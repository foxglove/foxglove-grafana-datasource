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
    return {
      ...query,
      deviceName: getTemplateSrv().replace(query.deviceName || '', scopedVars),
      topics: getTemplateSrv().replace(query.topics || '', scopedVars),
      start: getTemplateSrv().replace(query.start || '', scopedVars),
      end: getTemplateSrv().replace(query.end || '', scopedVars),
    };
  }

  filterQuery(query: MyQuery): boolean {
    // if no deviceName has been provided, prevent the query from being executed
    return !!query.deviceName;
  }
}
