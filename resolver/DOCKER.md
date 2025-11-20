# Resolver Services - Docker Setup

This guide covers running the DeepScan and Doomscroller resolver services in Docker containers.

## Prerequisites

- Docker installed and running
- Docker Compose installed
- YouTube cookies file at `./cookies/www_youtube.com_cookies.txt`
- Cloudflared for tunneling (download from https://github.com/cloudflare/cloudflared/releases)

## Quick Start

### 1. Build and Start Containers

```bash
cd resolver
docker-compose up --build -d
```

This starts both services:
- **deepscan-resolver** on port 5000
- **doomscroller-resolver** on port 5001

### 2. Check Container Status

```bash
docker-compose ps
docker-compose logs -f
```

### 3. Health Checks

```bash
# DeepScan resolver
curl http://localhost:5000/health

# Doomscroller resolver
curl http://localhost:5001/health
```

### 4. Start Cloudflare Tunnels

You need two separate tunnels for each service:

**Terminal 1 - DeepScan Tunnel:**
```bash
cloudflared tunnel --url http://localhost:5000
```

**Terminal 2 - Doomscroller Tunnel:**
```bash
cloudflared tunnel --url http://localhost:5001
```

Copy the generated tunnel URLs (e.g., `https://something.trycloudflare.com`).

### 5. Configure AWS Backend

Add the tunnel URLs to your AWS backend `.env`:

```bash
DEEPSCAN_RESOLVER_URL=https://your-deepscan-tunnel.trycloudflare.com
DOOMSCROLLER_RESOLVER_URL=https://your-doomscroller-tunnel.trycloudflare.com
```

Restart your AWS backend to apply changes.

## Environment Variables

Create a `.env` file in the resolver directory (see `.env.example`):

```bash
INFER_API_URL=https://your-huggingface-endpoint.cloud
INFER_API_KEY=your_api_key_here
YTDLP_COOKIES_FILE=/app/cookies/www_youtube.com_cookies.txt
```

## Management Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f deepscan-resolver
docker-compose logs -f doomscroller-resolver
```

### Stop Services

```bash
docker-compose stop
```

### Restart Services

```bash
docker-compose restart
```

### Rebuild After Code Changes

```bash
docker-compose up --build -d
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove images as well
docker-compose down --rmi all
```

## Architecture

```
AWS Backend → Cloudflare Tunnel → Docker Container (deepscan-resolver:5000)
                                           ↓
                                  yt-dlp + ffmpeg (residential IP)
                                           ↓
                                  HuggingFace Inference
                                           ↓
                                  Results back to AWS
```

## Troubleshooting

### Container won't start
- Check logs: `docker-compose logs`
- Ensure cookies file exists at `./cookies/www_youtube.com_cookies.txt`
- Verify ports 5000 and 5001 are not in use

### Frame extraction fails
- Verify cookies file is mounted correctly: `docker-compose exec deepscan-resolver ls -la /app/cookies`
- Check yt-dlp version: `docker-compose exec deepscan-resolver yt-dlp --version`
- Verify ffmpeg: `docker-compose exec deepscan-resolver ffmpeg -version`

### Inference fails
- Verify API credentials in environment variables
- Check logs for HTTP errors
- Test inference endpoint manually

### Health check failing
- Wait 10-30 seconds for services to fully start
- Check if service is listening: `docker-compose exec deepscan-resolver netstat -tlnp`

## Performance Notes

- Containers run with `--restart unless-stopped` for automatic recovery
- Health checks run every 30 seconds
- Cookies are mounted read-only for security
- Each container has its own isolated network

## Development

To run services locally without Docker:

```bash
# Install dependencies
pip install -r requirements.txt

# Run deepscan resolver
python deepscan_resolver.py

# Run doomscroller resolver (in another terminal)
python doomscroller_resolver.py
```
