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

Releases are published by [`.github/workflows/release.yml`](.github/workflows/release.yml).

A push to `main` that increases the `version` in `package.json` (for example `0.0.10` to `0.0.11`) publishes a release. [`.github/workflows/release-on-version-bump.yml`](.github/workflows/release-on-version-bump.yml) compares that field with the previous commit on `main`. Other `package.json` edits, such as dependency bumps, do not publish a release. The version must be `MAJOR.MINOR.PATCH` and greater than the previous version. The workflow builds and signs the plugin, creates tag `v<version>` on that commit, and marks the GitHub release as latest. The tag is created only after the signed build succeeds. If `v<version>` already exists, that push does not publish another release.

Pushing a `v*` tag, or running the Release workflow manually, still builds and publishes. On those runs the tag must be `v` plus the `package.json` version, unless the manual run sets a different tag.

Signing uses the Grafana access policy token stored as the repository secret `GRAFANA_ACCESS_POLICY_TOKEN`. Generate a token with `plugins:write` scope from the Grafana Cloud account that owns the plugin, then add it under **Settings → Secrets and variables → Actions**. See [Sign a plugin](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin#generate-an-access-policy-token).

The release job fails if that secret is missing or if signing does not produce a `MANIFEST.txt`. Use the zip and sha1 URLs from the GitHub release for Grafana plugin catalog submission. If publishing fails after the tag already exists, re-run the Release workflow manually for that commit.

GitHub runs one release at a time and keeps at most one more waiting. A newer waiting release replaces an older waiting one. If a release run is cancelled, re-run it, or run the Release workflow manually for that commit. The manual `commit_sha` input builds that commit and still loads the release scripts from the workflow revision.
