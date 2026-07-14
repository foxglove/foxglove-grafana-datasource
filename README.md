# Foxglove Data Source

This repo contains a plugin for connecting Grafana to a Foxglove primary site.

Use of this plugin requires an [Enterprise](https://foxglove.dev/pricing) Foxglove plan. To get started, [contact us](https://foxglove.dev/contact?reason=sales).

## Usage

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

| Name | Value | 
| ---- | ----- |
| API Base URL | https://api.foxglove.dev |
| Project ID | Your project ID. Find your project ID at https://app.foxglove.dev/~/settings/projects |
| Site ID | Your site ID. Find your site ID at https://app.foxglove.dev/~/settings/sites |
| API Key	| (your API key) |


You can then query Foxglove using comma-separated lists of device names and message path values.
