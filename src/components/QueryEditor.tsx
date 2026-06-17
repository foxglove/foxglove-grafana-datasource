import React, { ChangeEvent, useMemo } from 'react';
import { Combobox, type ComboboxOption, InlineField, InlineFieldRow, Input, Stack } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { intervalStringToNanoseconds } from '../intervalNanos';
import { parseAndConvertMessagePath } from '../messagePathSet';
import {
  MyDataSourceOptions,
  MyQuery,
  Selection,
  GroupBy,
  AggregationType,
  FilterNode,
  DEFAULT_QUERY,
} from '../types';
import { FilterEditor } from './FilterEditor';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const SELECTION_TYPE_OPTIONS: Array<ComboboxOption<Selection['type']>> = [
  { label: 'Message Path', value: 'messagePath' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const GROUPBY_TYPE_OPTIONS: Array<ComboboxOption<GroupBy['type']>> = [
  { label: 'Device', value: 'deviceId' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const AGGREGATION_TYPE_OPTIONS: Array<ComboboxOption<AggregationType | '__none__'>> = [
  { label: 'None', value: '__none__' },
  { label: 'Last', value: 'last' },
  { label: 'First', value: 'first' },
  { label: 'Max', value: 'max' },
  { label: 'Min', value: 'min' },
  { label: 'Sum', value: 'sum' },
  { label: 'Average', value: 'average' },
  { label: 'Median', value: 'median' },
  { label: 'P50', value: 'p50' },
  { label: 'P90', value: 'p90' },
  { label: 'P95', value: 'p95' },
];

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const selection = query.selection ?? { type: 'messagePath', messagePath: '' };
  const groupBy = query.groupBy ?? { type: 'deviceId' };

  const rawMessagePath = selection.type === 'messagePath' ? selection.messagePath : '';
  const messagePathError = useMemo(() => {
    if (!rawMessagePath) {
      return undefined;
    }
    if (rawMessagePath.includes('$')) {
      return undefined;
    }
    const result = parseAndConvertMessagePath(rawMessagePath);
    return result.ok ? undefined : result.error;
  }, [rawMessagePath]);

  const rawInterval = query.aggregation?.interval ?? '';
  const intervalError = useMemo(() => validateIntervalString(rawInterval), [rawInterval]);

  const rawGranularity = query.granularity ?? '';
  const granularityError = useMemo(() => validateIntervalString(rawGranularity), [rawGranularity]);

  // --- Selection handlers ---

  const onSelectionTypeChange = (opt: ComboboxOption<Selection['type']>) => {
    const newSel: Selection =
      opt.value === 'messagePath'
        ? { type: 'messagePath', messagePath: '' }
        : { type: 'deviceProperty', key: '' };
    const updates: Partial<MyQuery> = { selection: newSel };
    if (opt.value === 'deviceProperty') {
      updates.groupBy = { type: 'deviceId' };
    }
    onChange({ ...query, ...updates });
  };

  const onMessagePathChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (selection.type !== 'messagePath') {
      return;
    }
    onChange({
      ...query,
      selection: { ...selection, messagePath: e.target.value },
    });
  };

  const onSelectionKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (selection.type !== 'deviceProperty') {
      return;
    }
    onChange({
      ...query,
      selection: { ...selection, key: e.target.value },
    });
  };

  // --- GroupBy handlers ---

  const onGroupByTypeChange = (opt: ComboboxOption<GroupBy['type']>) => {
    const newGB: GroupBy =
      opt.value === 'deviceId'
        ? { type: 'deviceId' }
        : { type: 'deviceProperty', key: '' };
    onChange({ ...query, groupBy: newGB });
  };

  const onGroupByKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (groupBy.type !== 'deviceProperty') {
      return;
    }
    onChange({ ...query, groupBy: { ...groupBy, key: e.target.value } });
  };

  // --- Aggregation handlers ---
  const currentAggType: AggregationType | '__none__' = query.aggregation?.type ?? '__none__';

  const onAggregationTypeChange = (opt: ComboboxOption<AggregationType | '__none__'>) => {
    if (opt.value === '__none__') {
      onChange({ ...query, aggregation: undefined });
    } else {
      onChange({
        ...query,
        aggregation: {
          interval: query.aggregation?.interval ?? '',
          type: opt.value,
        },
      });
    }
  };

  const onAggregationIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!query.aggregation) {
      return;
    }
    onChange({
      ...query,
      aggregation: { ...query.aggregation, interval: e.target.value },
    });
  };

  // --- Filter handler ---

  const onFilterChange = (filter: FilterNode) => {
    onChange({ ...query, filter });
  };

  const onGranularityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, granularity: e.target.value });
  };

  const runOnBlur = () => onRunQuery();

  return (
    <Stack gap={1} direction="column">
      {/* Selection */}
      <InlineFieldRow>
        <InlineField label="Selection" labelWidth={14} tooltip="What data to select">
          <Combobox
            options={SELECTION_TYPE_OPTIONS}
            value={selection.type}
            onChange={onSelectionTypeChange}
            width={20}
          />
        </InlineField>

        {selection.type === 'messagePath' && (
          <InlineField
            label="Message Path"
            labelWidth={16}
            tooltip="e.g. /imu.linear_acceleration.x"
            grow
            invalid={!!messagePathError}
            error={messagePathError}
          >
            <Input
              value={selection.messagePath}
              onChange={onMessagePathChange}
              onBlur={runOnBlur}
              placeholder="/topic.field.subfield"
              invalid={!!messagePathError}
            />
          </InlineField>
        )}

        {selection.type === 'deviceProperty' && (
          <InlineField label="Property Key" labelWidth={14} grow>
            <Input
              value={selection.key}
              onChange={onSelectionKeyChange}
              onBlur={runOnBlur}
              placeholder="propertyKey"
            />
          </InlineField>
        )}

      </InlineFieldRow>

      {/* Group By — hidden when selecting device properties (always groups by device) */}
      {selection.type === 'messagePath' && (
        <InlineFieldRow>
          <InlineField label="Group By" labelWidth={14} tooltip="How to group the results">
            <Combobox
              options={GROUPBY_TYPE_OPTIONS}
              value={groupBy.type}
              onChange={onGroupByTypeChange}
              width={20}
            />
          </InlineField>

          {groupBy.type === 'deviceProperty' && (
            <InlineField label="Property Key" labelWidth={14} grow>
              <Input
                value={groupBy.key}
                onChange={onGroupByKeyChange}
                onBlur={runOnBlur}
                placeholder="propertyKey"
              />
            </InlineField>
          )}
        </InlineFieldRow>
      )}

      {/* Aggregation */}
      <InlineFieldRow>
        <InlineField
          label="Aggregation"
          labelWidth={14}
          tooltip="Downsampling method applied to query results"
        >
          <Combobox
            options={AGGREGATION_TYPE_OPTIONS}
            value={currentAggType}
            onChange={onAggregationTypeChange}
            width={20}
          />
        </InlineField>

        {query.aggregation && (
          <InlineField
            label="Interval"
            labelWidth={10}
            tooltip="Bin size for aggregation (e.g. 10s, 1m). When empty, defaults to (dashboard time range  / max data points)"
            invalid={!!intervalError}
            error={intervalError}
          >
            <Input
              value={query.aggregation.interval}
              onChange={onAggregationIntervalChange}
              onBlur={runOnBlur}
              placeholder="e.g. 10s, 1m, 1h"
              width={16}
              invalid={!!intervalError}
            />
          </InlineField>
        )}
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField
          label="Granularity"
          labelWidth={14}
          grow
          tooltip="Bin size for evaluating filter conditions (e.g. 10s, 1m). When empty, defaults to (dashboard time range  / max data points)"
          invalid={!!granularityError}
          error={granularityError}
        >
          <Input
            value={query.granularity ?? ''}
            onChange={onGranularityChange}
            onBlur={runOnBlur}
            placeholder="e.g. 10s, 1m, 1h"
            width={24}
            invalid={!!granularityError}
          />
        </InlineField>
      </InlineFieldRow>

      {/* Filter */}
      <InlineField label="Filter" labelWidth={14} tooltip="Filter conditions applied to the query">
        <FilterEditor
          filter={query.filter ?? DEFAULT_QUERY.filter!}
          onChange={onFilterChange}
        />
      </InlineField>
    </Stack>
  );
}

/**
 * Validate a user-entered interval string. Empty values are valid (they signal
 * "use the default"). Strings that contain a `$` are skipped, as they will be
 * substituted by Grafana template variables before parsing.
 */
function validateIntervalString(raw: string): string | undefined {
  const trimmed = raw.trim();
  // Empty input is intentional — signals the backend to use the default
  // interval (dashboard range ÷ max data points).
  if (!trimmed) {
    return undefined;
  }
  // Contains a Grafana template variable (e.g. "$interval"). We can't validate
  // it here because substitution happens later, in applyTemplateVariables().
  if (trimmed.includes('$')) {
    return undefined;
  }
  const ns = intervalStringToNanoseconds(trimmed);
  // Parser didn't recognize the format (e.g. "1hr", "5min", "abc").
  if (ns === undefined) {
    return `Invalid interval "${raw}". valid suffixes are (ms, s, m, h, d, w, M, y)`;
  }
  // Parsed but non-positive (e.g. "0s", "0") — meaningless as a bin size and
  // would also be treated by the backend as "use the default".
  if (ns <= 0) {
    return 'Interval must be greater than zero.';
  }
  return undefined;
}
