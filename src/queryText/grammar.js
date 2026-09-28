// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

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
let grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "main", "symbols": ["_"], "postprocess": () => undefined},
    {"name": "main", "symbols": ["_", "orExpr", "_"], "postprocess": (d) => d[1]},
    {"name": "_$ebnf$1", "symbols": [(lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": id},
    {"name": "_$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": () => null},
    {"name": "__", "symbols": [(lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": () => null},
    {"name": "orExpr", "symbols": ["andExpr"], "postprocess": id},
    {"name": "orExpr", "symbols": ["orExpr", "__", "or", "__", "andExpr"], "postprocess": (d) => ({ type: "or", left: d[0], right: d[4] })},
    {"name": "andExpr", "symbols": ["primary"], "postprocess": id},
    {"name": "andExpr", "symbols": ["andExpr", "__", "and", "__", "primary"], "postprocess": (d) => ({ type: "and", left: d[0], right: d[4] })},
    {"name": "and", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (d[0].value.toLowerCase() === "and" ? null : reject)},
    {"name": "or", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (d[0].value.toLowerCase() === "or" ? null : reject)},
    {"name": "primary", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", "orExpr", "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)], "postprocess": (d) => d[2]},
    {"name": "primary", "symbols": ["comparison"], "postprocess": id},
    {"name": "primary", "symbols": ["visual"], "postprocess": id},
    {"name": "comparison", "symbols": ["field", "__", "symOp", "__", "value"], "postprocess": (d) => ({ type: "comparison", field: d[0], opText: d[2], value: d[4] })},
    {"name": "comparison", "symbols": ["field", "__", "wordOp", "__", "value"], "postprocess": (d) => ({ type: "comparison", field: d[0], opText: d[2], value: d[4] })},
    {"name": "comparison", "symbols": ["field", "__", "existsOp"], "postprocess": (d) => ({ type: "comparison", field: d[0], opText: d[2] })},
    {"name": "field$ebnf$1", "symbols": ["fieldPart"]},
    {"name": "field$ebnf$1", "symbols": ["field$ebnf$1", "fieldPart"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "field", "symbols": ["field$ebnf$1"], "postprocess": (d) => d[0].map((token) => token.text).join("")},
    {"name": "fieldPart", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (isReservedWord(d[0]) ? reject : d[0])},
    {"name": "fieldPart", "symbols": [(lexer.has("qstring") ? {type: "qstring"} : qstring)], "postprocess": (d) => d[0]},
    {"name": "symOp", "symbols": [(lexer.has("op") ? {type: "op"} : op)], "postprocess": (d) => d[0].value},
    {"name": "wordOp", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (isValuedWordOperator(d[0].value) ? d[0].value : reject)},
    {"name": "existsOp", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (d[0].value.toLowerCase() === "exists" ? d[0].value : reject)},
    {"name": "value", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d) => d[0].value},
    {"name": "value", "symbols": [(lexer.has("qstring") ? {type: "qstring"} : qstring)], "postprocess": (d) => decodeQuoted(d[0].value)},
    {"name": "visual", "symbols": ["visualName", (lexer.has("lparen") ? {type: "lparen"} : lparen), "_", (lexer.has("qstring") ? {type: "qstring"} : qstring), "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)], "postprocess": (d) => ({ type: "semantic", text: decodeQuoted(d[3].value) })},
    {"name": "visualName", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": (d, _l, reject) => (d[0].value.toLowerCase() === VISUAL_FUNCTION ? null : reject)}
]
  , ParserStart: "main"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
