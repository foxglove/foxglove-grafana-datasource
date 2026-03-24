import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

// --- Selection types ---

export interface MessagePathSelection {
  type: 'messagePath';
  messagePath: string;
  columnAlias: string;
}

export interface DevicePropertySelection {
  type: 'deviceProperty';
  key: string;
  columnAlias: string;
}

export type Selection = MessagePathSelection | DevicePropertySelection;

// --- GroupBy types ---

export interface DeviceNameGroupBy {
  type: 'deviceName';
  deviceName: string;
}

export interface DevicePropertyGroupBy {
  type: 'deviceProperty';
  key: string;
}

export type GroupBy = DeviceNameGroupBy | DevicePropertyGroupBy;

// --- Aggregation ---

export type AggregationType = 'count' | 'sum' | 'min' | 'max' | 'average' | 'last' | 'first';

export interface Aggregation {
  intervalStart: string;
  intervalNanoseconds: number;
  type: AggregationType;
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
  filter?: FilterWire;
  groupBy?: GroupBy;
  aggregation?: Aggregation;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  selection: { type: 'messagePath', messagePath: '', columnAlias: '' },
  filter: { type: 'device', op: 'eq', field: 'name', value: '' },
  groupBy: { type: 'deviceName', deviceName: '' },
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
