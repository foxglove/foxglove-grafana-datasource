# This file incorporates work covered by the following copyright and
# permission notice:
#
#   Copyright 2018-2020 Cruise LLC
#
#   This source code is licensed under the Apache License, Version 2.0,
#   found at http://www.apache.org/licenses/LICENSE-2.0
#   You may not use this file except in compliance with the License.

# This grammar matches FoxQL expressions like this:
#
# /some/topic.sub_msgs[0].some_field
#
# The part with slashes is the topic name, and the part after that is the
# field path. This is a slight break from ROS convention, but makes it
# easier for both humans and computers to understand what's going on.
main -> topicName messagePath functionChain:?
  {% (d) => ({
    topicName: d[0].value,
    topicNameRepr: d[0].repr,
    parts: d[1],
    functionChain: d[2] != undefined ? d[2] : undefined
  }) %}

## Primitives

# A typical id like `some_thing_123`.
id -> [a-zA-Z0-9_-]:+
  {% (d) => d[0].join("") %}

# Numbers.
integer -> [+-]:? [0-9]:+  {%
  (d) => {
    const repr = d.flat().join("");
    const bigint = BigInt(repr);
    const int = Number(repr);
    // only convert to bigint if needed
    if (int == bigint) {
      return { value: int, repr };
    }
    return { value: bigint, repr };
  }
%}

float ->
[+-]:? (
[0-9]:+ "." [0-9]:* floatExponent:?
| "." [0-9]:+ floatExponent:?
| [0-9]:+ floatExponent
)
{%
  (d) => {
    const repr = d.flat(Infinity).join("");
    return { value: Number(repr), repr };
  }
%}

floatExponent -> [eE] [+-]:? [0-9]:+

