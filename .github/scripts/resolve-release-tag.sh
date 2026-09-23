#!/usr/bin/env bash
# Print the git tag for this release run.
#
# Tag pushes use the pushed tag. Manual runs can override it. A reusable-workflow
# call from a branch push passes the tag explicitly: inside the called workflow the
# github context is the caller's, so GITHUB_REF_NAME is the branch name (main), not
# the tag we are about to create.
set -euo pipefail

if [ -z "${PLUGIN_VERSION:-}" ]; then
  echo "::error::PLUGIN_VERSION is required." >&2
  exit 1
fi

expected_tag="v${PLUGIN_VERSION}"
release_tag_input="${RELEASE_TAG:-}"
event_name="${GITHUB_EVENT_NAME:-}"
ref_type="${GITHUB_REF_TYPE:-}"
ref_name="${GITHUB_REF_NAME:-}"

if [ -n "${release_tag_input}" ]; then
  release_tag="${release_tag_input}"
elif [ "${ref_type}" = "tag" ]; then
  release_tag="${ref_name}"
else
  release_tag="${expected_tag}"
fi

# Manual dispatch may name the tag something other than v<plugin version>.
if [ "${release_tag}" != "${expected_tag}" ] && [ "${event_name}" != "workflow_dispatch" ]; then
  echo "::error::Plugin version does not match tag name. The tag should be ${expected_tag} (got ${release_tag})." >&2
  exit 1
fi

printf '%s\n' "${release_tag}"
