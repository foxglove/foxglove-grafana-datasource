import { lex, type LexToken } from './lexer';

export type SourceRange = {
  start: number;
  end: number;
};

export type ParenAnalysis = {
  groups: SourceRange[];
  unbalanced: number[];
};

export function analyzeParens(source: string): ParenAnalysis {
  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return { groups: [], unbalanced: [] };
  }
  const openStack: number[] = [];
  const groups: SourceRange[] = [];
  const unbalanced: number[] = [];
  for (const token of tokens) {
    if (token.type === 'lparen') {
      openStack.push(token.offset);
    } else if (token.type === 'rparen') {
      const start = openStack.pop();
      if (start !== undefined) {
        groups.push({ start, end: token.offset + token.text.length });
      } else {
        unbalanced.push(token.offset);
      }
    }
  }
  return { groups, unbalanced: unbalanced.concat(openStack) };
}

export function matchParenAt(groups: readonly SourceRange[], caret: number): readonly [number, number] | undefined {
  for (const group of groups) {
    if (caret === group.start + 1 || caret === group.end) {
      return [group.start, group.end - 1];
    }
  }
  for (const group of groups) {
    if (caret === group.start || caret === group.end - 1) {
      return [group.start, group.end - 1];
    }
  }
  return undefined;
}

export function groupBandParts(
  source: string,
  groups: readonly SourceRange[]
): Array<{ text: string; depth: number }> | undefined {
  if (source === '' || groups.length === 0) {
    return undefined;
  }
  const depthAt = (pos: number) =>
    groups.reduce((depth, range) => (pos >= range.start && pos < range.end ? depth + 1 : depth), 0);
  const parts: Array<{ text: string; depth: number }> = [];
  let start = 0;
  while (start < source.length) {
    const depth = depthAt(start);
    let end = start + 1;
    while (end < source.length && depthAt(end) === depth) {
      end += 1;
    }
    parts.push({ text: source.slice(start, end), depth });
    start = end;
  }
  return parts;
}
