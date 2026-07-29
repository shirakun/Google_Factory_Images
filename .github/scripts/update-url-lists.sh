#!/usr/bin/env bash
set -Eeuo pipefail

# Scrapes Google's Android developer pages and updates the committed URL lists.
# Requires no external secrets; the devsite_wall_acks cookie is a TOS acknowledgement
# marker, not an authentication credential.

readonly FACTORY_URL='https://developers.google.com/android/images'
readonly OTA_URL='https://developers.google.com/android/ota'
readonly DRIVERS_URL='https://developers.google.com/android/drivers'
readonly WATCH_FACTORY_URL='https://developers.google.com/android/images-watch'
readonly WATCH_OTA_URL='https://developers.google.com/android/ota-watch'

readonly FACTORY_RE='^https://dl\.google\.com/dl/android/aosp/([a-z0-9._]+)-([A-Za-z0-9._]+)-factory-([0-9a-f]{8})\.zip$'
readonly OTA_RE='^https://dl\.google\.com/dl/android/aosp/([a-z0-9._]+)-ota-([A-Za-z0-9._]+)-([0-9a-f]{8})\.zip$'
readonly DRIVERS_RE='^https://dl\.google\.com/dl/android/aosp/[a-z0-9_]+-[A-Za-z0-9._-]+-[0-9a-f]{8}\.tgz$'

readonly MIN_FACTORY=100
readonly MIN_OTA=100
readonly MIN_DRIVERS=50
readonly MIN_WATCH_FACTORY=140
readonly MIN_WATCH_OTA=140

TMPDIR=""

cleanup() {
  [[ -n "$TMPDIR" ]] && rm -rf "$TMPDIR"
}
trap cleanup EXIT

log()  { echo "[$(date +%H:%M:%S)] $*"; }
fatal() { echo "[$(date +%H:%M:%S)] FATAL: $*" >&2; exit 1; }

scrape() {
  local page_url="$1" extract_re="$2" output="$3" label="${4:-scrape}"
  local raw="$TMPDIR/raw_${label}.html"

  curl --fail --silent --show-error --location --compressed \
    --retry 5 --retry-all-errors --retry-delay 5 \
    --connect-timeout 20 --max-time 180 \
    --user-agent 'Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0' \
    --header 'x-devsite-partial-request: 1' \
    --cookie 'devsite_wall_acks=nexus-image-tos,nexus-ota-tos,watch-image-tos,watch-ota-tos' \
    "$page_url" > "$raw"

  local grep_rc=0
  grep -oE "$extract_re" "$raw" \
    | LC_ALL=C sort -u > "$output" \
    || grep_rc=$?

  if (( grep_rc > 1 )); then
    fatal "$label: grep extraction error (status $grep_rc)"
  fi
}

validate() {
  local output="$1" full_re="$2" min_count="$3" label="$4"

  local count
  count=$(wc -l < "$output")

  if (( count < min_count )); then
    fatal "$label: only $count URLs extracted (minimum $min_count required)"
  fi

  local invalid
  invalid=$(grep -cvE "$full_re" "$output" || true)
  if (( invalid > 0 )); then
    fatal "$label: $invalid lines failed regex validation"
  fi

  log "$label: $count URLs validated"
}

atomic_replace() {
  local src="$1" dst="$2"
  if diff -q "$src" "$dst" >/dev/null 2>&1; then
    log "$(basename "$dst"): unchanged, skipping"
  else
    cp -- "$src" "$dst"
    log "$(basename "$dst"): updated"
  fi
}

main() {
  TMPDIR=$(mktemp -d)

  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  cd "$repo_root"

  log "Scraping factory images..."
  scrape "$FACTORY_URL" 'https://dl\.google\.com/dl/android/aosp/[^"]+\.zip' "$TMPDIR/factory_phone.txt" "FactoryImages"
  validate "$TMPDIR/factory_phone.txt" "$FACTORY_RE" "$MIN_FACTORY" "FactoryImages"

  log "Scraping watch factory images..."
  scrape "$WATCH_FACTORY_URL" 'https://dl\.google\.com/dl/android/aosp/[^"]+\.zip' "$TMPDIR/factory_watch.txt" "WatchImages"
  validate "$TMPDIR/factory_watch.txt" "$FACTORY_RE" "$MIN_WATCH_FACTORY" "WatchImages"

  LC_ALL=C sort -u "$TMPDIR/factory_phone.txt" "$TMPDIR/factory_watch.txt" > "$TMPDIR/factory.txt"

  log "Scraping OTA images..."
  scrape "$OTA_URL" 'https://dl\.google\.com/dl/android/aosp/[^"]+\.zip' "$TMPDIR/ota_phone.txt" "FullOTAImages"
  validate "$TMPDIR/ota_phone.txt" "$OTA_RE" "$MIN_OTA" "FullOTAImages"

  log "Scraping watch OTA images..."
  scrape "$WATCH_OTA_URL" 'https://dl\.google\.com/dl/android/aosp/[^"]+\.zip' "$TMPDIR/ota_watch.txt" "WatchOTAImages"
  validate "$TMPDIR/ota_watch.txt" "$OTA_RE" "$MIN_WATCH_OTA" "WatchOTAImages"

  LC_ALL=C sort -u "$TMPDIR/ota_phone.txt" "$TMPDIR/ota_watch.txt" > "$TMPDIR/ota.txt"

  log "Scraping driver binaries..."
  scrape "$DRIVERS_URL" 'https://dl\.google\.com/dl/android/aosp/[^"]+\.tgz' "$TMPDIR/drivers.txt" "DriverBinaries"
  validate "$TMPDIR/drivers.txt" "$DRIVERS_RE" "$MIN_DRIVERS" "DriverBinaries"

  atomic_replace "$TMPDIR/factory.txt" "FactoryImages.txt"
  atomic_replace "$TMPDIR/ota.txt" "FullOTAImages.txt"
  atomic_replace "$TMPDIR/drivers.txt" "DriverBinaries.txt"

  log "Done"
}

main "$@"
