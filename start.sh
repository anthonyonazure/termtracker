#!/bin/bash
# Launch TermTracker — must unset ELECTRON_RUN_AS_NODE (set by VS Code)
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

# Build if dist-electron is missing or source changed
if [ ! -f dist-electron/main.js ] || [ electron/main.ts -nt dist-electron/main.js ]; then
  echo "Building TypeScript + Vite..."
  npx tsc && npx vite build
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  npx electron . &
else
  node_modules/electron/dist/electron.exe . &
fi
