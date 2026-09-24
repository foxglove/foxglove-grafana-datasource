@{%
const moo = require("moo");

const WORD_OPERATORS = new Set(["like", "contains", "not-contains", "exists", "in"]);
const LOGIC_WORDS = new Set(["and", "or"]);

const RESERVED_WORDS = new Set([...LOGIC_WORDS, ...WORD_OPERATORS]);

const VISUAL_FUNCTION = "visual";

const lexer = moo.compile({
  ws: { match: /[ \t\r\n]+/, lineBreaks: true },
  qstring: { match: /"(?:\\.|[^"\\])*"/, lineBreaks: true },
  lparen: "(",
  rparen: ")",
  op: /==|!=|>=|<=|>|</,
  assign: "=",
  word: /[^\s()"=<>!\\]+/,
  err: moo.error,
});

function decodeQuoted(text) {
  return text.slice(1, -1).replace(/\\(.)/g, "$1");
}

function isReservedWord(token) {
  return RESERVED_WORDS.has(token.value.toLowerCase());
}

function isValuedWordOperator(value) {
  const lower = value.toLowerCase();
  return WORD_OPERATORS.has(lower) && lower !== "exists";
}
%}

@lexer lexer

main ->
    _            {% () => undefined %}
  | _ orExpr _   {% (d) => d[1] %}

_ -> %ws:?       {% () => null %}
__ -> %ws        {% () => null %}

orExpr ->
    andExpr                      {% id %}
  | orExpr __ or __ andExpr      {% (d) => ({ type: "or", left: d[0], right: d[4] }) %}

andExpr ->
    primary                      {% id %}
  | andExpr __ and __ primary    {% (d) => ({ type: "and", left: d[0], right: d[4] }) %}

and -> %word {% (d, _l, reject) => (d[0].value.toLowerCase() === "and" ? null : reject) %}
or  -> %word {% (d, _l, reject) => (d[0].value.toLowerCase() === "or" ? null : reject) %}

primary ->
    %lparen _ orExpr _ %rparen  {% (d) => d[2] %}
  | comparison                  {% id %}
  | visual                      {% id %}

comparison ->
    field __ symOp __ value   {% (d) => ({ type: "comparison", field: d[0], opText: d[2], value: d[4] }) %}
  | field __ wordOp __ value  {% (d) => ({ type: "comparison", field: d[0], opText: d[2], value: d[4] }) %}
  | field __ existsOp         {% (d) => ({ type: "comparison", field: d[0], opText: d[2] }) %}

field -> fieldPart:+          {% (d) => d[0].map((token) => token.text).join("") %}
fieldPart ->
    %word    {% (d, _l, reject) => (isReservedWord(d[0]) ? reject : d[0]) %}
  | %qstring {% (d) => d[0] %}

symOp -> %op      {% (d) => d[0].value %}
wordOp -> %word   {% (d, _l, reject) => (isValuedWordOperator(d[0].value) ? d[0].value : reject) %}
existsOp -> %word {% (d, _l, reject) => (d[0].value.toLowerCase() === "exists" ? d[0].value : reject) %}

value ->
    %word    {% (d) => d[0].value %}
  | %qstring {% (d) => decodeQuoted(d[0].value) %}

visual -> visualName %lparen _ %qstring _ %rparen
  {% (d) => ({ type: "semantic", text: decodeQuoted(d[3].value) }) %}
visualName -> %word
  {% (d, _l, reject) => (d[0].value.toLowerCase() === VISUAL_FUNCTION ? null : reject) %}
