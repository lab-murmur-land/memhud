#!/usr/bin/env sh
set -e

REPO_HTTPS="https://github.com/lab-murmur-land/memhud.git"
REPO_SSH="git@github.com:lab-murmur-land/memhud.git"
TARGET_DIR="${HOME}/.local/share/memhud"

MODE="extension"
for arg in "$@"; do
    case "$arg" in
        --service)
            MODE="service"
            ;;
    esac
done

mkdir -p "$(dirname "$TARGET_DIR")"

if [ -d "$TARGET_DIR/.git" ]; then
    echo "==> Updating existing memhud in $TARGET_DIR..."
    git -C "$TARGET_DIR" pull --ff-only
else
    rm -rf "$TARGET_DIR"
    echo "==> Cloning memhud into $TARGET_DIR..."
    if ! git clone --depth 1 "$REPO_HTTPS" "$TARGET_DIR" 2>/dev/null; then
        git clone --depth 1 "$REPO_SSH" "$TARGET_DIR"
    fi
fi

if [ "$MODE" = "service" ]; then
    echo "==> Installing memhud systemd user service..."
    make -C "$TARGET_DIR" install-service
else
    echo "==> Installing memhud GNOME Shell extension..."
    make -C "$TARGET_DIR" install
fi
