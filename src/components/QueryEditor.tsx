import React, { ChangeEvent } from 'react';
import { InlineField, Input, Stack, DateTimePicker } from '@grafana/ui';
import { QueryEditorProps, dateTime, DateTime } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, range }: Props) {
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

  const onMessagePathsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value || '';
    const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
    onChange({ ...query, messagePaths: arr });
  };

  const onDeviceNamesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value || '';
    const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
    onChange({ ...query, deviceNames: arr });
  };

  const onMetadataChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value || '';
    const rec: Record<string, string> = {};
    raw.split(',').map((pair) => pair.trim()).filter(Boolean).forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (key) {
          rec[key] = value;
        }
      }
    });
    onChange({ ...query, metadata: rec });
  };

  // Parse existing RFC3339 strings back to dateTime objects for the picker
  const startTime: DateTime | null = query.start ? dateTime(query.start) : null;
  const endTime: DateTime | null = query.end ? dateTime(query.end) : null;

  const messagePathsDisplay = (query.messagePaths ?? []).join(', ');
  const deviceNamesDisplay = (query.deviceNames ?? []).join(', ');
  const metadataDisplay = Object.entries(query.metadata ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return (
    <Stack gap={2} direction="column">
      <InlineField label="Message Paths" labelWidth={14} required tooltip="Comma-separated list of message paths to read" grow>
        <Input
          id="query-editor-message-paths"
          onChange={onMessagePathsChange}
          value={messagePathsDisplay}
          placeholder="/topic.field, /other"
          width={40}
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
      <InlineField label="Device Names" labelWidth={14} tooltip="Optional: comma-separated device names to filter" grow>
        <Input
          id="query-editor-device-names"
          onChange={onDeviceNamesChange}
          value={deviceNamesDisplay}
          placeholder="deviceA, deviceB"
          width={40}
        />
      </InlineField>
      <InlineField label="Metadata" labelWidth={14} tooltip="Optional: comma-separated key=value pairs" grow>
        <Input
          id="query-editor-metadata"
          onChange={onMetadataChange}
          value={metadataDisplay}
          placeholder="env=prod, site=abc"
          width={40}
        />
      </InlineField>
    </Stack>
  );
}
