# JaText 24/7 on your own Ubuntu laptop

This guide takes JaText off Vercel completely and runs the whole thing (web app, API, and PostgreSQL) on your Ubuntu laptop, published at `https://jatext.us.ci` through a free Cloudflare Tunnel.

Why it is built this way:

- The database lives on the laptop, so the app and the database talk over `127.0.0.1`. No remote database, no Turso, no Vercel Postgres.
- One Node process (`server/standaloneServer.js`) serves the built web app and every `/api/*` endpoint, so there is nothing serverless to configure and no fair use limits.
- `cloudflared` opens one outbound connection to Cloudflare. That means **no router port forwarding, no public IP, and no problem with ISP CGNAT** (Unifi, Maxis, TIME, mobile hotspots all work).

---

## 0. What you need

| Thing | Notes |
| --- | --- |
| Ubuntu laptop | Plugged into wall power, stays on 24/7 |
| Domain | `jatext.us.ci`, DNS panel at `https://my.dnshe.com` |
| Cloudflare account | Free signup at `https://dash.cloudflare.com/sign-up` |
| Google account | Used to sign in to GitHub and Cloudflare in the browser |

---

## 1. Run the automated installer

On the laptop, open Terminal and run:

JaText lives in a private repo, so cloning it needs the GitHub CLI instead of a password (GitHub blocked normal password login for git). Run these three blocks:

```bash
# 1. Install the GitHub CLI
sudo apt-get update
sudo apt-get install -y gh
```

```bash
# 2. Log in once in your browser (no password typing, no tokens to copy)
gh auth login -h github.com -p https -w
```

```bash
# 3. Clone your private repo and run the installer
gh repo clone Ahad00010/JaText ~/JaText -- -b main
cd ~/JaText
bash scripts/setup-ubuntu-selfhost.sh
```

Already have the repo cloned? Just run `cd ~/JaText && git pull --ff-only && bash scripts/setup-ubuntu-selfhost.sh`.

The installer does all of this for you, and is safe to re-run:

1. Disables suspend forever, including on lid close (writes `/etc/systemd/logind.conf.d/99-jatext-24-7.conf` and masks the sleep targets). It deliberately does **not** restart `systemd-logind`, because that kills your running desktop; those settings simply apply on the next reboot.
2. Installs PostgreSQL, Node 20, GitHub CLI, and cloudflared.
3. Enables PostgreSQL at boot.
4. Creates the `jatext` PostgreSQL role and `jatext` database, then writes `~/JaText/.env.selfhost` with a random database password and `AUTH_SECRET`.
5. Clones or updates `~/JaText`.
6. Runs `npm install` and `npm run build`.
7. Installs and starts the `jatext.service` systemd unit (auto restarts, starts on boot).
8. Prints the Cloudflare Tunnel commands for step 3 below.

Verify the local server before continuing:

```bash
curl http://127.0.0.1:8787/api/auth-status
```

You want `"dbConnected": true` and `"engine": "postgresql"`. The first request also creates all 28 tables automatically.

---

## 2. Point `jatext.us.ci` at Cloudflare

Do this once, in the Cloudflare dashboard.

1. Sign in at `https://dash.cloudflare.com` and click **Add a domain**, type `jatext.us.ci`, choose the **Free** plan.
2. Cloudflare shows you two nameservers, for example `betty.ns.cloudflare.com` and `rick.ns.cloudflare.com`. Leave this page open.
3. Now go to `https://my.dnshe.com`, sign in, and open the DNS settings for `jatext.us.ci`. You have two options:

   **Option A, recommended: let Cloudflare run DNS**
   Find the **Nameservers** or **NS** section (sometimes under "Domain settings", "Advanced", or "Delegation") and replace the existing nameservers with the two Cloudflare gave you. Save. Cloudflare then manages DNS for you, issues the TLS certificate automatically, and `cloudflared` can create its own DNS records.

   > **Heads up, this is the important bit:** a CNAME at a third-party DNS host pointing to `<TUNNEL_ID>.cfargotunnel.com` does **not** work. That hostname has no A records of its own, it only resolves once Cloudflare is authoritative for the zone. The other target you will find in docs, `{hostname}.cdn.cloudflare.net`, is the Partial (CNAME) setup, and Cloudflare limits that to Business and Enterprise plans. On the Free plan, full nameserver delegation really is the only way to use your own domain.
   >
   > If your DNS host cannot change nameservers, skip to the Tailscale Funnel section at the end instead, it needs no DNS at all.

   **Option B: keep dnshe as your DNS host**
   Only use this if you are on a Business or Enterprise Cloudflare plan. Add one record:

   | Type | Name | Value | TTL |
   | --- | --- | --- | --- |
   | CNAME | `jatext` (or `@` if they allow a root CNAME) | `<TUNNEL_ID>.cfargotunnel.com` | 300 |

   You get `<TUNNEL_ID>` in step 3. With this option Cloudflare cannot auto create records and you do not get the orange cloud proxy, but the tunnel still works.

