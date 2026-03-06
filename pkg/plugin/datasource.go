package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/foxglove-dev/foxglove/pkg/models"
	"github.com/foxglove/go-rosbag/ros1msg"
	"github.com/foxglove/mcap/go/mcap"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces - only those which are required for a particular task.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	config, err := models.LoadPluginSettings(settings)
	if err != nil {
		return nil, fmt.Errorf("failed to load plugin settings: %w", err)
	}

	return &Datasource{
		settings: config,
	}, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	settings *models.PluginSettings
}

const defaultAPIBaseURL = "https://api.foxglove.dev"

func getAPIBaseURL(config *models.PluginSettings) string {
	// Prefer configured baseUrl, fall back to legacy jsonData.path
	if config != nil {
		if base := strings.TrimSpace(config.BaseURL); base != "" {
			return strings.TrimRight(base, "/")
		}
		if base := strings.TrimSpace(config.Path); base != "" {
			return strings.TrimRight(base, "/")
		}
	}
	return defaultAPIBaseURL
}

type queryModel struct {
	DeviceName string `json:"deviceName"`
	Topics     string `json:"topics"` // Comma-separated list of topics
	Start      string `json:"start"`  // Start time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
	End        string `json:"end"`    // End time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
}

// streamDataResponse is the response from POST /v1/data/stream.
// See the "link" field in the OpenAPI spec (v1.yaml).
type streamDataResponse struct {
	Link string `json:"link"`
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

// parseDeviceNames splits a potentially comma-separated deviceName string into
// individual trimmed device names, filtering out empty entries. This supports
// Grafana multi-value template variables which resolve to "dev1,dev2,dev3".
func parseDeviceNames(raw string) []string {
	parts := strings.Split(raw, ",")
	names := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			names = append(names, trimmed)
		}
	}
	return names
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Unmarshal the JSON into our queryModel.
	var qm queryModel

	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
	}

	// Validate required fields
	if qm.DeviceName == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "deviceName is required")
	}

	// Use provided start/end times or fall back to query time range
	startTime := qm.Start
	endTime := qm.End
	if startTime == "" {
		startTime = query.TimeRange.From.Format(time.RFC3339)
	}
	if endTime == "" {
		endTime = query.TimeRange.To.Format(time.RFC3339)
	}

	// Load settings to get API key
	config, err := models.LoadPluginSettings(*pCtx.DataSourceInstanceSettings)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("failed to load settings: %v", err))
	}

	if config.Secrets.ApiKey == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "API key is not configured")
	}

	// Support multiple devices (comma-separated, e.g. from a Grafana multi-value variable).
	// Each device gets its own API call and its frames are labeled with the device name.
	deviceNames := parseDeviceNames(qm.DeviceName)
	if len(deviceNames) == 0 {
		return backend.ErrDataResponse(backend.StatusBadRequest, "deviceName is required")
	}

	var allFrames data.Frames
	for _, device := range deviceNames {
		// Build a per-device query model
		perDeviceQM := qm
		perDeviceQM.DeviceName = device

		// Call Foxglove API for this device and get a streaming reader for the MCAP data
		mcapBody, err := d.fetchFoxgloveStream(ctx, config, perDeviceQM, startTime, endTime)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to fetch data for device %q: %v", device, err))
		}
		defer mcapBody.Close()

		// Convert the MCAP stream to data frames
		frames, err := d.convertToDataFrames(mcapBody, perDeviceQM)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to convert data for device %q: %v", device, err))
		}

		// Label each frame with the device name so Grafana can distinguish them
		for _, frame := range frames {
			if frame.Meta == nil {
				frame.Meta = &data.FrameMeta{}
			}
			frame.Name = fmt.Sprintf("%s - %s", frame.Name, device)
			for _, field := range frame.Fields {
				if field.Labels == nil {
					field.Labels = data.Labels{}
				}
				field.Labels["device"] = device
			}
		}

		allFrames = append(allFrames, frames...)
	}

	response.Frames = allFrames
	return response
}

// fetchFoxgloveStream calls the Foxglove API /data/stream endpoint to obtain
// a download link, then fetches the MCAP data from that link. The returned
// io.ReadCloser streams the MCAP data and must be closed by the caller.
func (d *Datasource) fetchFoxgloveStream(ctx context.Context, config *models.PluginSettings, qm queryModel, startTime, endTime string) (io.ReadCloser, error) {
	// Build request payload according to Foxglove API specification
	// See: https://docs.foxglove.dev/api#tag/Stream-data
	payload := map[string]interface{}{
		"deviceName": qm.DeviceName,
		"start":      startTime,
		"end":        endTime,
	}

	// Parse comma-separated topics into array
	if qm.Topics != "" {
		parts := strings.Split(qm.Topics, ",")
		topics := make([]string, 0, len(parts))
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				topics = append(topics, trimmed)
			}
		}
		if len(topics) > 0 {
			payload["topics"] = topics
		}
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Use the correct endpoint: POST /v1/data/stream with configurable base URL
	baseURL := getAPIBaseURL(config)
	url := fmt.Sprintf("%s/v1/data/stream", baseURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.Secrets.ApiKey))

	// Make request
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// Include the URL and request payload in the error for debugging
		return nil, fmt.Errorf("API returned status %d for URL %s: %s (request: %s)", resp.StatusCode, url, string(body), string(jsonPayload))
	}

	// Read response body - this should contain a URL to the actual data file
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var downloadResponse streamDataResponse
	if err := json.Unmarshal(body, &downloadResponse); err != nil {
		return nil, fmt.Errorf("failed to parse download response: %w", err)
	}

	downloadURL := downloadResponse.Link
	if downloadURL == "" {
		return nil, fmt.Errorf("no download link in response: %s", string(body))
	}

	// GET the actual MCAP data from the download URL
	dlReq, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}

	dlResp, err := client.Do(dlReq)
	if err != nil {
		return nil, fmt.Errorf("failed to download MCAP data: %w", err)
	}

	if dlResp.StatusCode != http.StatusOK {
		dlBody, _ := io.ReadAll(dlResp.Body)
		dlResp.Body.Close()
		return nil, fmt.Errorf("download returned status %d: %s", dlResp.StatusCode, string(dlBody))
	}

	return dlResp.Body, nil
}

