# Running Anchoria on Oracle Cloud (OCI)

One small virtual machine runs everything: the website, the forms, the admin dashboard and all stored data.
**Caddy** (a web server) gets and renews the HTTPS certificate by itself, so certificate problems like the Netlify one cannot recur.

```
Visitors ──https──▶ Caddy (ports 80/443) ──▶ Anchoria app (port 3000, private)
                                                  └── /data  (applications, documents, staff, access log)
```

Allow about 45 minutes for the first setup. Do the steps in order and do not change DNS (Part D) until Parts A–C work.

---

## Part A — Create the server

1. Sign in at **cloud.oracle.com** → menu → **Compute → Instances → Create instance**.
2. **Name:** `anchoria`. **Image:** *Canonical Ubuntu 24.04*.
3. **Shape (important):**
   - Recommended for a real business system: a small **paid** flexible shape, e.g. `VM.Standard.E4.Flex` with 1 OCPU and 4–8 GB RAM. Costs a few dollars to ~$25/month.
   - *Always Free* shapes (`VM.Standard.A1.Flex` or `VM.Standard.E2.1.Micro`) work for testing, but **Oracle can reclaim idle Always Free instances**, which is risky for customer applications. If you use one, upgrade the account to Pay-As-You-Go so it is not reclaimed.
4. **Networking:** keep the defaults and make sure **Assign a public IPv4 address** is on.
5. **SSH keys:** choose *Generate a key pair* and **download the private key** (keep it safe; you cannot get it again).
6. Click **Create**. When it shows *Running*, copy the **public IP address**.

### Give it a permanent address
Menu → **Networking → IP management → Reserved public IPs → Reserve public IP address**, then attach it to the instance (instance → *Attached VNICs* → the VNIC → *IPv4 Addresses* → edit → *Reserved public IP*). Use this reserved address from now on, because a normal public IP can change.

### Open the web ports (two places — both are required)
1. **Cloud firewall:** instance → *Primary VNIC → Subnet → Security list → Add ingress rules*:
   `Source CIDR 0.0.0.0/0`, protocol **TCP**, destination port **80**; add a second rule for port **443**.
2. **Server firewall:** after connecting (next section) run:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
   ```

## Part B — Install and start Anchoria

Connect from your Mac's Terminal (replace the key path and IP):
```bash
chmod 600 ~/Downloads/ssh-key.key
ssh -i ~/Downloads/ssh-key.key ubuntu@YOUR_RESERVED_IP
```

On the server:
```bash
# 1. Install Docker and git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit        # then reconnect with ssh again
sudo apt-get install -y git

# 2. Get the code
git clone https://github.com/henriy-77/Anchoria.git anchoria && cd anchoria

# 3. Configure
cp .env.example .env
nano .env          # fill in SESSION_SECRET (run: openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
mkdir -p data && sudo chown 1000:1000 data

# 4. Start
docker compose up -d --build
docker compose ps          # both services should say "running"
```

### Test it before touching your real domain
Edit `.env` and set (replace the dots in your IP with dashes):
```
SITE_DOMAIN=129-146-10-20.sslip.io
SITE_URL=https://129-146-10-20.sslip.io
```
Run `docker compose up -d`, wait a minute, then open `https://129-146-10-20.sslip.io` — the site loads with a valid lock icon, and `/admin` lets you sign in. (sslip.io is a free service that turns an IP into a web name so a certificate can be issued without your DNS.)

## Part C — Copy your data from Netlify

1. Netlify → your profile → **User settings → Applications → Personal access tokens → New access token**. Copy it.
2. On the server, from the `anchoria` folder (the site id is `eba96b4a-432f-4acb-932b-4fe80c961281`):
   ```bash
   docker run --rm -v "$PWD:/app" -v "$PWD/data:/data" -w /app \
     -e STORAGE_DIR=/data \
     -e NETLIFY_SITE_ID=eba96b4a-432f-4acb-932b-4fe80c961281 \
     -e NETLIFY_TOKEN=PASTE_YOUR_TOKEN \
     node:22 sh -c "cd netlify/functions && npm i --no-audit --no-fund @netlify/blobs@8 && cd ../.. && node deploy/migrate-from-netlify.js"
   sudo chown -R 1000:1000 data
   ```
3. It prints a table: for each of *applications, documents, staff, access-log*, the **netlify** count must equal **now on server**. It is safe to run again at any time; it only copies what is missing.
4. Reload the admin: your applications, documents and staff accounts should all be there. Staff keep their passwords; everyone just signs in again once.

## Part D — Switch your real domain

Do this at a quiet time. Lower the DNS TTL to 300 seconds a day earlier if you can.

1. On the server, set the real domain in `.env`:
   ```
   SITE_DOMAIN=onboard.anchoriaonline.com
   SITE_URL=https://onboard.anchoriaonline.com
   ```
   then `docker compose up -d`.
2. In your DNS provider (Cloudflare for `anchoriaonline.com`): **delete** the existing `onboard` CNAME that points to Netlify, and **add** an **A record**: name `onboard`, value = your reserved IP. If using Cloudflare, set it to **DNS only (grey cloud)**.
3. Wait a few minutes, then open `https://onboard.anchoriaonline.com`. Caddy gets the certificate automatically. Check `docker compose logs caddy` if it does not.
4. **Run the Part C copy command once more** to pick up anything submitted to Netlify while DNS was switching.
5. Submit a test application and confirm it appears in `/admin`.

**If something goes wrong:** put the old CNAME back in DNS. Nothing on Netlify is deleted by this process.

## Part E — Backups (do not skip)

All data lives in the `data/` folder on the server. A disk failure without a backup means losing applications.

1. **Server backups in the OCI console:** Compute → your instance → **Boot volume** → *Backup policies* → assign **Silver** (daily).
2. **Nightly file backup** (keeps 14 days on the server):
   ```bash
   chmod +x deploy/backup.sh
   (crontab -l 2>/dev/null; echo "30 2 * * * $HOME/anchoria/deploy/backup.sh") | crontab -
   ```
3. **Strongly recommended:** also copy backups off the server. Create an **Object Storage** bucket (Storage → Buckets), install and configure the `oci` CLI, and set `OCI_BUCKET=your-bucket-name` in the cron line.

## Day-to-day

| Task | Command (in the `anchoria` folder) |
|---|---|
| See recent errors | `docker compose logs --tail 100 app` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Restart | `docker compose restart` |
| Server OS updates | `sudo apt-get update && sudo apt-get -y upgrade` (monthly) |

## After a week of stable running

- Remove the Netlify custom domain, and revoke the Netlify access token you created in Part C.
- `NETLIFY_*` settings, `netlify.toml` and the Netlify functions folder are not used by this server (the same code runs here through `server.js`).
