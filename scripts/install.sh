#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npm install --global --offline --ignore-scripts --install-links .
