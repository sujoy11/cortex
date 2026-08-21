#!/usr/bin/env bash
# The cortex installer moved to https://cortex.dev/install.sh
# This shim keeps old `curl ... github.io ... | bash` one-liners working.
set -euo pipefail
exec bash -c "$(curl -fsSL https://cortex.dev/install.sh)"
