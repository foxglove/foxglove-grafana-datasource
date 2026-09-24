import { Grammar, Parser } from 'nearley';

import type { ComparisonNode, QueryNode } from './ast';
import grammar from './grammar';
import { lex, type LexToken } from './lexer';
import {
  RESERVED_WORD_SET,
  TEXT_TO_OPERATOR,
  VALUELESS_OPERATORS,
  VISUAL_FUNCTION,
  type FilterTextOp,
} from './operators';

export type ParseError = {
  message: string;
  index: number;
};

export type ParseResult = { ok: true; query: QueryNode | undefined } | { ok: false; error: ParseError };

type RawComparison = { type: 'comparison'; field: string; opText: string; value?: string };
type RawSemantic = { type: 'semantic'; text: string };
type RawLogic = { type: 'and' | 'or'; left: RawNode; right: RawNode };
type RawNode = RawComparison | RawSemantic | RawLogic;

const LOGIC_WORDS: ReadonlySet<string> = new Set(['and', 'or']);

const RESERVED_WORD_MESSAGE = 'Enclose reserved words in quotes to use them as a field name, e.g. "exists"';

const BARE_TEXT_MESSAGE = 'Add an operator to filter by this';

const SINGLE_EQUALS_MESSAGE = 'Use == to test equality';

const compiledGrammar = Grammar.fromCompiled(grammar);

export function parseQuery(source: string): ParseResult {
  const parser = new Parser(compiledGrammar);
  try {
    parser.feed(source);
  } catch (err) {
    return { ok: false, error: normalizeParseError(source, err) };
  }

  const results = parser.results as Array<RawNode | undefined>;
  if (results.length === 0) {
    return { ok: false, error: incompleteQueryError(source) };
  }
  return { ok: true, query: finalize(results[0]) };
}

function finalize(node: RawNode | undefined): QueryNode | undefined {
  if (node === undefined) {
    return undefined;
  }
  switch (node.type) {
    case 'semantic':
      return { type: 'semantic', text: node.text };
    case 'comparison':
      return finalizeComparison(node);
    case 'and':
    case 'or':
      return { type: node.type, left: finalize(node.left)!, right: finalize(node.right)! };
  }
}

function finalizeComparison(node: RawComparison): ComparisonNode {
  const operator: FilterTextOp | undefined = TEXT_TO_OPERATOR.get(node.opText.toLowerCase());
  if (operator === undefined) {
    throw new Error(`Unknown operator "${node.opText}"`);
  }
  if (VALUELESS_OPERATORS.has(operator)) {
    return { type: 'comparison', field: node.field, operator };
  }
  return { type: 'comparison', field: node.field, operator, value: node.value ?? '' };
}

function isTermToken(token: LexToken): boolean {
  return token.type === 'word' || token.type === 'qstring';
}

function isVisualCall(tokens: readonly LexToken[], index: number): boolean {
  const token = tokens[index];
  return (
    token?.type === 'word' && token.value.toLowerCase() === VISUAL_FUNCTION && tokens[index + 1]?.type === 'lparen'
  );
}

function visualCallEnd(tokens: readonly LexToken[], index: number): number {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor]!.type === 'rparen') {
      return cursor + 1;
    }
  }
  return tokens.length;
}

function endsClause(token: LexToken): boolean {
  return (
    token.type === 'lparen' ||
    token.type === 'rparen' ||
    (token.type === 'word' && LOGIC_WORDS.has(token.value.toLowerCase()))
  );
}

function suppliesOperator(token: LexToken): boolean {
  return (
    token.type === 'op' ||
    token.type === 'assign' ||
    (token.type === 'word' && TEXT_TO_OPERATOR.has(token.value.toLowerCase()))
  );
}

function bareTextError(tokens: readonly LexToken[]): ParseError | undefined {
  let clauseTerm: LexToken | undefined;
  let clauseHasOperator = false;
  let index = 0;
  while (index < tokens.length) {
    if (isVisualCall(tokens, index)) {
      clauseHasOperator = true;
      index = visualCallEnd(tokens, index);
      continue;
    }
    const token = tokens[index]!;
    index += 1;
    if (suppliesOperator(token)) {
      clauseHasOperator = true;
      continue;
    }
    if (!endsClause(token)) {
      if (isTermToken(token)) {
        clauseTerm ??= token;
      }
      continue;
    }
    if (!clauseHasOperator && clauseTerm !== undefined) {
      return { message: BARE_TEXT_MESSAGE, index: clauseTerm.offset };
    }
    clauseTerm = undefined;
    clauseHasOperator = false;
  }
  return !clauseHasOperator && clauseTerm !== undefined
    ? { message: BARE_TEXT_MESSAGE, index: clauseTerm.offset }
    : undefined;
}

function tryLex(source: string): LexToken[] | undefined {
  try {
    return lex(source);
  } catch {
    return undefined;
  }
}

