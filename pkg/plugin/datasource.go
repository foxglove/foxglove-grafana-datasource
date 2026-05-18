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

var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	config, err := models.LoadPluginSettings(settings)
	if err != nil {
		return nil, fmt.Errorf("failed to load plugin settings: %w", err)
	}
	return &Datasource{settings: config}, nil
}

type Datasource struct {
	settings *models.PluginSettings
}

const defaultAPIBaseURL = "https://api.foxglove.dev"

func getAPIBaseURL(config *models.PluginSettings) string {
	if config != nil {
		if base := strings.TrimSpace(config.BaseURL); base != "" {
			return strings.TrimRight(base, "/")
		}
	}
	return defaultAPIBaseURL
}

// queryModel represents the per-query JSON sent from the frontend.
// The backend treats selection, filter, groupBy, and aggregation as opaque
// JSON forwarded to the Foxglove API; granularityWire is translated to filterBinNanos in the POST body.
type queryModel struct {
	Selection       json.RawMessage `json:"selection"`
	FilterWire      json.RawMessage `json:"filterWire"`
	GroupBy         json.RawMessage `json:"groupBy"`
	AggregationWire json.RawMessage `json:"aggregationWire,omitempty"`
	GranularityWire json.RawMessage `json:"granularityWire,omitempty"`
}

// grafanaQueryRequest is the body POSTed to /v1/data/grafana-plugin-query.
type grafanaQueryRequest struct {
	ProjectID      string          `json:"projectId"`
	SiteID         string          `json:"siteId"`
	Start          string          `json:"start"`
	End            string          `json:"end"`
	Selection      json.RawMessage `json:"selection"`
	Filter         json.RawMessage `json:"filter,omitempty"`
	GroupBy        json.RawMessage `json:"groupBy"`
	Aggregation    json.RawMessage `json:"aggregation,omitempty"`
	FilterBinNanos *int64          `json:"filterBinNanos,omitempty"`
}

type grafanaQueryResponse struct {
	Link string `json:"link"`
}

func (d *Datasource) Dispose() {}

func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()
	for _, q := range req.Queries {
		response.Responses[q.RefID] = d.query(ctx, req.PluginContext, q)
	}
	return response, nil
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var qm queryModel
	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err))
	}

	if len(qm.Selection) == 0 || string(qm.Selection) == "null" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "selection is required")
	}

	config, err := models.LoadPluginSettings(*pCtx.DataSourceInstanceSettings)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("failed to load settings: %v", err))
	}
	if config.Secrets.ApiKey == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "API key is not configured")
	}
	if config.ProjectID == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "project ID is not configured")
	}
	if config.SiteID == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "site ID is not configured")
	}

	startTime := query.TimeRange.From.Format(time.RFC3339Nano)
	endTime := query.TimeRange.To.Format(time.RFC3339Nano)

	apiReq := grafanaQueryRequest{
		ProjectID: config.ProjectID,
		SiteID:    config.SiteID,
		Start:     startTime,
		End:       endTime,
		Selection: qm.Selection,
		Filter:    qm.FilterWire,
		GroupBy:   qm.GroupBy,
	}

	if aggregationWireHasPositiveInterval(qm.AggregationWire) {
		apiReq.Aggregation = qm.AggregationWire
	}
	apiReq.FilterBinNanos = resolveFilterBinNanos(qm.GranularityWire, query.TimeRange, query.MaxDataPoints)

	frames, err := d.fetchGrafanaQuery(ctx, config, apiReq)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("query failed: %v", err))
	}

	return backend.DataResponse{Frames: frames}
}

// aggregationWireHasPositiveInterval is true only when the wire unmarshals
// to intervalNanoseconds > 0 (the Foxglove API rejects zero).
func aggregationWireHasPositiveInterval(raw json.RawMessage) bool {
	if len(raw) == 0 || string(raw) == "null" {
		return false
	}
	var w struct {
		IntervalNanoseconds int64 `json:"intervalNanoseconds"`
	}
	if err := json.Unmarshal(raw, &w); err != nil {
		return false
	}
	return w.IntervalNanoseconds > 0
}

