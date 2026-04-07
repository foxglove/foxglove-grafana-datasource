import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

// --- Selection types ---

import type { Selector } from './messagePathSet';

export type { Selector };

export interface MessagePathSelection {
  type: 'messagePath';
  /** Raw message path string entered by the user (stored in the query model). */
  messagePath: string;
  /**
   * Parsed wire-format fields. Populated by applyTemplateVariables() before
   * sending to the backend — not persisted in the query model.
   */
  topic?: string;
  selectorPath?: Selector[];
}

export interface DevicePropertySelection {
  type: 'deviceProperty';
  key: string;
}

export type Selection = MessagePathSelection | DevicePropertySelection;

// --- GroupBy types ---

export interface DeviceIdGroupBy {
  type: 'deviceId';
}

export interface DevicePropertyGroupBy {
  type: 'deviceProperty';
  key: string;
}

export type GroupBy = DeviceIdGroupBy | DevicePropertyGroupBy;

// --- Aggregation ---

export type AggregationType = 'last' | 'first' | 'max' | 'min' | 'sum' | 'average';

export interface Aggregation {
  /** Human-readable interval string, e.g. "10s", "1m", "1h". */
  interval: string;
  type: AggregationType;
}

/** Wire format sent to the backend/API. */
export interface AggregationWire {
  intervalNanoseconds: number;
  type: string;
}

// ---------------------------------------------------------------------------
// Filter types
//
// The wire format (what the backend and Foxglove API see) is a recursive
// tagged union matching the Rust QueryPredicate type.  The UI works with a
// friendlier representation (FilterNode) that uses flat arrays for groups
// instead of binary left/right trees.
//
// serializeFilterNode / deserializeFilterNode convert between the two.
// ---------------------------------------------------------------------------

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like';

export type LeafPredicateType = 'device' | 'device-property' | 'message' | 'event' | 'recording';

export interface FilterLeaf {
  kind: 'leaf';
  predicateType: LeafPredicateType;
  op: FilterOp;
  field: string;
  topic: string;
  value: string;
}

export interface FilterGroup {
  kind: 'group';
  operator: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

/** Wire format — opaque JSON forwarded by the backend. */
export type FilterWire = Record<string, unknown>;

// --- Factories ---

export function newFilterLeaf(): FilterLeaf {
  return { kind: 'leaf', predicateType: 'device', op: 'eq', field: 'name', topic: '', value: '' };
}

export function newFilterGroup(): FilterGroup {
  return { kind: 'group', operator: 'and', children: [newFilterLeaf()] };
}

// --- Serialization (UI → wire) ---

export function serializeFilterNode(node: FilterNode): FilterWire {
  if (node.kind === 'leaf') {
    const obj: FilterWire = {
      type: node.predicateType,
      op: node.op,
      field: node.field,
      value: node.value,
    };
    if (node.predicateType === 'message') {
      obj.topic = node.topic;
    }
    return obj;
  }

  const { operator, children } = node;
  if (children.length === 0) {
    return serializeFilterNode(newFilterLeaf());
  }
  if (children.length === 1) {
    return serializeFilterNode(children[0]);
  }

  let acc = serializeFilterNode(children[0]);
  for (let i = 1; i < children.length; i++) {
    acc = { type: operator, left: acc, right: serializeFilterNode(children[i]) };
  }
  return acc;
}

// --- Deserialization (wire → UI) ---

export function deserializeFilterNode(wire: FilterWire): FilterNode {
  if (!wire || typeof wire !== 'object' || !wire.type) {
    return newFilterLeaf();
  }

  const t = wire.type as string;

  if (t === 'and' || t === 'or') {
    const children: FilterNode[] = [];
    unfoldBinaryTree(wire, t, children);
    return { kind: 'group', operator: t, children };
  }

  return {
    kind: 'leaf',
    predicateType: t as LeafPredicateType,
    op: (wire.op as FilterOp) ?? 'eq',
    field: (wire.field as string) ?? '',
    topic: (wire.topic as string) ?? '',
    value: (wire.value as string) ?? '',
  };
}

function unfoldBinaryTree(wire: FilterWire, op: string, out: FilterNode[]): void {
  const left = wire.left as FilterWire | undefined;
  const right = wire.right as FilterWire | undefined;

  if (left) {
    if ((left.type as string) === op) {
      unfoldBinaryTree(left, op, out);
    } else {
      out.push(deserializeFilterNode(left));
    }
  }
  if (right) {
    out.push(deserializeFilterNode(right));
  }
}

/** Ensure the top-level node is always a group (for the editor UI). */
export function ensureGroup(node: FilterNode): FilterGroup {
  if (node.kind === 'group') {
    return node;
  }
  return { kind: 'group', operator: 'and', children: [node] };
}

// --- Query model ---

export interface MyQuery extends DataQuery {
  selection?: Selection;
  /** Stored as the UI-friendly FilterNode tree. Serialized to the binary-tree
   *  wire format in applyTemplateVariables() before being sent to the backend. */
  filter?: FilterNode;
  /** Wire-format filter, populated by applyTemplateVariables(). Not persisted. */
  filterWire?: FilterWire;
  groupBy?: GroupBy;
  /** UI-friendly aggregation with human-readable interval string. */
  aggregation?: Aggregation;
  /** Wire-format aggregation with intervalNanoseconds. Populated by
   *  applyTemplateVariables(). Not persisted. */
  aggregationWire?: AggregationWire;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  selection: { type: 'messagePath', messagePath: '' },
  filter: newFilterLeaf(),
  groupBy: { type: 'deviceId' },
};

/**
 * Datasource instance configuration (stored in Grafana's jsonData).
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  baseUrl?: string;
  projectId?: string;
  siteId?: string;
}

/**
 * Secure values — only sent to the backend, never exposed to the frontend.
 */
export interface MySecureJsonData {
  apiKey?: string;
}
