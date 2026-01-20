import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface MyQuery extends DataQuery {
  // New query model
  messagePath?: string;
  deviceNames?: string[];
  metadata?: Record<string, string>;
  // Legacy fields (kept for migration/back-compat in UI)
  deviceName?: string;
  topics?: string; // Comma-separated
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  messagePath: '',
  deviceNames: [],
  metadata: {},
};

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  baseUrl?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string;
}
