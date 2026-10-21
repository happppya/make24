# Deploying

## GitHub Pages (frontend)

`.github/workflows/deploy-pages.yml` runs on every push to `master` and by hand
via **workflow_dispatch**. It installs with `npm ci`, runs `npm run build`
(typecheck included), uploads `dist/` as the Pages artifact, then deploys it with
`actions/deploy-pages`. Permissions are scoped to `contents: read`,
`pages: write`, `id-token: write`, and deployments are queued rather than
cancelled so a push during a deploy still reaches the site.

**One-time setup:** Settings → Pages → Build and deployment → Source:
**GitHub Actions**. The workflow's `GITHUB_TOKEN` cannot flip that switch (the
Pages enablement API needs a PAT or App token with `pages: write`), so it stays
manual; until it is set, the deploy job fails with "Pages is not enabled".

### Sub-path assets

Project sites live at `https://<user>.github.io/<repo>/`, so production builds
use `base: './'` (see `vite.config.ts`). Consequences:

- Vite writes relative `./assets/…` references into `index.html`; no base
  variable is needed in CI and custom domains work unchanged.
- Anything read from `public/` at runtime must go through `assetUrl()`
  (`src/assetUrl.ts`) rather than a root-absolute string, or it will 404 under
  the repo path. Card sprites (rendered by `CardGroupNode`, the title hero and
  the joker art) and the tutorial screenshots do this.
- `src/engine/deck.ts` still stores `/card-sprites/…` paths because the table
  server imports it in Node, where Vite's `BASE_URL` does not exist; the prefix
  is applied when the component renders the card.

### Multiplayer

The table server is not deployed by this workflow — `.github/workflows/deploy-server.yml`
handles that separately (see "Server deploys" below). See the Oracle Cloud
runbook below for hosting it, then come back here to point the build at it. To make the
hosted site multiplayer-capable, add a repository variable `VITE_MULTIPLAYER_URL`
(Settings → Secrets and variables → Actions → Variables), e.g.
`wss://table.example.com/ws`; the build step passes it through and
`resolveServerUrl()` picks it up. The server's `ALLOWED_ORIGIN` must include the
Pages origin. Without the variable the site is single-player only: the fallback is
`ws://<page host>:8787/ws`, which cannot work from an `https://` Pages origin.

## Table server on Oracle Cloud (Always Free)

Oracle's own [Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
docs describe the compute allowance as **1,500 Ampere A1 OCPU-hours + 9,000
GB-hours per month**, i.e. **2 OCPU / 12 GB** usable continuously (older guides
quote 4 OCPU / 24 GB; plan for what the quota actually sustains). Alternatives:
two `VM.Standard.E2.1.Micro` AMD instances (1 GB RAM each) — the VM only runs
the table server, never the frontend build, so that is enough. Either way: 200
GB total block storage with a 47 GB minimum boot volume, 10 TB/month outbound,
and the instance must live in your **home region**. Signup needs a payment
verification method (not charged unless you upgrade).

Always Free A1 capacity is frequently exhausted — "Out of host capacity" is
normal, so retry another availability domain or another time.

### 0. One-shot provision

`scripts/provision-vm.sh` does steps 2–5 on the instance itself: swap, Node from
the official tarball, the `m24` user, the checkout, `npm ci`, both systemd
units, the Caddyfile and the iptables insert. Copy it up and run it as root:

```bash
scp scripts/provision-vm.sh ubuntu@<ip>: && ssh ubuntu@<ip> 'sudo bash provision-vm.sh'
```

It is idempotent and takes `DOMAIN=…` / `FRONTEND_ORIGIN=…` overrides. It skips
`npm ci` while `package-lock.json` is unchanged, which makes a re-run the fix
for any edited unit or Caddyfile. Node comes from the tarball and Caddy as a
static binary rather than through `apt`/NodeSource, so it also works on Ubuntu
20.04 images — which is what the Always Free console actually hands out — where
the current Node release is no longer carried by the distro repo.

### 1. Instance

- Ubuntu image marked *Always Free Eligible* (20.04 or 24.04), public subnet
  with an internet gateway, and a **reserved** public IP (an ephemeral one
  changes on stop/start, which would silently break DNS). Reserving is not an
  in-place edit: reserve a new address under *IP management → Reserved public
  IPs*, then reassign it to the VNIC's primary private IP.
- Security list / NSG ingress: TCP 22 from your own IP, TCP 80 and 443 from
  `0.0.0.0/0`. Do **not** publish 8787; Caddy fronts it on localhost.

### 2. Runtime and code

```bash
sudo adduser --system --group --home /opt/make24 m24
sudo mkdir -p /opt/make24 && sudo chown m24:m24 /opt/make24
sudo apt-get install -y git curl
sudo -u m24 git clone https://github.com/<you>/<repo>.git /opt/make24/app
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs caddy
cd /opt/make24/app && sudo -u m24 npm ci   # includes tsx, which runs the server
```

`ws` and `tsx` are pure JavaScript, so the ARM (A1) images are fine.

