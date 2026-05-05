import React, { ChangeEvent } from 'react';
import { InlineField, Input, SecretInput } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

/** Grafana `InlineField` label width (theme units); 14 wraps multi-word labels awkwardly. */
const configLabelWidth = 22;

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const onBaseUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, baseUrl: event.target.value },
    });
  };

  const onProjectIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, projectId: event.target.value },
    });
  };

  const onSiteIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, siteId: event.target.value },
    });
  };

  const onQueryHttpTimeoutSecondsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.trim();
    if (raw === '') {
      const next = { ...jsonData };
      delete next.queryHttpTimeoutSeconds;
      onOptionsChange({
        ...options,
        jsonData: next,
      });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return;
    }
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, queryHttpTimeoutSeconds: n },
    });
  };

  const onAPIKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: { apiKey: event.target.value },
    });
  };

  const onResetAPIKey = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: { ...secureJsonFields, apiKey: false },
      secureJsonData: { ...secureJsonData, apiKey: '' },
    });
  };

  return (
    <>
      <InlineField label="API Base URL" labelWidth={configLabelWidth} tooltip="Optional: Override the default Foxglove API base URL">
        <Input
          id="config-editor-base-url"
          onChange={onBaseUrlChange}
          value={jsonData.baseUrl ?? ''}
          placeholder="https://api.foxglove.dev"
          width={40}
        />
      </InlineField>
      <InlineField
        label="API Key"
        labelWidth={configLabelWidth}
        required
        tooltip="Stored securely and only sent to the backend. For provisioning/CI you can also set the FOXGLOVE_API_KEY environment variable."
      >
        <SecretInput
          required
          id="config-editor-api-key"
          isConfigured={secureJsonFields.apiKey}
          value={secureJsonData?.apiKey}
          placeholder="Enter your API key"
          width={40}
          onReset={onResetAPIKey}
          onChange={onAPIKeyChange}
        />
      </InlineField>
      <InlineField label="Project ID" labelWidth={configLabelWidth} required tooltip="The Foxglove project ID to scope queries to">
        <Input
          id="config-editor-project-id"
          onChange={onProjectIdChange}
          value={jsonData.projectId ?? ''}
          placeholder="proj_..."
          width={40}
        />
      </InlineField>
      <InlineField label="Site ID" labelWidth={configLabelWidth} required tooltip="The primary Foxglove site ID to search">
        <Input
          id="config-editor-site-id"
          onChange={onSiteIdChange}
          value={jsonData.siteId ?? ''}
          placeholder="site_..."
          width={40}
        />
      </InlineField>
      <InlineField
        label="Query Timeout (seconds)"
        labelWidth={configLabelWidth}
        tooltip="Optional per-request limit for each query HTTP call (Foxglove API POST and frame download). Empty or 0 means no plugin-side limit; Grafana’s query timeout and your infrastructure still apply."
      >
        <Input
          id="config-editor-query-http-timeout"
          type="number"
          min={0}
          onChange={onQueryHttpTimeoutSecondsChange}
          value={
            jsonData.queryHttpTimeoutSeconds !== undefined ? String(jsonData.queryHttpTimeoutSeconds) : ''
          }
          placeholder="0 = no limit"
          width={40}
        />
      </InlineField>
    </>
  );
}
