package plugin

import (
	"context"
	"encoding/json"
	"io"
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

func TestCheckHealth_MissingAPIKey(t *testing.T) {
	ds := Datasource{httpClient: http.DefaultClient}
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData:                []byte(`{"projectId":"p","siteId":"s"}`),
				DecryptedSecureJSONData: map[string]string{},
			},
		},
	})
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

func TestCheckHealth_ConnectionErrorIsGeneric(t *testing.T) {
	// Point the client at a closed local server so Dial fails with a connection error
	// that would otherwise leak into the UI message.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	serverURL := server.URL
	server.Close()

	ds := Datasource{httpClient: &http.Client{Timeout: time.Second}}
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"projectId":"p","siteId":"s","baseUrl":"` + serverURL + `"}`),
				DecryptedSecureJSONData: map[string]string{
					"apiKey": "test-key",
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusError {
		t.Fatalf("expected error status, got %v", res.Status)
	}
	if res.Message != healthCheckErrorMessage {
		t.Fatalf("expected generic health message, got %q", res.Message)
	}
	if strings.Contains(res.Message, serverURL) {
		t.Fatalf("health message must not include base URL, got %q", res.Message)
	}
}

func TestCheckHealth_NonOKBodyIsGeneric(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":"internal secret details"}`)
	}))
	defer server.Close()

	ds := Datasource{httpClient: server.Client()}
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"projectId":"p","siteId":"s","baseUrl":"` + server.URL + `"}`),
				DecryptedSecureJSONData: map[string]string{
					"apiKey": "test-key",
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusError {
		t.Fatalf("expected error status, got %v", res.Status)
	}
	if res.Message != healthCheckErrorMessage {
		t.Fatalf("expected generic health message, got %q", res.Message)
	}
	if strings.Contains(res.Message, "internal secret details") {
		t.Fatalf("health message must not include upstream body, got %q", res.Message)
	}
}

func TestCheckHealth_OK(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/devices" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected auth header: %q", got)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `[]`)
	}))
	defer server.Close()

	ds := Datasource{httpClient: server.Client()}
	res, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{
		PluginContext: backend.PluginContext{
			DataSourceInstanceSettings: &backend.DataSourceInstanceSettings{
				JSONData: []byte(`{"projectId":"p","siteId":"s","baseUrl":"` + server.URL + `"}`),
				DecryptedSecureJSONData: map[string]string{
					"apiKey": "test-key",
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != backend.HealthStatusOk {
		t.Fatalf("expected OK status, got %v (%s)", res.Status, res.Message)
	}
}
