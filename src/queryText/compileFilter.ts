import { parseAndConvertFoxql } from '../foxqlSelection';
import type { FilterWire } from '../types';

import { isLogicNode, type QueryNode } from './ast';
import { isKnownEntityField } from './completions';
import { entityFieldToWire, isEntityFieldText, parseFieldKey } from './entityFields';
import { lex } from './lexer';
import { VALUELESS_OPERATORS, type FilterTextOp } from './operators';
import { errorTokenRange, parseQuery } from './parser';

export type FilterTextError = {
  message: string;
  index: number;
};

export type CompileFilterResult = { ok: true; filter?: FilterWire } | { ok: false; error: FilterTextError };

const VISUAL_MESSAGE = 'Visual search is not supported in Grafana filters.';
const TOPIC_VALUE_MESSAGE = 'Topic comparisons only support exists. Compare a field to filter on a value.';
const BRACE_LIST_MESSAGE = 'A brace-wrapped list is not an in list. Use ${name:csv} for a multi-value variable.';

/**
 * Compile filter text into the wire predicate sent to the Foxglove API.
 * Empty text compiles to no filter. A failure leaves the filter unset so the
 * query is not run without the condition the user wrote.
 */
export function compileFilterText(source: string): CompileFilterResult {
  if (source.trim() === '') {
    return { ok: true };
  }
  const unknown = unknownEntityField(source);
  if (unknown !== undefined) {
    return { ok: false, error: { message: `No such field: ${unknown.wire}`, index: unknown.start } };
  }
  const parsed = parseQuery(source);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  if (parsed.query === undefined) {
    return { ok: true };
  }
  return compileNode(parsed.query, source);
}

/**
 * Editor validation. Text that still contains a Grafana template variable is
 * skipped, because substitution happens when the query runs.
 */
export function filterTextError(source: string): FilterTextError | undefined {
  if (source.trim() === '' || source.includes('$')) {
    return undefined;
  }
  const compiled = compileFilterText(source);
  return compiled.ok ? undefined : compiled.error;
}

/**
 * While the field is focused, an error on the token at the end of the text is still
 * being typed. A trailing space does not count. The error shows once more text follows
 * that token, or when the field blurs.
 */
export function isUncommittedFilterError(source: string, error: FilterTextError): boolean {
  const range = errorTokenRange(source, error.index);
  return range.end >= source.trimEnd().length;
}

/**
 * The error to show in the editor. An unknown field appears once the caret moves past
 * it, which a trailing space does. Other errors on the final token wait until more
 * text follows, or until the field blurs.
 */
export function displayedFilterError(source: string, caret: number, focused: boolean): FilterTextError | undefined {
  if (source.includes('$')) {
    return undefined;
  }
  const unknown = unknownEntityField(source);
  if (unknown !== undefined) {
    const committed = !focused || caret > unknown.end || unknown.end < source.trimEnd().length;
    if (committed) {
      return { message: `No such field: ${unknown.wire}`, index: unknown.start };
    }
  }
  const parsed = filterTextError(source);
  if (parsed === undefined) {
    return undefined;
  }
  if (focused && isUncommittedFilterError(source, parsed)) {
    return undefined;
  }
  return parsed;
}

const LOGIC_WORDS = new Set(['and', 'or']);

function unknownEntityField(source: string): { wire: string; start: number; end: number } | undefined {
  let tokens;
  try {
    tokens = lex(source);
  } catch {
    return undefined;
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const previous = tokens[index - 1];
    const atClauseStart =
      previous === undefined ||
      previous.type === 'lparen' ||
      (previous.type === 'word' && LOGIC_WORDS.has(previous.value.toLowerCase()));
    if (!atClauseStart || token.type !== 'word' || !token.text.startsWith('@') || token.text.endsWith('.')) {
      continue;
    }
    if (!isKnownEntityField(token.text)) {
      return {
        wire: entityFieldToWire(token.text),
        start: token.offset,
        end: token.offset + token.text.length,
      };
    }
  }
  return undefined;
}

