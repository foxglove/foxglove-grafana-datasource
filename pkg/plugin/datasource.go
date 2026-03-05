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

		// Call Foxglove API for this device
		responseData, err := d.fetchFoxgloveStream(ctx, config, perDeviceQM, startTime, endTime)
		if err != nil {
			return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to fetch data for device %q: %v", device, err))
		}

		// Convert to data frames
		frames, err := d.convertToDataFrames(responseData, perDeviceQM)
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

// fetchFoxgloveStream calls the Foxglove API /data/stream endpoint
func (d *Datasource) fetchFoxgloveStream(ctx context.Context, config *models.PluginSettings, qm queryModel, startTime, endTime string) ([]byte, error) {
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

	// Parse the response to extract the download URL
	var downloadResponse map[string]interface{}
	if err := json.Unmarshal(body, &downloadResponse); err != nil {
		return nil, fmt.Errorf("failed to parse download response: %w", err)
	}

	// Extract the URL from the response (could be "url", "downloadUrl", "link", etc.)
	downloadURL, ok := downloadResponse["url"].(string)
	if !ok {
		// Try alternative field names
		if url, ok := downloadResponse["downloadUrl"].(string); ok {
			downloadURL = url
		} else if url, ok := downloadResponse["link"].(string); ok {
			downloadURL = url
		} else {
			// If no URL field found, return the raw response for debugging
			return nil, fmt.Errorf("no download URL found in response: %s", string(body))
		}
	}

	if downloadURL == "" {
		return nil, fmt.Errorf("empty download URL in response: %s", string(body))
	}

	// Make GET request to download the actual data file
	return d.downloadFile(ctx, downloadURL)
}

// downloadFile makes a GET request to download the file from the provided URL
func (d *Datasource) downloadFile(ctx context.Context, fileURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}

	// Make request (no auth needed for pre-signed URLs typically)
	client := &http.Client{
		Timeout: 60 * time.Second, // Longer timeout for file downloads
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("download returned status %d for URL %s: %s", resp.StatusCode, fileURL, string(body))
	}

	// Read the file content
	fileData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read file content: %w", err)
	}

	return fileData, nil
}

// convertToDataFrames converts Foxglove API response to Grafana data frames
func (d *Datasource) convertToDataFrames(responseData []byte, qm queryModel) (data.Frames, error) {
	// Parse the JSON response from Foxglove
	// The exact structure depends on the Foxglove API response format
	// This is a placeholder implementation - you'll need to adjust based on actual API response

	var result map[string]interface{}
	if err := json.Unmarshal(responseData, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Create a frame for the data
	frame := data.NewFrame("foxglove_data")

	// Extract time and value fields from the response
	// This is a simplified example - adjust based on actual Foxglove response structure
	times := []time.Time{}
	values := []float64{}

	// Try to extract data points from the response
	if messages, ok := result["messages"].([]interface{}); ok {
		for _, msg := range messages {
			if msgMap, ok := msg.(map[string]interface{}); ok {
				// Extract timestamp (adjust field names based on actual API)
				if timestamp, ok := msgMap["timestamp"].(float64); ok {
					times = append(times, time.Unix(0, int64(timestamp*1e9)))
				}

				// Extract value (adjust based on actual message structure)
				if value, ok := msgMap["value"].(float64); ok {
					values = append(values, value)
				}
			}
		}
	}

	// If no data was extracted, create a simple frame with time range
	if len(times) == 0 {
		now := time.Now()
		frame.Fields = append(frame.Fields,
			data.NewField("time", nil, []time.Time{now.Add(-time.Hour), now}),
			data.NewField("value", nil, []float64{0, 0}),
		)
		return data.Frames{frame}, nil
	}

	// Add fields to frame
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