function normalizeParseError(source: string, err: unknown): ParseError {
  const tokens = tryLex(source);
  const bareText = tokens === undefined ? undefined : bareTextError(tokens);
  if (bareText !== undefined) {
    return bareText;
  }
  const spacedIn = spacedInListError(source);
  if (spacedIn !== undefined) {
    return spacedIn;
  }
  const token = getErrorToken(err);
  if (token === undefined) {
    return { message: 'Invalid query', index: source.length };
  }
  if (token.type === 'ws') {
    const previous = lastTokenBefore(source, token.offset);
    if (previous?.type === 'word') {
      const lowered = previous.value.toLowerCase();
      if (
        !LOGIC_WORDS.has(lowered) &&
        RESERVED_WORD_SET.has(lowered) &&
        precededByTermBoundary(source, previous.offset)
      ) {
        return { message: RESERVED_WORD_MESSAGE, index: previous.offset };
      }
      return { message: `Unexpected "${previous.text}"`, index: previous.offset };
    }
    if (previous !== undefined) {
      return { message: `Unexpected "${previous.text}"`, index: previous.offset };
    }
  }
  if (token.type === 'rparen') {
    const opener = lastTokenBefore(source, token.offset);
    if (opener?.type === 'lparen') {
      return { message: 'Empty group', index: opener.offset };
    }
  }
  return { message: messageForToken(token), index: token.offset };
}

function precededByTermBoundary(source: string, offset: number): boolean {
  const previous = lastTokenBefore(source, offset);
  if (previous === undefined || previous.type === 'lparen') {
    return true;
  }
  return previous.type === 'word' && LOGIC_WORDS.has(previous.value.toLowerCase());
}

function getErrorToken(err: unknown): LexToken | undefined {
  if (err === undefined || typeof err !== 'object') {
    return undefined;
  }
  const token = (err as { token?: unknown }).token;
  if (token === undefined || typeof token !== 'object') {
    return undefined;
  }
  const candidate = token as Partial<LexToken>;
  if (typeof candidate.offset !== 'number' || typeof candidate.type !== 'string') {
    return undefined;
  }
  return {
    type: candidate.type,
    value: candidate.value ?? '',
    text: candidate.text ?? '',
    offset: candidate.offset,
  };
}

function lastTokenBefore(source: string, offset: number): LexToken | undefined {
  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return undefined;
  }
  let result: LexToken | undefined;
  for (const token of tokens) {
    if (token.offset < offset) {
      result = token;
    } else {
      break;
    }
  }
  return result;
}

function incompleteQueryError(source: string): ParseError {
  const spacedIn = spacedInListError(source);
  if (spacedIn !== undefined) {
    return spacedIn;
  }
  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return { message: 'Unexpected end of query', index: source.length };
  }
  const last = tokens[tokens.length - 1];
  if (
    last?.type === 'word' &&
    !LOGIC_WORDS.has(last.value.toLowerCase()) &&
    RESERVED_WORD_SET.has(last.value.toLowerCase()) &&
    precededByTermBoundary(source, last.offset)
  ) {
    return { message: RESERVED_WORD_MESSAGE, index: last.offset };
  }
  const bareText = bareTextError(tokens);
  if (bareText !== undefined) {
    return bareText;
  }
  const lastIsOperator = last?.type === 'word' && TEXT_TO_OPERATOR.has(last.value.toLowerCase());
  if (last !== undefined && (last.type === 'word' || last.type === 'qstring') && !lastIsOperator) {
    const prefix = parseQuery(source.slice(0, last.offset));
    if (prefix.ok && prefix.query !== undefined) {
      return { message: `Unexpected "${last.text}"`, index: last.offset };
    }
  }
  return { message: 'Unexpected end of query', index: source.length };
}

const SPACED_IN_LIST = /(?:^|[\s(])in\s+\S+,\s+\S/i;

function spacedInListError(source: string): ParseError | undefined {
  const match = SPACED_IN_LIST.exec(source);
  if (match === null) {
    return undefined;
  }
  const comma = source.indexOf(',', match.index);
  return {
    message: 'Write in lists without spaces, for example a,b',
    index: comma === -1 ? match.index : comma + 1,
  };
}

function messageForToken(token: LexToken): string {
  if (token.type === 'err') {
    return token.text.startsWith('"') ? 'Unterminated string literal' : 'Unexpected character';
  }
  if (token.type === 'assign') {
    return SINGLE_EQUALS_MESSAGE;
  }
  return `Unexpected "${token.text}"`;
}

export function errorTokenRange(source: string, errorIndex: number): { start: number; end: number } {
  const clampedIndex = Math.max(0, Math.min(errorIndex, source.length));

  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return { start: clampedIndex, end: source.length };
  }
  if (tokens.length === 0) {
    return { start: clampedIndex, end: clampedIndex };
  }

  const containing = tokens.find(
    (token) => clampedIndex >= token.offset && clampedIndex < token.offset + token.text.length
  );
  if (containing !== undefined) {
    return { start: containing.offset, end: containing.offset + containing.text.length };
  }

  const startingAt = tokens.find((token) => token.offset === clampedIndex);
  if (startingAt !== undefined) {
    return { start: startingAt.offset, end: startingAt.offset + startingAt.text.length };
  }

  let preceding: LexToken | undefined;
  for (const token of tokens) {
    if (token.offset < clampedIndex) {
      preceding = token;
    } else {
      break;
    }
  }
  if (preceding !== undefined) {
    return { start: preceding.offset, end: preceding.offset + preceding.text.length };
  }
  return { start: clampedIndex, end: clampedIndex };
}