# String of the form 'hi' or "hi". No escaping supported.
string
-> "'" [^']:* "'"   {% (d) => ({ value: d[1].join(""), repr: `'${d[1].join("")}'` }) %}
| "\"" [^"]:* "\"" {% (d) => ({ value: d[1].join(""), repr: `"${d[1].join("")}"` }) %}

variable -> "$" id:? {% (d, loc) => ({ value: {variableName: d[1] || "", startLoc: loc }, repr: `$${d[1] || ""}` }) %}

# An unquoted identifier used as an enum name or boolean literal in filter values.
# Must start with a letter or underscore (not a digit).
identifier -> [a-zA-Z_] [a-zA-Z0-9_-]:*
  {% (d) => ({ value: d[0] + d[1].join(""), repr: d[0] + d[1].join(""), isIdentifier: true }) %}

# A value in a filter expression.
value -> integer  {% (d) => d[0] %}
| float {% (d) => d[0] %}
| string  {% (d) => d[0] %}
| identifier {% (d) => d[0] %}
| variable {% (d) => d[0] %}

## Topic part. Basically an id but with (optional) slashes.
topicName -> slashID:+     {% (d) => ({ value: d[0].join(""), repr: d[0].join("") }) %}
| id slashID:*  {% (d) => ({ value: d[0] + d[1].join(""), repr: d[0] + d[1].join("") }) %}
| quotedString  {% id %}
slashID -> "/" id:?
{% (d) => d.join("") %}

quotedString ->
"\""
(
[^"\\]
| "\\\\" {% d => "\\" %}
| "\\\"" {% d => `"` %}
):*
"\""
{%
  d => ({
    value: d[1].join(''),
    repr: `"${d[1].join('').replace(/[\\"]/g, char => `\\${char}`)}"`
  })
%}

## `messagePath` part.

# Multiple `messagePathElements`, optionally with an additional dot for autocomplete. When that
# extra dot is given, make sure to add an empty name field so the path will be marked as invalid,
# and the autocomplete is actually shown.
# Return type: `FoxqlPart[]`.
messagePath -> messagePathElement:* ".":?
{%
  (d) =>
  d[0]
  .reduce((acc, arr) => acc.concat(arr), [])
  .concat(d[1] ? [{ type: "name", name: "", repr: "" }] : [])
%}

# An element of the `messagePart`, of the form `field[10:20]{some_id==10}`.
# Multiple slices are not allowed (no 2d arrays in ROS).
# Return type: `FoxqlPart`.
messagePathElement ->
"." name slice:? filter:? {% (d) => [d[1], d[2], d[3]].filter(x => x !== null) %}
| filter {% id %}

# Name part is just an id, e.g. `field`.
name ->
id             {% (d) => ({ type: "name", name: d[0], repr: d[0] }) %}
| quotedString {% (d) => ({ type: "name", name: d[0].value, repr: d[0].repr }) %}

# Slice part; can be a single array index `[0]` or multiple `[0:10]`, or even infinite `[:]`.
sliceVal -> integer {% (d) => Number(d[0].value) %} | variable {% (d) => (d[0].value) %}
slice -> "[" sliceVal "]"
{% (d) => ({ type: "slice", start: d[1], end: d[1] }) %}
| "[" sliceVal:? ":" sliceVal:? "]"
{% (d) => ({ type: "slice", start: d[1] === null ? 0 : d[1], end: d[3] === null ? Infinity : d[3] }) %}

# For now, filters only support simple "foo.bar.baz" paths, so we need a separate rule for this.
# TODO: it would be nice if filters supported arbitrary sub-paths, such as "/diagnostics{status[0].hardware_id=='bar'}".
simplePath -> name ("." name):* {% (d) => [d[0]].concat(d[1].map((d) => d[1])) %}

filterOperator -> "==" | "!=" | "<" | "<=" | ">" | ">="

# Filter part; can be empty `{}` to allow for autocomplete. Can also be half-empty,
# like `{==0}`, also to allow for autocomplete.
filter -> "{" simplePath:? "}"
{%
  (d, loc) => {
    const path = d[1] || [];
    const pathRepr = path.map(p => p.repr).join('.');
    return {
      type: "filter",
      path: path,
      value: undefined,
      nameLoc: loc+1,
      valueLoc: loc+1,
      repr: pathRepr,
    };
  }
%}
| "{" simplePath:? filterOperator value "}"
{%
  ([ open, pathIn, [ operator ], value ], loc) => {
    const path = pathIn || [];
    const pathRepr = path.map(p => p.repr).join('.');
    return {
      type: "filter",
      operator,
      path: path,
      value: value.value,
      ...(value.isIdentifier ? { valueIsIdentifier: true } : {}),
      nameLoc: loc+1,
      valueLoc: loc + pathRepr.length + operator.length + 1,
      repr: `${pathRepr}${operator}${value.repr}`,
    };
  }
%}
| "{" simplePath:? filterOperator "}"
{%
  ([ open, pathIn, [ operator ] ], loc) => {
    const path = pathIn || [];
    const pathRepr = path.map(p => p.repr).join('.');
    return {
      type: "filter",
      operator,
      path: path,
      value: undefined,
      nameLoc: loc+1,
      valueLoc: loc + pathRepr.length + operator.length + 1,
      repr: `${pathRepr}${operator}`,
    };
  }
%}
| "{" simplePath:? "=" "}"
{%
  ([ open, pathIn ], loc) => {
    const path = pathIn || [];
    const pathRepr = path.map(p => p.repr).join('.');
    return {
      type: "filter",
      path: path,
      value: undefined,
      nameLoc: loc+1,
      valueLoc: loc + pathRepr.length + 1 + 1,
      repr: `${pathRepr}=`,
    };
  }
%}

## Message path function chain.
# One or more chained function segments at the end of a path, e.g.:
# - .@derivative
# - .@rpy.roll
# - .@rpy.roll.@degrees
functionChain -> functionSegment:+
  {% (d) => d[0] %}

functionSegment -> ".@" id:? functionArg:? functionField:?
  {%
    (d) => {
      const name = d[1];
      const arg = d[2];
      const field = d[3] ?? undefined;

      if (name == undefined) {
        return { function: "", fieldAccess: field };
      }

      let functionStr;
      if (arg == undefined) {
        functionStr = name;
      } else {
        functionStr = `${name}(${arg})`;
      }

      return { function: functionStr, fieldAccess: field };
    }
  %}

functionArg -> "(" [^)] :* ")"
  {% (d) => d[1].join("") %}

functionField -> "." id:?
  {% (d) => d[1] ?? "" %}
