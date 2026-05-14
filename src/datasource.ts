import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';

import { intervalStringToNanoseconds } from './intervalNanos';
import { parseAndConvertMessagePath } from './messagePathSet';
import {
  MyQuery,
  MyDataSourceOptions,
  DEFAULT_QUERY,
  FilterWire,
  FilterWireSerialized,
  serializeFilterNode,
  FilterNode,
} from './types';

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

    if (result.filter && !isEmptyFilter(result.filter)) {
      const serialized = serializeFilterNode(result.filter);
      result.filterWire = resolveFilter(serialized, tpl, scopedVars);
    }

    if (result.aggregation) {
      const intervalStr = tpl.replace(result.aggregation.interval || '', scopedVars).trim();
      let intervalNs = undefined;
      if (intervalStr) {
        intervalNs = intervalStringToNanoseconds(intervalStr);
      }
      if (intervalNs !== undefined && intervalNs > 0) {
        result.aggregationWire = {
          intervalNanoseconds: intervalNs,
          type: result.aggregation.type,
        };
      } else {
        delete result.aggregationWire;
      }
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
    if (query.aggregation && !query.aggregation.interval?.trim()) {
      return false;
    }
    return true;
  }
}

/**
 * Resolve a serialized filter tree into the final API wire format:
 * apply Grafana template variable substitution and parse message paths
 * into topic + selectorPath.
 */
function resolveFilter(filter: FilterWireSerialized, tpl: TemplateSrv, scopedVars: ScopedVars): FilterWire {
  if (filter.type === 'and' || filter.type === 'or') {
    return {
      type: filter.type,
      left: resolveFilter(filter.left, tpl, scopedVars),
      right: resolveFilter(filter.right, tpl, scopedVars),
    };
  }

  const resolvedValue = resolveValue(filter.op, tpl.replace(filter.value as string, scopedVars));

  if (filter.type === 'message') {
    const raw = tpl.replace(filter.messagePath, scopedVars);
    const parsed = parseAndConvertMessagePath(raw);
    return {
      type: 'message',
      op: filter.op,
      topic: parsed.ok ? parsed.parsed.topic : '',
      selectorPath: parsed.ok ? parsed.parsed.selectorPath : [],
      value: resolvedValue,
    };
  }

  return {
    type: filter.type,
    op: filter.op,
    field: tpl.replace(filter.field, scopedVars),
    value: resolvedValue,
  };
}

/** For 'in' ops, split comma-separated string into an array; otherwise pass through. */
function resolveValue(op: string, raw: string): string | string[] {
  if (op === 'in') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return raw;
}

/** A filter is "empty" when the user hasn't configured any meaningful conditions. */
function isEmptyFilter(node: FilterNode): boolean {
  if (node.kind === 'leaf') {
    return node.value === '';
  }
  return node.children.every(isEmptyFilter);
}
