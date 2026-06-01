# Changelog

## v0.0.6

### Changed

- Better build artifacts for Grafana release process.

## v0.0.5

### Added

- Optional **Granularity**: Controls the date bin width of filter evaluation results. This now defaults to
  (dashboard time range / max data points), or roughly one bin per pixel. Before this change, it would
  filter granularity would be set to the aggregation interval if set, but this is no longer true.

### Changed

- Aggregation interval is now optional. It defaults to (dashboard time range / max data points), or roughly one bin per pixel.

## v0.0.4

### Added

- Optional **Query timeout** datasource setting: The maximum duration in seconds for each HTTP request used during a query (the Foxglove API POST and the follow-up download). Leave unset or set to `0` for no client-side limit.

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
