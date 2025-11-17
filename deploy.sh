#!/bin/bash

# Webarmonium Auto-Deployment Script
# Pulls latest changes from prod branch and restarts servers if updates are found

PROJECT_DIR="/home/hexapodya/webarmonium"
LOG_FILE="$PROJECT_DIR/deploy.log"

# Navigate to project directory
cd "$PROJECT_DIR" || exit 1

# Log timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking for updates..." >> "$LOG_FILE"

# Perform git pull and capture output
PULL_OUTPUT=$(git pull origin prod 2>&1)

# Check if there were any updates
if echo "$PULL_OUTPUT" | grep -q "Already up to date"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - No updates found" >> "$LOG_FILE"
    exit 0
fi

# New commits detected - log and restart servers
echo "$(date '+%Y-%m-%d %H:%M:%S') - Updates detected! Restarting servers..." >> "$LOG_FILE"
echo "$PULL_OUTPUT" >> "$LOG_FILE"

# Kill existing backend process
if pgrep -f "node.*backend" > /dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Stopping backend server..." >> "$LOG_FILE"
    pkill -f "node.*backend"
    sleep 2
fi

# Kill existing frontend process
if pgrep -f "http-server.*frontend" > /dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Stopping frontend server..." >> "$LOG_FILE"
    pkill -f "http-server.*frontend"
    sleep 2
fi

# Start backend server
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting backend server..." >> "$LOG_FILE"
cd "$PROJECT_DIR/backend" || exit 1
nohup npm start >> "$LOG_FILE" 2>&1 &
sleep 3

# Start frontend server
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting frontend server..." >> "$LOG_FILE"
cd "$PROJECT_DIR/frontend" || exit 1
nohup npm start >> "$LOG_FILE" 2>&1 &
sleep 2

echo "$(date '+%Y-%m-%d %H:%M:%S') - Deployment complete!" >> "$LOG_FILE"
echo "----------------------------------------" >> "$LOG_FILE"
