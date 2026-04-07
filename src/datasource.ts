import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';

import { parseAndConvertMessagePath } from './messagePathSet';
import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, FilterWire } from './types';

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
        const converted = parseAndConvertMessagePath(rawPath);
        result.selection = {
          ...result.selection,
          messagePath: rawPath,
          messagePathSet: converted.ok ? converted.messagePathSet : undefined,
        };
      } else {
        result.selection = {
          ...result.selection,
          key: tpl.replace(result.selection.key, scopedVars),
        };
      }
    }

    if (result.groupBy) {
      if (result.groupBy.type === 'deviceName') {
        result.groupBy = {
          ...result.groupBy,
          deviceName: tpl.replace(result.groupBy.deviceName, scopedVars, 'csv'),
        };
      } else {
        result.groupBy = {
          ...result.groupBy,
          key: tpl.replace(result.groupBy.key, scopedVars),
        };
      }
    }

    if (result.filter) {
      result.filter = replaceFilterVars(result.filter, tpl, scopedVars);
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

/**
 * Recursively walk the wire-format filter and apply Grafana template variable
 * substitution to all string fields (value, field, topic).
 */
function replaceFilterVars(
  filter: FilterWire,
  tpl: TemplateSrv,
  scopedVars: ScopedVars,
): FilterWire {
  if (!filter || typeof filter !== 'object') {
    return filter;
  }

  const type = filter.type as string;

  if (type === 'and' || type === 'or') {
    return {
      ...filter,
      left: replaceFilterVars(filter.left as FilterWire, tpl, scopedVars),
      right: replaceFilterVars(filter.right as FilterWire, tpl, scopedVars),
    };
  }

  const result = { ...filter };
  if (typeof result.value === 'string') {
    result.value = tpl.replace(result.value, scopedVars);
  }
  if (typeof result.field === 'string') {
    result.field = tpl.replace(result.field, scopedVars);
  }
  if (typeof result.topic === 'string') {
    result.topic = tpl.replace(result.topic, scopedVars);
  }
  return result;
}
