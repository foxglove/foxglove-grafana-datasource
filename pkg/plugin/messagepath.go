package plugin

import (
	"fmt"
	"strconv"
	"strings"
)

// SelectorKind represents the type of a message path selector.
type SelectorKind string

const (
	// SelectorKindField is a field projection selector.
	SelectorKindField SelectorKind = "field"
	// SelectorKindSlice is a slice selector.
	SelectorKindSlice SelectorKind = "slice"
	// SelectorKindCondition is a condition/filter selector.
	SelectorKindCondition SelectorKind = "condition"
)

// Selector represents a single selector in a message path.
// Depending on Kind, different fields are populated:
//   - "field":     Field
//   - "slice":     Start, End (both optional; nil means unbounded)
//   - "condition": Op, Path, Value
type Selector struct {
	Kind SelectorKind `json:"kind"`

	// FieldProjection: the name of the field to access.
	Field string `json:"field,omitempty"`

	// Slice: the start and end indices (inclusive). Nil means unbounded.
	Start *int `json:"start,omitempty"`
	End   *int `json:"end,omitempty"`

	// Condition: the comparison operator, field path, and right-hand-side value.
	Op    string      `json:"op,omitempty"`
	Path  []string    `json:"path,omitempty"`
	Value interface{} `json:"value,omitempty"`
}

// MessagePathSet represents a set of message paths sharing a common topic,
// matching the Foxglove API MessagePathSet schema.
type MessagePathSet struct {
	Topic         string       `json:"topic"`
	SelectorPaths [][]Selector `json:"selectorPaths"`
}

// ParseMessagePath parses a Foxglove message path string into a topic and a
// sequence of selectors.
//
// Supported syntax:
//   - Topic: /topic or /namespaced/topic
//   - Field access: .fieldName
//   - Single index: [n] (maps to Slice with start=n, end=n)
//   - Range slice: [start:end], [:end], [start:], [:]
//   - Filter: {field==value}, {nested.path>100}, {name=="hello"}
//   - Multiple filters: {a==1}{b>2}
//
// Unsupported syntax (returns error):
//   - Functions (.@abs, .@norm, .@rpy, etc.)
//   - Variables ($var) in slices or filters
func ParseMessagePath(input string) (topic string, selectors []Selector, err error) {
	p := &parser{input: input}

	topic, err = p.parseTopic()
	if err != nil {
		return "", nil, err
	}

	selectors, err = p.parseSelectors()
	if err != nil {
		return "", nil, err
	}

	return topic, selectors, nil
}

// ParseMessagePaths parses multiple message path strings that must share a
// common topic, and returns a MessagePathSet suitable for the Foxglove API.
func ParseMessagePaths(inputs []string) (*MessagePathSet, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("no message paths provided")
	}

	var topic string
	selectorPaths := make([][]Selector, 0, len(inputs))

	for i, input := range inputs {
		t, sels, err := ParseMessagePath(input)
		if err != nil {
			return nil, fmt.Errorf("path %d (%q): %w", i, input, err)
		}
		if i == 0 {
			topic = t
		} else if t != topic {
			return nil, fmt.Errorf("path %d (%q): topic %q doesn't match expected topic %q", i, input, t, topic)
		}
		selectorPaths = append(selectorPaths, sels)
	}

	return &MessagePathSet{
		Topic:         topic,
		SelectorPaths: selectorPaths,
	}, nil
}

// ---------------------------------------------------------------------------
// Recursive descent parser
// ---------------------------------------------------------------------------

type parser struct {
	input string
	pos   int
}

func (p *parser) peek() (byte, bool) {
	if p.pos >= len(p.input) {
		return 0, false
	}
	return p.input[p.pos], true
}

func (p *parser) advance() byte {
	ch := p.input[p.pos]
	p.pos++
	return ch
}

func (p *parser) expect(ch byte) error {
	if p.pos >= len(p.input) {
		return fmt.Errorf("at position %d: unexpected end of input, expected '%c'", p.pos, ch)
	}
	if p.input[p.pos] != ch {
		return fmt.Errorf("at position %d: expected '%c', got '%c'", p.pos, ch, p.input[p.pos])
	}
	p.pos++
	return nil
}

func (p *parser) atEnd() bool {
	return p.pos >= len(p.input)
}

// parseTopic extracts the topic from the beginning of the path.
// The topic starts with '/' and extends until '.', '[', '{', or end of string.
func (p *parser) parseTopic() (string, error) {
	if p.atEnd() {
		return "", fmt.Errorf("empty message path")
	}

	ch, _ := p.peek()
	if ch != '/' {
		return "", fmt.Errorf("message path must start with '/', got '%c'", ch)
	}
	start := p.pos
	p.advance() // consume leading '/'

	for !p.atEnd() {
		ch, _ := p.peek()
		if ch == '.' || ch == '[' || ch == '{' {
			break
		}
		p.advance()
	}

	topic := p.input[start:p.pos]
	if len(topic) < 2 {
		return "", fmt.Errorf("empty topic name after '/'")
	}

	return topic, nil
}

