import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { intervalStringToNanoseconds } from './intervalNanos';
import { parseAndConvertFoxql } from './foxqlSelection';
import { compileFilterText } from './queryText/compileFilter';
import { filterNodeToText } from './queryText/migrateFilter';
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

    if (result.selection) {
      if (result.selection.type === 'messagePath') {
        const rawPath = tpl.replace(result.selection.messagePath, scopedVars);
        const converted = parseAndConvertFoxql(rawPath);
        result.selection = {
          ...result.selection,
          messagePath: rawPath,
          messagePathString: rawPath,
          topic: converted.ok ? converted.parsed.topic : undefined,
          selectorPath: converted.ok ? converted.parsed.selectorPath : undefined,
        };
      } else {
        result.selection = {
          ...result.selection,
          key: tpl.replace(result.selection.key, scopedVars),
        };
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
    if (!query.selection) {
      return false;
    }
    if (query.selection.type === 'messagePath' && !query.selection.messagePath) {
      return false;
    }
    if (query.selection.type === 'deviceProperty' && !query.selection.key) {
      return false;
    }
    return true;
  }
}