function compileNode(node: QueryNode, source: string): CompileFilterResult {
  if (node.type === 'semantic') {
    return { ok: false, error: { message: VISUAL_MESSAGE, index: indexOfVisual(source) } };
  }
  if (isLogicNode(node)) {
    const left = compileNode(node.left, source);
    if (!left.ok) {
      return left;
    }
    const right = compileNode(node.right, source);
    if (!right.ok) {
      return right;
    }
    if (left.filter === undefined || right.filter === undefined) {
      return { ok: false, error: { message: 'Invalid query', index: 0 } };
    }
    return { ok: true, filter: { type: node.type, left: left.filter, right: right.filter } };
  }
  return compileComparison(node.field, node.operator, node.value);
}

function compileComparison(field: string, operator: FilterTextOp, value: string | undefined): CompileFilterResult {
  if (!VALUELESS_OPERATORS.has(operator) && (value === undefined || value === '')) {
    return { ok: false, error: { message: 'Enter a value', index: 0 } };
  }
  if (operator === 'in') {
    const listed = inListValues(value ?? '');
    if (!listed.ok) {
      return { ok: false, error: { message: listed.error, index: 0 } };
    }
    if (listed.values.length === 0) {
      return { ok: false, error: { message: 'Enter a value', index: 0 } };
    }
  }
  if (isEntityFieldText(field)) {
    return compileEntity(field, operator, value);
  }
  return compileMessage(field, operator, value);
}

function compileEntity(field: string, operator: FilterTextOp, value: string | undefined): CompileFilterResult {
  const key = parseFieldKey(entityFieldToWire(field));
  if (key === undefined) {
    return { ok: false, error: { message: `Unknown field "${field}"`, index: 0 } };
  }
  if (VALUELESS_OPERATORS.has(operator)) {
    return { ok: true, filter: { type: key.predicateType, op: operator, field: key.field } };
  }
  return {
    ok: true,
    filter: {
      type: key.predicateType,
      op: operator,
      field: key.field,
      value: operator === 'in' ? inListOrEmpty(value ?? '') : value,
    },
  };
}

function compileMessage(field: string, operator: FilterTextOp, value: string | undefined): CompileFilterResult {
  const parsed = parseAndConvertFoxql(field);
  if (!parsed.ok) {
    return { ok: false, error: { message: parsed.error, index: 0 } };
  }
  if (parsed.parsed.selectorPath.length === 0) {
    if (operator === 'is-not-null') {
      return { ok: true, filter: { type: 'topic-exists', topic: parsed.parsed.topic } };
    }
    return { ok: false, error: { message: TOPIC_VALUE_MESSAGE, index: 0 } };
  }
  if (VALUELESS_OPERATORS.has(operator)) {
    return {
      ok: true,
      filter: {
        type: 'message',
        op: operator,
        topic: parsed.parsed.topic,
        selectorPath: parsed.parsed.selectorPath,
      },
    };
  }
  return {
    ok: true,
    filter: {
      type: 'message',
      op: operator,
      topic: parsed.parsed.topic,
      selectorPath: parsed.parsed.selectorPath,
      value: operator === 'in' ? inListOrEmpty(value ?? '') : value,
    },
  };
}

function indexOfVisual(source: string): number {
  let tokens;
  try {
    tokens = lex(source);
  } catch {
    return 0;
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const next = tokens[index + 1];
    if (
      token.type === 'word' &&
      token.value.toLowerCase() === 'visual' &&
      next?.type === 'lparen' &&
      next.offset === token.offset + token.text.length
    ) {
      return token.offset;
    }
  }
  return 0;
}

function inListOrEmpty(raw: string): string[] {
  const listed = inListValues(raw);
  return listed.ok ? listed.values : [];
}

function inListValues(raw: string): { ok: true; values: string[] } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return { ok: false, error: BRACE_LIST_MESSAGE };
  }
  return {
    ok: true,
    values: trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  };
}
