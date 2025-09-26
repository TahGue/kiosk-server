#!/usr/bin/env bash
set -euo pipefail

# Simple APT repo builder to serve .deb files from kiosk-server/public/repo
# Usage:
# 1) Place .deb files for firefox, midori, curl, drivers, etc. into an input folder.
# 2) Run: scripts/prepare-offline-repo.sh /path/to/debs
# 3) Start the kiosk-server (npm start). Clients can use: http://<server-ip>:4000/repo

INPUT_DIR=${1:-}
if [[ -z "$INPUT_DIR" || ! -d "$INPUT_DIR" ]]; then
  echo "Usage: $0 /path/to/debs" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/repo"
mkdir -p "$REPO_DIR" || true

# Copy debs into repo
cp -f "$INPUT_DIR"/*.deb "$REPO_DIR" 2>/dev/null || true

# Generate Packages and Packages.gz
pushd "$REPO_DIR" >/dev/null
if ! command -v dpkg-scanpackages >/dev/null 2>&1; then
  echo "dpkg-scanpackages is required. Install dpkg-dev on the server machine." >&2
  echo "Example (Debian/Ubuntu): sudo apt-get install -y dpkg-dev" >&2
  exit 1
fi

echo "Building Packages index..."
dpkg-scanpackages . /dev/null | tee Packages > /dev/null
gzip -fk Packages

# Create Release file (optional; minimal for APT)
cat > Release <<EOF
Origin: kiosk-local
Label: kiosk-local
Suite: stable
Version: 1.0
Architectures: amd64 i386
Components: main
Description: Local offline repository for kiosk clients
EOF

popd >/dev/null

echo "Local repo prepared at: $REPO_DIR"
echo "Serve via kiosk-server at: http://<server-ip>:4000/repo"
