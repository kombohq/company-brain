#!/usr/bin/env bash
set -euo pipefail

# Set minimum release age globally across package managers to guard against
# supply chain attacks, also outside of this specific repo.

MIN_AGE_DAYS=5
MIN_AGE_MINUTES=$((MIN_AGE_DAYS * 24 * 60))
MIN_AGE_SECONDS=$((MIN_AGE_MINUTES * 60))

sedi() {
  if sed --version 2>/dev/null | grep -q 'GNU'; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Bun: `minimumReleaseAge` is in seconds
if command -v bun &> /dev/null; then
  bunfig="$HOME/.bunfig.toml"
  if [ -f "$bunfig" ] && grep -q '^minimumReleaseAge[[:space:]]*=' "$bunfig"; then
    sedi -e "s/^minimumReleaseAge[[:space:]]*=.*/minimumReleaseAge = $MIN_AGE_SECONDS/" "$bunfig"
  else
    if [ -f "$bunfig" ] && grep -q '^\[install\]' "$bunfig"; then
      sedi -e "/\[install\]/a\\
minimumReleaseAge = $MIN_AGE_SECONDS" "$bunfig"
    else
      printf '\n[install]\nminimumReleaseAge = %s\n' "$MIN_AGE_SECONDS" >> "$bunfig"
    fi
  fi
fi

# npm: `min-release-age` is in days
if command -v npm &> /dev/null; then
  npm config set min-release-age "$MIN_AGE_DAYS" --global 2>/dev/null
fi

# pnpm: `minimumReleaseAge` is in minutes
if command -v pnpm &> /dev/null; then
  pnpm config set minimumReleaseAge "$MIN_AGE_MINUTES" --global
fi

# Yarn Berry: `npmMinimalAgeGate` is in minutes
if command -v yarn &> /dev/null; then
  yarnrc="$HOME/.yarnrc.yml"
  if [ -f "$yarnrc" ] && grep -q '^npmMinimalAgeGate' "$yarnrc"; then
    sedi -e "s/^npmMinimalAgeGate.*/npmMinimalAgeGate: $MIN_AGE_MINUTES/" "$yarnrc"
  else
    printf '\nnpmMinimalAgeGate: %s\n' "$MIN_AGE_MINUTES" >> "$yarnrc"
  fi
fi

echo "✅ Set minimum release age to $MIN_AGE_DAYS days globally (for bun, npm, pnpm, and yarn)!"
