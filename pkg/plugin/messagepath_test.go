package plugin

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseMessagePath(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		topic     string
		selectors []Selector
		wantErr   bool
	}{
		// --- Topic only ---
		{
			name:      "topic only",
			input:     "/my_topic",
			topic:     "/my_topic",
			selectors: nil,
		},
		{
			name:      "namespaced topic",
			input:     "/robot/sensors/imu",
			topic:     "/robot/sensors/imu",
			selectors: nil,
		},

		// --- Field access ---
		{
			name:  "single field",
			input: "/my_models.total",
			topic: "/my_models",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "total"},
			},
		},
		{
			name:  "nested fields",
			input: "/my_models.stats.pages",
			topic: "/my_models",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "stats"},
				{Kind: SelectorKindField, Field: "pages"},
			},
		},
		{
			name:  "deep nested with namespaced topic",
			input: "/robot/sensors/imu.linear_acceleration.x",
			topic: "/robot/sensors/imu",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "linear_acceleration"},
				{Kind: SelectorKindField, Field: "x"},
			},
		},

		// --- Single index ---
		{
			name:  "single positive index",
			input: "/my_models.objects[1].width",
			topic: "/my_models",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "objects"},
				{Kind: SelectorKindSlice, Start: intPtr(1), End: intPtr(1)},
				{Kind: SelectorKindField, Field: "width"},
			},
		},
		{
			name:  "single negative index",
			input: "/my_models.objects[-1].width",
			topic: "/my_models",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "objects"},
				{Kind: SelectorKindSlice, Start: intPtr(-1), End: intPtr(-1)},
				{Kind: SelectorKindField, Field: "width"},
			},
		},
		{
			name:  "zero index",
			input: "/t.arr[0]",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "arr"},
				{Kind: SelectorKindSlice, Start: intPtr(0), End: intPtr(0)},
			},
		},

		// --- Slices ---
		{
			name:  "full slice [:]",
			input: "/my_options.colors[:].g",
			topic: "/my_options",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "colors"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindField, Field: "g"},
			},
		},
		{
			name:  "range slice [1:3]",
			input: "/my_options.colors[1:3].r",
			topic: "/my_options",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "colors"},
				{Kind: SelectorKindSlice, Start: intPtr(1), End: intPtr(3)},
				{Kind: SelectorKindField, Field: "r"},
			},
		},
		{
			name:  "start-only slice [1:]",
			input: "/my_options.colors[1:]",
			topic: "/my_options",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "colors"},
				{Kind: SelectorKindSlice, Start: intPtr(1)},
			},
		},
		{
			name:  "end-only slice [:3]",
			input: "/my_options.colors[:3]",
			topic: "/my_options",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "colors"},
				{Kind: SelectorKindSlice, End: intPtr(3)},
			},
		},
		{
			name:  "negative range slice [-2:-1]",
			input: "/my_options.numbers[-2:-1]",
			topic: "/my_options",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "numbers"},
				{Kind: SelectorKindSlice, Start: intPtr(-2), End: intPtr(-1)},
			},
		},

		// --- Filters ---
		{
			name:  "filter with number >",
			input: "/my_books{stats.pages>200}",
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: ">", Path: []string{"stats", "pages"}, Value: float64(200)},
			},
		},
		{
			name:  "filter with ==",
			input: "/my_books{stats.pages==100}",
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"stats", "pages"}, Value: float64(100)},
			},
		},
		{
			name:  "filter with boolean",
			input: "/my_books.readers[:]{isCurrentlyReading==true}.name",
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "readers"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"isCurrentlyReading"}, Value: true},
				{Kind: SelectorKindField, Field: "name"},
			},
		},
		{
			name:  "filter with single-quoted string",
			input: `/my_books{stats.author=='Beatrice Potter'}`,
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"stats", "author"}, Value: "Beatrice Potter"},
			},
		},
		{
			name:  "filter with double-quoted string",
			input: `/my_books{stats.author=="Beatrice Potter"}`,
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"stats", "author"}, Value: "Beatrice Potter"},
			},
		},
		{
			name:  "filter with != operator",
			input: "/t.items[:]{status!=0}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "items"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindCondition, Op: "!=", Path: []string{"status"}, Value: float64(0)},
			},
		},
		{
			name:  "filter with >= operator",
			input: "/t{x>=10}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: ">=", Path: []string{"x"}, Value: float64(10)},
			},
		},
		{
			name:  "filter with <= operator",
			input: "/t{x<=5}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "<=", Path: []string{"x"}, Value: float64(5)},
			},
		},
		{
			name:  "filter with < operator",
			input: "/t{x<3}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "<", Path: []string{"x"}, Value: float64(3)},
			},
		},
		{
			name:  "filter with bare word enum name",
			input: "/my_topic{status==MOVING}",
			topic: "/my_topic",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"status"}, Value: "MOVING"},
			},
		},
		{
			name:  "filter with false boolean",
			input: "/t{active==false}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"active"}, Value: false},
			},
		},
		{
			name:  "filter with negative number",
			input: "/t{temp>-10}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: ">", Path: []string{"temp"}, Value: float64(-10)},
			},
		},
		{
			name:  "filter with float number",
			input: "/t{val==3.14}",
			topic: "/t",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"val"}, Value: float64(3.14)},
			},
		},

		// --- Multiple filters ---
		{
			name:  "multiple filters",
			input: "/my_books.readers[:]{id==1}{isCurrentlyReading==true}.name",
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "readers"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"id"}, Value: float64(1)},
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"isCurrentlyReading"}, Value: true},
				{Kind: SelectorKindField, Field: "name"},
			},
		},

		// --- Complex combined ---
		{
			name:  "complex path from docs",
			input: "/my_books.readers[:]{isCurrentlyReading==true}.name",
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "readers"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"isCurrentlyReading"}, Value: true},
				{Kind: SelectorKindField, Field: "name"},
			},
		},
		{
			name:  "string filter with alternate quotes",
			input: `/my_books{stats.author=='Tommy "Two Gun" Simon'}.readers[:].name`,
			topic: "/my_books",
			selectors: []Selector{
				{Kind: SelectorKindCondition, Op: "==", Path: []string{"stats", "author"}, Value: `Tommy "Two Gun" Simon`},
				{Kind: SelectorKindField, Field: "readers"},
				{Kind: SelectorKindSlice},
				{Kind: SelectorKindField, Field: "name"},
			},
		},

		// --- Error cases ---
		{
			name:    "empty input",
			input:   "",
			wantErr: true,
		},
		{
			name:  "missing leading slash",
			input: "my_topic.field",
			topic: "my_topic",
			selectors: []Selector{
				{Kind: SelectorKindField, Field: "field"},
			},
			wantErr: false,
		},
		{
			name:    "only slash",
			input:   "/",
			wantErr: true,
		},
		{
			name:    "function syntax",
			input:   "/imu.linear_acceleration.x.@abs",
			wantErr: true,
		},
		{
			name:    "function with operand",
			input:   "/wheel.speed.@mul",
			wantErr: true,
		},
		{
			name:    "variable in slice start",
			input:   "/t.colors[$start:3]",
			wantErr: true,
		},
		{
			name:    "variable in slice end",
			input:   "/t.colors[1:$end]",
			wantErr: true,
		},
		{
			name:    "variable in filter",
			input:   "/t.readers[:]{id==$my_id}",
			wantErr: true,
		},
		{
			name:    "unterminated string in filter",
			input:   `/t{name=="hello}`,
			wantErr: true,
		},
		{
			name:    "trailing dot",
			input:   "/t.",
			wantErr: true,
		},
		{
			name:    "unclosed bracket",
			input:   "/t.arr[1",
			wantErr: true,
		},
		{
			name:    "unclosed brace",
			input:   "/t{x==1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			topic, selectors, err := ParseMessagePath(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseMessagePath(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if tt.wantErr {
				return
			}
			if topic != tt.topic {
				t.Errorf("ParseMessagePath(%q) topic = %q, want %q", tt.input, topic, tt.topic)
			}
			if !reflect.DeepEqual(selectors, tt.selectors) {
				t.Errorf("ParseMessagePath(%q) selectors = %v, want %v", tt.input, selectors, tt.selectors)
			}
		})
	}
}

