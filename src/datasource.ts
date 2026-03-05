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
      // Use 'csv' format so multi-value variables resolve to "dev1,dev2,dev3"
      // which the backend splits and queries individually.
      deviceName: getTemplateSrv().replace(query.deviceName || '', scopedVars, 'csv'),
      topics: getTemplateSrv().replace(query.topics || '', scopedVars, 'csv'),
      start: getTemplateSrv().replace(query.start || '', scopedVars),
      end: getTemplateSrv().replace(query.end || '', scopedVars),
    };
  }

  filterQuery(query: MyQuery): boolean {
    // if no deviceName has been provided, prevent the query from being executed
    return !!query.deviceName;
  }
}
