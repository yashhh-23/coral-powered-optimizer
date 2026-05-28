#!/bin/bash
set -e

echo "Setting up Coral configurations..."

export HOME="${HOME:-/root}"
export CORAL_CONFIG_DIR="${CORAL_CONFIG_DIR:-$HOME/.config/coral}"
export CORAL_DATA_DIR="${CORAL_DATA_DIR:-$HOME/.local/share/coral}"

# Pre-create ALL directories coral needs to avoid 'os error 2' on source add
mkdir -p "$CORAL_CONFIG_DIR" "$CORAL_DATA_DIR"
mkdir -p "$CORAL_CONFIG_DIR/workspaces/default/sources"
mkdir -p "$CORAL_DATA_DIR/workspaces/default"

# Reconstruct config.toml using environment variables
# NOTE: <<EOF is the heredoc open marker; the > redirects output to the file
cat <<EOF > "$CORAL_CONFIG_DIR/config.toml"
version = 1

[workspaces.default.sources.github]
variables = { GITHUB_API_BASE = "https://api.github.com" }
secrets = ["GITHUB_TOKEN"]
origin = "bundled"

[workspaces.default.sources.leetcode]
version = "0.1.0"
variables = { LEETCODE_USERNAME = "${LEETCODE_USERNAME:-yashdedhia}" }
secrets = []
origin = "imported"
EOF

echo "config.toml written:"
cat "$CORAL_CONFIG_DIR/config.toml"

# In Docker, Coral reads secrets from environment directly.
# Coral will read GITHUB_TOKEN from the environment.

echo "Registering custom Coral sources..."
YAML_PATH=$(find /app -name "leetcode.yaml" | head -n 1)

if [ -z "$YAML_PATH" ]; then
  echo "ERROR: leetcode.yaml not found in /app! Here is the directory structure:"
  find /app -maxdepth 3
  exit 1
fi

echo "Found leetcode.yaml at: $YAML_PATH"

if ! coral source add --file "$YAML_PATH"; then
  echo "ERROR: Failed to register leetcode.yaml. Debug info:"
  ls -la "$YAML_PATH" || true
  ls -la "$CORAL_CONFIG_DIR" || true
  ls -la "$CORAL_CONFIG_DIR/workspaces/default" || true
  ls -la "$CORAL_CONFIG_DIR/workspaces/default/sources" || true
  echo "--- config.toml contents ---"
  cat "$CORAL_CONFIG_DIR/config.toml" || true
  echo "--- coral version ---"
  coral --version || true
  exit 1
fi

echo "Configuration complete. Starting Node server..."
exec npm start
