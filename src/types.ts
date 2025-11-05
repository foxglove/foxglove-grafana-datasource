import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface MyQuery extends DataQuery {
  deviceName?: string;
  topics?: string; // Comma-separated list of topics
  start?: string; // Start time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
  end?: string; // End time in RFC3339 format (e.g., "2019-08-24T14:15:22Z")
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  deviceName: '',
  topics: '',
  start: '',
  end: '',
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
  path?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string;
}
