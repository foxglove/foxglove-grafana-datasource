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
  /** The un-parsed message path, used by the backend as a label for the time series. */
  messagePathString?: string;
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

export type AggregationType = 'last' | 'first' | 'max' | 'min' | 'sum' | 'average' | 'median' | 'p50' | 'p90' | 'p95';

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
// The UI works with FilterNode — a tree using flat arrays for groups.
// serializeFilterNode converts to FilterWireSerialized (binary left/right
// tree, message predicates carry raw messagePath strings).
// replaceFilterVars() in datasource.ts resolves template variables and
// parses message paths, producing the final FilterWire sent to the API.
// ---------------------------------------------------------------------------

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in';

export type LeafPredicateType = 'device' | 'message' | 'event' | 'recording';

export interface FilterLeaf {
  kind: 'leaf';
  predicateType: LeafPredicateType;
  op: FilterOp;
  /** Field name for device / event / recording predicates (e.g. "name", "properties.fleet"). */
  field: string;
  /** Full message path for message predicates (e.g. /imu.accel.x). */
  messagePath: string;
  value: string;
}

export interface FilterGroup {
  kind: 'group';
  operator: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

// ---------------------------------------------------------------------------
// Wire format types
//
// Two phases: "serialized" (output of serializeFilterNode, message predicates
// still carry the raw messagePath string) and "resolved" (after template
// variable substitution + message path parsing — what the API receives).
// ---------------------------------------------------------------------------

type FieldPredicateType = 'device' | 'event' | 'recording';

/** Wire predicate for device / event / recording. */
export interface FilterWireFieldPredicate {
  type: FieldPredicateType;
  op: FilterOp;
  field: string;
  value: string | string[];
}

/** Serialized message predicate — still has the raw messagePath string. */
export interface FilterWireMessageRaw {
  type: 'message';
  op: FilterOp;
  messagePath: string;
  value: string | string[];
}

/** Resolved message predicate — messagePath parsed into topic + selectorPath. */
export interface FilterWireMessageResolved {
  type: 'message';
  op: FilterOp;
  topic: string;
  selectorPath: Selector[];
  value: string | string[];
}

/** Serialized wire format — output of serializeFilterNode. */
export type FilterWireSerialized =
  | FilterWireFieldPredicate
  | FilterWireMessageRaw
  | { type: 'and'; left: FilterWireSerialized; right: FilterWireSerialized }
  | { type: 'or'; left: FilterWireSerialized; right: FilterWireSerialized };

/** Resolved wire format — sent to the backend / Foxglove API. */
export type FilterWire =
  | FilterWireFieldPredicate
  | FilterWireMessageResolved
  | { type: 'and'; left: FilterWire; right: FilterWire }
  | { type: 'or'; left: FilterWire; right: FilterWire };

// --- Factories ---

export function newFilterLeaf(): FilterLeaf {
  return { kind: 'leaf', predicateType: 'device', op: 'eq', field: 'name', messagePath: '', value: '' };
}

export function newFilterGroup(): FilterGroup {
  return { kind: 'group', operator: 'and', children: [newFilterLeaf()] };
}

// --- Serialization (UI → serialized wire) ---

export function serializeFilterNode(node: FilterNode): FilterWireSerialized {
  if (node.kind === 'leaf') {
    if (node.predicateType === 'message') {
      return {
        type: 'message',
        op: node.op,
        messagePath: node.messagePath,
        value: node.value,
      };
    }
    return {
      type: node.predicateType,
      op: node.op,
      field: node.field,
      value: node.value,
    };
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
