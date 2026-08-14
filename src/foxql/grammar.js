// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }
var grammar = {
    Lexer: undefined,
    ParserRules: [
    {"name": "main$ebnf$1", "symbols": ["functionChain"], "postprocess": id},
    {"name": "main$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "main", "symbols": ["topicName", "messagePath", "main$ebnf$1"], "postprocess":  (d) => ({
          topicName: d[0].value,
          topicNameRepr: d[0].repr,
          parts: d[1],
          functionChain: d[2] != undefined ? d[2] : undefined
        }) },
    {"name": "id$ebnf$1", "symbols": [/[a-zA-Z0-9_-]/]},
    {"name": "id$ebnf$1", "symbols": ["id$ebnf$1", /[a-zA-Z0-9_-]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "id", "symbols": ["id$ebnf$1"], "postprocess": (d) => d[0].join("")},
    {"name": "integer$ebnf$1", "symbols": [/[+-]/], "postprocess": id},
    {"name": "integer$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "integer$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "integer$ebnf$2", "symbols": ["integer$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "integer", "symbols": ["integer$ebnf$1", "integer$ebnf$2"], "postprocess": 
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
        },
    {"name": "float$ebnf$1", "symbols": [/[+-]/], "postprocess": id},
    {"name": "float$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "float$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "float$subexpression$1$ebnf$1", "symbols": ["float$subexpression$1$ebnf$1", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "float$subexpression$1$ebnf$2", "symbols": []},
    {"name": "float$subexpression$1$ebnf$2", "symbols": ["float$subexpression$1$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "float$subexpression$1$ebnf$3", "symbols": ["floatExponent"], "postprocess": id},
    {"name": "float$subexpression$1$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "float$subexpression$1", "symbols": ["float$subexpression$1$ebnf$1", {"literal":"."}, "float$subexpression$1$ebnf$2", "float$subexpression$1$ebnf$3"]},
    {"name": "float$subexpression$1$ebnf$4", "symbols": [/[0-9]/]},
    {"name": "float$subexpression$1$ebnf$4", "symbols": ["float$subexpression$1$ebnf$4", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "float$subexpression$1$ebnf$5", "symbols": ["floatExponent"], "postprocess": id},
    {"name": "float$subexpression$1$ebnf$5", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "float$subexpression$1", "symbols": [{"literal":"."}, "float$subexpression$1$ebnf$4", "float$subexpression$1$ebnf$5"]},
    {"name": "float$subexpression$1$ebnf$6", "symbols": [/[0-9]/]},
    {"name": "float$subexpression$1$ebnf$6", "symbols": ["float$subexpression$1$ebnf$6", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "float$subexpression$1", "symbols": ["float$subexpression$1$ebnf$6", "floatExponent"]},
    {"name": "float", "symbols": ["float$ebnf$1", "float$subexpression$1"], "postprocess": 
        (d) => {
          const repr = d.flat(Infinity).join("");
          return { value: Number(repr), repr };
        }
        },
    {"name": "floatExponent$ebnf$1", "symbols": [/[+-]/], "postprocess": id},
    {"name": "floatExponent$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "floatExponent$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "floatExponent$ebnf$2", "symbols": ["floatExponent$ebnf$2", /[0-9]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "floatExponent", "symbols": [/[eE]/, "floatExponent$ebnf$1", "floatExponent$ebnf$2"]},
    {"name": "string$ebnf$1", "symbols": []},
    {"name": "string$ebnf$1", "symbols": ["string$ebnf$1", /[^']/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "string", "symbols": [{"literal":"'"}, "string$ebnf$1", {"literal":"'"}], "postprocess": (d) => ({ value: d[1].join(""), repr: `'${d[1].join("")}'` })},
    {"name": "string$ebnf$2", "symbols": []},
    {"name": "string$ebnf$2", "symbols": ["string$ebnf$2", /[^"]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "string", "symbols": [{"literal":"\""}, "string$ebnf$2", {"literal":"\""}], "postprocess": (d) => ({ value: d[1].join(""), repr: `"${d[1].join("")}"` })},
    {"name": "variable$ebnf$1", "symbols": ["id"], "postprocess": id},
    {"name": "variable$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "variable", "symbols": [{"literal":"$"}, "variable$ebnf$1"], "postprocess": (d, loc) => ({ value: {variableName: d[1] || "", startLoc: loc }, repr: `$${d[1] || ""}` })},
    {"name": "identifier$ebnf$1", "symbols": []},
    {"name": "identifier$ebnf$1", "symbols": ["identifier$ebnf$1", /[a-zA-Z0-9_-]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "identifier", "symbols": [/[a-zA-Z_]/, "identifier$ebnf$1"], "postprocess": (d) => ({ value: d[0] + d[1].join(""), repr: d[0] + d[1].join(""), isIdentifier: true })},
    {"name": "value", "symbols": ["integer"], "postprocess": (d) => d[0]},
    {"name": "value", "symbols": ["float"], "postprocess": (d) => d[0]},
    {"name": "value", "symbols": ["string"], "postprocess": (d) => d[0]},
    {"name": "value", "symbols": ["identifier"], "postprocess": (d) => d[0]},
    {"name": "value", "symbols": ["variable"], "postprocess": (d) => d[0]},
    {"name": "topicName$ebnf$1", "symbols": ["slashID"]},
    {"name": "topicName$ebnf$1", "symbols": ["topicName$ebnf$1", "slashID"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "topicName", "symbols": ["topicName$ebnf$1"], "postprocess": (d) => ({ value: d[0].join(""), repr: d[0].join("") })},
    {"name": "topicName$ebnf$2", "symbols": []},
    {"name": "topicName$ebnf$2", "symbols": ["topicName$ebnf$2", "slashID"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "topicName", "symbols": ["id", "topicName$ebnf$2"], "postprocess": (d) => ({ value: d[0] + d[1].join(""), repr: d[0] + d[1].join("") })},
    {"name": "topicName", "symbols": ["quotedString"], "postprocess": id},
    {"name": "slashID$ebnf$1", "symbols": ["id"], "postprocess": id},
    {"name": "slashID$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "slashID", "symbols": [{"literal":"/"}, "slashID$ebnf$1"], "postprocess": (d) => d.join("")},
    {"name": "quotedString$ebnf$1", "symbols": []},
    {"name": "quotedString$ebnf$1$subexpression$1", "symbols": [/[^"\\]/]},
    {"name": "quotedString$ebnf$1$subexpression$1$string$1", "symbols": [{"literal":"\\"}, {"literal":"\\"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "quotedString$ebnf$1$subexpression$1", "symbols": ["quotedString$ebnf$1$subexpression$1$string$1"], "postprocess": d => "\\"},
    {"name": "quotedString$ebnf$1$subexpression$1$string$2", "symbols": [{"literal":"\\"}, {"literal":"\""}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "quotedString$ebnf$1$subexpression$1", "symbols": ["quotedString$ebnf$1$subexpression$1$string$2"], "postprocess": d => `"`},
    {"name": "quotedString$ebnf$1", "symbols": ["quotedString$ebnf$1", "quotedString$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "quotedString", "symbols": [{"literal":"\""}, "quotedString$ebnf$1", {"literal":"\""}], "postprocess": 
        d => ({
          value: d[1].join(''),
          repr: `"${d[1].join('').replace(/[\\"]/g, char => `\\${char}`)}"`
        })
        },
    {"name": "messagePath$ebnf$1", "symbols": []},
    {"name": "messagePath$ebnf$1", "symbols": ["messagePath$ebnf$1", "messagePathElement"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "messagePath$ebnf$2", "symbols": [{"literal":"."}], "postprocess": id},
    {"name": "messagePath$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "messagePath", "symbols": ["messagePath$ebnf$1", "messagePath$ebnf$2"], "postprocess": 
        (d) =>
        d[0]
        .reduce((acc, arr) => acc.concat(arr), [])
        .concat(d[1] ? [{ type: "name", name: "", repr: "" }] : [])
        },
    {"name": "messagePathElement$ebnf$1", "symbols": ["slice"], "postprocess": id},
    {"name": "messagePathElement$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "messagePathElement$ebnf$2", "symbols": ["filter"], "postprocess": id},
    {"name": "messagePathElement$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "messagePathElement", "symbols": [{"literal":"."}, "name", "messagePathElement$ebnf$1", "messagePathElement$ebnf$2"], "postprocess": (d) => [d[1], d[2], d[3]].filter(x => x !== null)},
    {"name": "messagePathElement", "symbols": ["filter"], "postprocess": id},
    {"name": "name", "symbols": ["id"], "postprocess": (d) => ({ type: "name", name: d[0], repr: d[0] })},
    {"name": "name", "symbols": ["quotedString"], "postprocess": (d) => ({ type: "name", name: d[0].value, repr: d[0].repr })},
    {"name": "sliceVal", "symbols": ["integer"], "postprocess": (d) => Number(d[0].value)},
    {"name": "sliceVal", "symbols": ["variable"], "postprocess": (d) => (d[0].value)},
    {"name": "slice", "symbols": [{"literal":"["}, "sliceVal", {"literal":"]"}], "postprocess": (d) => ({ type: "slice", start: d[1], end: d[1] })},
    {"name": "slice$ebnf$1", "symbols": ["sliceVal"], "postprocess": id},
    {"name": "slice$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "slice$ebnf$2", "symbols": ["sliceVal"], "postprocess": id},
    {"name": "slice$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "slice", "symbols": [{"literal":"["}, "slice$ebnf$1", {"literal":":"}, "slice$ebnf$2", {"literal":"]"}], "postprocess": (d) => ({ type: "slice", start: d[1] === null ? 0 : d[1], end: d[3] === null ? Infinity : d[3] })},
    {"name": "simplePath$ebnf$1", "symbols": []},
    {"name": "simplePath$ebnf$1$subexpression$1", "symbols": [{"literal":"."}, "name"]},
    {"name": "simplePath$ebnf$1", "symbols": ["simplePath$ebnf$1", "simplePath$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "simplePath", "symbols": ["name", "simplePath$ebnf$1"], "postprocess": (d) => [d[0]].concat(d[1].map((d) => d[1]))},
    {"name": "filterOperator$string$1", "symbols": [{"literal":"="}, {"literal":"="}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "filterOperator", "symbols": ["filterOperator$string$1"]},
    {"name": "filterOperator$string$2", "symbols": [{"literal":"!"}, {"literal":"="}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "filterOperator", "symbols": ["filterOperator$string$2"]},
    {"name": "filterOperator", "symbols": [{"literal":"<"}]},
    {"name": "filterOperator$string$3", "symbols": [{"literal":"<"}, {"literal":"="}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "filterOperator", "symbols": ["filterOperator$string$3"]},
    {"name": "filterOperator", "symbols": [{"literal":">"}]},
    {"name": "filterOperator$string$4", "symbols": [{"literal":">"}, {"literal":"="}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "filterOperator", "symbols": ["filterOperator$string$4"]},
    {"name": "filter$ebnf$1", "symbols": ["simplePath"], "postprocess": id},
    {"name": "filter$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "filter", "symbols": [{"literal":"{"}, "filter$ebnf$1", {"literal":"}"}], "postprocess": 
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
        },
    {"name": "filter$ebnf$2", "symbols": ["simplePath"], "postprocess": id},
    {"name": "filter$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "filter", "symbols": [{"literal":"{"}, "filter$ebnf$2", "filterOperator", "value", {"literal":"}"}], "postprocess": 
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
        },
    {"name": "filter$ebnf$3", "symbols": ["simplePath"], "postprocess": id},
    {"name": "filter$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "filter", "symbols": [{"literal":"{"}, "filter$ebnf$3", "filterOperator", {"literal":"}"}], "postprocess": 
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
        },
    {"name": "filter$ebnf$4", "symbols": ["simplePath"], "postprocess": id},
    {"name": "filter$ebnf$4", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "filter", "symbols": [{"literal":"{"}, "filter$ebnf$4", {"literal":"="}, {"literal":"}"}], "postprocess": 
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
        },
    {"name": "functionChain$ebnf$1", "symbols": ["functionSegment"]},
    {"name": "functionChain$ebnf$1", "symbols": ["functionChain$ebnf$1", "functionSegment"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "functionChain", "symbols": ["functionChain$ebnf$1"], "postprocess": (d) => d[0]},
    {"name": "functionSegment$string$1", "symbols": [{"literal":"."}, {"literal":"@"}], "postprocess": function joiner(d) {return d.join('');}},
    {"name": "functionSegment$ebnf$1", "symbols": ["id"], "postprocess": id},
    {"name": "functionSegment$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "functionSegment$ebnf$2", "symbols": ["functionArg"], "postprocess": id},
    {"name": "functionSegment$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "functionSegment$ebnf$3", "symbols": ["functionField"], "postprocess": id},
    {"name": "functionSegment$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "functionSegment", "symbols": ["functionSegment$string$1", "functionSegment$ebnf$1", "functionSegment$ebnf$2", "functionSegment$ebnf$3"], "postprocess": 
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
          },
    {"name": "functionArg$ebnf$1", "symbols": []},
    {"name": "functionArg$ebnf$1", "symbols": ["functionArg$ebnf$1", /[^)]/], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "functionArg", "symbols": [{"literal":"("}, "functionArg$ebnf$1", {"literal":")"}], "postprocess": (d) => d[1].join("")},
    {"name": "functionField$ebnf$1", "symbols": ["id"], "postprocess": id},
    {"name": "functionField$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "functionField", "symbols": [{"literal":"."}, "functionField$ebnf$1"], "postprocess": (d) => d[1] ?? ""}
]
  , ParserStart: "main"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
