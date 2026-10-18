#!/usr/bin/env bash
# Provision the Make 24 table server on an Oracle Cloud Always Free VM
# (VM.Standard.E2.1.Micro, Ubuntu 20.04+, x86_64).
#
# Run ON THE INSTANCE:   sudo bash provision-vm.sh
# Re-running is safe: every step checks before it acts.
#
# Prereqs, both done in the OCI console, not here:
#   - ingress TCP 80 + 443 from 0.0.0.0/0 on the subnet's security list
#   - the reserved public IP (a stop/start changes an ephemeral one)
set -euo pipefail

DOMAIN="${DOMAIN:-129-153-131-117.sslip.io}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://happppya.github.io}"
REPO_URL="${REPO_URL:-https://github.com/happppya/make24.git}"
NODE_VERSION="${NODE_VERSION:-24.22.0}"
APP_USER=m24
APP_HOME=/opt/make24
APP_DIR=$APP_HOME/app
SWAP_MB=2048
NODE_BIN=/usr/local/bin/node

log() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run me with sudo: sudo bash $0" >&2; exit 1; }

# --- 1. swap ---------------------------------------------------------------
# 1 GB of RAM is plenty at runtime (~60 MB RSS) but not for `npm ci`.
log "swap"
if swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  echo "/swapfile already active"
else
  [ -f /swapfile ] || fallocate -l "${SWAP_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
  echo "/swapfile ${SWAP_MB}MB active"
fi

# --- 2. base packages ------------------------------------------------------
log "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl xz-utils ca-certificates iptables-persistent >/dev/null

# --- 3. service account ----------------------------------------------------
log "user ${APP_USER}"
id "$APP_USER" >/dev/null 2>&1 || adduser --system --group --home "$APP_HOME" "$APP_USER"
mkdir -p "$APP_HOME"
chown -R "$APP_USER:$APP_USER" "$APP_HOME"

# --- 4. node ---------------------------------------------------------------
# Official tarball rather than NodeSource: Ubuntu 20.04 (focal) is past
# standard support and its repo is not reliably carried by NodeSource.
#
# Each version lives in its own directory and /usr/local/bin only holds
# symlinks. Overwriting an executing binary in place fails with ETXTBSY (the
# running service has node open), while unlinking a symlink and pointing it at
# a new file is always safe; the service picks the new version up on restart.
log "node v${NODE_VERSION}"
NODE_DIR="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64"
mkdir -p "$(dirname "$NODE_DIR")"
# mktemp -d hands back a 0700 directory, and mv keeps that mode: the tree would
# be traversable by root only and every service user gets EACCES on exec. This
# also repairs an install made by an earlier copy of this script.
[ -d "$NODE_DIR" ] && chmod 755 "$NODE_DIR"
if [ -x "$NODE_DIR/bin/node" ] && [ "$(readlink -f "$NODE_BIN" 2>/dev/null)" = "$NODE_DIR/bin/node" ]; then
  echo "node v${NODE_VERSION} already installed"
else
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    tmp=$(mktemp -d)
    trap 'if [ -n "${tmp:-}" ]; then rm -rf "$tmp"; fi' EXIT
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C "$tmp" --strip-components=1
    rm -rf "$NODE_DIR"
    mv "$tmp" "$NODE_DIR"
    tmp=
    chmod 755 "$NODE_DIR"
  fi
  ln -sfn "$NODE_DIR/bin/node" "$NODE_BIN"
  ln -sfn "$NODE_DIR/bin/npm" /usr/local/bin/npm
  ln -sfn "$NODE_DIR/bin/npx" /usr/local/bin/npx
  ln -sfn "$NODE_BIN" /usr/bin/node
  ln -sfn /usr/local/bin/npm /usr/bin/npm
  ln -sfn /usr/local/bin/npx /usr/bin/npx
  echo "node $("$NODE_BIN" -v), npm $(npm -v)"
fi
# Prove an unprivileged user can actually exec it — root can traverse 0700
# directories, so a root-only "node -v" above would hide exactly this bug.
runuser -u "$APP_USER" -- "$NODE_BIN" -v >/dev/null 2>&1 || {
  echo "node is not runnable by ${APP_USER}; check the permissions on ${NODE_DIR}" >&2
  exit 1
}

