import { lex, type LexToken } from './lexer';
import { OPERATOR_TO_TEXT, TEXT_TO_OPERATOR, VALUELESS_OPERATORS, type FilterTextOp } from './operators';

export type CompletionItem = {
  insertText: string;
  primary: string;
  secondary?: string;
  appendSpace?: boolean;
};

type CompletionContext =
  | { kind: 'field'; range: { start: number; end: number }; partial: string }
  | { kind: 'operator'; range: { start: number; end: number }; partial: string; field: string }
  | { kind: 'value'; range: { start: number; end: number }; partial: string; field: string }
  | { kind: 'connector'; range: { start: number; end: number }; partial: string };

const LOGIC_WORDS = new Set(['and', 'or']);

type StaticField = { name: string; label: string; dataType: 'string' | 'boolean' };

/** Fixed entity fields. Custom properties, metadata keys, and message paths are typed, not listed. */
const STATIC_FIELDS: readonly StaticField[] = [
  { name: '@device.id', label: 'ID', dataType: 'string' },
  { name: '@device.name', label: 'Name', dataType: 'string' },
  { name: '@device.enabled', label: 'Enabled', dataType: 'boolean' },
  { name: '@device.properties.', label: 'Custom property', dataType: 'string' },
  { name: '@event.id', label: 'ID', dataType: 'string' },
  { name: '@event.eventTypeId', label: 'Event type', dataType: 'string' },
  { name: '@event.deviceId', label: 'Device ID', dataType: 'string' },
  { name: '@event.properties.', label: 'Custom property', dataType: 'string' },
  { name: '@recording.id', label: 'ID', dataType: 'string' },
  { name: '@recording.key', label: 'Key', dataType: 'string' },
  { name: '@recording.deviceId', label: 'Device ID', dataType: 'string' },
  { name: '@recording.deviceName', label: 'Device name', dataType: 'string' },
  { name: '@recording.path', label: 'Path', dataType: 'string' },
  { name: '@recording.metadata.', label: 'Metadata', dataType: 'string' },
  { name: '@session.id', label: 'ID', dataType: 'string' },
  { name: '@session.key', label: 'Key', dataType: 'string' },
  { name: '@session.deviceId', label: 'Device ID', dataType: 'string' },
  { name: '@session.properties.', label: 'Custom property', dataType: 'string' },
  { name: '@episode.id', label: 'ID', dataType: 'string' },
  { name: '@episode.metadata.', label: 'Metadata', dataType: 'string' },
];

const STRING_OPERATORS: readonly FilterTextOp[] = [
  'eq',
  'neq',
  'like',
  'contains',
  'not-contains',
  'is-not-null',
  'in',
];
const NUMBER_OPERATORS: readonly FilterTextOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is-not-null', 'in'];
const BOOLEAN_OPERATORS: readonly FilterTextOp[] = ['eq', 'neq', 'is-not-null'];

const OPERATOR_LABELS: Record<FilterTextOp, string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  gte: 'greater than or equals',
  lt: 'less than',
  lte: 'less than or equals',
  like: 'like',
  contains: 'has',
  'not-contains': 'does not have',
  'is-not-null': 'exists',
  in: 'in list',
};

/**
 * Suggestions for the filter caret. Static entity fields, the operators those fields accept,
 * `true`/`false` for booleans, and `and`/`or`. Message paths get numeric comparisons.
 */
export function filterCompletions(
  source: string,
  caret: number
): { items: CompletionItem[]; range: { start: number; end: number } } | undefined {
  const context = completionContext(source, caret);
  if (context === undefined) {
    return undefined;
  }
  const items =
    context.kind === 'field'
      ? fieldCompletions(context.partial)
      : context.kind === 'operator'
      ? operatorCompletions(context.field, context.partial)
      : context.kind === 'value'
      ? valueCompletions(context.field, context.partial)
      : connectorCompletions(context.partial);
  if (items.length === 0) {
    return undefined;
  }
  return { items, range: context.range };
}

function fieldCompletions(partial: string): CompletionItem[] {
  const lastSep = partial.lastIndexOf('.');
  const committed = lastSep === -1 ? '' : partial.slice(0, lastSep + 1);
  const needle = (lastSep === -1 ? partial : partial.slice(lastSep + 1)).toLowerCase();
  const bySegment = new Map<string, { segment: string; path: string; isGroup: boolean; label?: string }>();
  const groups: Array<{ segment: string; path: string; isGroup: boolean; label?: string }> = [];
  for (const field of STATIC_FIELDS) {
    if (!field.name.startsWith(committed)) {
      continue;
    }
    const rest = field.name.slice(committed.length);
    if (rest === '') {
      continue;
    }
    const nextSep = rest.indexOf('.');
    const segment = nextSep === -1 ? rest : rest.slice(0, nextSep);
    if (!segment.toLowerCase().startsWith(needle)) {
      continue;
    }
    let group = bySegment.get(segment);
    if (group === undefined) {
      group = { segment, path: `${committed}${segment}`, isGroup: false };
      bySegment.set(segment, group);
      groups.push(group);
    }
    if (nextSep === -1) {
      group.label = field.label;
    } else {
      group.isGroup = true;
    }
  }
  const items: CompletionItem[] = [];
  for (const group of groups) {
    if (!group.isGroup && group.segment.toLowerCase() === needle) {
      continue;
    }
    items.push({
      insertText: group.isGroup ? `${group.path}.` : group.path,
      primary: group.segment,
      secondary: group.isGroup ? undefined : group.label,
      appendSpace: !group.isGroup,
    });
  }
  return items;
}

