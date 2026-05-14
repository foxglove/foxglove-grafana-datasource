package plugin

import (
	"context"
	"encoding/json"
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

func TestAggregationWireHasPositiveInterval(t *testing.T) {
	if aggregationWireHasPositiveInterval(nil) {
		t.Fatal("nil should be false")
	}
	if aggregationWireHasPositiveInterval(json.RawMessage(`null`)) {
		t.Fatal("null should be false")
	}
	if aggregationWireHasPositiveInterval(json.RawMessage(`{}`)) {
		t.Fatal("empty object should be false")
	}
	if aggregationWireHasPositiveInterval(json.RawMessage(`{"intervalNanoseconds":0,"type":"max"}`)) {
		t.Fatal("zero ns should be false")
	}
	if !aggregationWireHasPositiveInterval(json.RawMessage(`{"intervalNanoseconds":1,"type":"max"}`)) {
		t.Fatal("positive ns should be true")
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
