import { DataSourceInstanceSettings, CoreApp, ScopedVars, rangeUtil } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';

import { parseAndConvertMessagePath } from './messagePathSet';
import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, FilterWire, serializeFilterNode } from './types';

const MS_TO_NS = 1_000_000;

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

    if (result.groupBy) {
      if (result.groupBy.type === 'deviceProperty') {
        result.groupBy = {
          ...result.groupBy,
          key: tpl.replace(result.groupBy.key, scopedVars),
        };
      }
    }

    if (result.filter) {
      const wire = serializeFilterNode(result.filter);
      result.filterWire = replaceFilterVars(wire, tpl, scopedVars);
    }

    if (result.aggregation) {
      const intervalStr = tpl.replace(result.aggregation.interval || '', scopedVars);
      let intervalNs = 0;
      if (intervalStr) {
        try {
          intervalNs = rangeUtil.intervalToMs(intervalStr) * MS_TO_NS;
        } catch {
          // Leave at 0 if the interval string is unparseable.
        }
      }
      result.aggregationWire = {
        intervalNanoseconds: intervalNs,
        type: result.aggregation.type,
      };
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
 * Recursively walk the wire-format filter, apply Grafana template variable
 * substitution, and for message predicates parse the messagePath into
 * topic + selectorPath for the API.
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

  if (type === 'message' && typeof result.messagePath === 'string') {
    const raw = tpl.replace(result.messagePath, scopedVars);
    const parsed = parseAndConvertMessagePath(raw);
    delete result.messagePath;
    if (parsed.ok) {
      result.topic = parsed.parsed.topic;
      result.selectorPath = parsed.parsed.selectorPath;
    }
  }

  return result;
}
