# YTClip Production Deployment Guide (Linux VPS + HTTPS)

YTClip is a server-side AI video processing SaaS. All uploaded video probing (`ffprobe`), audio extraction (`ffmpeg`), speech transcription (`faster-whisper`), face tracking (`OpenCV`), and burned-in subtitle rendering (`ffmpeg` + `libx264`) run on the remote Linux server—never on the user's laptop.

---

## 1. Why Ordinary cPanel Shared Hosting Cannot Run YTClip

Ordinary cPanel shared web hosting (PHP/Apache accounts) **cannot run YTClip's video processing backend** for four technical reasons:

1. **No long-running background worker processes**: Shared cPanel plans kill background Node.js/Python daemons (`worker.ts`) and enforce strict CPU/memory process limits (CloudLinux LVE).
2. **Missing native binaries & shared libraries**: Shared hosts rarely permit system-wide `ffmpeg` with `libx264`/`libass`, `python3` with CTranslate2 (`faster-whisper`), or `opencv-python-headless` (`libGL` / `libglib2.0`).
3. **Request timeout & upload limits**: Apache/PHP reverse proxies on shared hosting enforce 30–60 second HTTP timeouts and small upload limits (50–128 MB), killing multi-minute video processing.
4. **CPU & RAM saturation**: Whisper transcription + OpenCV frame analysis + 1080p H.264 video encoding require dedicated vCPUs and at least 4 GB RAM (8 GB recommended).

**Recommended Hosting**:
- **Frontend (`https://YOUR-DOMAIN.com`)**: Served from the same VPS via Nginx (included in `deploy/nginx-ytclip.conf`) **or** deployed as a static Vite site on Cloudflare Pages / Vercel with `VITE_API_BASE_URL=https://api.YOUR-DOMAIN.com/api`.
- **Backend API + Worker (`https://api.YOUR-DOMAIN.com`)**: Dedicated Ubuntu 22.04 / 24.04 VPS (Hetzner, DigitalOcean, Linode/Akamai, AWS EC2, or Contabo) with **4+ vCPU, 8 GB RAM, 80+ GB SSD**.

---

## 2. DNS Configuration

Before provisioning SSL certificates, point two DNS `A` records to your VPS public IPv4 address:

| Type | Name | Value |
|------|------|-------|
| `A` | `@` (and `www`) | `<YOUR_VPS_IP>` |
| `A` | `api` | `<YOUR_VPS_IP>` |

---

## 3. Option A — Ubuntu VPS Bare-Metal Installation (`systemd` + Nginx)

### Step 1: Clone & Install Dependencies
```bash
sudo mkdir -p /opt/ytclip
sudo git clone <YOUR_GIT_REPO_URL> /opt/ytclip
cd /opt/ytclip
sudo bash deploy/install-vps.sh
```

`install-vps.sh` automatically installs:
- `ffmpeg` (`libx264`, `aac`, `ass`), `ffprobe`, `nginx`, `certbot`
- Node.js 22+
- Isolated Python virtualenv `/opt/ytclip/.venv` with `faster-whisper`, `opencv-python-headless`, and `numpy`
- Pre-cached `base.en` Whisper model in `/var/lib/ytclip/models`
- Runs `npm run check:server` to verify every dependency loads cleanly.

### Step 2: Configure Environment Variables
Edit `/opt/ytclip/.env`:
```bash
sudo nano /opt/ytclip/.env
```
Set your public domain(s):
```env
NODE_ENV=production
PORT=3000
CORS_ALLOWED_ORIGINS=https://YOUR-DOMAIN.com,https://www.YOUR-DOMAIN.com
EMBEDDED_WORKER=false
YTCLIP_REQUIRE_REAL_AI=true
```
If hosting the frontend separately on Cloudflare Pages/Vercel (or rebuilding static `dist/` against `api.YOUR-DOMAIN.com`), build the frontend with:
```bash
cd /opt/ytclip
VITE_API_BASE_URL="https://api.YOUR-DOMAIN.com/api" npm run build
```

### Step 3: Install & Start `systemd` Services + Logrotate
```bash
sudo cp deploy/ytclip-api.service /etc/systemd/system/
sudo cp deploy/ytclip-worker.service /etc/systemd/system/
sudo cp deploy/logrotate-ytclip /etc/logrotate.d/ytclip
sudo systemctl daemon-reload
sudo systemctl enable --now ytclip-api ytclip-worker
sudo systemctl status ytclip-api ytclip-worker
```

### Step 4: Configure Nginx & HTTPS (Let's Encrypt Certbot)
```bash
sudo cp deploy/nginx-ytclip.conf /etc/nginx/sites-available/ytclip.conf
sudo sed -i 's/YOUR-DOMAIN.com/example.com/g' /etc/nginx/sites-available/ytclip.conf
sudo ln -sf /etc/nginx/sites-available/ytclip.conf /etc/nginx/sites-enabled/ytclip.conf
sudo nginx -t && sudo systemctl reload nginx

# Issue free HTTPS TLS certificates & auto-configure SSL redirects
sudo certbot --nginx -d example.com -d www.example.com -d api.example.com
```

### Step 5: Verify Production Health Check
```bash
curl -sS https://api.example.com/api/health/deep | jq
```
Expected output confirms `"readyForAiProcessing": true`, `"fasterWhisperAvailable": true`, `"opencvAvailable": true`, and `"whisperModelReady": true`.

---

## 4. Option B — Docker Compose Deployment

```bash
cp deploy/.env.backend.example deploy/.env.backend
# Edit deploy/.env.backend (set CORS_ALLOWED_ORIGINS and openssl rand -hex 32 secret)

# Build frontend pointing at your API subdomain (if served via Nginx)
VITE_API_BASE_URL="https://api.YOUR-DOMAIN.com/api" npm run build

# Launch separate API + Worker containers
docker compose up -d --build
docker compose logs -f
```
Then proxy `https://api.YOUR-DOMAIN.com` -> `http://127.0.0.1:3000` using `deploy/nginx-ytclip.conf` + Certbot.

---

## 5. Persistent Storage & Automated Backups

All persistent data lives inside `YTCLIP_DATA_DIR` (`/var/lib/ytclip/data`):
- `ytclip.sqlite` — SQLite WAL database (projects, transcripts, highlights, clips, job queue, chunked upload sessions)
- `uploads/`, `renders/`, `thumbs/`, `chunks/`, `work/`

Automatic retention cleanup removes projects older than `STORAGE_RETENTION_HOURS` (default `72` hours) to prevent disk exhaustion.

To back up the SQLite database safely on a daily cron job:
```bash
0 3 * * * sqlite3 /var/lib/ytclip/data/ytclip.sqlite ".backup '/var/backups/ytclip-$(date +\%F).sqlite'"
```