// defaultMaxDataPoints matches Grafana's typical fallback when the panel does not
// send an explicit max data points value.
const defaultMaxDataPoints int64 = 1000

func resolveFilterBinNanos(granularityWire json.RawMessage, timeRange backend.TimeRange, maxDataPoints int64) *int64 {
	if bn := filterBinNanosFromGranularityWire(granularityWire); bn != nil {
		return bn
	}
	return defaultFilterBinNanosFromQuery(timeRange, maxDataPoints)
}

func defaultFilterBinNanosFromQuery(timeRange backend.TimeRange, maxDataPoints int64) *int64 {
	from := timeRange.From
	to := timeRange.To
	if from.IsZero() || to.IsZero() || !to.After(from) {
		return nil
	}

	points := maxDataPoints
	if points <= 0 {
		points = defaultMaxDataPoints
	}

	durationNs := to.Sub(from).Nanoseconds()
	if durationNs <= 0 {
		return nil
	}

	bn := durationNs / points
	if bn < 1 {
		bn = 1
	}
	return &bn
}

func filterBinNanosFromGranularityWire(raw json.RawMessage) *int64 {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var w struct {
		IntervalNanoseconds int64 `json:"intervalNanoseconds"`
	}
	if err := json.Unmarshal(raw, &w); err != nil || w.IntervalNanoseconds <= 0 {
		return nil
	}
	v := w.IntervalNanoseconds
	return &v
}

// fetchGrafanaQuery POSTs to /v1/data/grafana-query, follows the signed link,
// and parses the Grafana Frame JSON response into data.Frames.
func (d *Datasource) fetchGrafanaQuery(
	ctx context.Context,
	config *models.PluginSettings,
	apiReq grafanaQueryRequest,
) (data.Frames, error) {
	jsonPayload, err := json.Marshal(apiReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	baseURL := getAPIBaseURL(config)
	url := fmt.Sprintf("%s/v1/data/grafana-plugin-query", baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonPayload))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.Secrets.ApiKey))

	clientTimeout := time.Duration(0)
	if config.QueryHTTPTimeoutSeconds > 0 {
		clientTimeout = time.Duration(config.QueryHTTPTimeoutSeconds) * time.Second
	}
	client := &http.Client{Timeout: clientTimeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d for %s: %s (request: %s)",
			resp.StatusCode, url, string(body), string(jsonPayload))
	}

	var qResp grafanaQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&qResp); err != nil {
		return nil, fmt.Errorf("failed to parse API response: %w", err)
	}
	if qResp.Link == "" {
		return nil, fmt.Errorf("API response contained no download link")
	}

	fmt.Println("qResp.Link", qResp.Link)

	// Fetch the Grafana Frame JSON from the signed link.
	dlReq, err := http.NewRequestWithContext(ctx, "GET", qResp.Link, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}
	dlResp, err := client.Do(dlReq)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch data from signed link: %w", err)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(dlResp.Body)
		return nil, fmt.Errorf("download returned status %d: %s", dlResp.StatusCode, string(body))
	}

	return parseGrafanaFrameJSON(dlResp.Body)
}

// parseGrafanaFrameJSON reads the response body and decodes it as Grafana
// data frames. The server returns either a single frame or an array of frames
// in the SDK's JSON wire format.
func parseGrafanaFrameJSON(r io.Reader) (data.Frames, error) {
	body, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("failed to read frame data: %w", err)
	}
	if len(body) == 0 {
		return nil, nil
	}

	// Try array-of-frames first, then single frame.
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		var frames data.Frames
		if err := json.Unmarshal(trimmed, &frames); err != nil {
			return nil, fmt.Errorf("failed to decode frames array: %w", err)
		}
		return frames, nil
	}

	var frame data.Frame
	if err := json.Unmarshal(trimmed, &frame); err != nil {
		return nil, fmt.Errorf("failed to decode frame: %w", err)
	}
	return data.Frames{&frame}, nil
}

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

	if config.ProjectID == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Project ID is missing",
		}, nil
	}

	if config.SiteID == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Site ID is missing",
		}, nil
	}

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

	client := &http.Client{Timeout: 10 * time.Second}
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
