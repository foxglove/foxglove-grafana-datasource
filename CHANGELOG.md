# Changelog

## v0.0.4

### Added

- Optional **Query HTTP timeout** datasource setting (`queryHttpTimeoutSeconds` in `jsonData`): maximum duration in seconds for each HTTP request used during a query (the Foxglove API POST and the follow-up download). Leave unset or set to `0` for no client-side limit.

### Changed

- Query HTTP calls no longer use a fixed plugin-side timeout by default. When the timeout setting is omitted or zero, duration is bounded only by Grafana’s datasource/query timeout, the request context, and infrastructure (for example load balancers and the Foxglove API).

## v0.0.3

This release adds a query builder and support for displaying device property values.

The new query builder supports:

- Selecting either topic data via [Message path](https://docs.foxglove.dev/docs/visualization/message-path-syntax) or [Device Property](https://docs.foxglove.dev/docs/data/devices#properties) data by key.
- Grouping results by device or by device property value.
- Filtering using predicates on:
  - Messsage data
  - Device ID, name, and custom property values
  - Event ID and custom property values
  - Recording ID, filename and metadata
- Aggregation using median, average, first, last, sum, count, and percentile methods.

## v0.0.2

### Fixed

- Fixed a bug where quoted topic or field names were not respected in message paths.

## v0.0.1

Initial release.

To use this plugin, you need a Foxglove API key.

Navigate to https://app.foxglove.dev/~/settings/apikeys and create an API key with at least these capabilities:

- recordings.list
- data.stream
- devices.list
- events.list
- properties.list
- projects.list
- sites.list

Then, once the plugin is installed, configure the data source with

| Name         | Value                    |
| ------------ | ------------------------ |
| API Base URL | https://api.foxglove.dev |
| API Key      | (your API key)           |

You can then query Foxglove using comma-separated lists of device names and [message path](https://docs.foxglove.dev/docs/visualization/message-path-syntax) values.

### Limitations

- Grouping, aggregation and filtering are not supported for this release.
- Currently only numeric values from your data are supported.