# --- 5. code ---------------------------------------------------------------
log "code in ${APP_DIR}"
if [ -d "$APP_DIR/.git" ]; then
  runuser -u "$APP_USER" -- git -C "$APP_DIR" fetch --depth 1 origin master
  runuser -u "$APP_USER" -- git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  runuser -u "$APP_USER" -- git clone --depth 1 --branch master "$REPO_URL" "$APP_DIR"
fi

# tsx lives in devDependencies, so this must NOT omit dev packages.
# Only reinstall when the lockfile moved: this is minutes of work on 1/8 OCPU.
LOCK_HASH_FILE="$APP_HOME/.package-lock.sha256"
lock_sha=$(sha256sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)
if [ "$lock_sha" = "$(cat "$LOCK_HASH_FILE" 2>/dev/null || true)" ]; then
  log "dependencies already installed (lockfile unchanged)"
elif [ ! -f "$LOCK_HASH_FILE" ] && [ -d "$APP_DIR/node_modules" ]; then
  # A first run with an older copy of this script leaves node_modules behind
  # but no hash; adopt it instead of reinstalling for minutes.
  log "adopting the existing node_modules"
  printf '%s\n' "$lock_sha" >"$LOCK_HASH_FILE"
  chown "$APP_USER:$APP_USER" "$LOCK_HASH_FILE"
else
  log "npm ci (slow on 1/8 OCPU, several minutes)"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm ci --no-audit --no-fund"
  printf '%s\n' "$lock_sha" >"$LOCK_HASH_FILE"
  chown "$APP_USER:$APP_USER" "$LOCK_HASH_FILE"
fi

# --- 6. table server service ----------------------------------------------
log "make24.service"
cat >/etc/systemd/system/make24.service <<UNIT
[Unit]
Description=Make 24 table server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=8787
Environment=HOST=127.0.0.1
Environment=ALLOWED_ORIGIN=${FRONTEND_ORIGIN}
ExecStart=/usr/local/bin/npm run server
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable make24 >/dev/null 2>&1
systemctl restart make24

# --- 7. caddy --------------------------------------------------------------
log "caddy"
if [ -x /usr/local/bin/caddy ]; then
  echo "already installed: $(/usr/local/bin/caddy version | head -1)"
else
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /usr/local/bin/caddy
  chmod 755 /usr/local/bin/caddy
  echo "installed $(/usr/local/bin/caddy version | head -1)"
fi
mkdir -p /etc/caddy /var/lib/caddy

# `route` keeps the directives below in the order written. A bare `respond 404`
# in the site block gets sorted before `reverse_proxy` and would answer every
# request — /health and the /ws upgrade included.
cat >/etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
	route {
		@table path /ws /health
		reverse_proxy @table 127.0.0.1:8787
		respond 404
	}
}
CADDY

cat >/etc/systemd/system/caddy.service <<UNIT
[Unit]
Description=Caddy (TLS + WebSocket proxy for the table server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=HOME=/var/lib/caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
Restart=always
RestartSec=3
LimitNOFILE=1048576
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy

# --- 8. host firewall ------------------------------------------------------
# OCI Ubuntu images ship a persistent rules.v4 that REJECTs everything not
# explicitly allowed, so the console ingress rule alone is not always enough.
log "host firewall"
for port in 80 443; do
  if iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "tcp/${port} already allowed"
  else
    reject=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    if [ -n "${reject:-}" ]; then
      iptables -I INPUT "$reject" -p tcp --dport "$port" -j ACCEPT
      echo "tcp/${port} inserted above REJECT at line ${reject}"
    else
      iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
      echo "tcp/${port} appended (no REJECT rule found)"
    fi
  fi
done
if command -v netfilter-persistent >/dev/null; then
  netfilter-persistent save >/dev/null && echo "rules saved to /etc/iptables/rules.v4"
fi

# --- 9. verify -------------------------------------------------------------
log "status"
sleep 2
systemctl is-active make24 caddy || true
echo -n "local health: "
curl -fsS --max-time 5 http://127.0.0.1:8787/health || echo "FAILED"
# A fresh box needs a few seconds for the certificate, so poll instead of
# reporting one early failure as a broken deployment.
printf 'public health: '
for attempt in $(seq 1 20); do
  if body=$(curl -fsS --max-time 8 "https://${DOMAIN}/health" 2>/dev/null); then
    echo "$body"
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "FAILED after 60s"
    echo "  check: journalctl -u caddy -n 40, and that TCP 80/443 are open in the security list" >&2
    exit 1
  fi
  sleep 3
done
