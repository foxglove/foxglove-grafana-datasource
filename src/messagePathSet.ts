/**
 * Converts a parsed MessagePath (from the message-path library) into the
 * wire format expected by the Foxglove /v1/data/grafana-plugin-query API
 * selection field.
 */

import { parseMessagePath, type MessagePath, type MessagePathPart, type MessagePathFilter } from './message-path';

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
interface ParsedMessagePathSelection {
  topic: string;
  selectorPath: Selector[];
}

// --- Conversion ---

function partToSelector(part: MessagePathPart): Selector | undefined {
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

function filterToCondition(filter: MessagePathFilter): Condition | undefined {
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

function convertMessagePath(parsed: MessagePath): ParsedMessagePathSelection {
  const selectors: Selector[] = [];
  for (const part of parsed.messagePath) {
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
  | { ok: true; parsed: ParsedMessagePathSelection }
  | { ok: false; error: string };

/**
 * Parse a raw message path string and convert it to the API wire format
 * (topic + selectorPath). Returns an error if the path is unparseable or
 * uses unsupported features (function chains).
 */
export function parseAndConvertMessagePath(raw: string): ConvertResult {
  if (!raw.trim()) {
    return { ok: false, error: 'Message path is empty' };
  }

  const parsed = parseMessagePath(raw);
  if (!parsed) {
    return { ok: false, error: `Invalid message path: "${raw}"` };
  }

  if (parsed.functionChain && parsed.functionChain.length > 0) {
    return { ok: false, error: 'Function chains (e.g. .@rpy, .@degrees) are not supported' };
  }

  return { ok: true, parsed: convertMessagePath(parsed) };
}
