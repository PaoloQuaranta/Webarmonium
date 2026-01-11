# Vedere i log live
sudo journalctl -u webarmonium-backend -f
sudo journalctl -u webarmonium-frontend -f

# Restart manuale
sudo systemctl restart webarmonium-backend
sudo systemctl restart webarmonium-frontend