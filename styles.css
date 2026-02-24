#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# GastroChef — NUCLEAR ZIP BUILDER
# - Runs a clean install
# - Typecheck + Build
# - Produces a deployable ZIP artifact
# =========================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Node version"
node -v || true
echo "==> NPM version"
npm -v || true

echo "==> Clean install"
rm -rf node_modules
npm ci

echo "==> Lint (if configured)"
npm run lint --if-present

echo "==> Typecheck (if configured)"
npm run typecheck --if-present

echo "==> Build"
npm run build

echo "==> Create ZIP (source + config, excluding node_modules, .git, caches)"
OUT_DIR="$ROOT_DIR/__dist"
mkdir -p "$OUT_DIR"

ZIP_NAME="gastrochef_NUCLEAR_FINAL_$(date +%Y%m%d_%H%M%S).zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

# Use zip if available; otherwise fall back to python zip
if command -v zip >/dev/null 2>&1; then
  (cd "$ROOT_DIR" && \
    zip -r "$ZIP_PATH" . \
      -x "node_modules/*" ".git/*" ".vercel/*" "__dist/*" "dist/*" "build/*" \
         ".DS_Store" "npm-debug.log" "yarn.lock" "pnpm-lock.yaml" \
         "*.zip")
else
  python - <<'PY'
import os, zipfile, time
from pathlib import Path

root = Path(".").resolve()
out_dir = root/"__dist"
out_dir.mkdir(exist_ok=True)
zip_name = f"gastrochef_NUCLEAR_FINAL_{time.strftime('%Y%m%d_%H%M%S')}.zip"
zip_path = out_dir/zip_name

exclude_prefixes = {
  str(root/"node_modules"),
  str(root/".git"),
  str(root/".vercel"),
  str(root/"__dist"),
  str(root/"dist"),
  str(root/"build"),
}

def excluded(p: Path) -> bool:
  sp = str(p)
  for ex in exclude_prefixes:
    if sp.startswith(ex):
      return True
  if p.name.endswith(".zip"):
    return True
  if p.name in {".DS_Store", "npm-debug.log"}:
    return True
  return False

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
  for path in root.rglob("*"):
    if path.is_dir():
      continue
    if excluded(path):
      continue
    z.write(path, path.relative_to(root))

print(zip_path)
PY
fi

echo "==> DONE: $ZIP_PATH"
echo "Upload this ZIP to GitHub (replace repo) or keep as release artifact."
