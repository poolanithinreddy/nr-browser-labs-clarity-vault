#!/usr/bin/env bash
# Creates a distributable zip of the extension.
# Usage:
#   bash scripts/package.sh           # chrome (default)
#   bash scripts/package.sh firefox   # firefox
set -euo pipefail

TARGET="${1:-chrome}"
VERSION=$(node -e "import('./manifest.json', {assert:{type:'json'}}).then(m=>console.log(m.default.version))" 2>/dev/null \
  || python3 -c "import json,sys; print(json.load(open('manifest.json'))['version'])" 2>/dev/null \
  || grep '"version"' manifest.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')

OUTDIR="dist"
OUTFILE="${OUTDIR}/clarity-vault-${VERSION}-${TARGET}.zip"

mkdir -p "$OUTDIR"

# Remove existing package
rm -f "$OUTFILE"

zip -r "$OUTFILE" \
  manifest.json \
  LICENSE \
  README.md \
  background/ \
  content/ \
  popup/ \
  options/ \
  common/ \
  models/ \
  assets/ \
  -x "**/.DS_Store" \
  -x "**/Thumbs.db" \
  -x "**/*.log" \
  -x "**/node_modules/*"

echo ""
echo "✓ Package ready: ${OUTFILE}"
echo "  Size: $(du -sh "$OUTFILE" | cut -f1)"
echo ""
if [ "$TARGET" = "chrome" ]; then
  echo "  Next: upload to https://chrome.google.com/webstore/devconsole"
else
  echo "  Next: upload to https://addons.mozilla.org/developers/"
fi
