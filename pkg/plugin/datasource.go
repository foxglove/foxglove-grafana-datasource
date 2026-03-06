package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
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
	Topics     string `json:"topics"` // Comma-separated list of message path strings (e.g. "/imu.linear_acceleration.x, /gps.latitude")
	Start      string `json:"start"`  // Start time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
	End        string `json:"end"`    // End time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
}

// parseMessagePathStrings splits the comma-separated Topics string into unique,
// trimmed, non-empty message path strings, preserving the order of first appearance.
func parseMessagePathStrings(raw string) []string {
	parts := strings.Split(raw, ",")
	seen := make(map[string]bool)
	var result []string
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" && !seen[trimmed] {
			seen[trimmed] = true
			result = append(result, trimmed)
		}
	}
	return result
}

// buildMessagePathSets parses each message path string and builds the
// messagePathSets map (keyed by synthetic names "topic_0", "topic_1", ...),
// a reverse map from synthetic key → original message path string, and the
// deduplicated list of real topics for backward compatibility.
func buildMessagePathSets(messagePaths []string) (
	messagePathSets map[string]*MessagePathSet,
	syntheticToOriginal map[string]string,
	realTopics []string,
	err error,
) {
	messagePathSets = make(map[string]*MessagePathSet, len(messagePaths))
	syntheticToOriginal = make(map[string]string, len(messagePaths))
	topicSeen := make(map[string]bool)

	for i, mp := range messagePaths {
		topic, selectors, parseErr := ParseMessagePath(mp)
		if parseErr != nil {
			return nil, nil, nil, fmt.Errorf("failed to parse message path %q: %w", mp, parseErr)
		}

		key := fmt.Sprintf("topic_%d", i)
		messagePathSets[key] = &MessagePathSet{
			Topic:         topic,
			SelectorPaths: [][]Selector{selectors},
		}
		syntheticToOriginal[key] = mp

		if !topicSeen[topic] {
			topicSeen[topic] = true
			realTopics = append(realTopics, topic)
		}
	}
	return messagePathSets, syntheticToOriginal, realTopics, nil
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

	// Parse and deduplicate message path strings from Topics.
	// If no topics are provided, return an empty response.
	messagePaths := parseMessagePathStrings(qm.Topics)
	if len(messagePaths) == 0 {
		return response
	}

	// Parse each message path and build the messagePathSets for the API,
	// a reverse map from synthetic keys back to original strings, and the
	// deduplicated list of real topics for backward compatibility.
	messagePathSets, syntheticToOriginal, realTopics, err := buildMessagePathSets(messagePaths)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, err.Error())
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
		// Call Foxglove API for this device and get a streaming reader for the MCAP data
		mcapBody, err := d.fetchFoxgloveStream(ctx, config, device, startTime, endTime, messagePathSets, realTopics)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to fetch data for device %q: %v", device, err))
		}
		defer mcapBody.Close()

		// Convert the MCAP stream into per-message-path data frames.
		frames, err := d.convertToDataFrames(mcapBody, syntheticToOriginal, device)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to convert data for device %q: %v", device, err))
		}

		allFrames = append(allFrames, frames...)
	}

	response.Frames = allFrames
	return response
}

