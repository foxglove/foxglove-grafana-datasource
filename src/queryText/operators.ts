export type FilterTextOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'contains'
  | 'not-contains'
  | 'is-not-null'
  | 'in';

export const OPERATOR_TO_TEXT: Readonly<Record<FilterTextOp, string>> = {
  eq: '==',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  contains: 'contains',
  'not-contains': 'not-contains',
  'is-not-null': 'exists',
  in: 'in',
};

export const TEXT_TO_OPERATOR: ReadonlyMap<string, FilterTextOp> = new Map(
  (Object.entries(OPERATOR_TO_TEXT) as Array<[FilterTextOp, string]>).map(([op, text]) => [text, op])
);

export const VALUELESS_OPERATORS: ReadonlySet<FilterTextOp> = new Set<FilterTextOp>(['is-not-null']);

export const LOGIC_WORDS = ['and', 'or'] as const;

export const LOGIC_WORD_SET: ReadonlySet<string> = new Set(LOGIC_WORDS);

const WORD_OPERATOR_TEXTS: readonly string[] = Object.values(OPERATOR_TO_TEXT).filter((text) =>
  /^[a-z][a-z-]*$/.test(text)
);

export const RESERVED_WORD_SET: ReadonlySet<string> = new Set<string>([...LOGIC_WORDS, ...WORD_OPERATOR_TEXTS]);

export const VISUAL_FUNCTION = 'visual';
