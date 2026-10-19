#!/usr/bin/env bash
# Keep this computer's current public IP on the Azure Cosmos DB (MongoDB vCore) firewall, so database
# scripts and MongoDB Compass can connect from any network.
#
# Usage (from server/):
#   npm run db:allow-my-ip                 add this computer's IP now (no-op if already there)
#   npm run db:allow-my-ip -- --install    also re-check every 10 minutes and at login (macOS)
#   npm run db:allow-my-ip -- --uninstall  stop the background re-check
#
# Only this computer's own firewall rule (AutoMac by default) is created or updated;
# other rules, such as AllowAzureServices for the App Service, are never touched.
# Needs the Azure CLI (`az`), signed in with `az login`.
# Account: COSMOS_ACCOUNT env var, else COSMOS_ACCOUNT= in server/.env, else rds-db-grant.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env"
STATE_DIR="$HOME/.rds-allow-my-ip"
AGENT_LABEL="org.rds.allow-my-ip"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

if [[ -z "${COSMOS_ACCOUNT:-}" && -f "$ENV_FILE" ]]; then
	COSMOS_ACCOUNT="$(sed -n 's/^COSMOS_ACCOUNT=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$ENV_FILE" | tail -1)"
fi
COSMOS_ACCOUNT="${COSMOS_ACCOUNT:-rds-db-grant}"

case "${1:-}" in
--install)
	mkdir -p "$STATE_DIR" "$(dirname "$AGENT_PLIST")"
	cat >"$AGENT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$AGENT_LABEL</string>
	<key>ProgramArguments</key>
	<array><string>/bin/bash</string><string>$SCRIPT_DIR/allowMyIp.sh</string></array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>COSMOS_ACCOUNT</key><string>$COSMOS_ACCOUNT</string>
		<key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
	</dict>
	<key>RunAtLoad</key><true/>
	<key>StartInterval</key><integer>600</integer>
	<key>StandardOutPath</key><string>$STATE_DIR/agent.log</string>
	<key>StandardErrorPath</key><string>$STATE_DIR/agent.log</string>
</dict>
</plist>
PLIST
	launchctl unload "$AGENT_PLIST" 2>/dev/null || true
	launchctl load "$AGENT_PLIST"
	echo "Installed: re-checks every 10 minutes and at login. Log: $STATE_DIR/agent.log"
	exit 0
	;;
--uninstall)
	launchctl unload "$AGENT_PLIST" 2>/dev/null || true
	rm -f "$AGENT_PLIST"
	echo "Removed the background re-check."
	exit 0
	;;
esac

command -v az >/dev/null || { echo "Azure CLI (az) not found. Install it, then run: az login" >&2; exit 1; }

# rds-db-grant is a Cosmos DB for MongoDB vCore cluster: its firewall is a set of named
# rules, so this computer keeps exactly one rule (RULE_NAME) pointed at its current IP.
RULE_NAME="${RULE_NAME:-AutoMac}"
API_VERSION="2024-07-01"

MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)"
[[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Could not read this computer's public IP" >&2; exit 1; }

CLUSTER_ID="$(az resource list --name "$COSMOS_ACCOUNT" --resource-type Microsoft.DocumentDB/mongoClusters --query "[0].id" -o tsv)"
[[ -n "$CLUSTER_ID" ]] || { echo "Cluster $COSMOS_ACCOUNT not found (is az signed in to the right subscription?)" >&2; exit 1; }
RULE_URL="https://management.azure.com$CLUSTER_ID/firewallRules/$RULE_NAME?api-version=$API_VERSION"

CURRENT_IP="$(az rest --method get --url "$RULE_URL" --query properties.startIpAddress -o tsv 2>/dev/null || true)"
if [[ "$CURRENT_IP" == "$MY_IP" ]]; then
	echo "$(date '+%F %T') $MY_IP already allowed on $COSMOS_ACCOUNT ($RULE_NAME)"
	exit 0
fi

echo "$(date '+%F %T') Setting $RULE_NAME on $COSMOS_ACCOUNT to $MY_IP${CURRENT_IP:+ (was $CURRENT_IP)}. Azure takes a few minutes..."
az rest --method put --url "$RULE_URL" \
	--body "{\"properties\":{\"startIpAddress\":\"$MY_IP\",\"endIpAddress\":\"$MY_IP\"}}" --output none
echo "$(date '+%F %T') Done: $MY_IP is allowed on $COSMOS_ACCOUNT"
