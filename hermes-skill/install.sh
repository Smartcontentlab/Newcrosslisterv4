#!/usr/bin/env bash
# Sets up the CrossLinkOS lister skill for Hermes on Ubuntu.
# Run from anywhere:  bash ~/crosslinkos/hermes-skill/install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
skill_src="$here/crosslinkos-lister"
skill_dst="$HOME/.hermes/skills/business/crosslinkos-lister"

echo "1/4  Installing photo tools (asks for your password)…"
# If Ubuntu is installing updates in the background, wait for it (up to 10 minutes) instead of failing.
if python3 -c "import PIL" 2>/dev/null && command -v heif-convert >/dev/null; then
  echo "     Already installed."
else
  echo "     (If Ubuntu is busy installing updates, this waits for it to finish.)"
  sudo apt-get -o DPkg::Lock::Timeout=600 update -qq
  sudo apt-get -o DPkg::Lock::Timeout=600 install -y -qq python3-pil libheif-examples >/dev/null
fi

echo "2/4  Linking the skill into Hermes…"
mkdir -p "$(dirname "$skill_dst")"
ln -sfn "$skill_src" "$skill_dst"
chmod +x "$skill_src/scripts/crosslinkos.py"

echo "3/4  Creating ~/Listings (one folder per item goes here)…"
mkdir -p "$HOME/Listings"

echo "4/4  Saving your CrossLinkOS access key…"
mkdir -p "$HOME/.config/crosslinkos"
env_file="$HOME/.config/crosslinkos/env"
if [ -f "$env_file" ] && grep -q '^CROSSLINKOS_KEY=clos_' "$env_file"; then
  echo "     A key is already saved. Delete $env_file to change it."
else
  read -r -s -p "     Paste the key from CrossLinkOS Settings > Access keys, then press Enter: " key; echo
  case "$key" in clos_*) ;; *) echo "     That does not look like a CrossLinkOS key (it starts with clos_)."; exit 1;; esac
  printf 'CROSSLINKOS_KEY=%s\nLISTINGS_DIR=%s\n' "$key" "$HOME/Listings" > "$env_file"
  chmod 600 "$env_file"
fi

echo
echo "Checking the connection…"
if python3 "$skill_src/scripts/crosslinkos.py" review --status ready >/dev/null; then
  echo "✅ Connected to CrossLinkOS. In Hermes, type /reload-skills, then: check my Listings folder"
else
  echo "❌ Could not connect. The message above says why."
fi