4. Back on the Cloudflare page, click **Check nameservers**. It can take anywhere from a few minutes to a few hours. You can continue with step 3 while it propagates, the site just will not resolve until it finishes.

> **Why this step is not optional, even though the tunnel already works:** `<TUNNEL_ID>.cfargotunnel.com` has no A records of its own. You can confirm it with `https://dns.google/resolve?name=<TUNNEL_ID>.cfargotunnel.com&type=A`, which returns an SOA and no answer. It is a label that only resolves inside Cloudflare's own DNS. If your registrar's nameservers are still authoritative, lookups follow the CNAME, reach that name, find no IP, and die. Handing the nameservers to Cloudflare completes the chain. Until that propagates, everything else can be perfect and the site still will not load.

### Verify the handover

```bash
echo "should list *.ns.cloudflare.com"; dig jatext.us.ci NS +short
echo "should now print Cloudflare IPs"; dig jatext.us.ci +short
curl -sS https://jatext.us.ci/api/auth-status; echo
```

While you are in the Cloudflare DNS page for the zone, check two things:

- The `jatext.us.ci` CNAME must be **Proxied** (orange cloud). If it is grey and says DNS only, click it to toggle. A DNS-only tunnel CNAME will not route.
- If you later see error `525` or `526`, open **SSL/TLS, Overview** and switch the encryption mode from Full (strict) to **Flexible**. Tunnel origins that speak plain HTTP on localhost are fine on any mode, but Flexible removes the strict certificate requirement during setup.

---

## 3. Create the permanent Cloudflare Tunnel

Run these on the laptop:

```bash
# 1. Authorize cloudflared with your Cloudflare account (opens the browser)
cloudflared tunnel login

# 2. Create the tunnel. Copy the long id it prints, you need it next.
cloudflared tunnel create jatext

# 3. Publish the hostname. Skip this if you used Option B in step 2.
cloudflared tunnel route dns jatext jatext.us.ci
```

Write the tunnel config. Replace `<TUNNEL_ID>` with the id from `cloudflared tunnel create`:

```bash
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml >/dev/null <<YML
url: http://127.0.0.1:8787
tunnel: jatext
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
YML
```

Install it as a 24/7 service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

If you prefer the dashboard instead of the CLI: `https://one.dash.cloudflare.com` then **Networks, Tunnels, Create a tunnel, Cloudflared**. Give it a name, copy the token, run `sudo cloudflared service install <TOKEN>`, then add a **Public Hostname** of `jatext.us.ci` pointing at `http://127.0.0.1:8787`.

---

## 4. Go live

```bash
curl -I https://jatext.us.ci
curl https://jatext.us.ci/api/auth-status
```

You should see `"ok": true`, `"dbConnected": true`, `"engine": "postgresql"`. Open `https://jatext.us.ci/chats` and sign in.

---

## 5. Install the new Android APK

Every installed APK from the Vercel era still points at the dead `jatext.vercel.app`, so the new build has to be installed once, manually. After this the in app updater works again.

1. Download the newest signed APK: `https://jatext.us.ci/downloads/JaText-release.apk`
2. On the phone, allow **Install unknown apps** for your browser, then open the APK.
3. Sign in. Version 4.3.0 (Build 71) is the first build that talks to `jatext.us.ci`.

Note on passkeys: the WebAuthn relying party id changed from `jatext.vercel.app` to `jatext.us.ci`, so any passkey you registered before has to be registered again. Email and password logins are unaffected.

---

## 6. Enable Google Sign-In (otherwise the app says it is not configured)

The installer asks for these, but you can add them any time. Google Sign-In needs the OAuth client ID and secret in `~/JaText/.env.selfhost`:

1. Open `https://console.cloud.google.com/apis/credentials` and find the OAuth 2.0 **Web application** client used for JaText. The Client ID and Client Secret are both viewable there.
2. In the same client, add these two:
   - **Authorized JavaScript origins:** `https://jatext.us.ci`
   - **Authorized redirect URIs:** `https://jatext.us.ci/api/oauth-google`
3. Put the values on your laptop:

```bash
cat >> ~/JaText/.env.selfhost <<'EOF'
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
EOF
chmod 600 ~/JaText/.env.selfhost
sudo systemctl restart jatext.service
```

