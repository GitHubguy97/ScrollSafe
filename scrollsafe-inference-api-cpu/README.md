# ScrollSafe Inference API

FastAPI service that batches image frames and runs the
`haywoodsloan/ai-image-detector-dev-deploy` classifier in a single forward pass.
Designed for deployment as a custom container on Hugging Face Inference
Endpoints (Pro) or any GPU-enabled platform.

## Features

- Loads the model once at startup and keeps it in GPU/CPU memory.
- Accepts up to `MAX_BATCH` frames per request via multipart upload.
- Applies the official preprocessing pipeline (resize to 256, normalize with
  ImageNet stats).
- Returns per-frame label scores (`artificial`, `real`) together with timing
  metadata.
- Simple API-key guard using the `X-API-Key` header.
- Warmup on startup to reduce the first-request latency.

## Repository Layout

```
scrollsafe-inference-api/
├── Dockerfile
├── README.md
├── requirements.txt
└── app
    ├── __init__.py
    ├── config.py
    ├── model.py
    ├── schemas.py
    └── server.py
```

## Expected Environment Variables

| Variable        | Required | Description                                                   |
|-----------------|----------|---------------------------------------------------------------|
| `MODEL_ID`      | No       | Hugging Face repo ID (defaults to the ScrollSafe model).      |
| `API_KEY`       | Yes      | Shared secret required in the `X-API-Key` header.             |
| `MAX_BATCH`     | No       | Maximum images per request (default `32`).                    |
| `MAX_CONCURRENCY` | No     | Parallel inference slots (default `1`).                       |
| `PORT`          | No       | Uvicorn port (default `8080`).                                |
| `DEVICE`        | No       | `cuda`, `cpu`, or `auto` (default).                           |
| `HF_TOKEN`      | No       | Token used when the model repo is private (optional here).    |

## Local Development

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
export API_KEY=dev-secret
uvicorn app.server:app --reload --port 8080
```

Then call:

```bash
curl -H "X-API-Key: dev-secret" \
     -F "files=@frame_0.jpg" \
     -F "files=@frame_1.jpg" \
     http://localhost:8080/v1/infer
```

## Docker Build & Push

Replace `<tag>` with your desired version (for example `v0.1.0`).

```bash
docker build -t dockergideon/scrollsafe-inference:<tag> .
docker push dockergideon/scrollsafe-inference:<tag>
```

Use the pushed image name when creating your Hugging Face Inference Endpoint.

## Deployment Notes

- Choose a GPU instance such as T4/A10 on HF Inference Endpoints.
- Set `scale_to_zero = false` for predictable latency.
- Provide the environment variables above (especially `API_KEY`). If the model
  becomes private, add `HF_TOKEN`.
- Configure the endpoint to allow only your backend caller IPs or clients.

## Request / Response

**POST** `/v1/infer` (multipart)

Request body (multipart):

```
files: frame_0.jpg
files: frame_1.jpg
...
```

Headers:

```
X-API-Key: <your secret>
```

Response:

```jsonc
{
  "model": {
    "id": "haywoodsloan/ai-image-detector-dev-deploy",
    "device": "cuda"
  },
  "batch_time_ms": 23,
  "results": [
    {
      "label_scores": {"artificial": 0.82, "real": 0.18},
      "inference_time_ms": 1.4
    },
    {
      "label_scores": {"artificial": 0.09, "real": 0.91},
      "inference_time_ms": 1.3
    }
  ]
}
```

**GET** `/healthz`

```json
{
  "status": "ok",
  "model_id": "haywoodsloan/ai-image-detector-dev-deploy",
  "device": "cuda",
  "max_batch": 32
}
```

## Backend Usage Sketch

See the accompanying snippet in `app/server.py` docstring for sending frames
from the ScrollSafe backend (`requests.post` with multipart data). The API is
designed to drop into the existing pipeline without changing your aggregation
logic.
*** End Patch