// convertToDataFrames performs a streaming MCAP decode from the given reader,
// transcodes each ros1msg-encoded message to JSON, extracts the single numeric
// field as the Y value, and uses the message LogTime as the X value.
func (d *Datasource) convertToDataFrames(body io.Reader, qm queryModel) (data.Frames, error) {
	reader, err := mcap.NewReader(body)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCAP reader: %w", err)
	}
	defer reader.Close()

	// The response body is not seekable, so we must disable index-based reading.
	iter, err := reader.Messages(mcap.UsingIndex(false))
	if err != nil {
		return nil, fmt.Errorf("failed to create message iterator: %w", err)
	}

	// Cache JSON transcoders by schema ID so we build each one only once.
	transcoders := make(map[uint16]*ros1msg.JSONTranscoder)

	var times []time.Time
	var values []float64

	err = mcap.Range(iter, func(schema *mcap.Schema, channel *mcap.Channel, message *mcap.Message) error {
		// Only ros1msg encoding is supported.
		if channel.MessageEncoding != "ros1msg" {
			return fmt.Errorf(
				"unsupported message encoding %q on channel %q (topic %s); only ros1msg is supported",
				channel.MessageEncoding, channel.ID, channel.Topic,
			)
		}

		// Get or create a transcoder for this schema.
		tc, ok := transcoders[schema.ID]
		if !ok {
			tc, err = ros1msg.NewJSONTranscoder(schema.Name, schema.Data)
			if err != nil {
				return fmt.Errorf("failed to create JSON transcoder for schema %q: %w", schema.Name, err)
			}
			transcoders[schema.ID] = tc
		}

		// Transcode the ros1msg binary data to JSON.
		var jsonBuf bytes.Buffer
		if err := tc.Transcode(&jsonBuf, bytes.NewReader(message.Data)); err != nil {
			return fmt.Errorf("failed to transcode message to JSON: %w", err)
		}

		// Parse the JSON object. We expect exactly {"data_0": <value>}.
		var obj map[string]interface{}
		if err := json.Unmarshal(jsonBuf.Bytes(), &obj); err != nil {
			return fmt.Errorf("failed to parse transcoded JSON: %w", err)
		}

		// Extract the single field value.
		if len(obj) != 1 {
			return fmt.Errorf("expected exactly 1 field in message JSON, got %d: %v", len(obj), obj)
		}
		var val float64
		for fieldName, raw := range obj {
			v, ok := raw.(float64)
			if !ok {
				return fmt.Errorf("field %q value is not a float64 (got %T: %v)", fieldName, raw, raw)
			}
			val = v
		}

		// X = message timestamp (LogTime is nanoseconds since epoch).
		ts := time.Unix(0, int64(message.LogTime))

		times = append(times, ts)
		values = append(values, val)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("error reading MCAP messages: %w", err)
	}

	if len(times) == 0 {
		// Return an empty frame rather than an error when there are no messages.
		frame := data.NewFrame("foxglove_data")
		frame.Fields = append(frame.Fields,
			data.NewField("time", nil, []time.Time{}),
			data.NewField("value", nil, []float64{}),
		)
		return data.Frames{frame}, nil
	}

	frame := data.NewFrame("foxglove_data")
	frame.Fields = append(frame.Fields,
		data.NewField("time", nil, times),
		data.NewField("value", nil, values),
	)

	return data.Frames{frame}, nil
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	config, err := models.LoadPluginSettings(*req.PluginContext.DataSourceInstanceSettings)

	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Unable to load settings: %v", err),
		}, nil
	}

	if config.Secrets.ApiKey == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "API key is missing",
		}, nil
	}

	// Test the API connection by making a simple request
	// Try to list devices or make a lightweight API call
	baseURL := getAPIBaseURL(config)
	url := fmt.Sprintf("%s/v1/devices", baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Failed to create health check request: %v", err),
		}, nil
	}

	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.Secrets.ApiKey))

	client := &http.Client{
		Timeout: 10 * time.Second,
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Failed to connect to Foxglove API: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("API returned status %d: %s", resp.StatusCode, string(body)),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Successfully connected to Foxglove API",
	}, nil
}