// parseSelectors parses all selectors following the topic.
func (p *parser) parseSelectors() ([]Selector, error) {
	var selectors []Selector

	for !p.atEnd() {
		ch, _ := p.peek()
		switch ch {
		case '.':
			sel, err := p.parseFieldAccess()
			if err != nil {
				return nil, err
			}
			selectors = append(selectors, sel)
		case '[':
			sel, err := p.parseSlice()
			if err != nil {
				return nil, err
			}
			selectors = append(selectors, sel)
		case '{':
			sel, err := p.parseCondition()
			if err != nil {
				return nil, err
			}
			selectors = append(selectors, sel)
		default:
			return nil, fmt.Errorf("at position %d: unexpected character '%c'", p.pos, ch)
		}
	}

	return selectors, nil
}

// parseFieldAccess parses ".fieldName". Returns an error for function syntax ".@".
func (p *parser) parseFieldAccess() (Selector, error) {
	p.advance() // consume '.'

	if p.atEnd() {
		return Selector{}, fmt.Errorf("at position %d: unexpected end of input after '.'", p.pos)
	}

	ch, _ := p.peek()
	if ch == '@' {
		return Selector{}, fmt.Errorf("at position %d: functions (.@) are not supported", p.pos)
	}

	name, err := p.parseIdentifier()
	if err != nil {
		return Selector{}, err
	}

	return Selector{
		Kind:  SelectorKindField,
		Field: name,
	}, nil
}

// parseIdentifier reads a contiguous identifier (letters, digits, underscores).
func (p *parser) parseIdentifier() (string, error) {
	start := p.pos
	for !p.atEnd() {
		ch, _ := p.peek()
		if isIdentChar(ch) {
			p.advance()
		} else {
			break
		}
	}

	if p.pos == start {
		if p.atEnd() {
			return "", fmt.Errorf("at position %d: unexpected end of input, expected identifier", p.pos)
		}
		return "", fmt.Errorf("at position %d: expected identifier, got '%c'", p.pos, p.input[p.pos])
	}

	return p.input[start:p.pos], nil
}

// isIdentChar returns true if ch is a valid identifier character.
func isIdentChar(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
		(ch >= '0' && ch <= '9') || ch == '_'
}

// parseSlice parses bracket notation: [n], [start:end], [:], [start:], [:end].
func (p *parser) parseSlice() (Selector, error) {
	p.advance() // consume '['

	if p.atEnd() {
		return Selector{}, fmt.Errorf("at position %d: unexpected end of input after '['", p.pos)
	}

	ch, _ := p.peek()
	if ch == '$' {
		return Selector{}, fmt.Errorf("at position %d: variables ($) in slices are not supported", p.pos)
	}

	sel := Selector{Kind: SelectorKindSlice}

	// Parse optional start index.
	hasStart := false
	ch, _ = p.peek()
	if ch == '-' || isDigit(ch) {
		v, err := p.parseInt()
		if err != nil {
			return Selector{}, err
		}
		sel.Start = intPtr(v)
		hasStart = true
	}

	if p.atEnd() {
		return Selector{}, fmt.Errorf("at position %d: unexpected end of input in slice", p.pos)
	}

	ch, _ = p.peek()
	if ch == ':' {
		p.advance() // consume ':'

		// Check for variable after colon.
		if !p.atEnd() {
			ch, _ = p.peek()
			if ch == '$' {
				return Selector{}, fmt.Errorf("at position %d: variables ($) in slices are not supported", p.pos)
			}
		}

		// Parse optional end index.
		if !p.atEnd() {
			ch, _ = p.peek()
			if ch == '-' || isDigit(ch) {
				v, err := p.parseInt()
				if err != nil {
					return Selector{}, err
				}
				sel.End = intPtr(v)
			}
		}
	} else if hasStart {
		// Single index [n] → start=n, end=n (inclusive).
		sel.End = intPtr(*sel.Start)
	} else {
		return Selector{}, fmt.Errorf("at position %d: expected index or ':' in slice, got '%c'", p.pos, ch)
	}

	if err := p.expect(']'); err != nil {
		return Selector{}, err
	}

	return sel, nil
}

// parseInt parses a (possibly negative) integer.
func (p *parser) parseInt() (int, error) {
	start := p.pos

	if ch, ok := p.peek(); ok && ch == '-' {
		p.advance()
	}

	digitStart := p.pos
	for !p.atEnd() {
		ch, _ := p.peek()
		if isDigit(ch) {
			p.advance()
		} else {
			break
		}
	}

	if p.pos == digitStart {
		return 0, fmt.Errorf("at position %d: expected digit", p.pos)
	}

	v, err := strconv.Atoi(p.input[start:p.pos])
	if err != nil {
		return 0, fmt.Errorf("at position %d: invalid integer: %w", start, err)
	}

	return v, nil
}

func isDigit(ch byte) bool {
	return ch >= '0' && ch <= '9'
}

func intPtr(v int) *int {
	return &v
}

