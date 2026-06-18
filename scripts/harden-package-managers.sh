#!/usr/bin/env bash
set -euo pipefail

# Set a minimum release age globally across package managers to guard against
# supply chain attacks, beyond just this repo. Run once per machine.

MIN_AGE_DAYS=5
MIN_AGE_MINUTES=$((MIN_AGE_DAYS * 24 * 60))
MIN_AGE_SECONDS=$((MIN_AGE_MINUTES * 60))

# Track which managers were actually configured so the summary is accurate.
configured=()

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
  elif [ -f "$bunfig" ] && grep -q '^\[install\]' "$bunfig"; then
    sedi -e "/\[install\]/a\\
minimumReleaseAge = $MIN_AGE_SECONDS" "$bunfig"
  else
    printf '\n[install]\nminimumReleaseAge = %s\n' "$MIN_AGE_SECONDS" >> "$bunfig"
  fi
  configured+=("bun")
fi

# npm: `min-release-age` is in days
if command -v npm &> /dev/null; then
  if npm config set min-release-age "$MIN_AGE_DAYS" --global 2>/dev/null; then
    configured+=("npm")
  else
    echo "⚠️  Skipped npm (could not set min-release-age)"
  fi
fi

# pnpm: `minimumReleaseAge` is in minutes
if command -v pnpm &> /dev/null; then
  if pnpm config set minimumReleaseAge "$MIN_AGE_MINUTES" --global 2>/dev/null; then
    configured+=("pnpm")
  else
    echo "⚠️  Skipped pnpm (could not set minimumReleaseAge)"
  fi
fi

# Yarn Berry (2+): `npmMinimalAgeGate` is in minutes. Yarn Classic (1.x) has no
# equivalent and ignores ~/.yarnrc.yml, so skip it rather than claim it's hardened.
if command -v yarn &> /dev/null; then
  yarn_major="$(yarn --version 2>/dev/null | cut -d. -f1)"
  if [[ "$yarn_major" =~ ^[0-9]+$ ]] && [ "$yarn_major" -ge 2 ]; then
    yarnrc="$HOME/.yarnrc.yml"
    if [ -f "$yarnrc" ] && grep -q '^npmMinimalAgeGate' "$yarnrc"; then
      sedi -e "s/^npmMinimalAgeGate.*/npmMinimalAgeGate: $MIN_AGE_MINUTES/" "$yarnrc"
    else
      printf '\nnpmMinimalAgeGate: %s\n' "$MIN_AGE_MINUTES" >> "$yarnrc"
    fi
    configured+=("yarn")
  else
    echo "⚠️  Skipped Yarn Classic (no release-age gate; upgrade to Yarn Berry)"
  fi
fi

if [ ${#configured[@]} -eq 0 ]; then
  echo "No supported package managers found (bun, npm, pnpm, Yarn Berry)."
else
  echo "✅ Set minimum release age to $MIN_AGE_DAYS days globally for: ${configured[*]}"
fi
