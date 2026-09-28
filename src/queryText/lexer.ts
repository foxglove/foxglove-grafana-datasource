import grammar from './grammar';

export type LexToken = {
  type: string;
  value: string;
  text: string;
  offset: number;
};

const mooLexer = grammar.Lexer as unknown as {
  reset: (source: string) => void;
  [Symbol.iterator]: () => Iterator<LexToken>;
};

export function decodeQuoted(text: string): string {
  return text.slice(1, -1).replace(/\\(.)/g, '$1');
}

export function lex(source: string): LexToken[] {
  mooLexer.reset(source);
  const tokens: LexToken[] = [];
  for (const token of mooLexer) {
    if (token.type === 'err') {
      throw new Error(`Cannot lex query at offset ${token.offset}`);
    }
    if (token.type === 'ws') {
      continue;
    }
    tokens.push(token);
  }
  return tokens;
}