// parseCondition parses a filter: {path.to.field op value}.
func (p *parser) parseCondition() (Selector, error) {
	p.advance() // consume '{'

	if p.atEnd() {
		return Selector{}, fmt.Errorf("at position %d: unexpected end of input after '{'", p.pos)
	}

	// Parse the left-hand-side field path.
	path, err := p.parseDottedPath()
	if err != nil {
		return Selector{}, fmt.Errorf("in filter: %w", err)
	}

	// Parse the comparison operator.
	op, err := p.parseOperator()
	if err != nil {
		return Selector{}, fmt.Errorf("in filter: %w", err)
	}

	// Parse the right-hand-side value.
	value, err := p.parseConditionValue()
	if err != nil {
		return Selector{}, fmt.Errorf("in filter: %w", err)
	}

	if err := p.expect('}'); err != nil {
		return Selector{}, err
	}

	return Selector{
		Kind:  SelectorKindCondition,
		Op:    op,
		Path:  path,
		Value: value,
	}, nil
}

// parseDottedPath parses a dot-separated field path like "stats.pages".
func (p *parser) parseDottedPath() ([]string, error) {
	var parts []string

	name, err := p.parseIdentifier()
	if err != nil {
		return nil, err
	}
	parts = append(parts, name)

	for !p.atEnd() {
		ch, _ := p.peek()
		if ch != '.' {
			break
		}
		p.advance() // consume '.'
		name, err = p.parseIdentifier()
		if err != nil {
			return nil, err
		}
		parts = append(parts, name)
	}

	return parts, nil
}

// parseOperator parses a comparison operator: ==, !=, >=, <=, >, <.
func (p *parser) parseOperator() (string, error) {
	if p.atEnd() {
		return "", fmt.Errorf("at position %d: unexpected end of input, expected operator", p.pos)
	}

	// Try two-character operators first.
	if p.pos+1 < len(p.input) {
		two := p.input[p.pos : p.pos+2]
		switch two {
		case "==", "!=", ">=", "<=":
			p.pos += 2
			return two, nil
		}
	}

	// Single-character operators.
	ch := p.input[p.pos]
	if ch == '>' || ch == '<' {
		p.pos++
		return string(ch), nil
	}

	return "", fmt.Errorf("at position %d: expected comparison operator, got '%c'", p.pos, ch)
}

// parseConditionValue parses the right-hand side of a condition.
// Supports: quoted strings, numbers, booleans, and bare words (enum names).
func (p *parser) parseConditionValue() (interface{}, error) {
	if p.atEnd() {
		return nil, fmt.Errorf("at position %d: unexpected end of input, expected value", p.pos)
	}

	ch, _ := p.peek()

	// Variable reference.
	if ch == '$' {
		return nil, fmt.Errorf("at position %d: variables ($) in filters are not supported", p.pos)
	}

	// Quoted string.
	if ch == '\'' || ch == '"' {
		return p.parseQuotedString()
	}

	// Number (possibly negative).
	if ch == '-' || isDigit(ch) {
		return p.parseNumber()
	}

	// Boolean or bare word (enum name).
	word, err := p.parseBareWord()
	if err != nil {
		return nil, err
	}
	switch word {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return word, nil // enum name treated as string
	}
}

// parseQuotedString parses a single- or double-quoted string literal.
// Escape sequences within strings are not supported.
func (p *parser) parseQuotedString() (string, error) {
	quote := p.advance() // consume opening quote
	var buf strings.Builder
	for !p.atEnd() {
		ch := p.advance()
		if ch == quote {
			return buf.String(), nil
		}
		buf.WriteByte(ch)
	}
	return "", fmt.Errorf("at position %d: unterminated string", p.pos)
}

// parseNumber parses an integer or floating-point number and returns it as float64.
func (p *parser) parseNumber() (float64, error) {
	start := p.pos

	if ch, ok := p.peek(); ok && ch == '-' {
		p.advance()
	}

	isFloat := false
	digitStart := p.pos
	for !p.atEnd() {
		ch, _ := p.peek()
		if isDigit(ch) {
			p.advance()
		} else if ch == '.' && !isFloat {
			isFloat = true
			p.advance()
		} else {
			break
		}
	}

	if p.pos == digitStart {
		return 0, fmt.Errorf("at position %d: expected digit", p.pos)
	}

	v, err := strconv.ParseFloat(p.input[start:p.pos], 64)
	if err != nil {
		return 0, fmt.Errorf("at position %d: invalid number: %w", start, err)
	}

	return v, nil
}

// parseBareWord reads contiguous identifier characters (for booleans and enum names).
func (p *parser) parseBareWord() (string, error) {
	start := p.pos
	for !p.atEnd() {
		ch, _ := p.peek()
		if isIdentChar(ch) {
			p.advance()
		} else {
			break
		}
	}
	if p.pos == start {
		if p.atEnd() {
			return "", fmt.Errorf("at position %d: unexpected end of input, expected value", p.pos)
		}
		return "", fmt.Errorf("at position %d: unexpected character '%c', expected value", p.pos, p.input[p.pos])
	}
	return p.input[start:p.pos], nil
}
