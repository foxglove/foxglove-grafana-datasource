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
      messagePath: tpl.replace(query.messagePath || '', scopedVars),
      deviceNames: replaceArray(query.deviceNames),
      metadata: replaceRecord(query.metadata),
      // Legacy fields (kept for migration/back-compat)
      deviceName: tpl.replace(query.deviceName || '', scopedVars),
      topics: tpl.replace(query.topics || '', scopedVars),
    };
  }

  filterQuery(query: MyQuery): boolean {
    // Require non-empty messagePath
    return typeof query.messagePath === 'string' && query.messagePath.trim().length > 0;
  }
}
