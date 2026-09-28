import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { intervalStringToNanoseconds } from './intervalNanos';
import { compileFilterText } from './queryText/compileFilter';
import { filterNodeToText } from './queryText/migrateFilter';
import { compileSelectionText, selectionToText } from './queryText/selectionText';
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
    const result = { ...query };

    delete result.selectionError;
    const selectionSource =
      typeof result.selectionText === 'string' ? result.selectionText : selectionToText(result.selection);
    const substitutedSelection = tpl.replace(selectionSource, scopedVars);
    if (substitutedSelection.trim() === '') {
      delete result.selection;
    } else {
      const compiled = compileSelectionText(substitutedSelection);
      if (!compiled.ok) {
        result.selectionError = compiled.error;
        delete result.selection;
      } else if (compiled.selection) {
        result.selection = compiled.selection;
      }
    }

    const groupBy = result.groupBy ?? { type: 'deviceId' as const };
    if (groupBy.type === 'deviceProperty') {
      result.groupBy = { ...groupBy, key: tpl.replace(groupBy.key, scopedVars) };
    } else {
      result.groupBy = groupBy;
    }

    delete result.filterWire;
    delete result.filterError;
    const filterSource = typeof result.filterText === 'string' ? result.filterText : filterNodeToText(result.filter);
    const substitutedFilter = tpl.replace(filterSource, scopedVars);
    if (substitutedFilter.trim() !== '') {
      const compiled = compileFilterText(substitutedFilter);
      if (!compiled.ok) {
        result.filterError = compiled.error.message;
      } else if (compiled.filter) {
        result.filterWire = compiled.filter;
      }
    }

    if (result.aggregation) {
      const intervalStr = tpl.replace(result.aggregation.interval || '', scopedVars).trim();
      let intervalNanoseconds = 0;
      if (intervalStr) {
        const ns = intervalStringToNanoseconds(intervalStr);
        if (ns !== undefined && ns > 0) {
          intervalNanoseconds = ns;
        }
      }
      result.aggregationWire = {
        intervalNanoseconds,
        type: result.aggregation.type,
      };
    } else {
      delete result.aggregationWire;
    }

    const granularityStr = tpl.replace(result.granularity ?? '', scopedVars).trim();
    if (granularityStr) {
      const granularityNs = intervalStringToNanoseconds(granularityStr);
      if (granularityNs !== undefined && granularityNs > 0) {
        result.granularityWire = { intervalNanoseconds: granularityNs };
      } else {
        delete result.granularityWire;
      }
    } else {
      delete result.granularityWire;
    }

    return result;
  }

  filterQuery(query: MyQuery): boolean {
    const selectionSource =
      typeof query.selectionText === 'string' ? query.selectionText : selectionToText(query.selection);
    return selectionSource.trim() !== '';
  }
}
