#!/bin/bash
# Launch TermTracker — must unset ELECTRON_RUN_AS_NODE (set by VS Code)
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

# Build if dist doesn't exist
if [ ! -f dist/index.html ]; then
  echo "Building..."
  npx vite build
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  npx electron . &
else
  node_modules/electron/dist/electron.exe . &
fi
