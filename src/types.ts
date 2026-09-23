import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

// --- Selection types ---

import type { Selector } from './foxqlSelection';

export type { Selector };

export interface FoxqlSelection {
  type: 'messagePath';
  /** Raw FoxQL expression entered by the user (stored in the query model). */
  messagePath: string;
  /**
   * Parsed wire-format fields. Populated by applyTemplateVariables() before
   * sending to the backend — not persisted in the query model.
   */
  topic?: string;
  selectorPath?: Selector[];
  /** The un-parsed FoxQL expression, used by the backend as a label for the time series. */
  messagePathString?: string;
}

export interface DevicePropertySelection {
  type: 'deviceProperty';
  key: string;
}

export type Selection = FoxqlSelection | DevicePropertySelection;

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
  /** Human-readable interval string, e.g. "10s", "1m", "1h".
   *  When empty, the plugin backend sets intervalNanoseconds to range duration ÷ Max data points. */
  interval: string;
  type: AggregationType;
}

/** Wire format sent to the backend/API. */
export interface AggregationWire {
  intervalNanoseconds: number;
  type: string;
}

/** Wire format for time granularity of filter evaluation (interval only). */
export interface GranularityWire {
  intervalNanoseconds: number;
}

// ---------------------------------------------------------------------------
// Filter types
//
// The editor stores filter text. Older dashboards store a FilterNode tree;
// filterNodeToText renders that tree so both paths compile to FilterWire.
// ---------------------------------------------------------------------------

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'
  | 'contains'
  | 'not-contains'
  | 'is-not-null';

export type LeafPredicateType = 'device' | 'message' | 'event' | 'recording';

export interface FilterLeaf {
  kind: 'leaf';
  predicateType: LeafPredicateType;
  op: FilterOp;
  /** Field name for device / event / recording predicates (e.g. "name", "properties.fleet"). */
  field: string;
  /** Full FoxQL expression for message predicates (e.g. /imu.accel.x). */
  messagePath: string;
  value: string;
}

export interface FilterGroup {
  kind: 'group';
  operator: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterLeaf | FilterGroup;

type FieldPredicateType = 'device' | 'event' | 'recording' | 'episode' | 'session';

/** Wire predicate for device, event, recording, episode, and session fields. */
export interface FilterWireFieldPredicate {
  type: FieldPredicateType;
  op: FilterOp;
  field: string;
  /** Omitted for `is-not-null`. `in` is a string array; every other operator is a string. */
  value?: string | string[];
}

/** Message predicate — FoxQL expression parsed into topic + selectorPath. */
export interface FilterWireMessageResolved {
  type: 'message';
  op: FilterOp;
  topic: string;
  selectorPath: Selector[];
  /** Omitted for `is-not-null`. `in` is a string array; every other operator is a string. */
  value?: string | string[];
}

/** Topic existence predicate. The filter text is `/topic exists`. */
export interface FilterWireTopicExists {
  type: 'topic-exists';
  topic: string;
}

/** Wire format sent to the backend / Foxglove API. */
export type FilterWire =
  | FilterWireFieldPredicate
  | FilterWireMessageResolved
  | FilterWireTopicExists
  | { type: 'and'; left: FilterWire; right: FilterWire }
  | { type: 'or'; left: FilterWire; right: FilterWire };

// --- Query model ---

export interface MyQuery extends DataQuery {
  selection?: Selection;
  /**
   * Filter text in the Search filter language. When set, including as an empty
   * string, it is the filter the editor and the query use. Older dashboards
   * store {@link filter} instead and gain `filterText` when the panel is edited.
   */
  filterText?: string;
  /** Condition tree written by the previous filter editor. Read until the panel is edited. */
  filter?: FilterNode;
  /** Wire-format filter, populated by applyTemplateVariables(). Not persisted. */
  filterWire?: FilterWire;
  /** Set by applyTemplateVariables() when filter text does not compile. Not persisted. */
  filterError?: string;
  groupBy?: GroupBy;
  /** UI-friendly aggregation with human-readable interval string. */
  aggregation?: Aggregation;
  /** Wire-format aggregation sent to the backend. Populated by applyTemplateVariables()
   *  whenever aggregation is set (intervalNanoseconds is 0 when the UI interval is empty).
   *  Not persisted. */
  aggregationWire?: AggregationWire;
  /** Human-readable time interval for filter condition granularity (e.g. "10s", "1m").
   *  When omitted, the plugin backend sets filterBinNanos to range duration ÷ Max data points. */
  granularity?: string;
  /** Wire-format granularity. Populated by applyTemplateVariables(). Not persisted. */
  granularityWire?: GranularityWire;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  selection: { type: 'messagePath', messagePath: '' },
  filterText: '',
  groupBy: { type: 'deviceId' },
};

/**
 * Datasource instance configuration (stored in Grafana's jsonData).
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  baseUrl?: string;
  /** Seconds per query HTTP request (POST + signed GET). Omit or 0 = use Grafana HTTP client timeout. */
  queryHttpTimeoutSeconds?: number;
  projectId?: string;
  siteId?: string;
}

/**
 * Secure values — only sent to the backend, never exposed to the frontend.
 */
export interface MySecureJsonData {
  apiKey?: string;
}
