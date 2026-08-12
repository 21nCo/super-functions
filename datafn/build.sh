#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building @superfunctions/db..."
npm run build --prefix "$ROOT_DIR/packages/db"
echo "----------------------------------------"

echo "Building @superfunctions/http..."
npm run build --prefix "$ROOT_DIR/packages/http"
echo "----------------------------------------"

packages=("core" "client" "svelte" "server" "cli")

for pkg in "${packages[@]}"; do
  echo "Building $pkg..."
  npm run build --prefix "$SCRIPT_DIR/$pkg"
  echo "----------------------------------------"
done

echo "All packages built successfully."
