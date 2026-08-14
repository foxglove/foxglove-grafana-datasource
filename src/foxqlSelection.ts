/**
 * Converts a parsed FoxQL expression into the wire format expected by the
 * Foxglove /v1/data/grafana-plugin-query API selection field.
 */

import { parseFoxql, type FoxqlExpression, type FoxqlPart, type FoxqlFilter } from './foxql';

// --- Wire-format types matching the OpenAPI schema ---

interface FieldProjection {
  kind: 'field';
  field: string;
}

interface Slice {
  kind: 'slice';
  start?: number;
  end?: number;
}

interface Condition {
  kind: 'condition';
  op: string;
  path: string[];
  value: string | number | boolean;
}

export type Selector = FieldProjection | Slice | Condition;

/** The parsed selection fields that get merged onto the selection object. */
interface ParsedFoxqlSelection {
  topic: string;
  selectorPath: Selector[];
}

// --- Conversion ---

function partToSelector(part: FoxqlPart): Selector | undefined {
  switch (part.type) {
    case 'name':
      if (!part.name) {
        return undefined;
      }
      return { kind: 'field', field: part.name };

    case 'slice': {
      const sel: Slice = { kind: 'slice' };
      if (typeof part.start === 'number' && isFinite(part.start)) {
        sel.start = part.start;
      }
      if (typeof part.end === 'number' && isFinite(part.end)) {
        sel.end = part.end;
      }
      return sel;
    }

    case 'filter':
      return filterToCondition(part);
  }
}

function filterToCondition(filter: FoxqlFilter): Condition | undefined {
  if (filter.operator === undefined || filter.value === undefined) {
    return undefined;
  }
  if (typeof filter.value === 'object') {
    return undefined;
  }

  let value: string | number | boolean;
  if (typeof filter.value === 'bigint') {
    value = Number(filter.value);
  } else {
    value = filter.value;
  }

  return {
    kind: 'condition',
    op: filter.operator,
    path: filter.path.map((p) => p.name),
    value,
  };
}

function convertFoxql(parsed: FoxqlExpression): ParsedFoxqlSelection {
  const selectors: Selector[] = [];
  for (const part of parsed.parts) {
    const sel = partToSelector(part);
    if (sel) {
      selectors.push(sel);
    }
  }
  return {
    topic: parsed.topicName,
    selectorPath: selectors,
  };
}

// --- Public API ---

type ConvertResult =
  | { ok: true; parsed: ParsedFoxqlSelection }
  | { ok: false; error: string };

/**
 * Parse a raw FoxQL expression and convert it to the API wire format
 * (topic + selectorPath). Returns an error if the expression is unparseable or
 * uses unsupported features (function chains).
 */
export function parseAndConvertFoxql(raw: string): ConvertResult {
  if (!raw.trim()) {
    return { ok: false, error: 'FoxQL expression is empty' };
  }

  const parsed = parseFoxql(raw);
  if (!parsed) {
    return { ok: false, error: `Invalid FoxQL expression: "${raw}"` };
  }

  if (parsed.functionChain && parsed.functionChain.length > 0) {
    return { ok: false, error: 'Function chains (e.g. .@rpy, .@degrees) are not supported' };
  }

  return { ok: true, parsed: convertFoxql(parsed) };
}
