import React, { ChangeEvent } from 'react';
import { InlineField, Input, Stack, DateTimePicker } from '@grafana/ui';
import { QueryEditorProps, dateTime, DateTime } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, range }: Props) {
  const onDeviceNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, deviceName: event.target.value });
    onRunQuery();
  };

  const onTopicsChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, topics: event.target.value });
  };

  const onStartTimeChange = (value?: DateTime) => {
    // Convert to RFC3339 format (ISO 8601)
    const rfc3339 = value ? value.toISOString() : '';
    onChange({ ...query, start: rfc3339 });
  };

  const onEndTimeChange = (value?: DateTime) => {
    // Convert to RFC3339 format (ISO 8601)
    const rfc3339 = value ? value.toISOString() : '';
    onChange({ ...query, end: rfc3339 });
  };

  // Parse existing RFC3339 strings back to dateTime objects for the picker
  const startTime: DateTime | null = query.start ? dateTime(query.start) : null;
  const endTime: DateTime | null = query.end ? dateTime(query.end) : null;

  const { deviceName, topics } = query;

  return (
    <Stack gap={2} direction="column">
      <InlineField label="Device Name" labelWidth={14} required tooltip="The Foxglove device name to query" grow>
        <Input
          id="query-editor-device-name"
          onChange={onDeviceNameChange}
          value={deviceName || ''}
          placeholder="Enter device name"
          width={30}
        />
      </InlineField>
      <InlineField label="Start Time" labelWidth={14} tooltip="Start time. Leave empty to use dashboard time range." grow>
        <DateTimePicker
          date={startTime ?? range?.from}
          onChange={onStartTimeChange}
          showSeconds={true}
        />
      </InlineField>
      <InlineField label="End Time" labelWidth={14} tooltip="End time. Leave empty to use dashboard time range." grow>
        <DateTimePicker
          date={endTime ?? range?.to}
          onChange={onEndTimeChange}
          showSeconds={true}
        />
      </InlineField>
      <InlineField label="Topics" labelWidth={14} tooltip="Comma-separated list of topics (optional)" grow>
        <Input
          id="query-editor-topics"
          onChange={onTopicsChange}
          value={topics || ''}
          placeholder="topic1, topic2, topic3"
          width={30}
        />
      </InlineField>
    </Stack>
  );
}
