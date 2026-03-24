import React, { ChangeEvent } from 'react';
import { InlineField, InlineFieldRow, Input, Select, Stack } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import {
  MyDataSourceOptions,
  MyQuery,
  Selection,
  GroupBy,
  AggregationType,
  FilterWire,
  DEFAULT_QUERY,
} from '../types';
import { FilterEditor } from './FilterEditor';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const SELECTION_TYPE_OPTIONS: Array<SelectableValue<Selection['type']>> = [
  { label: 'Message Path', value: 'messagePath' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const GROUPBY_TYPE_OPTIONS: Array<SelectableValue<GroupBy['type']>> = [
  { label: 'Device Name', value: 'deviceName' },
  { label: 'Device Property', value: 'deviceProperty' },
];

const AGGREGATION_TYPE_OPTIONS: Array<SelectableValue<AggregationType | '__auto__'>> = [
  { label: 'Auto (last)', value: '__auto__', description: 'Let the backend choose based on panel resolution' },
  { label: 'Count', value: 'count' },
  { label: 'Sum', value: 'sum' },
  { label: 'Min', value: 'min' },
  { label: 'Max', value: 'max' },
  { label: 'Average', value: 'average' },
  { label: 'Last', value: 'last' },
  { label: 'First', value: 'first' },
];

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const selection = query.selection ?? { type: 'messagePath', messagePath: '', columnAlias: '' };
  const groupBy = query.groupBy ?? { type: 'deviceName', deviceName: '' };

  // --- Selection handlers ---

  const onSelectionTypeChange = (opt: SelectableValue<Selection['type']>) => {
    if (!opt.value) {
      return;
    }
    const newSel: Selection =
      opt.value === 'messagePath'
        ? { type: 'messagePath', messagePath: '', columnAlias: '' }
        : { type: 'deviceProperty', key: '', columnAlias: '' };
    onChange({ ...query, selection: newSel });
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

  const onColumnAliasChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...query,
      selection: { ...selection, columnAlias: e.target.value },
    });
  };

  // --- GroupBy handlers ---

  const onGroupByTypeChange = (opt: SelectableValue<GroupBy['type']>) => {
    if (!opt.value) {
      return;
    }
    const newGB: GroupBy =
      opt.value === 'deviceName'
        ? { type: 'deviceName', deviceName: '' }
        : { type: 'deviceProperty', key: '' };
    onChange({ ...query, groupBy: newGB });
  };

  const onGroupByDeviceNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (groupBy.type !== 'deviceName') {
      return;
    }
    onChange({ ...query, groupBy: { ...groupBy, deviceName: e.target.value } });
  };

  const onGroupByKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (groupBy.type !== 'deviceProperty') {
      return;
    }
    onChange({ ...query, groupBy: { ...groupBy, key: e.target.value } });
  };

  // --- Aggregation handler ---
  // "__auto__" means omit the aggregation field so the backend auto-computes it.
  const currentAggType: AggregationType | '__auto__' = query.aggregation?.type ?? '__auto__';

  const onAggregationTypeChange = (opt: SelectableValue<AggregationType | '__auto__'>) => {
    if (!opt.value || opt.value === '__auto__') {
      onChange({ ...query, aggregation: undefined });
    } else {
      onChange({
        ...query,
        aggregation: {
          intervalStart: '',
          intervalNanoseconds: 0,
          type: opt.value,
        },
      });
    }
  };

  // --- Filter handler ---

  const onFilterChange = (filter: FilterWire) => {
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
          <InlineField label="Message Path" labelWidth={14} tooltip="e.g. /imu.linear_acceleration.x" grow>
            <Input
              value={selection.messagePath}
              onChange={onMessagePathChange}
              onBlur={runOnBlur}
              placeholder="/topic.field.subfield"
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

        <InlineField label="Alias" labelWidth={8} tooltip="Column name in the result">
          <Input
            value={selection.columnAlias}
            onChange={onColumnAliasChange}
            onBlur={runOnBlur}
            placeholder="alias"
            width={16}
          />
        </InlineField>
      </InlineFieldRow>

      {/* Group By */}
      <InlineFieldRow>
        <InlineField label="Group By" labelWidth={14} tooltip="How to group the results">
          <Select
            options={GROUPBY_TYPE_OPTIONS}
            value={groupBy.type}
            onChange={onGroupByTypeChange}
            width={20}
          />
        </InlineField>

        {groupBy.type === 'deviceName' && (
          <InlineField label="Device Name" labelWidth={14} tooltip="Supports template variables (e.g. $device)" grow>
            <Input
              value={groupBy.deviceName}
              onChange={onGroupByDeviceNameChange}
              onBlur={runOnBlur}
              placeholder="device-1 or $device"
            />
          </InlineField>
        )}

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

      {/* Aggregation */}
      <InlineFieldRow>
        <InlineField
          label="Aggregation"
          labelWidth={14}
          tooltip="Downsampling method. 'Auto' uses the panel's resolution to pick an appropriate interval."
        >
          <Select
            options={AGGREGATION_TYPE_OPTIONS}
            value={currentAggType}
            onChange={onAggregationTypeChange}
            width={20}
          />
        </InlineField>
      </InlineFieldRow>

      {/* Filter */}
      <InlineField label="Filter" labelWidth={14} tooltip="Filter conditions applied to the query">
        <FilterEditor
          filter={query.filter ?? (DEFAULT_QUERY.filter as FilterWire)}
          onChange={onFilterChange}
        />
      </InlineField>
    </Stack>
  );
}