func TestParseMessagePaths(t *testing.T) {
	t.Run("multiple paths same topic", func(t *testing.T) {
		mps, err := ParseMessagePaths([]string{
			"/my_models.objects[:].width",
			"/my_models.objects[:].height",
		})
		if err != nil {
			t.Fatal(err)
		}
		if mps.Topic != "/my_models" {
			t.Errorf("topic = %q, want /my_models", mps.Topic)
		}
		if len(mps.SelectorPaths) != 2 {
			t.Fatalf("len(selectorPaths) = %d, want 2", len(mps.SelectorPaths))
		}
		// First path: .objects[:].width
		want0 := []Selector{
			{Kind: SelectorKindField, Field: "objects"},
			{Kind: SelectorKindSlice},
			{Kind: SelectorKindField, Field: "width"},
		}
		if !reflect.DeepEqual(mps.SelectorPaths[0], want0) {
			t.Errorf("selectorPaths[0] = %v, want %v", mps.SelectorPaths[0], want0)
		}
		// Second path: .objects[:].height
		want1 := []Selector{
			{Kind: SelectorKindField, Field: "objects"},
			{Kind: SelectorKindSlice},
			{Kind: SelectorKindField, Field: "height"},
		}
		if !reflect.DeepEqual(mps.SelectorPaths[1], want1) {
			t.Errorf("selectorPaths[1] = %v, want %v", mps.SelectorPaths[1], want1)
		}
	})

	t.Run("mismatched topics", func(t *testing.T) {
		_, err := ParseMessagePaths([]string{
			"/topic_a.field",
			"/topic_b.field",
		})
		if err == nil {
			t.Error("expected error for mismatched topics, got nil")
		}
	})

	t.Run("empty input", func(t *testing.T) {
		_, err := ParseMessagePaths(nil)
		if err == nil {
			t.Error("expected error for empty input, got nil")
		}
	})

	t.Run("single path", func(t *testing.T) {
		mps, err := ParseMessagePaths([]string{"/t.field"})
		if err != nil {
			t.Fatal(err)
		}
		if mps.Topic != "/t" {
			t.Errorf("topic = %q, want /t", mps.Topic)
		}
		if len(mps.SelectorPaths) != 1 {
			t.Fatalf("len(selectorPaths) = %d, want 1", len(mps.SelectorPaths))
		}
	})
}

