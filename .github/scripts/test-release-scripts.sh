#!/usr/bin/env bash
# Exercises the release tag and version-bump scripts without GitHub Actions.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
resolve="${root}/.github/scripts/resolve-release-tag.sh"
detect="${root}/.github/scripts/detect-version-bump.sh"
release_workflow="${root}/.github/workflows/release.yml"
bump_workflow="${root}/.github/workflows/release-on-version-bump.yml"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "${actual}" != "${expected}" ]; then
    fail "${label}: expected [${expected}] got [${actual}]"
  fi
  echo "ok ${label}"
}

output_value() {
  local file="$1"
  local key="$2"
  awk -F= -v k="${key}" '$1 == k { print substr($0, index($0, "=") + 1) }' "${file}"
}

bash -n "${resolve}"
bash -n "${detect}"
bash -n "$0"

run_resolve() {
  env \
    PLUGIN_VERSION="$1" \
    RELEASE_TAG="$2" \
    GITHUB_EVENT_NAME="$3" \
    GITHUB_REF_TYPE="$4" \
    GITHUB_REF_NAME="$5" \
    bash "${resolve}"
}

assert_eq "$(run_resolve 0.0.11 "" push tag v0.0.11)" "v0.0.11" "tag push uses the pushed tag"
assert_eq "$(run_resolve 0.0.11 "" workflow_dispatch branch main)" "v0.0.11" "manual run defaults to v<version>"
assert_eq "$(run_resolve 0.0.11 v9.9.9 workflow_dispatch branch main)" "v9.9.9" "manual run can override the tag"
assert_eq "$(run_resolve 0.0.11 v0.0.11 push branch main)" "v0.0.11" "version-bump call uses the passed tag"

set +e
mismatch=$(run_resolve 0.0.11 v0.0.12 push tag v0.0.12 2>&1)
mismatch_status=$?
set -e
[ "${mismatch_status}" -ne 0 ] || fail "mismatched tag push should fail"
printf '%s\n' "${mismatch}" | grep -q 'v0.0.11' || fail "mismatched tag push should name the expected tag"

set +e
caller_mismatch=$(run_resolve 0.0.11 v0.0.12 push branch main 2>&1)
caller_mismatch_status=$?
set -e
[ "${caller_mismatch_status}" -ne 0 ] || fail "mismatched version-bump tag should fail"
printf '%s\n' "${caller_mismatch}" | grep -q 'got v0.0.12' || fail "mismatched version-bump tag should report the provided tag"

tmp=$(mktemp -d)
trap 'rm -rf "${tmp}"' EXIT

init_repo() {
  local repo="$1"
  git init -b main "${repo}" >/dev/null
  git -C "${repo}" config user.email "release-test@example.com"
  git -C "${repo}" config user.name "Release Test"
  git -C "${repo}" config commit.gpgsign false
}

commit_version() {
  local repo="$1"
  local version="$2"
  local name="${3:-foxglove}"
  printf '{"name":"%s","version":"%s"}\n' "${name}" "${version}" >"${repo}/package.json"
  git -C "${repo}" add package.json
  git -C "${repo}" commit -m "version ${version}" >/dev/null
}

run_detect() {
  local repo="$1"
  local before="$2"
  local output="$3"
  shift 3
  (
    cd "${repo}"
    env BEFORE_SHA="${before}" GITHUB_OUTPUT="${output}" "$@" bash "${detect}"
  )
}

repo="${tmp}/repo"
init_repo "${repo}"
commit_version "${repo}" "0.0.9"
before=$(git -C "${repo}" rev-parse HEAD)
commit_version "${repo}" "0.0.10" "foxglove-renamed"
output="${tmp}/out-bump"
log=$(run_detect "${repo}" "${before}" "${output}" RELEASE_TAG_REMOTE="${repo}")
assert_eq "$(output_value "${output}" should_release)" "true" "higher version releases"
assert_eq "$(output_value "${output}" release_tag)" "v0.0.10" "tag is v plus the new version"
assert_eq "$(output_value "${output}" commit_sha)" "$(git -C "${repo}" rev-parse HEAD)" "release commit is HEAD"
printf '%s\n' "${log}" | grep -q '0.0.9 -> 0.0.10' || fail "bump log should describe the version change"

output="${tmp}/out-same"
parent=$(git -C "${repo}" rev-parse HEAD)
commit_version "${repo}" "0.0.10" "foxglove-deps-only"
log=$(run_detect "${repo}" "${parent}" "${output}" RELEASE_TAG_REMOTE="${repo}")
assert_eq "$(output_value "${output}" should_release)" "false" "unchanged version does not release"
printf '%s\n' "${log}" | grep -q 'Version unchanged' || fail "unchanged version should say so"