// fetchFoxgloveStream calls the Foxglove API /data/stream endpoint to obtain
// a download link, then fetches the MCAP data from that link. The returned
// io.ReadCloser streams the MCAP data and must be closed by the caller.
func (d *Datasource) fetchFoxgloveStream(
	ctx context.Context,
	config *models.PluginSettings,
	deviceName string,
	startTime, endTime string,
	messagePathSets map[string]*MessagePathSet,
	realTopics []string,
) (io.ReadCloser, error) {
	// Build request payload according to Foxglove API specification
	// See: https://docs.foxglove.dev/api#tag/Stream-data
	payload := map[string]interface{}{
		"deviceName": deviceName,
		"start":      startTime,
		"end":        endTime,
	}

	// Send messagePathSets for server-side message path extraction.
	// Also include the real topics list for backward compatibility with
	// servers that don't support messagePathSets.
	if len(messagePathSets) > 0 {
		payload["messagePathSets"] = messagePathSets
		payload["topics"] = realTopics
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

// frameAccumulator collects time-series data for a single message path.
type frameAccumulator struct {
	times  []time.Time
	values []float64
}

// convertToDataFrames performs a streaming MCAP decode from the given reader.
// Each message's channel topic is expected to be a synthetic key (e.g. "topic_0")
// that maps back to the original message path string via syntheticToOriginal.
// Messages on channels whose topic is not a recognized synthetic key indicate
// an unsupported message path and cause an error.
//
// Returns one data frame per original message path string, named
// "{deviceName}_{message path string}".
func (d *Datasource) convertToDataFrames(
	body io.Reader,
	syntheticToOriginal map[string]string,
	deviceName string,
) (data.Frames, error) {
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

	// One accumulator per synthetic key.
	accumulators := make(map[string]*frameAccumulator, len(syntheticToOriginal))
	for key := range syntheticToOriginal {
		accumulators[key] = &frameAccumulator{}
	}

	err = mcap.Range(iter, func(schema *mcap.Schema, channel *mcap.Channel, message *mcap.Message) error {
		syntheticKey := channel.Topic

		// If the channel topic is not one of our synthetic keys, the server
		// passed the message through unmodified — meaning the message path
		// was not supported for this schema. Treat as an error.
		originalPath, ok := syntheticToOriginal[syntheticKey]
		if !ok {
			return fmt.Errorf(
				"received message on unexpected channel topic %q; "+
					"the message path may not be supported for the schema on this topic",
				channel.Topic,
			)
		}

		// Only ros1msg encoding is supported.
		if channel.MessageEncoding != "ros1" {
			return fmt.Errorf(
				"received unexpected message encoding %q on channel topic %q (message path %q); message path field selection failed",
				channel.MessageEncoding, syntheticKey, originalPath,
			)
		}

		// Get or create a transcoder for this schema.
		tc, tcOK := transcoders[schema.ID]
		if !tcOK {
			tc, err = ros1msg.NewJSONTranscoder(schema.Name, schema.Data)
			if err != nil {
				return fmt.Errorf("failed to create JSON transcoder for schema %q: %w", schema.Name, err)
			}
			transcoders[schema.ID] = tc
		}

		// Transcode the ros1msg binary data to JSON.
		var jsonBuf bytes.Buffer
		if err := tc.Transcode(&jsonBuf, bytes.NewReader(message.Data)); err != nil {
			return fmt.Errorf("failed to transcode message to JSON (path %q): %w", originalPath, err)
		}

		// Parse the JSON object. We expect exactly one field (e.g. {"data_0": <value>}).
		var obj map[string]interface{}
		if err := json.Unmarshal(jsonBuf.Bytes(), &obj); err != nil {
			return fmt.Errorf("failed to parse transcoded JSON (path %q): %w", originalPath, err)
		}

		if len(obj) != 1 {
			return fmt.Errorf("expected exactly 1 field in message JSON for path %q, got %d: %v", originalPath, len(obj), obj)
		}
		var val float64
		for fieldName, raw := range obj {
			arr, isArray := raw.([]interface{})
			if !isArray {
				v, isFloat := raw.(float64)
				if !isFloat {
					return fmt.Errorf("field %q value is not an float64 for path %q (got %T: %v)", fieldName, originalPath, raw, raw)
				}
				val = v
				continue
			}
			first := arr[0]
			v, isFloat := first.(float64)
			if !isFloat {
				return fmt.Errorf("first element of array is not a float64 for path %q (got %T: %v)", originalPath, first, first)
			}
			val = v
		}

		ts := time.Unix(0, int64(message.LogTime))
		acc := accumulators[syntheticKey]
		acc.times = append(acc.times, ts)
		acc.values = append(acc.values, val)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("error reading MCAP messages: %w", err)
	}

	// Build one data frame per message path string, in synthetic-key order.
	// Collect and sort keys so output order is deterministic (topic_0, topic_1, ...).
	sortedKeys := make([]string, 0, len(syntheticToOriginal))
	for key := range syntheticToOriginal {
		sortedKeys = append(sortedKeys, key)
	}
	// topic_0, topic_1, ... sort lexicographically in the right order for
	// small counts; use explicit sort for correctness.
	sortStrings(sortedKeys)

	var frames data.Frames
	for _, key := range sortedKeys {
		originalPath := syntheticToOriginal[key]
		acc := accumulators[key]
		frameName := fmt.Sprintf("%s_%s", deviceName, originalPath)

		frame := data.NewFrame(frameName)
		if len(acc.times) == 0 {
			frame.Fields = append(frame.Fields,
				data.NewField("time", nil, []time.Time{}),
				data.NewField("value", nil, []float64{}),
			)
		} else {
			frame.Fields = append(frame.Fields,
				data.NewField("time", nil, acc.times),
				data.NewField("value", nil, acc.values),
			)
		}
		frames = append(frames, frame)
	}

	return frames, nil
}

// sortStrings sorts a slice of strings in place.
func sortStrings(s []string) {
	sort.Strings(s)
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
