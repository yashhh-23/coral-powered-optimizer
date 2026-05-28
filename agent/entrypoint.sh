#!/bin/bash
set -e

echo "Setting up Coral configurations..."

export HOME="${HOME:-/root}"
export CORAL_CONFIG_DIR="${CORAL_CONFIG_DIR:-$HOME/.config/coral}"
export CORAL_DATA_DIR="${CORAL_DATA_DIR:-$HOME/.local/share/coral}"

mkdir -p "$CORAL_CONFIG_DIR" "$CORAL_DATA_DIR"

# Create coral config directories
mkdir -p "$CORAL_CONFIG_DIR/workspaces/default" "$CORAL_CONFIG_DIR/workspaces/default/sources"

# Reconstruct config.toml using environment variables
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

# In Docker, many tools without access to a keychain will read secrets from env directly.
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
    exit 1
fi

echo "Configuration complete. Starting Node server..."
exec npm start
