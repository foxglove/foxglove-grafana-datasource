import React, { ChangeEvent, useMemo } from 'react';
import { InlineField, InlineFieldRow, Input, Select, Stack } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
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

const SELECTION_TYPE_OPTIONS: Array<SelectableValue<Selection['type']>> = [
  { label: 'Message Path', value: 'messagePath' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const GROUPBY_TYPE_OPTIONS: Array<SelectableValue<GroupBy['type']>> = [
  { label: 'Device', value: 'deviceId' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const AGGREGATION_TYPE_OPTIONS: Array<SelectableValue<AggregationType | '__none__'>> = [
  { label: 'None', value: '__none__' },
  { label: 'Last', value: 'last' },
  { label: 'First', value: 'first' },
  { label: 'Max', value: 'max' },
  { label: 'Min', value: 'min' },
  { label: 'Sum', value: 'sum' },
  { label: 'Average', value: 'average' },
];

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const selection = query.selection ?? { type: 'messagePath', messagePath: '' };
  const groupBy = query.groupBy ?? { type: 'deviceId' };

  // Validate message path on every change so we can show inline feedback.
  const rawMessagePath = selection.type === 'messagePath' ? selection.messagePath : '';
  const messagePathError = useMemo(() => {
    if (!rawMessagePath) {
      return undefined;
    }
    // Skip validation for template variable references
    if (rawMessagePath.includes('$')) {
      return undefined;
    }
    const result = parseAndConvertMessagePath(rawMessagePath);
    return result.ok ? undefined : result.error;
  }, [rawMessagePath]);

  // --- Selection handlers ---

  const onSelectionTypeChange = (opt: SelectableValue<Selection['type']>) => {
    if (!opt.value) {
      return;
    }
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

  const onGroupByTypeChange = (opt: SelectableValue<GroupBy['type']>) => {
    if (!opt.value) {
      return;
    }
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

  const onAggregationTypeChange = (opt: SelectableValue<AggregationType | '__none__'>) => {
    if (!opt.value || opt.value === '__none__') {
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

  // Trigger query on blur of text inputs
  const runOnBlur = () => onRunQuery();

  return (
    <Stack gap={1} direction="column">
      {/* Selection */}
      <InlineFieldRow>
        <InlineField label="Selection" labelWidth={14} tooltip="What data to select">
          <Select
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
            <Select
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
          <Select
            options={AGGREGATION_TYPE_OPTIONS}
            value={currentAggType}
            onChange={onAggregationTypeChange}
            width={20}
          />
        </InlineField>

        {query.aggregation && (
          <InlineField label="Interval" labelWidth={10} tooltip="Bin interval for aggregation (e.g. 10s, 1m, 1h)">
            <Input
              value={query.aggregation.interval}
              onChange={onAggregationIntervalChange}
              onBlur={runOnBlur}
              placeholder="10s, 1m, 1h"
              width={16}
            />
          </InlineField>
        )}
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
