#!/usr/bin/env bash
set -euo pipefail

version=24.15.0
release="node-v${version}-linux-x64"
checksum=472655581fb851559730c48763e0c9d3bc25975c59d518003fc0849d3e4ba0f6
install_dir="${RUNNER_TOOL_CACHE}/node/${version}/x64"
if [[ ! -x "$install_dir/bin/node" ]]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  archive="$temp_dir/$release.tar.xz"
  curl --fail --silent --show-error --retry 3 --output "$archive" "https://nodejs.org/dist/v${version}/$release.tar.xz"
  printf '%s  %s
' "$checksum" "$archive" | sha256sum --check --status
  install_dir="$RUNNER_TEMP/$release"
  mkdir -p "$install_dir"
  tar -xJf "$archive" -C "$install_dir" --strip-components=1
fi
printf '%s
' "$install_dir/bin" >> "$GITHUB_PATH"
"$install_dir/bin/node" --version