function operatorCompletions(field: string, partial: string): CompletionItem[] {
  const needle = partial.toLowerCase();
  return operatorsFor(field)
    .filter((op) => OPERATOR_TO_TEXT[op].toLowerCase().startsWith(needle))
    .map((op) => {
      const text = OPERATOR_TO_TEXT[op];
      const label = OPERATOR_LABELS[op];
      return {
        insertText: text,
        primary: text,
        secondary: label === text ? undefined : label,
        appendSpace: true,
      };
    });
}

function operatorsFor(field: string): readonly FilterTextOp[] {
  const known = STATIC_FIELDS.find((entry) => entry.name === field);
  if (known?.dataType === 'boolean') {
    return BOOLEAN_OPERATORS;
  }
  if (field.startsWith('/') && known === undefined) {
    return NUMBER_OPERATORS;
  }
  return STRING_OPERATORS;
}

function valueCompletions(field: string, partial: string): CompletionItem[] {
  const known = STATIC_FIELDS.find((entry) => entry.name === field);
  if (known?.dataType !== 'boolean') {
    return [];
  }
  const needle = partial.toLowerCase();
  return ['true', 'false']
    .filter((value) => value !== needle && value.startsWith(needle))
    .map((value) => ({ insertText: value, primary: value, appendSpace: true }));
}

function connectorCompletions(partial: string): CompletionItem[] {
  const needle = partial.toLowerCase();
  return ['and', 'or']
    .filter((word) => word !== needle && word.startsWith(needle))
    .map((word) => ({ insertText: word, primary: word, appendSpace: true }));
}

function isLogicWord(token: LexToken): boolean {
  return token.type === 'word' && LOGIC_WORDS.has(token.value.toLowerCase());
}

function isClauseBoundary(token: LexToken): boolean {
  return token.type === 'lparen' || token.type === 'rparen' || isLogicWord(token);
}

function isTerm(token: LexToken): boolean {
  return token.type === 'word' || token.type === 'qstring';
}

function operatorFor(token: LexToken): FilterTextOp | undefined {
  return token.type === 'op' || token.type === 'word' ? TEXT_TO_OPERATOR.get(token.value.toLowerCase()) : undefined;
}

function completionContext(source: string, caret: number): CompletionContext | undefined {
  const clamped = Math.max(0, Math.min(caret, source.length));
  let tokens: LexToken[];
  try {
    tokens = lex(source);
  } catch {
    return undefined;
  }

  const editIndex = tokens.findIndex(
    (token) => isTerm(token) && clamped > token.offset && clamped <= token.offset + token.text.length
  );

  let range: { start: number; end: number };
  let partial: string;
  let beforeIndex: number;
  if (editIndex >= 0) {
    const token = tokens[editIndex]!;
    range = { start: token.offset, end: token.offset + token.text.length };
    partial = token.text;
    beforeIndex = editIndex;
  } else {
    range = { start: clamped, end: clamped };
    partial = '';
    beforeIndex = tokens.filter((token) => token.offset + token.text.length <= clamped).length;
  }

  const clause: LexToken[] = [];
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const token = tokens[index]!;
    if (isClauseBoundary(token)) {
      break;
    }
    clause.unshift(token);
  }

  if (clause.length === 0) {
    return { kind: 'field', range, partial };
  }

  const operatorIndex = clause.findIndex((token) => operatorFor(token) !== undefined);
  if (operatorIndex === -1) {
    const field = clause.length === 1 && isTerm(clause[0]!) ? clause[0]!.text : undefined;
    return field === undefined ? undefined : { kind: 'operator', range, partial, field };
  }

  const fieldToken = clause[0];
  if (fieldToken === undefined || !isTerm(fieldToken) || clause.length === 0) {
    return undefined;
  }
  const field = clause
    .slice(0, operatorIndex)
    .map((token) => token.text)
    .join('');
  const operator = operatorFor(clause[operatorIndex]!);
  if (operator === undefined) {
    return undefined;
  }
  if (VALUELESS_OPERATORS.has(operator) || operatorIndex !== clause.length - 1) {
    return { kind: 'connector', range, partial };
  }
  return { kind: 'value', range, partial, field };
}