### 3. systemd unit

`/etc/systemd/system/make24.service`:

```ini
[Unit]
Description=Make 24 table server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=m24
WorkingDirectory=/opt/make24/app
Environment=PORT=8787 HOST=127.0.0.1 ALLOWED_ORIGIN=https://<user>.github.io
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now make24` then `journalctl -u make24 -f` for logs.
Bind to `127.0.0.1` (the `HOST` above) so the raw port is never reachable from
the internet.

### 4. Caddy (TLS + WebSocket proxy)

`/etc/caddy/Caddyfile`:

```caddyfile
table.example.com {
	# `route` keeps these in the order written. A bare `respond 404` in the site
	# block is sorted before `reverse_proxy`, so it would answer every request —
	# /health and the /ws upgrade included, and the site would 404 forever.
	route {
		@table path /ws /health /puzzles/*
		reverse_proxy @table 127.0.0.1:8787
		respond 404
	}
}
```

Caddy obtains a certificate automatically once `table.example.com` resolves to
the reserved IP and ports 80/443 reach the box. It handles the WebSocket
upgrade without extra configuration. `/puzzles/*` must stay in the matcher: the
hourly, both daily and weekly boards are plain HTTP endpoints on the same server.

Puzzle scores persist in `data/puzzle-leaderboards.json` under the service's
working directory (override with `PUZZLE_LEADERBOARD_FILE`). `git reset --hard`
leaves that ignored directory alone, so a server deploy keeps the boards; back
the file up if the instance is rebuilt. No domain? An IP of `1.2.3.4` already has
the hostname `1-2-3-4.sslip.io`, which Let's Encrypt will issue for.

### 5. Host firewall

OCI Ubuntu images ship persistent iptables rules that reject everything not
explicitly allowed, and changing the security list alone is not enough:

```bash
sudo iptables -L INPUT --line-numbers -n   # find the REJECT rule
sudo iptables -I INPUT <n> -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT <n> -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Insert above the reject line; restarting the box without saving reverts it.

### 6. Point the site at it

1. Repo → Settings → Secrets and variables → Actions → Variables:
   `VITE_MULTIPLAYER_URL = wss://table.example.com/ws`.
2. Set the server's `ALLOWED_ORIGIN` to the exact Pages origin
   (`https://<user>.github.io`, no path; comma-separate extra origins).
3. Re-run the Pages workflow (a new push also works) so the bundle is rebuilt
   with the variable baked in.

### 7. Verify

```bash
curl -s https://table.example.com/health     # { ok: true, rooms, players, uptimeSeconds }
```

Then open the deployed site in two browsers, create a lobby in one and join by
code in the other: the lobby list, the deal and shared standings all ride the
WebSocket. A 101 Switching Protocols in the browser's network tab is the
end-to-end proof of the `wss://` upgrade.

### 8. Server deploys

`.github/workflows/deploy-server.yml` ships `master` to the box on push: it
fetches and hard-resets `/opt/make24/app` as `m24`, reinstalls dependencies only
when `package-lock.json` changed (the hash is cached in
`/opt/make24/.package-lock.sha256`), restarts the unit and then polls
`/health` from the runner until it answers `{"ok":true}`. On failure it dumps
`journalctl` for `make24` and `caddy` into the job log.

`/health` also reports the wire `protocol` the process speaks, so the poll doubles
as a version probe: a client built from a different commit is refused with
`protocol-mismatch` instead of misreading snapshots. Ship the frontend and the
table server from the same push.

Only `server/**`, `src/multiplayer/**`, `src/engine/**`, the manifests and the
workflow itself trigger it. That filter is deliberate: rooms and seats live in
memory, so every restart disconnects everyone mid-hand and a copy tweak must
not cost players their game.

**One-time setup:** a secret `VM_SSH_KEY` (the private key whose public half is
in the VM's `authorized_keys`) and variables `VM_HOST`, `VM_HEALTH_URL`
(`https://<host>/health`), plus optional `VM_USER` (default `ubuntu`),
`VM_APP_DIR` (default `/opt/make24/app`) and `VM_SERVICE` (default `make24`).
The runner pins the host key with `ssh-keyscan` rather than storing a
`known_hosts` secret; pinning the fingerprint in a variable is stricter if the
repo ever goes private.

### Caveats before calling it public

- **No auth or rate limiting.** Anyone with the URL can open rooms; a reverse
  proxy rule or the planned token check belongs here before advertising it.
- **State is in memory.** Restarting the service (or an idle reclamation) drops
  every room and seat; there is no persistence and no reconnect/resume, so
  players simply start a new lobby.
- **Idle reclamation.** Oracle may reclaim an Always Free instance whose CPU,
  network and (for A1) memory stay under 20% for 7 days. A quiet table server
  qualifies. There is no data to lose, but budget for a rebuild — keep this
  runbook and a snapshot of the boot volume.
- One process holds all rooms (200 max, 8 seats each, 32 KiB frame cap); that is
  plenty for friends-and-forum scale and not a sharded system.

