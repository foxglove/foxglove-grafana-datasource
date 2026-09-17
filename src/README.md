# Foxglove

The Foxglove data source plugin charts values from your Primary Site as time series in Grafana. Point a panel at a [FoxQL](https://docs.foxglove.dev/docs/visualization/foxql) expression such as `/imu.linear_acceleration.x`.

It uses the same query engine as the Foxglove Search page. The plugin is a Grafana data source only — it does not add custom panels or embed the Foxglove app.

Use of this plugin requires an [Enterprise](https://foxglove.dev/pricing) Foxglove plan with the Grafana integration enabled for your organization. To get started, [contact us](https://foxglove.dev/contact?reason=sales). Grafana **11.5.0** or later is required.

For the full guide, see the [Foxglove Grafana documentation](https://docs.foxglove.dev/docs/grafana).

## Configuration

Create an API key at https://app.foxglove.dev/~/settings/apikeys with these capabilities:

- `data.search`
- `devices.list`

If the "search" capability group doesn't appear when creating a key, the Grafana integration isn't enabled for your organization yet.

Look up your Project ID and Site ID on the [Projects](https://app.foxglove.dev/~/settings/projects) and [Sites](https://app.foxglove.dev/~/settings/sites) settings pages.

In Grafana, go to **Connections → Data sources → Add new data source** and choose Foxglove.

| Field | Required | Value |
| ----- | -------- | ----- |
| API Base URL | No | Defaults to `https://api.foxglove.dev`. Most users should not change this field. |
| API Key | Yes | Your API key |
| Project ID | Yes | The `proj_` ID from the Projects settings page |
| Site ID | Yes | The `site_` ID of your Primary Site from the Sites settings page |
| Query Timeout (seconds) | No | Per-request limit for each query. Leave empty or set to `0` to use Grafana's HTTP client timeout |

Click **Save & test**. A working configuration reports "Successfully connected to Foxglove API".

Each data source targets one Project and one Primary Site. To chart data from more than one Primary Site, add a data source per site.

## Queries

In a Time series panel, select the Foxglove data source. Leave **Selection** set to **FoxQL Expression** and enter a numeric path — for example `/imu.linear_acceleration.x`. Set the dashboard time range to a window where at least one device was recording.

The query editor supports:

- **Selection**: a FoxQL expression or a numeric device property
- **Group By**: device or device property (FoxQL selections only)
- **Aggregation**: last, first, max, min, sum, average, median, and percentiles
- **Filters**: predicates on devices, messages, events, and recordings
- **Granularity**: bin width for evaluating filter conditions

See [Building queries](https://docs.foxglove.dev/docs/grafana/queries) for filters, grouping, aggregation, and examples.

### Limitations

- Series values must be numeric. String and boolean fields can be used in filters, but not plotted.
- FoxQL functions such as `.@rpy` and `.@degrees` are not supported.

## Provisioning

You can provision the data source from a Grafana YAML file. Use environment variables for per-environment values. Use the bare `$VAR` form for the API key so Grafana does not double-expand values that contain `$`:

```yaml
apiVersion: 1

datasources:
  - name: Foxglove
    type: foxglovedev-foxglove-datasource
    access: proxy
    jsonData:
      baseUrl: ${FOXGLOVE_API_BASE_URL}
      projectId: ${FOXGLOVE_PROJECT_ID}
      siteId: ${FOXGLOVE_SITE_ID}
      queryHttpTimeoutSeconds: 60
    secureJsonData:
      apiKey: $FOXGLOVE_API_KEY
```

Omit `queryHttpTimeoutSeconds` to use Grafana's HTTP client timeout. Omit `baseUrl` to use `https://api.foxglove.dev`.