func TestSelectorJSON(t *testing.T) {
	t.Run("field projection", func(t *testing.T) {
		sel := Selector{Kind: SelectorKindField, Field: "name"}
		b, err := json.Marshal(sel)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"kind":"field","field":"name"}`
		if string(b) != want {
			t.Errorf("json = %s, want %s", b, want)
		}
	})

	t.Run("slice with bounds", func(t *testing.T) {
		sel := Selector{Kind: SelectorKindSlice, Start: intPtr(1), End: intPtr(3)}
		b, err := json.Marshal(sel)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"kind":"slice","start":1,"end":3}`
		if string(b) != want {
			t.Errorf("json = %s, want %s", b, want)
		}
	})

	t.Run("unbounded slice", func(t *testing.T) {
		sel := Selector{Kind: SelectorKindSlice}
		b, err := json.Marshal(sel)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"kind":"slice"}`
		if string(b) != want {
			t.Errorf("json = %s, want %s", b, want)
		}
	})

	t.Run("condition with number", func(t *testing.T) {
		sel := Selector{
			Kind:  SelectorKindCondition,
			Op:    ">",
			Path:  []string{"stats", "pages"},
			Value: float64(200),
		}
		b, err := json.Marshal(sel)
		if err != nil {
			t.Fatal(err)
		}
		// Go's json.Marshal escapes > as \u003e by default.
		want := `{"kind":"condition","op":"\u003e","path":["stats","pages"],"value":200}`
		if string(b) != want {
			t.Errorf("json = %s, want %s", b, want)
		}
	})

	t.Run("condition with boolean", func(t *testing.T) {
		sel := Selector{
			Kind:  SelectorKindCondition,
			Op:    "==",
			Path:  []string{"active"},
			Value: true,
		}
		b, err := json.Marshal(sel)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"kind":"condition","op":"==","path":["active"],"value":true}`
		if string(b) != want {
			t.Errorf("json = %s, want %s", b, want)
		}
	})

	t.Run("full MessagePathSet", func(t *testing.T) {
		mps := MessagePathSet{
			Topic: "/my_topic",
			SelectorPaths: [][]Selector{
				{
					{Kind: SelectorKindField, Field: "objects"},
					{Kind: SelectorKindSlice},
					{Kind: SelectorKindField, Field: "width"},
				},
			},
		}
		b, err := json.Marshal(mps)
		if err != nil {
			t.Fatal(err)
		}
		// Verify it round-trips through JSON.
		var decoded map[string]interface{}
		if err := json.Unmarshal(b, &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded["topic"] != "/my_topic" {
			t.Errorf("topic = %v, want /my_topic", decoded["topic"])
		}
	})
}
