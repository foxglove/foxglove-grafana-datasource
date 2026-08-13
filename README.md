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


You can then query Foxglove using comma-separated lists of device names and [FoxQL](https://docs.foxglove.dev/docs/visualization/foxql) expressions.

## Using GitHub Actions release workflow

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) when you push a `v*` tag (or run the workflow manually). The workflow packages the plugin, **signs it for public distribution**, and creates a draft GitHub release with the zip and sha1 artifacts.

Signing uses the Grafana access policy token stored as the repository secret `GRAFANA_ACCESS_POLICY_TOKEN`. Generate a token with `plugins:write` scope from the Grafana Cloud account that owns the plugin, then add it under **Settings → Secrets and variables → Actions**. See [Sign a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin#generate-an-access-policy-token).

The release job fails if that secret is missing or if signing does not produce a `MANIFEST.txt`. After publishing the draft release, use the zip and sha1 URLs for Grafana plugin catalog submission.
