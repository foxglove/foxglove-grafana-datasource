# Changelog

## v0.0.1

Initial release.

To use this plugin, you need a Foxglove API key.

Log into https://app.foxglove.dev, navigate to Settings > API keys, and create an API key with
at least these capabilities:

- recordings.list
- data.stream
- devices.list
- events.list
- properties.list
- projects.list
- sites.list

Then, once the plugin is installed, configure the data source with

API Base URL: https://api.foxglove.dev
API Key: (your API key)

You can then query Foxglove using comma-separated lists of device names and [message path](https://docs.foxglove.dev/docs/visualization/message-path-syntax) values.

### Limitations

- Grouping, aggregation and filtering are not supported for this release.
- Currently only numeric values from your data are supported.
