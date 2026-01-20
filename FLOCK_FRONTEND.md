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
     - `MessagePaths []string \`json:"messagePaths"\``
     - `DeviceNames []string \`json:"deviceNames"\` (optional)`
     - `Metadata map[string]string \`json:"metadata"\` (optional)`
     - Keep `Start`/`End` as RFC3339 strings.
   - In `query()`, validate that `messagePaths` is non-empty; `deviceNames` and `metadata` remain optional.
   - In `fetchFoxgloveStream()`, build POST body with `messagePaths`, `deviceNames`, `metadata`, `start`, `end`. Preserve backward-compat by mapping existing fields:
     - If legacy `topics` provided, convert to message paths (e.g., `/{topic}`) best-effort.
     - If legacy `deviceName` provided, append to `deviceNames`.
   - Keep `getAPIBaseURL()` and API key handling unchanged. Adjust response conversion only if the new API response shape requires it.

2. Frontend query shape and templating
   - Update `src/types.ts` `MyQuery`:
     - Add `messagePaths?: string[]`, `deviceNames?: string[]`, `metadata?: Record<string, string>`.
     - Keep `start?`/`end?`. Deprecate `topics` and `deviceName` (retain for migration).
     - Update `DEFAULT_QUERY` to initialize with empty arrays/objects.
   - Update `src/datasource.ts`:
     - `applyTemplateVariables()` should template each string in `messagePaths`/`deviceNames` and each metadata value.
     - `filterQuery()` should allow execution only when `messagePaths` has at least one entry (no longer require `deviceName`).

3. Query editor UI
   - Replace fields in `src/components/QueryEditor.tsx`:
     - Message Paths: add a multi-value editor (tags or repeater of `Input`) supporting add/remove; store as `messagePaths: string[]`. Required; show validation when empty.
     - Device Names (optional): multi-value editor; store as `deviceNames: string[]`.
     - Metadata filters (optional): repeater with `key` and `value` inputs; store as `metadata: Record<string,string>`.
     - Keep Start/End `DateTimePicker` behavior.
   - Provide a small one-time migration in component state:
     - If `topics` is set and `messagePaths` empty, split CSV and map to simple message paths.
     - If `deviceName` is set and `deviceNames` empty, seed `deviceNames` with it.

4. Config editor and settings
   - No changes required to `src/components/ConfigEditor.tsx` or `pkg/models/settings.go`; base URL and API key remain the same.

5. Tests and docs
   - Update Playwright tests in `tests/` to cover adding message paths, device names, and metadata pairs.
   - Update README to document the new query fields and deprecations.
