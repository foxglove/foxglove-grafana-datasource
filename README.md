# Foxglove Data Source

This repo contains a plugin for connecting Grafana to a Foxglove primary site.

Use of this plugin requires an [Enterprise](https://foxglove.dev/pricing) Foxglove plan with the Grafana integration enabled for your organization. To get started, [contact us](https://foxglove.dev/contact?reason=sales). Grafana **11.5.0** or later is required.

The Grafana.com plugin listing is published from [`src/README.md`](src/README.md). Full product documentation lives at [docs.foxglove.dev/docs/grafana](https://docs.foxglove.dev/docs/grafana).

## Usage

To use this plugin, you need a Foxglove API key.

Navigate to https://app.foxglove.dev/~/settings/apikeys and create an API key with these capabilities:

- `data.search`
- `devices.list`

If the "search" capability group doesn't appear when creating a key, the Grafana integration isn't enabled for your organization yet.

Then, once the plugin is installed, configure the data source with:

| Name | Required | Value |
| ---- | -------- | ----- |
| API Base URL | No | Defaults to `https://api.foxglove.dev`. Most users should not change this field. |
| API Key | Yes | Your API key |
| Project ID | Yes | The `proj_` ID from https://app.foxglove.dev/~/settings/projects |
| Site ID | Yes | The `site_` ID of your Primary Site from https://app.foxglove.dev/~/settings/sites |
| Query Timeout (seconds) | No | Per-request limit for each query. Leave empty or set to `0` to use Grafana's HTTP client timeout |

You can then query Foxglove using [FoxQL](https://docs.foxglove.dev/docs/visualization/foxql) expressions. The query editor supports grouping, aggregation, and filtering. See [Building queries](https://docs.foxglove.dev/docs/grafana/queries).

## Using GitHub Actions release workflow

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml) when you push a `v*` tag (or run the workflow manually). The workflow packages the plugin, **signs it for public distribution**, and creates a draft GitHub release with the zip and sha1 artifacts.

Signing uses the Grafana access policy token stored as the repository secret `GRAFANA_ACCESS_POLICY_TOKEN`. Generate a token with `plugins:write` scope from the Grafana Cloud account that owns the plugin, then add it under **Settings → Secrets and variables → Actions**. See [Sign a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin#generate-an-access-policy-token).

The release job fails if that secret is missing or if signing does not produce a `MANIFEST.txt`. After publishing the draft release, use the zip and sha1 URLs for Grafana plugin catalog submission.
