#!/usr/bin/env bash
# Redeploy family-api to estentities.org (systemd service `family-api`, nginx /family-api/).
# Usage: ./deploy.sh      (run from family_expenses/server)
set -euo pipefail
HOST=root@estentities.org
KEY="${SSH_KEY:-$HOME/.ssh/estain_makaudze_private_key}"
SSH="ssh -i $KEY -o BatchMode=yes"
cd "$(dirname "$0")"
rsync -az --delete --exclude node_modules --exclude test --exclude .env --exclude phones.csv -e "$SSH" ./ "$HOST:/opt/family-api/"
$SSH "$HOST" 'set -e; cd /opt/family-api; npm ci --omit=dev --no-audit --no-fund >/dev/null
  chown -R familyapi:familyapi /opt/family-api
  sudo -u familyapi bash -c "set -a; . ./.env; set +a; npx tsx scripts/migrate.ts"
  systemctl restart family-api; sleep 2; systemctl is-active family-api'
curl -fsS https://estentities.org/family-api/health && echo "  ✓ deployed"
