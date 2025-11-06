package plugin

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/foxglove/foxglove-grafana-datasource/pkg/models"
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
func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
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

const foxgloveAPIBaseURL = "https://api.foxglove.party/v1"

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

	// Call Foxglove API
	responseData, err := d.fetchFoxgloveStream(ctx, config, qm, startTime, endTime)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to fetch data: %v", err))
	}

	// Convert to data frames
	frames, err := d.convertToDataFrames(responseData, qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("failed to convert data: %v", err))
	}

	response.Frames = frames
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

	// Use the correct endpoint: POST /v1/data/stream
	url := fmt.Sprintf("%s/data/stream", foxgloveAPIBaseURL)
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

// convertToDataFrames converts an MCAP file containing ROS1 messages into Grafana data frames.
// Each ROS1 message is expected to contain a single primitive numeric value. The topic name is
// used as both the frame name and the numeric field name.
func (d *Datasource) convertToDataFrames(responseData []byte, qm queryModel) (data.Frames, error) {
	reader, err := mcap.NewReader(bytes.NewReader(responseData))
	if err != nil {
		return nil, fmt.Errorf("failed to open MCAP reader: %w", err)
	}
	defer reader.Close()

	it, err := reader.Messages()
	if err != nil {
		return nil, fmt.Errorf("failed to create MCAP iterator: %w", err)
	}

	type series struct {
		times  []time.Time
		values []float64
	}

	seriesByTopic := make(map[string]*series)
	schemas := make(map[uint16]*mcap.Schema)
	decoders := make(map[uint16]numericDecoder)

	for {
		schema, channel, message, iterErr := it.Next(nil)
		if iterErr != nil {
			if errors.Is(iterErr, io.EOF) {
				break
			}
			return nil, fmt.Errorf("failed to iterate MCAP messages: %w", iterErr)
		}
		if channel == nil {
			return nil, fmt.Errorf("encountered MCAP message with no channel information")
		}
		topic := channel.Topic
		if topic == "" {
			return nil, fmt.Errorf("encountered MCAP channel %d with empty topic", channel.ID)
		}

		if schema != nil {
			schemas[schema.ID] = schema
		}
		schemaID := channel.SchemaID
		if schemaID == 0 {
			return nil, fmt.Errorf("channel %s has no associated schema", topic)
		}
		schema = schemas[schemaID]
		if schema == nil {
			return nil, fmt.Errorf("missing schema %d for topic %s", schemaID, topic)
		}

		decoder, ok := decoders[schemaID]
		if !ok {
			decoder, err = newROS1NumericDecoder(schema)
			if err != nil {
				return nil, fmt.Errorf("failed to build decoder for topic %s: %w", topic, err)
			}
			decoders[schemaID] = decoder
		}

		value, err := decoder(message.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to decode message for topic %s: %w", topic, err)
		}

		timestamp := message.LogTime
		if timestamp == 0 {
			timestamp = message.PublishTime
		}
		if timestamp == 0 {
			return nil, fmt.Errorf("message on topic %s has no timestamp", topic)
		}
		if timestamp > math.MaxInt64 {
			return nil, fmt.Errorf("timestamp overflow for topic %s", topic)
		}

		ts := time.Unix(0, int64(timestamp))
		seq := seriesByTopic[topic]
		if seq == nil {
			seq = &series{}
			seriesByTopic[topic] = seq
		}
		seq.times = append(seq.times, ts)
		seq.values = append(seq.values, value)
	}

	if len(seriesByTopic) == 0 {
		return data.Frames{}, nil
	}

	topics := make([]string, 0, len(seriesByTopic))
	for topic := range seriesByTopic {
		topics = append(topics, topic)
	}
	sort.Strings(topics)

	frames := make(data.Frames, 0, len(topics))
	for _, topic := range topics {
		seq := seriesByTopic[topic]
		if len(seq.times) == 0 {
			continue
		}
		frame := data.NewFrame(topic)
		frame.Fields = append(frame.Fields,
			data.NewField("time", nil, seq.times),
			data.NewField(topic, nil, seq.values),
		)
		frames = append(frames, frame)
	}

	return frames, nil
}

type numericDecoder func([]byte) (float64, error)

func newROS1NumericDecoder(schema *mcap.Schema) (numericDecoder, error) {
	if schema.Encoding != "ros1msg" {
		return nil, fmt.Errorf("unsupported schema encoding %q", schema.Encoding)
	}
	parentPackage := ""
	if idx := strings.Index(schema.Name, "/"); idx != -1 {
		parentPackage = schema.Name[:idx]
	}

	fields, err := ros1msg.ParseMessageDefinition(parentPackage, schema.Data)
	if err != nil {
		return nil, fmt.Errorf("failed to parse ROS1 message definition: %w", err)
	}
	if len(fields) != 1 {
		return nil, fmt.Errorf("expected a single field, found %d", len(fields))
	}
	field := fields[0]
	if field.Type.IsArray {
		return nil, fmt.Errorf("array field %q is not supported", field.Name)
	}
	if field.Type.IsRecord {
		return nil, fmt.Errorf("record field %q is not supported", field.Name)
	}
	if strings.Contains(field.Type.BaseType, "/") {
		return nil, fmt.Errorf("nested type %q is not supported", field.Type.BaseType)
	}

	switch field.Type.BaseType {
	case "float64":
		return func(data []byte) (float64, error) {
			if len(data) < 8 {
				return 0, io.ErrUnexpectedEOF
			}
			return math.Float64frombits(binary.LittleEndian.Uint64(data[:8])), nil
		}, nil
	case "float32":
		return func(data []byte) (float64, error) {
			if len(data) < 4 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(math.Float32frombits(binary.LittleEndian.Uint32(data[:4]))), nil
		}, nil
	case "int8":
		return func(data []byte) (float64, error) {
			if len(data) < 1 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(int8(data[0])), nil
		}, nil
	case "uint8", "char", "byte":
		return func(data []byte) (float64, error) {
			if len(data) < 1 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(data[0]), nil
		}, nil
	case "int16":
		return func(data []byte) (float64, error) {
			if len(data) < 2 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(int16(binary.LittleEndian.Uint16(data[:2]))), nil
		}, nil
	case "uint16":
		return func(data []byte) (float64, error) {
			if len(data) < 2 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(binary.LittleEndian.Uint16(data[:2])), nil
		}, nil
	case "int32":
		return func(data []byte) (float64, error) {
			if len(data) < 4 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(int32(binary.LittleEndian.Uint32(data[:4]))), nil
		}, nil
	case "uint32":
		return func(data []byte) (float64, error) {
			if len(data) < 4 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(binary.LittleEndian.Uint32(data[:4])), nil
		}, nil
	case "int64":
		return func(data []byte) (float64, error) {
			if len(data) < 8 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(int64(binary.LittleEndian.Uint64(data[:8]))), nil
		}, nil
	case "uint64":
		return func(data []byte) (float64, error) {
			if len(data) < 8 {
				return 0, io.ErrUnexpectedEOF
			}
			return float64(binary.LittleEndian.Uint64(data[:8])), nil
		}, nil
	default:
		return nil, fmt.Errorf("unsupported primitive type %q", field.Type.BaseType)
	}
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
	url := fmt.Sprintf("%s/devices", foxgloveAPIBaseURL)
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