4. Verify, you want `"configured": true`:

```bash
curl -sS "https://jatext.us.ci/api/oauth-google?action=config"; echo
```

If your Android app uses its own Android-type OAuth client, add `GOOGLE_ANDROID_CLIENT_ID=<android-client-id>` as well. In most cases you do not need it, the server already accepts any audience from the same Google Cloud project.

## 7. Optional: bring over your old Turso data

Only possible if your old Turso database still answers reads.

```bash
cd ~/JaText
set -a; . .env.selfhost; set +a
TURSO_DATABASE_URL="libsql://your-old-db.turso.io" \
TURSO_AUTH_TOKEN="your-old-token" \
npm run pg:migrate
```

---

## 8. Day to day commands

```bash
# Live logs
sudo journalctl -u jatext.service -f
sudo journalctl -u cloudflared -f

# Restart everything
sudo systemctl restart jatext.service
sudo systemctl restart cloudflared

# Open the database shell
sudo -u postgres psql -d jatext

# Full database backup
sudo -u postgres pg_dump -Fc jatext > ~/jatext-backup-$(date +%F).dump

# Restore a backup
sudo -u postgres pg_restore -d jatext --clean --if-exists ~/jatext-backup-YYYY-MM-DD.dump
```

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cloudflared.service` fails with `Job for cloudflared.service failed because the control process exited with error code` | The service runs as root and reads `/etc/cloudflared/config.yml`, but `cloudflared tunnel create` saves credentials to your own `~/.cloudflared/<TUNNEL_ID>.json`. Copy them with `sudo cp ~/.cloudflared/<TUNNEL_ID>.json /root/.cloudflared/`, write the config shown in section 3, then `sudo systemctl restart cloudflared` |
| `curl http://127.0.0.1:8787/api/auth-status` refuses the connection | `sudo systemctl status jatext.service` then `sudo journalctl -u jatext.service -n 80` |
| `dbConnected: false` | Check PostgreSQL is up: `sudo -u postgres pg_isready`, and confirm `DATABASE_URL` in `~/JaText/.env.selfhost` |
| Cloudflare shows `1033` or `1034` error | The tunnel service is not connected. `sudo systemctl restart cloudflared` and check `sudo cloudflared tunnel info jatext` |
| Browser shows `ERR_NAME_NOT_RESOLVED` | DNS has not propagated yet, or the CNAME from step 2 Option B is missing or wrong |
| Site works at home, not on mobile data | Wait for DNS propagation, then `dig jatext.us.ci +short` |
| Laptop sleeps when the lid closes | Re run step 1, or `sudo systemctl status sleep.target` to confirm it is masked. The logind settings apply after a reboot |
| Login screen freezes after entering your password | Press `Ctrl + Alt + F3`, log in, then run `rm -f ~/.Xauthority ~/.ICEauthority && sudo chown -R $USER:$USER $HOME/.cache $HOME/.config $HOME/.local && sudo reboot`. If it still hangs, pick **Ubuntu on Xorg** from the gear icon on the login screen |
| You want to undo the no-sleep change | `sudo rm -f /etc/systemd/logind.conf.d/99-jatext-24-7.conf && sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target && sudo systemctl daemon-reload` |

---

## 10. No-DNS fallback: Tailscale Funnel

If your DNS provider will not delegate nameservers, Tailscale Funnel gives you a permanent public HTTPS URL with zero DNS records. You already have Tailscale installed from an earlier step.

```bash
sudo tailscale funnel --bg http://127.0.0.1:8787
sudo tailscale funnel status
```

The first run may print a link to enable Funnel on your tailnet, open it once and run the command again. Copy the `https://zach-dynabook-b55-k.<tailnet>.ts.net` URL it prints.

The web app works on that URL immediately, because it derives its API origin from the browser. The Android APK is pinned to a hostname at build time, so point the build at the new URL and rebuild:

1. Set `API_ORIGIN` in `android/app/build.gradle` to the Funnel URL.
2. Bump `versionCode` and `versionName`.
3. Push to `main`, GitHub Actions publishes the new signed APK to `apk-latest`.
4. Update `release-cdn/apk-version.json` so phones see the update.

## 11. If you ever change the domain

The domain lives in exactly three places:

1. `PUBLIC_APP_ORIGIN` in `~/JaText/.env.selfhost` (server side origin and passkey id)
2. `scripts/setup-ubuntu-selfhost.sh` and `scripts/jatext.service` (install defaults)
3. `API_ORIGIN` in `android/app/build.gradle` (what the APK talks to), which needs an APK rebuild if you change it after building

The web app itself figures out its origin from the browser, so it follows whatever domain you serve it on.