output="${tmp}/out-down"
parent=$(git -C "${repo}" rev-parse HEAD)
commit_version "${repo}" "0.0.9"
log=$(run_detect "${repo}" "${parent}" "${output}" RELEASE_TAG_REMOTE="${repo}")
assert_eq "$(output_value "${output}" should_release)" "false" "lower version does not release"
printf '%s\n' "${log}" | grep -q '::warning::' || fail "lower version should warn"

output="${tmp}/out-tag"
parent=$(git -C "${repo}" rev-parse HEAD)
commit_version "${repo}" "0.0.11"
git -C "${repo}" tag v0.0.11
log=$(run_detect "${repo}" "${parent}" "${output}" RELEASE_TAG_REMOTE="${repo}")
assert_eq "$(output_value "${output}" should_release)" "false" "existing tag does not release again"
printf '%s\n' "${log}" | grep -q 'already exists' || fail "existing tag should warn"

output="${tmp}/out-multi"
init_repo "${tmp}/multi"
commit_version "${tmp}/multi" "0.0.1"
first=$(git -C "${tmp}/multi" rev-parse HEAD)
commit_version "${tmp}/multi" "0.0.2"
commit_version "${tmp}/multi" "0.0.3"
log=$(run_detect "${tmp}/multi" "${first}" "${output}" RELEASE_TAG_REMOTE="${tmp}/multi")
assert_eq "$(output_value "${output}" should_release)" "true" "push of several commits uses the new tip"
assert_eq "$(output_value "${output}" release_tag)" "v0.0.3" "tag matches the tip version"

output="${tmp}/out-revert"
init_repo "${tmp}/revert"
commit_version "${tmp}/revert" "0.0.1"
first=$(git -C "${tmp}/revert" rev-parse HEAD)
commit_version "${tmp}/revert" "0.0.2"
commit_version "${tmp}/revert" "0.0.1"
log=$(run_detect "${tmp}/revert" "${first}" "${output}" RELEASE_TAG_REMOTE="${tmp}/revert")
assert_eq "$(output_value "${output}" should_release)" "false" "version returned to the previous value does not release"

output="${tmp}/out-padding"
init_repo "${tmp}/padding"
commit_version "${tmp}/padding" "0.0.10"
parent=$(git -C "${tmp}/padding" rev-parse HEAD)
commit_version "${tmp}/padding" "0.0.010"
log=$(run_detect "${tmp}/padding" "${parent}" "${output}" RELEASE_TAG_REMOTE="${tmp}/padding")
assert_eq "$(output_value "${output}" should_release)" "false" "leading zeros are not a version increase"
printf '%s\n' "${log}" | grep -q '::warning::' || fail "leading zeros should warn"

output="${tmp}/out-zero"
log=$(run_detect "${repo}" "0000000000000000000000000000000000000000" "${output}" RELEASE_TAG_REMOTE="${repo}")
assert_eq "$(output_value "${output}" should_release)" "false" "missing parent commit does not release"

printf '{"name":"foxglove","version":"v0.0.12"}\n' >"${repo}/package.json"
git -C "${repo}" add package.json
git -C "${repo}" commit -m "bad version" >/dev/null
parent=$(git -C "${repo}" rev-parse HEAD^)
set +e
bad_log=$(run_detect "${repo}" "${parent}" "${tmp}/out-bad" RELEASE_TAG_REMOTE="${repo}" 2>&1)
bad_status=$?
set -e
[ "${bad_status}" -ne 0 ] || fail "non semver version should fail"
printf '%s\n' "${bad_log}" | grep -q 'MAJOR.MINOR.PATCH' || fail "invalid version should explain the required form"

fake_bin="${tmp}/bin"
mkdir -p "${fake_bin}"
cat >"${fake_bin}/gh" <<'EOF'
#!/usr/bin/env bash
# Matches gh on a GitHub-hosted runner: GITHUB_ACTIONS is set, and gh refuses
# to run until GH_TOKEN is set. It does not read GITHUB_TOKEN.
if [ "${GITHUB_ACTIONS:-}" = "true" ] && [ -z "${GH_TOKEN:-}" ]; then
  echo "gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable" >&2
  exit 4
fi
case "${FAKE_GH_MODE}" in
  missing)
    echo "gh: Not Found (HTTP 404)" >&2
    exit 1
    ;;
  present)
    printf '%s\n' "refs/tags/v0.0.4"
    exit 0
    ;;
  error)
    echo "gh: Internal Server Error (HTTP 500)" >&2
    exit 1
    ;;
  *)
    echo "gh: unexpected mode" >&2
    exit 1
    ;;
