package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

func TestQueryDataMissingSelection(t *testing.T) {
	ds := Datasource{}

	resp, err := ds.QueryData(
		context.Background(),
		&backend.QueryDataRequest{
			Queries: []backend.DataQuery{
				{RefID: "A"},
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Responses) != 1 {
		t.Fatal("QueryData must return a response")
	}
	r := resp.Responses["A"]
	if r.Error == nil {
		t.Fatal("expected error for missing selection")
	}
}

// checkHealthRequest builds a CheckHealthRequest pointing at baseURL with a
// configured API key/project/site so CheckHealth proceeds to the HTTP call.
func checkHealthRequest(baseURL string) *backend.CheckHealthRequest {
	jsonData := fmt.Sprintf(`{"baseUrl":%q,"projectId":"p","siteId":"s"}`, baseURL)
	return &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(jsonData),
				DecryptedSecureJSONData: map[string]string{"apiKey": "test-key"},
			},
		},
	}
}

func TestCheckHealth_OK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"devices":[]}`))
	}))
	defer srv.Close()

	ds := &Datasource{httpClient: srv.Client()}
	res, err := ds.CheckHealth(context.Background(), checkHealthRequest(srv.URL))
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusOk {
		t.Fatalf("expected OK status, got %v (message: %q)", res.Status, res.Message)
	}
}

func TestCheckHealth_NonOKStatusHidesBody(t *testing.T) {
	const secret = "internal-upstream-secret-detail"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(secret))
	}))
	defer srv.Close()

	ds := &Datasource{httpClient: srv.Client()}
	res, err := ds.CheckHealth(context.Background(), checkHealthRequest(srv.URL))
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusError {
		t.Fatalf("expected error status, got %v", res.Status)
	}
	// The numeric status code is safe to surface and aids triage...
	if !strings.Contains(res.Message, "500") {
		t.Fatalf("message should include the status code, got %q", res.Message)
	}
	// ...but the raw upstream body must not leak to the UI.
	if strings.Contains(res.Message, secret) {
		t.Fatalf("message must not contain the upstream response body, got %q", res.Message)
	}
}

func TestCheckHealth_ConnectionErrorIsGeneric(t *testing.T) {
	// Point at a server that is immediately closed so the request fails to
	// connect. The generic message must not embed the (user-configurable) URL.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	baseURL := srv.URL
	client := srv.Client()
	srv.Close()

	ds := &Datasource{httpClient: client}
	res, err := ds.CheckHealth(context.Background(), checkHealthRequest(baseURL))
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusError {
		t.Fatalf("expected error status, got %v", res.Status)
	}
	if strings.Contains(res.Message, baseURL) {
		t.Fatalf("message must not leak the base URL, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "Grafana server log") {
		t.Fatalf("message should point operators to the server log, got %q", res.Message)
	}
}

func TestCheckHealth_MissingAPIKey(t *testing.T) {
	req := &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"projectId":"p","siteId":"s"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	}
	ds := &Datasource{}
	res, err := ds.CheckHealth(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusError {
		t.Fatalf("expected error status, got %v", res.Status)
	}
	if res.Message != "API key is missing" {
		t.Fatalf("unexpected message: %q", res.Message)
	}
}

func TestParseGrafanaFrameJSON_SingleFrame(t *testing.T) {
	// Use the exact wire format the Grafana SDK produces.
	f := data.NewFrame("test",
		data.NewField("time", nil, []time.Time{time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)}),
		data.NewField("value", nil, []float64{1.0}),
	)
	raw, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("failed to marshal test frame: %v", err)
	}

	frames, err := parseGrafanaFrameJSON(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(frames) != 1 {
		t.Fatalf("expected 1 frame, got %d", len(frames))
	}
}

func TestParseGrafanaFrameJSON_Empty(t *testing.T) {
	frames, err := parseGrafanaFrameJSON(strings.NewReader(""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if frames != nil {
		t.Fatalf("expected nil frames for empty body, got %d", len(frames))
	}
}

func TestQueryModelUnmarshal(t *testing.T) {
	raw := `{
		"selection": {"type":"messagePath","messagePath":"/imu.accel.x","topic":"/imu","selectorPath":[{"kind":"field","field":"accel"},{"kind":"field","field":"x"}]},
		"filterWire": {"type":"device","op":"eq","field":"name","value":"robot-1"},
		"groupBy": {"type":"deviceId"}
	}`
	var qm queryModel
	if err := json.Unmarshal([]byte(raw), &qm); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(qm.Selection) == 0 {
		t.Fatal("selection should not be empty")
	}
	if len(qm.FilterWire) == 0 {
		t.Fatal("filterWire should not be empty")
	}
	if len(qm.AggregationWire) != 0 {
		t.Fatal("aggregationWire should be empty when omitted")
	}
	if len(qm.GranularityWire) != 0 {
		t.Fatal("granularityWire should be empty when omitted")
	}
}

func TestQueryModelUnmarshal_WithGranularity(t *testing.T) {
	raw := `{
		"selection": {"type":"messagePath","messagePath":"/imu.accel.x","topic":"/imu","selectorPath":[{"kind":"field","field":"accel"},{"kind":"field","field":"x"}]},
		"filterWire": {"type":"device","op":"eq","field":"name","value":"robot-1"},
		"groupBy": {"type":"deviceId"},
		"granularityWire": {"intervalNanoseconds":1000000000}
	}`
	var qm queryModel
	if err := json.Unmarshal([]byte(raw), &qm); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if len(qm.GranularityWire) == 0 {
		t.Fatal("granularityWire should be present")
	}
	if string(qm.GranularityWire) != `{"intervalNanoseconds":1000000000}` {
		t.Fatalf("unexpected granularityWire: %s", string(qm.GranularityWire))
	}
	bn := filterBinNanosFromGranularityWire(qm.GranularityWire)
	if bn == nil || *bn != 1_000_000_000 {
		t.Fatalf("filterBinNanos: want 1000000000, got %v", bn)
	}
}

func TestResolveAggregation(t *testing.T) {
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := from.Add(10 * time.Second)
	tr := backend.TimeRange{From: from, To: to}

	wire := json.RawMessage(`{"intervalNanoseconds":500000000,"type":"max"}`)
	agg := resolveAggregation(wire, tr, 100)
	if string(agg) != `{"intervalNanoseconds":500000000,"type":"max"}` {
		t.Fatalf("explicit wire interval should be preserved, got %s", agg)
	}

	zeroWire := json.RawMessage(`{"intervalNanoseconds":0,"type":"max"}`)
	agg = resolveAggregation(zeroWire, tr, 1000)
	var parsed struct {
		IntervalNanoseconds int64  `json:"intervalNanoseconds"`
		Type                string `json:"type"`
	}
	if err := json.Unmarshal(agg, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Type != "max" || parsed.IntervalNanoseconds != 10_000_000 {
		t.Fatalf("zero interval should default to 10ms, got %+v", parsed)
	}

	if resolveAggregation(nil, tr, 1000) != nil {
		t.Fatal("missing wire should yield nil")
	}
}

func TestFilterBinNanosFromGranularityWire(t *testing.T) {
	if filterBinNanosFromGranularityWire(nil) != nil {
		t.Fatal("nil raw should yield nil")
	}
	if filterBinNanosFromGranularityWire(json.RawMessage(`null`)) != nil {
		t.Fatal("null json should yield nil")
	}
	raw := json.RawMessage(`{"intervalNanoseconds":1000000000}`)
	bn := filterBinNanosFromGranularityWire(raw)
	if bn == nil || *bn != 1_000_000_000 {
		t.Fatalf("want 1000000000, got %v", bn)
	}
	if filterBinNanosFromGranularityWire(json.RawMessage(`{}`)) != nil {
		t.Fatal("empty object should yield nil")
	}
	if filterBinNanosFromGranularityWire(json.RawMessage(`{"intervalNanoseconds":0}`)) != nil {
		t.Fatal("zero ns should yield nil")
	}
}

func TestDefaultFilterBinNanosFromQuery(t *testing.T) {
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := from.Add(10 * time.Second)
	tr := backend.TimeRange{From: from, To: to}

	bn := defaultIntervalNanosecondsFromQuery(tr, 1000)
	if bn == nil || *bn != 10_000_000 {
		t.Fatalf("want 10ms (10_000_000 ns), got %v", bn)
	}

	// Zero max data points uses defaultMaxDataPoints.
	bn = defaultIntervalNanosecondsFromQuery(tr, 0)
	if bn == nil || *bn != 10_000_000 {
		t.Fatalf("zero maxDataPoints: want 10_000_000 ns, got %v", bn)
	}

	// Invalid range yields nil.
	if defaultIntervalNanosecondsFromQuery(backend.TimeRange{From: to, To: from}, 100) != nil {
		t.Fatal("inverted range should yield nil")
	}
}

func TestResolveFilterBinNanos(t *testing.T) {
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := from.Add(time.Second)
	tr := backend.TimeRange{From: from, To: to}

	wire := json.RawMessage(`{"intervalNanoseconds":500000000}`)
	bn := resolveFilterBinNanos(wire, tr, 100)
	if bn == nil || *bn != 500_000_000 {
		t.Fatalf("user granularity should win, got %v", bn)
	}

	bn = resolveFilterBinNanos(nil, tr, 100)
	if bn == nil || *bn != 10_000_000 {
		t.Fatalf("default should be 1s/100 = 10ms, got %v", bn)
	}
}

func TestGrafanaQueryRequestMarshal_FilterBinNanos(t *testing.T) {
	bn := int64(500)
	req := grafanaQueryRequest{
		ProjectID:      "p",
		SiteID:         "s",
		Start:          "2024-01-01T00:00:00Z",
		End:            "2024-01-02T00:00:00Z",
		Selection:      json.RawMessage(`{}`),
		GroupBy:        json.RawMessage(`{"type":"deviceId"}`),
		FilterBinNanos: &bn,
	}
	out, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	const want = `"filterBinNanos":500`
	if !strings.Contains(string(out), want) {
		t.Fatalf("marshal should contain %q, got %s", want, out)
	}
}
