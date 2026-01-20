# Plan

### Scope

The scope of this change is to update the configuration front-end for this plugin and
corresponding server-side configuration to allow queries with the following model:

- A set of [message path strings](https://docs.foxglove.dev/docs/visualization/message-path-syntax) indicating
which topics and fields to read from.
- An optional set of device names, where those device names are used to filter down recordings to read from.
- An optional set of metadata key / value pairs, used to filter recordings to read from.

In the backend, this involves updating the `queryModel`. In the frontend, this involves updating the QueryConfig
to allow the user to fill in these fields.

### Implementation plan
1. Backend query model and payload
   - Update `pkg/plugin/datasource.go` `queryModel` to:
     - `MessagePath string \`json:"messagePath"\`` (required)
     - `DeviceNames []string \`json:"deviceNames"\` (optional)`
     - `Metadata map[string]string \`json:"metadata"\` (optional)`
     - Keep `Start`/`End` as RFC3339 strings.
   - In `query()`, validate that `messagePath` is a non-empty string; `deviceNames` and `metadata` remain optional.
   - In `fetchFoxgloveStream()`, build POST body with `messagePaths` (array with a single entry), `deviceNames`, `metadata`, `start`, `end`. Preserve backward-compat by mapping existing fields:
     - If legacy `topics` provided, convert to the first message path (best-effort).
     - If legacy `deviceName` provided, append to `deviceNames`.
   - Keep `getAPIBaseURL()` and API key handling unchanged. Adjust response conversion only if the new API response shape requires it.

2. Frontend query shape and templating
   - Update `src/types.ts` `MyQuery`:
     - Add `messagePath?: string` (required), `deviceNames?: string[]`, `metadata?: Record<string, string>`.
     - Deprecate `topics` and `deviceName` (retain for migration).
     - Update `DEFAULT_QUERY` to initialize `messagePath` as empty string.
   - Update `src/datasource.ts`:
     - `applyTemplateVariables()` templates `messagePath`, `deviceNames`, and each metadata value.
     - `filterQuery()` should allow execution only when `messagePath` is a non-empty string.

3. Query editor UI
   - Update fields in `src/components/QueryEditor.tsx`:
     - Message Path: a single `Input` (required); store as `messagePath: string`.
     - Device Names (optional): multi-value editor; store as `deviceNames: string[]`.
     - Metadata filters (optional): repeater with `key` and `value` inputs; store as `metadata: Record<string,string>`.
   - One-time migration not needed.

4. Config editor and settings
   - No changes required to `src/components/ConfigEditor.tsx` or `pkg/models/settings.go`; base URL and API key remain the same.

5. Tests and docs
   - Update Playwright tests in `tests/` to cover entering a single message path, device names, and metadata pairs.
   - Update README to document the new query fields and deprecations.

### Notes on Query Editor UI controls
- Multi-input support
  - Grafana UI supports true multi-value inputs; comma-separated text was only a simple interim UX.
  - Options for `messagePaths` and `deviceNames`:
    - Prefer a multi-value control (e.g. a tags-style input or `MultiSelect` configured for free-text/creatable values).
    - Alternatively, render a small repeater (list of `Input`s) with add/remove actions.
  - Option for `metadata`:
    - Use a repeater of key/value rows (two `Input`s per row) with add/remove.
- Why not comma-separated?
  - Harder to validate and error-highlight each entry; poor ergonomics for editing/removing single items.
  - Message path syntax can contain characters that make CSV parsing brittle.
- Recommended direction
  - Use a tags-style multi-input for `messagePaths` and `deviceNames` to allow free-form entries and easy deletion.
  - Use a key/value repeater for `metadata` with inline validation per row.
  - Keep Start/End time pickers as-is.

### Time range behavior (panel vs per-query overrides)
- Grafana passes a panel time range to every query; that should be the canonical time window.
- Decision: remove per-query overrides (`start`/`end`) from the query model and UI.
  - Backend: always use the panel time range (`req.Queries[i].TimeRange`) when building the API request.
  - Frontend: remove Start/End pickers from the Query Editor.
