#!/bin/bash
set -e

echo "Setting up Coral configurations..."

export HOME="${HOME:-/root}"
export CORAL_CONFIG_DIR="${CORAL_CONFIG_DIR:-$HOME/.config/coral}"
export CORAL_DATA_DIR="${CORAL_DATA_DIR:-$HOME/.local/share/coral}"

# Pre-create ALL directories coral needs
mkdir -p "$CORAL_CONFIG_DIR"
mkdir -p "$CORAL_CONFIG_DIR/workspaces/default/sources"
mkdir -p "$CORAL_DATA_DIR/workspaces/default/sources"

# config.toml: only declare BUNDLED sources here.
# Custom sources (leetcode) must NOT be pre-declared here;
# coral source add --file is the only registration path for them.
# Pre-declaring a source as origin="imported" AND also running
# source add causes coral to look for a missing data-dir record -> os error 2.
cat <<EOF > "$CORAL_CONFIG_DIR/config.toml"
version = 1

[workspaces.default.sources.github]
variables = { GITHUB_API_BASE = "https://api.github.com" }
secrets = ["GITHUB_TOKEN"]
origin = "bundled"
EOF

echo "config.toml written:"
cat "$CORAL_CONFIG_DIR/config.toml"

echo "Registering custom Coral sources..."
YAML_PATH=$(find /app -name "leetcode.yaml" | head -n 1)

if [ -z "$YAML_PATH" ]; then
  echo "ERROR: leetcode.yaml not found in /app! Directory structure:"
  find /app -maxdepth 3
  exit 1
fi

echo "Found leetcode.yaml at: $YAML_PATH"

# Pass LEETCODE_USERNAME so coral can resolve the input without interactive prompt
export LEETCODE_USERNAME="${LEETCODE_USERNAME:-yashdedhia}"

if ! coral source add --file "$YAML_PATH"; then
  echo "ERROR: Failed to register leetcode.yaml. Debug info:"
  ls -la "$YAML_PATH" || true
  ls -la "$CORAL_CONFIG_DIR" || true
  ls -la "$CORAL_CONFIG_DIR/workspaces/default" || true
  ls -la "$CORAL_DATA_DIR/workspaces/default" || true
  echo "--- config.toml contents ---"
  cat "$CORAL_CONFIG_DIR/config.toml" || true
  echo "--- coral data-dir sources ---"
  ls -la "$CORAL_DATA_DIR/workspaces/default/sources" || true
  echo "--- coral version ---"
  coral --version || true
  exit 1
fi

echo "Coral source registration complete. Starting Node server..."
exec npm start
