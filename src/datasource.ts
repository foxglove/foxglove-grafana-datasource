import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY } from './types';

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: MyQuery, scopedVars: ScopedVars) {
    const tpl = getTemplateSrv();
    const replaceArray = (arr?: string[]) => (arr ?? []).map((s) => tpl.replace(s || '', scopedVars));
    const replaceRecord = (rec?: Record<string, string>) => {
      const out: Record<string, string> = {};
      if (rec) {
        for (const [k, v] of Object.entries(rec)) {
          out[k] = tpl.replace(v || '', scopedVars);
        }
      }
      return out;
    };

    return {
      ...query,
      // New model
      messagePaths: replaceArray(query.messagePaths),
      deviceNames: replaceArray(query.deviceNames),
      metadata: replaceRecord(query.metadata),
      start: tpl.replace(query.start || '', scopedVars),
      end: tpl.replace(query.end || '', scopedVars),
      // Legacy fields (kept for migration/back-compat)
      deviceName: tpl.replace(query.deviceName || '', scopedVars),
      topics: tpl.replace(query.topics || '', scopedVars),
    };
  }

  filterQuery(query: MyQuery): boolean {
    // Require at least one message path
    return Array.isArray(query.messagePaths) && query.messagePaths.length > 0;
  }
}
