#!/usr/bin/env bash
# Decide whether a push to main should publish a release.
#
# Writes should_release, release_tag, and commit_sha to GITHUB_OUTPUT.
# Releases only when package.json "version" is a higher MAJOR.MINOR.PATCH than the
# previous commit and the tag v<version> does not already exist.
set -euo pipefail

if [ -z "${GITHUB_OUTPUT:-}" ]; then
  echo "::error::GITHUB_OUTPUT is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "::error::node is required to read package.json." >&2
  exit 1
fi

write_output() {
  local should_release="$1"
  local release_tag="$2"
  local commit_sha="$3"
  {
    printf 'should_release=%s\n' "${should_release}"
    printf 'release_tag=%s\n' "${release_tag}"
    printf 'commit_sha=%s\n' "${commit_sha}"
  } >>"${GITHUB_OUTPUT}"
}

read_version() {
  node -e '
    let source = "";
    process.stdin.on("data", (chunk) => {
      source += chunk;
    });
    process.stdin.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(source);
      } catch (err) {
        console.error("::error::package.json is not valid JSON.");
        process.exit(2);
      }
      if (typeof parsed.version !== "string") {
        console.error("::error::package.json version must be a string.");
        process.exit(2);
      }
      process.stdout.write(parsed.version);
    });
  '
}

# Exit 0 when new > old, 10 when new < old, 11 when numerically equal, 2 when not MAJOR.MINOR.PATCH.
compare_versions() {
  node -e '
    const oldVersion = process.argv[1];
    const newVersion = process.argv[2];
    const semver = /^\d+\.\d+\.\d+$/;
    function fail(message) {
      console.error(`::error::${message}`);
      process.exit(2);
    }
    if (!semver.test(newVersion)) {
      fail(`package.json version "${newVersion}" must be MAJOR.MINOR.PATCH.`);
    }
    if (!semver.test(oldVersion)) {
      fail(`Previous package.json version "${oldVersion}" must be MAJOR.MINOR.PATCH.`);
    }
    const oldParts = oldVersion.split(".").map(Number);
    const newParts = newVersion.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (newParts[i] > oldParts[i]) process.exit(0);
      if (newParts[i] < oldParts[i]) process.exit(10);
    }
    process.exit(11);
  ' "$1" "$2"
}

# Return 0 when the tag ref exists, 1 when it does not, 2 when the lookup failed.
tag_exists() {
  local tag="$1"
  if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "::error::Refusing to look up unexpected tag name: ${tag}" >&2
    return 2
  fi

  if [ -n "${RELEASE_TAG_REMOTE:-}" ]; then
    local matches
    if ! matches=$(git ls-remote --tags "${RELEASE_TAG_REMOTE}" "refs/tags/${tag}"); then
      echo "::error::Could not list tags on ${RELEASE_TAG_REMOTE}." >&2
      return 2
    fi
    if [ -n "${matches}" ]; then
      return 0
    fi
    return 1
  fi

  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    echo "::error::GITHUB_REPOSITORY is not set; cannot check for existing tags." >&2
    return 2
  fi
  if ! command -v gh >/dev/null 2>&1; then
    echo "::error::gh is required to check for existing tags." >&2
    return 2
  fi

  local err_file status=0
  err_file=$(mktemp)
  gh api "repos/${GITHUB_REPOSITORY}/git/ref/tags/${tag}" --jq .ref >/dev/null 2>"${err_file}" || status=$?
  if [ "${status}" -eq 0 ]; then
    rm -f "${err_file}"
    return 0
  fi
  if grep -q '404' "${err_file}"; then
    rm -f "${err_file}"
    return 1
  fi
  echo "::error::Could not check tag ${tag}: $(cat "${err_file}")" >&2
  rm -f "${err_file}"
  return 2
}

commit_sha=$(git rev-parse HEAD)
before="${BEFORE_SHA:-}"

if [[ "${before}" =~ ^0+$ ]]; then
  echo "No previous commit on this branch; skipping release."
  write_output false "" "${commit_sha}"
  exit 0
fi

if [[ ! "${before}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "::error::Expected github.event.before to be a full commit SHA (got ${before})." >&2
  exit 1
fi

if ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
  echo "Previous commit ${before} is not in the checkout; fetching it."
  if ! git fetch --depth=1 origin "${before}"; then
    echo "::error::Could not fetch previous commit ${before} to compare package.json versions." >&2
    exit 1
  fi
fi

if ! old_version=$(git show "${before}:package.json" | read_version); then
  echo "::error::Could not read package.json version at ${before}." >&2
  exit 1
fi
if ! new_version=$(read_version <package.json); then
  echo "::error::Could not read package.json version at ${commit_sha}." >&2
  exit 1
fi

echo "Previous version: ${old_version}"
echo "Current version: ${new_version}"

if [ "${old_version}" = "${new_version}" ]; then
  echo "Version unchanged (${new_version}); skipping release."
  write_output false "" "${commit_sha}"
  exit 0
fi

compare_status=0
compare_versions "${old_version}" "${new_version}" || compare_status=$?
if [ "${compare_status}" -eq 10 ] || [ "${compare_status}" -eq 11 ]; then
  echo "::warning::Version moved from ${old_version} to ${new_version}, which is not an increase. Skipping automatic release."
  write_output false "" "${commit_sha}"
  exit 0
fi
if [ "${compare_status}" -ne 0 ]; then
  exit 1
fi

tag="v${new_version}"
exists_status=0
tag_exists "${tag}" || exists_status=$?
if [ "${exists_status}" -eq 0 ]; then
  echo "::warning::Tag ${tag} already exists. Skipping automatic release."
  write_output false "" "${commit_sha}"
  exit 0
fi
if [ "${exists_status}" -ne 1 ]; then
  exit 1
fi

echo "Version bump ${old_version} -> ${new_version}; will release ${tag}."
write_output true "${tag}" "${commit_sha}"
