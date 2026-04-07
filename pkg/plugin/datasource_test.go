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
}
