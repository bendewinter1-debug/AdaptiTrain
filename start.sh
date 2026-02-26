#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20

cd "$(dirname "$0")"

echo "🏋️  Building AdaptiTrain..."

# Kill anything on 8081
lsof -ti:8081 | xargs kill -9 2>/dev/null
sleep 1

# Build
npx expo export --platform web 2>&1 | grep -E "Bundled|Exported|[Ee]rror"

# Copy static files needed for OAuth callbacks
cp whoop-callback.html dist/whoop-callback.html
cp serve.json dist/serve.json

echo "✅ Starting server..."
npx serve dist -p 8081 &

sleep 2
echo "🌐 Opening http://localhost:8081"
open http://localhost:8081

wait
