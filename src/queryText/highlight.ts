import { lex, type LexToken } from './lexer';
import { TEXT_TO_OPERATOR, VALUELESS_OPERATORS } from './operators';

export type QueryHighlightKind = 'operator' | 'logic' | 'paren' | 'plain';

export type QueryHighlightSegment = {
  text: string;
  kind: QueryHighlightKind;
};

const LOGIC_WORDS: ReadonlySet<string> = new Set(['and', 'or']);

function isLogicWord(token: LexToken): boolean {
  return token.type === 'word' && LOGIC_WORDS.has(token.value.toLowerCase());
}

function isTerm(token: LexToken | undefined): boolean {
  return token?.type === 'word' || token?.type === 'qstring';
}

function operatorFor(token: LexToken) {
  return token.type === 'op' || token.type === 'word' ? TEXT_TO_OPERATOR.get(token.value.toLowerCase()) : undefined;
}

function classifyRoles(tokens: readonly LexToken[]): QueryHighlightKind[] {
  const kinds: QueryHighlightKind[] = tokens.map(() => 'plain');
  let index = 0;
  let expectTerm = true;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token.type === 'lparen') {
      kinds[index] = 'paren';
      expectTerm = true;
      index += 1;
      continue;
    }
    if (token.type === 'rparen') {
      kinds[index] = 'paren';
      expectTerm = false;
      index += 1;
      continue;
    }
    if (token.type === 'op') {
      kinds[index] = 'operator';
      expectTerm = false;
      index += 1;
      continue;
    }
    if (!expectTerm) {
      if (isLogicWord(token)) {
        kinds[index] = 'logic';
        expectTerm = true;
        index += 1;
        continue;
      }
      expectTerm = true;
    }
    if (isLogicWord(token)) {
      kinds[index] = 'logic';
      index += 1;
      continue;
    }
    const next = tokens[index + 1];
    const operator = next !== undefined ? operatorFor(next) : undefined;
    if (operator !== undefined) {
      kinds[index + 1] = 'operator';
      index += 2;
      if (!VALUELESS_OPERATORS.has(operator) && isTerm(tokens[index])) {
        index += 1;
      }
      expectTerm = false;
      continue;
    }
    index += 1;
    while (index < tokens.length) {
      const runToken = tokens[index]!;
      if (runToken.type === 'lparen' || runToken.type === 'rparen' || isLogicWord(runToken)) {
        break;
      }
      index += 1;
    }
    expectTerm = false;
  }
  return kinds;
}

export function highlightQuery(source: string): QueryHighlightSegment[] {
  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return source === '' ? [] : [{ text: source, kind: 'plain' }];
  }
  const kinds = classifyRoles(tokens);
  const segments: QueryHighlightSegment[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    const end = token.offset + token.text.length;
    if (token.offset > cursor) {
      segments.push({ text: source.slice(cursor, token.offset), kind: 'plain' });
    }
    segments.push({ text: source.slice(token.offset, end), kind: kinds[index]! });
    cursor = end;
  });
  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor), kind: 'plain' });
  }
  return segments;
}
