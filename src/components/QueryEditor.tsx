import React, { ChangeEvent, useMemo, useState } from 'react';
import { Combobox, type ComboboxOption, InlineField, InlineFieldRow, Input, Stack } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { intervalStringToNanoseconds } from '../intervalNanos';
import type { FilterTextError } from '../queryText/compileFilter';
import { filterNodeToText } from '../queryText/migrateFilter';
import { displayedSelectionError, isDevicePropertySelectionText, selectionToText } from '../queryText/selectionText';
import { MyDataSourceOptions, MyQuery, GroupBy, AggregationType } from '../types';
import { FilterTextEditor } from './FilterTextEditor';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

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
  const groupBy = query.groupBy ?? { type: 'deviceId' };
  const selectionText = query.selectionText ?? selectionToText(query.selection);
  const [selectionFocused, setSelectionFocused] = useState(false);
  const selectionError = useMemo(
    () => displayedSelectionError(selectionText, selectionFocused),
    [selectionText, selectionFocused]
  );
  const selectingDeviceProperty = isDevicePropertySelectionText(selectionText);

  const rawInterval = query.aggregation?.interval ?? '';
  const intervalError = useMemo(() => validateIntervalString(rawInterval), [rawInterval]);

  const rawGranularity = query.granularity ?? '';
  const granularityError = useMemo(() => validateIntervalString(rawGranularity), [rawGranularity]);

  const onSelectionTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const updates: Partial<MyQuery> = { selectionText: value };
    if (isDevicePropertySelectionText(value)) {
      updates.groupBy = { type: 'deviceId' };
    }
    onChange({ ...query, ...updates });
  };

  // --- GroupBy handlers ---

  const onGroupByTypeChange = (opt: ComboboxOption<GroupBy['type']>) => {
    const newGB: GroupBy = opt.value === 'deviceId' ? { type: 'deviceId' } : { type: 'deviceProperty', key: '' };
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

  const filterText = query.filterText ?? filterNodeToText(query.filter);
  const [visibleFilterError, setVisibleFilterError] = useState<FilterTextError | undefined>(undefined);

  const onFilterTextChange = (value: string) => {
    onChange({ ...query, filterText: value, filter: undefined });
  };

  const onGranularityChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, granularity: e.target.value });
  };

  const runOnBlur = () => onRunQuery();

  return (
    <Stack gap={1} direction="column">
      <InlineFieldRow>
        <InlineField
          label="Selection"
          labelWidth={14}
          tooltip="A FoxQL expression (/topic.x.y) or a device property (@device.properties.key)"
          grow
          invalid={!!selectionError}
          error={selectionError}
        >
          <Input
            value={selectionText}
            onChange={onSelectionTextChange}
            onFocus={() => setSelectionFocused(true)}
            onBlur={() => {
              setSelectionFocused(false);
              runOnBlur();
            }}
            placeholder="/topic.x.y or @device.properties.key"
            invalid={!!selectionError}
          />
        </InlineField>
      </InlineFieldRow>

      {/* Group By — hidden for a device property, which always groups by device */}
      {!selectingDeviceProperty && (
        <InlineFieldRow>
          <InlineField label="Group By" labelWidth={14} tooltip="How to group the results">
            <Combobox options={GROUPBY_TYPE_OPTIONS} value={groupBy.type} onChange={onGroupByTypeChange} width={20} />
          </InlineField>

          {groupBy.type === 'deviceProperty' && (
            <InlineField label="Property Key" labelWidth={14} grow>
              <Input value={groupBy.key} onChange={onGroupByKeyChange} onBlur={runOnBlur} placeholder="propertyKey" />
            </InlineField>
          )}
        </InlineFieldRow>
      )}

      {/* Aggregation */}
      <InlineFieldRow>
        <InlineField label="Aggregation" labelWidth={14} tooltip="Downsampling method applied to query results">
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

      <InlineField
        label="Filter"
        labelWidth={14}
        grow
        tooltip="Filter text, same language as Foxglove Search. Leave empty to apply no filter."
        invalid={!!visibleFilterError}
        error={visibleFilterError?.message}
      >
        <FilterTextEditor
          value={filterText}
          onChange={onFilterTextChange}
          onBlur={runOnBlur}
          onErrorChange={setVisibleFilterError}
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
