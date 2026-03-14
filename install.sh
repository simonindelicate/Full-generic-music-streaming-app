#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────────────────────────────────────
# Music Streaming Server — installer
# Run on a fresh Ubuntu/Debian VPS. Sets up Docker, clones the app,
# writes your .env, and starts everything.
# ──────────────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/simonindelicate/music-streaming-server.git"
INSTALL_DIR="$HOME/music-streaming-server"
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}Music Streaming Server — Setup${RESET}"
echo "──────────────────────────────────────────────"
echo ""

# ── Check OS ──────────────────────────────────────────────────────────────────
if ! command -v apt-get &>/dev/null; then
  echo -e "${RED}This installer only works on Ubuntu or Debian.${RESET}"
  echo "If you're on a different Linux, install Docker manually and run:"
  echo "  git clone $REPO_URL && cd music-streaming-server && cp .env.example .env"
  exit 1
fi

# ── Install Docker if missing ─────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}Installing Docker...${RESET}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  DOCKER_NEWLY_INSTALLED=true
  echo -e "${GREEN}Docker installed.${RESET}"
else
  echo -e "${GREEN}Docker already installed.${RESET}"
fi

# ── Install git if missing ────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  echo -e "${YELLOW}Installing git...${RESET}"
  sudo apt-get install -y git
fi

# ── Clone repo ────────────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Folder $INSTALL_DIR already exists — skipping clone.${RESET}"
else
  echo "Downloading the app..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Ask two questions ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Two quick questions, then we're done.${RESET}"
echo ""

# 1. URL
echo -e "${BOLD}1. What is your server's web address?${RESET}"
echo "   This is either your domain (if you have one) or your server's IP address."
echo "   Examples:  http://123.45.67.89   or   https://music.yourdomain.com"
echo ""
read -rp "   Your address: " APP_BASE_URL
APP_BASE_URL="${APP_BASE_URL%/}"  # strip trailing slash if any
if [ -z "$APP_BASE_URL" ]; then
  # Default to server's public IP
  APP_BASE_URL="http://$(curl -fsSL https://icanhazip.com 2>/dev/null || echo 'localhost')"
  echo -e "   ${YELLOW}Using: $APP_BASE_URL${RESET}"
fi

echo ""

# 2. Admin password
echo -e "${BOLD}2. Choose an admin password.${RESET}"
echo "   This is what you'll use to log in to your admin panel."
echo "   Make it long and hard to guess. Press Enter to generate one automatically."
echo ""
read -rp "   Password (or Enter to generate): " ADMIN_API_TOKEN
if [ -z "$ADMIN_API_TOKEN" ]; then
  ADMIN_API_TOKEN=$(openssl rand -hex 20 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 40)
  echo ""
  echo -e "   ${GREEN}Generated password:  $ADMIN_API_TOKEN${RESET}"
  echo -e "   ${YELLOW}Write this down — you'll need it to log in.${RESET}"
fi

# ── Write .env ────────────────────────────────────────────────────────────────
echo ""
echo "Writing settings..."

cat > .env << EOF
APP_BASE_URL=${APP_BASE_URL}
PORT=3000
STORAGE_ROOT=./storage
ADMIN_API_TOKEN=${ADMIN_API_TOKEN}
DISCOVERY_OPT_IN=false

# PayPal — only needed if you want paid subscriptions. Leave blank for now.
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
EOF

# ── Start the app ─────────────────────────────────────────────────────────────
echo "Starting the app..."

if [ "$DOCKER_NEWLY_INSTALLED" = true ]; then
  # Docker group change needs a new shell — use sudo for this first run
  sudo docker compose up -d
else
  docker compose up -d
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}All done!${RESET}"
echo ""
echo "  Your site:      ${APP_BASE_URL}"
echo "  Admin login:    ${APP_BASE_URL}/admin/admin-login.html"
echo "  Admin password: ${ADMIN_API_TOKEN}"
echo ""
echo "────────────────────────────────────────────────"
echo -e "${YELLOW}Save your admin password somewhere safe — it won't be shown again.${RESET}"
echo "────────────────────────────────────────────────"
echo ""
echo "To check the app is running:   docker compose ps"
echo "To see logs:                   docker compose logs -f app"
echo "To stop:                       docker compose stop"
echo "To start again:                docker compose start"
echo ""

if [ "$DOCKER_NEWLY_INSTALLED" = true ]; then
  echo -e "${YELLOW}Note: Docker was just installed. If 'docker' commands fail without sudo,${RESET}"
  echo -e "${YELLOW}log out and back in, then run: docker compose ps${RESET}"
  echo ""
fi
