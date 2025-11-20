# ScrollSafe Resolver Services

These services run locally on your machine to handle YouTube video frame extraction and inference, bypassing datacenter IP restrictions.

## Services

1. **DeepScan Resolver** (Port 5000) - Handles deep scan requests from backend
2. **Doomscroller Resolver** (Port 5001) - Handles doomscroller analysis requests

## Setup

```bash
cd resolver
pip install -r requirements.txt
```

## Run Both Services

```bash
# Terminal 1 - DeepScan Resolver
python deepscan_resolver.py

# Terminal 2 - Doomscroller Resolver
python doomscroller_resolver.py
```

## Tunnel to Cloud

Use Cloudflare tunnel to expose these services:

```bash
# Terminal 3 - Tunnel DeepScan (5000)
cloudflared tunnel --url http://localhost:5000

# Terminal 4 - Tunnel Doomscroller (5001)
cloudflared tunnel --url http://localhost:5001
```

Copy the generated URLs and configure them in AWS workers.

## How It Works

```
AWS Worker → Cloudflare Tunnel → Your PC (Resolver) → YouTube (Residential IP) ✓
                                      ↓
                              HuggingFace Inference
                                      ↓
                              Results back to AWS → Upsert to DB
```

## Environment Variables (Optional)

```bash
YTDLP_COOKIES_FILE=path/to/cookies.txt
INFER_API_URL=https://your-inference-endpoint.com
INFER_API_KEY=your-api-key
```
