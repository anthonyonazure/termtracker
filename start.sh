#!/bin/bash
# Launch TermTracker — must unset ELECTRON_RUN_AS_NODE (set by VS Code)
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

if [[ "$OSTYPE" == "darwin"* ]]; then
  npx electron . &
else
  node_modules/electron/dist/electron.exe . &
fi