esac
EOF
chmod +x "${fake_bin}/gh"

init_repo "${tmp}/api"
commit_version "${tmp}/api" "0.0.3"
parent=$(git -C "${tmp}/api" rev-parse HEAD)
commit_version "${tmp}/api" "0.0.4"
output="${tmp}/out-api-missing"
log=$(
  run_detect "${tmp}/api" "${parent}" "${output}" \
    PATH="${fake_bin}:${PATH}" \
    GITHUB_REPOSITORY="octo/repo" \
    FAKE_GH_MODE="missing"
)
assert_eq "$(output_value "${output}" should_release)" "true" "missing remote tag releases"
assert_eq "$(output_value "${output}" release_tag)" "v0.0.4" "api lookup uses the new version"

output="${tmp}/out-api-present"
log=$(
  run_detect "${tmp}/api" "${parent}" "${output}" \
    PATH="${fake_bin}:${PATH}" \
    GITHUB_REPOSITORY="octo/repo" \
    FAKE_GH_MODE="present"
)
assert_eq "$(output_value "${output}" should_release)" "false" "remote tag skips release"

set +e
api_error=$(
  run_detect "${tmp}/api" "${parent}" "${tmp}/out-api-error" \
    PATH="${fake_bin}:${PATH}" \
    GITHUB_REPOSITORY="octo/repo" \
    FAKE_GH_MODE="error" 2>&1
)
api_error_status=$?
set -e
[ "${api_error_status}" -ne 0 ] || fail "tag lookup failure should fail the script"
printf '%s\n' "${api_error}" | grep -q 'Could not check tag' || fail "tag lookup failure should include the API error"

grep -Fq 'GH_TOKEN: ${{ github.token }}' "${bump_workflow}" || fail "detect step must set GH_TOKEN"
grep -Fq 'resolve-release-tag.sh?ref=${GITHUB_SHA}' "${release_workflow}" || fail "release must load the tag script from the workflow revision"
grep -Fq 'GH_TOKEN: ${{ github.token }}' "${release_workflow}" || fail "release tag lookup must set GH_TOKEN"

# The detect step's environment, plus the variables Actions sets itself.
# GH_TOKEN is included only when the workflow sets it, so removing that line fails CI.
workflow_detect_env=(
  PATH="${fake_bin}:${PATH}"
  GITHUB_REPOSITORY="octo/repo"
  GITHUB_ACTIONS="true"
  FAKE_GH_MODE="missing"
)
if grep -Fq 'GH_TOKEN: ${{ github.token }}' "${bump_workflow}"; then
  workflow_detect_env+=(GH_TOKEN="workflow-token")
fi
output="${tmp}/out-workflow-env"
log=$(run_detect "${tmp}/api" "${parent}" "${output}" "${workflow_detect_env[@]}")
assert_eq "$(output_value "${output}" should_release)" "true" "detect step environment can see an existing-tag miss"
printf '%s\n' "${log}" >/dev/null

set +e
no_token=$(
  run_detect "${tmp}/api" "${parent}" "${tmp}/out-no-token" \
    PATH="${fake_bin}:${PATH}" \
    GITHUB_REPOSITORY="octo/repo" \
    GITHUB_ACTIONS="true" \
    FAKE_GH_MODE="missing" 2>&1
)
no_token_status=$?
set -e
[ "${no_token_status}" -ne 0 ] || fail "Actions without GH_TOKEN should fail the tag lookup"
printf '%s\n' "${no_token}" | grep -q 'GH_TOKEN' || fail "missing GH_TOKEN should surface the gh error"

grep -q 'workflow_call:' "${release_workflow}" || fail "release workflow should be callable"
grep -q 'make_latest: "true"' "${release_workflow}" || fail "release should be marked latest"
grep -q 'draft: false' "${release_workflow}" || fail "release should be published"
if grep -q 'draft: true' "${release_workflow}"; then
  fail "release should not stay a draft"
fi
grep -q 'resolve-release-tag.sh' "${release_workflow}" || fail "release workflow should resolve the tag in one place"
grep -q 'uses: \./\.github/workflows/release\.yml' "${bump_workflow}" || fail "version bump workflow should call the release workflow"
grep -q 'secrets: inherit' "${bump_workflow}" || fail "version bump workflow should pass secrets"
grep -q "branches:" "${bump_workflow}" || fail "version bump workflow should declare a branch filter"
grep -q -- '- main' "${bump_workflow}" || fail "version bump workflow should run on main"

echo "all release script checks passed"
