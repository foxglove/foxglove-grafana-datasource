import React, { ChangeEvent } from 'react';
import { InlineField, Input, Stack, DateTimePicker } from '@grafana/ui';
import { QueryEditorProps, dateTime, DateTime } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, range }: Props) {
  const onDeviceNamesChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, deviceName: event.target.value });
    onRunQuery();
  };

  const onMessagePathsChange = (event: ChangeEvent<HTMLInputElement>) => {
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
      <InlineField label="Device Names" labelWidth={14} required tooltip="Foxglove device name(s). Supports Grafana template variables (e.g. $device). Multi-value variables or comma-separated names will query each device separately." grow>
        <Input
          id="query-editor-device-name"
          onChange={onDeviceNamesChange}
          value={deviceName || ''}
          placeholder="device-1 or $device"
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
      <InlineField label="Message Paths" labelWidth={14} tooltip="Comma-separated list of message paths to floating-point fields. See https://docs.foxglove.dev/docs/visualization/message-path-syntax" grow>
        <Input
          id="query-editor-topics"
          onChange={onMessagePathsChange}
          value={topics || ''}
          placeholder="topic1, topic2, topic3"
          width={30}
        />
      </InlineField>
    </Stack>
  );
}
