#!/usr/bin/env bash
set -Eeuo pipefail

# Extracts unique device names from added URLs in a git diff.
# Usage:
#   extract-changed-devices.sh <base_sha> <head_sha>   # incremental: only added lines
#   extract-changed-devices.sh --all                   # full scan: all URLs in both files
# Output: compact JSON array of sorted device names, e.g. ["raven","stallion"]

readonly FACTORY_RE='^https://dl\.google\.com/dl/android/aosp/([a-z0-9._]+)-([A-Za-z0-9._]+)-factory-([0-9a-f]{8})\.zip$'
readonly OTA_RE='^https://dl\.google\.com/dl/android/aosp/([a-z0-9._]+)-ota-([A-Za-z0-9._]+)-([0-9a-f]{8})\.zip$'

extract_devices() {
  local line device
  declare -A seen=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ $FACTORY_RE ]]; then
      device="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ $OTA_RE ]]; then
      device="${BASH_REMATCH[1]}"
    else
      continue
    fi
    seen["$device"]=1
  done

  if (( ${#seen[@]} == 0 )); then
    echo '[]'
    return
  fi

  printf '%s\n' "${!seen[@]}" | LC_ALL=C sort -u | jq -Rsc 'split("\n") | map(select(length > 0))'
}

main() {
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  cd "$repo_root"

  if [[ "${1:-}" == "--all" ]]; then
    # Full scan: read all URLs from both files
    extract_devices < <(cat -- FactoryImages.txt FullOTAImages.txt 2>/dev/null || true)
    return
  fi

  if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <base_sha> <head_sha>" >&2
    echo "       $0 --all" >&2
    exit 1
  fi

  local base="$1" head="$2"

  # Handle root commit or unavailable parent (diff against empty tree)
  local empty_tree
  empty_tree=$(git hash-object -t tree /dev/null)

  if [[ "$base" == "0000000000000000000000000000000000000000" ]] || \
     ! git rev-parse --verify --quiet "$base" >/dev/null 2>&1; then
    base="$empty_tree"
  fi

  # Extract only added lines (not deletions, not diff headers)
  extract_devices < <(
    git diff --no-ext-diff --no-color --unified=0 "$base" "$head" \
      -- FactoryImages.txt FullOTAImages.txt 2>/dev/null \
    | awk 'substr($0,1,1)=="+" && substr($0,1,3)!="+++" { print substr($0,2) }'
  )
}

main "$@"
