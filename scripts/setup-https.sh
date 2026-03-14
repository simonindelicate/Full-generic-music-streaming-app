#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────────────────────────────────────
# Music Streaming Server — HTTPS setup
# Installs Certbot, gets a Let's Encrypt certificate for your domain,
# and updates nginx to serve over HTTPS.
# ──────────────────────────────────────────────────────────────────────────────

INSTALL_DIR="$HOME/music-streaming-server"
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}Music Streaming Server — HTTPS Setup${RESET}"
echo "──────────────────────────────────────────────"
echo ""

# ── Check we're in the right place ───────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
  echo -e "${RED}Can't find $INSTALL_DIR/docker-compose.yml${RESET}"
  echo "Make sure you ran the installer first."
  exit 1
fi

# ── Ask for domain ────────────────────────────────────────────────────────────
echo -e "${BOLD}What is your domain name?${RESET}"
echo "This should already be pointing at this server's IP address."
echo "Example:  music.yourdomain.com"
echo ""
read -rp "Domain: " DOMAIN

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}No domain entered. Exiting.${RESET}"
  exit 1
fi

echo ""
echo "Checking $DOMAIN points to this server..."
SERVER_IP=$(curl -fsSL https://icanhazip.com 2>/dev/null)
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -n1)

if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  echo -e "${YELLOW}Warning: $DOMAIN appears to point to $DOMAIN_IP but this server's IP is $SERVER_IP.${RESET}"
  echo "If you just updated your DNS, wait an hour and try again."
  read -rp "Continue anyway? (y/N): " CONTINUE
  if [ "${CONTINUE,,}" != "y" ]; then
    exit 1
  fi
fi

# ── Install Certbot ───────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "Installing Certbot..."
  sudo apt-get update -qq
  sudo apt-get install -y certbot
fi

# ── Stop nginx temporarily so Certbot can use port 80 ────────────────────────
echo "Pausing the web server briefly to get your certificate..."
cd "$INSTALL_DIR"
docker compose stop nginx

# ── Get certificate ───────────────────────────────────────────────────────────
sudo certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email

# ── Write new nginx config ────────────────────────────────────────────────────
echo "Updating nginx config for HTTPS..."

cat > nginx/default.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    client_max_body_size 500M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass         http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
EOF

# ── Add HTTPS port and cert mount to docker-compose.yml ──────────────────────
# Only update if 443 isn't already listed
if ! grep -q '"443:443"' docker-compose.yml; then
  sed -i 's|      - "80:80"|      - "80:80"\n      - "443:443"|' docker-compose.yml
fi

if ! grep -q 'letsencrypt' docker-compose.yml; then
  sed -i '/nginx\/default.conf/a\      - /etc/letsencrypt:/etc/letsencrypt:ro' docker-compose.yml
fi

# ── Update APP_BASE_URL in .env ───────────────────────────────────────────────
sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=https://${DOMAIN}|" .env

# ── Restart everything ────────────────────────────────────────────────────────
echo "Restarting..."
docker compose up -d

# ── Set up auto-renewal ───────────────────────────────────────────────────────
CRON_CMD="0 3 * * * certbot renew --quiet && docker compose -f ${INSTALL_DIR}/docker-compose.yml restart nginx"
( crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "$CRON_CMD" ) | crontab -

echo ""
echo -e "${GREEN}${BOLD}HTTPS is set up!${RESET}"
echo ""
echo "  Your site:   https://${DOMAIN}"
echo "  Admin login: https://${DOMAIN}/admin/admin-login.html"
echo ""
echo "Certificate renews automatically every 90 days."
echo ""
