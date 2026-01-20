import React, { ChangeEvent, useEffect, useState } from 'react';
import { InlineField, Input, Stack, Button } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const updateMessagePath = (value: string) => {
    onChange({ ...query, messagePath: value });
    onRunQuery();
  };

  const updateDeviceName = (idx: number, value: string) => {
    const devices = [...(query.deviceNames ?? [])];
    devices[idx] = value;
    onChange({ ...query, deviceNames: devices });
  };
  const addDeviceName = () => {
    const devices = [...(query.deviceNames ?? []), ''];
    onChange({ ...query, deviceNames: devices });
  };
  const removeDeviceName = (idx: number) => {
    const devices = [...(query.deviceNames ?? [])];
    devices.splice(idx, 1);
    onChange({ ...query, deviceNames: devices });
  };

  // Local UI state for metadata rows so we can render empty rows before keys are set
  type MetadataRow = { key: string; value: string };
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(
    () => Object.entries(query.metadata ?? {}).map(([key, value]) => ({ key, value }))
  );
  useEffect(() => {
    setMetadataRows(Object.entries(query.metadata ?? {}).map(([key, value]) => ({ key, value })));
  }, [query.metadata]);
  const applyMetadataRowsToQuery = (entries: MetadataRow[]) => {
    const rec: Record<string, string> = {};
    for (const row of entries) {
      if (row.key) {
        rec[row.key] = row.value ?? '';
      }
    }
    onChange({ ...query, metadata: rec });
  };
  const updateMetadataKey = (idx: number, key: string) => {
    const entries = metadataRows.map((r, i) => (i === idx ? { key, value: r.value } : r));
    setMetadataRows(entries);
    applyMetadataRowsToQuery(entries);
  };
  const updateMetadataValue = (idx: number, value: string) => {
    const entries = metadataRows.map((r, i) => (i === idx ? { key: r.key, value } : r));
    setMetadataRows(entries);
    applyMetadataRowsToQuery(entries);
  };
  const addMetadata = () => {
    const entries = [...metadataRows, { key: '', value: '' }];
    setMetadataRows(entries);
    // Do not apply to query until a non-empty key exists
  };
  const removeMetadata = (idx: number) => {
    const entries = metadataRows.filter((_, i) => i !== idx);
    setMetadataRows(entries);
    applyMetadataRowsToQuery(entries);
  };

  return (
    <Stack gap={2} direction="column">
      <InlineField label="Message Path" labelWidth={21} required tooltip="Message path to read" grow>
        <Input
          id="query-editor-message-path"
          onChange={(e: ChangeEvent<HTMLInputElement>) => updateMessagePath(e.target.value)}
          value={query.messagePath ?? ''}
          placeholder="/topic.field"
          width={40}
        />
      </InlineField>
      {/* Time range pickers removed; panel time range is canonical */}
      <InlineField label="Device Names" labelWidth={21} tooltip="Optional device names to filter" grow>
        <Stack direction="column" gap={1}>
          {(query.deviceNames ?? []).map((d, idx) => (
            <Stack key={`device-${idx}`} direction="row" gap={1}>
              <Input
                id={`query-editor-device-name-${idx}`}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateDeviceName(idx, e.target.value)}
                value={d}
                placeholder="deviceA"
                width={40}
              />
              <Button variant="secondary" onClick={() => removeDeviceName(idx)}>
                Remove
              </Button>
            </Stack>
          ))}
          <Button onClick={addDeviceName}>Add device</Button>
        </Stack>
      </InlineField>
      <InlineField label="Metadata" labelWidth={21} tooltip="Optional key/value filters" grow>
        <Stack direction="column" gap={1}>
          {metadataRows.map(({ key, value }, idx) => (
            <Stack key={`meta-${idx}`} direction="row" gap={1}>
              <Input
                id={`query-editor-metadata-key-${idx}`}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateMetadataKey(idx, e.target.value)}
                value={key}
                placeholder="key"
                width={20}
              />
              <Input
                id={`query-editor-metadata-value-${idx}`}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateMetadataValue(idx, e.target.value)}
                value={value}
                placeholder="value"
                width={20}
              />
              <Button variant="secondary" onClick={() => removeMetadata(idx)}>
                Remove
              </Button>
            </Stack>
          ))}
          <Button onClick={addMetadata}>Add pair</Button>
        </Stack>
      </InlineField>
    </Stack>
  );
}
