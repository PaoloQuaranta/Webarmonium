#!/bin/bash
# v0.8.7: Adds MemoryMax=400M to systemd service for graceful OOM handling
# On 961MB server, without MemoryMax the kernel OOM killer sends SIGKILL
# (bypassing graceful shutdown). With MemoryMax, systemd sends SIGTERM first,
# allowing the process to clean up active sessions before restarting.
# Run with: sudo bash ~/fix-node-memory.sh

SERVICE=/etc/systemd/system/webarmonium-backend.service

echo "Current service config:"
grep -E "^(ExecStart|MemoryMax)" "$SERVICE" || echo "  (no MemoryMax set)"

# Add MemoryMax=400M if not already present
if grep -q "^MemoryMax" "$SERVICE"; then
  echo ""
  echo "MemoryMax already set, updating to 400M..."
  sed -i "s|^MemoryMax=.*|MemoryMax=400M|" "$SERVICE"
else
  echo ""
  echo "Adding MemoryMax=400M..."
  sed -i "/^\[Service\]/a MemoryMax=400M" "$SERVICE"
fi

echo ""
echo "Updated service config:"
grep -E "^(ExecStart|MemoryMax)" "$SERVICE"

# Reload and restart
systemctl daemon-reload
systemctl restart webarmonium-backend.service

echo ""
echo "Service status:"
systemctl status webarmonium-backend.service --no-pager -l

echo ""
echo "Verify MemoryMax:"
systemctl show webarmonium-backend -p MemoryMax
