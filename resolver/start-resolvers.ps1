# Start Resolver Services with Docker Compose and Cloudflare Tunnels
# Usage: .\start-resolvers.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Resolver Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running ✓" -ForegroundColor Green
Write-Host ""

# Check if cookies file exists
Write-Host "Checking cookies file..." -ForegroundColor Yellow
$cookiesPath = ".\cookies\www_youtube.com_cookies.txt"
if (-Not (Test-Path $cookiesPath)) {
    Write-Host "WARNING: Cookies file not found at $cookiesPath" -ForegroundColor Yellow
    Write-Host "Services may not work properly without YouTube cookies." -ForegroundColor Yellow
} else {
    Write-Host "Cookies file found ✓" -ForegroundColor Green
}
Write-Host ""

# Build and start containers
Write-Host "Building and starting Docker containers..." -ForegroundColor Yellow
docker-compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start containers" -ForegroundColor Red
    exit 1
}

Write-Host "Containers started ✓" -ForegroundColor Green
Write-Host ""

# Wait for services to be healthy
Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check health endpoints
$deepscanHealthy = $false
$doomscrollerHealthy = $false

for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $deepscanHealthy = $true
        }
    } catch {}

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5001/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $doomscrollerHealthy = $true
        }
    } catch {}

    if ($deepscanHealthy -and $doomscrollerHealthy) {
        break
    }

    Write-Host "  Attempt $i/10..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if ($deepscanHealthy) {
    Write-Host "DeepScan Resolver healthy on port 5000 ✓" -ForegroundColor Green
} else {
    Write-Host "WARNING: DeepScan Resolver not responding on port 5000" -ForegroundColor Yellow
}

if ($doomscrollerHealthy) {
    Write-Host "Doomscroller Resolver healthy on port 5001 ✓" -ForegroundColor Green
} else {
    Write-Host "WARNING: Doomscroller Resolver not responding on port 5001" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Services Running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "DeepScan Resolver:     http://localhost:5000" -ForegroundColor White
Write-Host "Doomscroller Resolver: http://localhost:5001" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Start Cloudflare tunnels in separate terminals:" -ForegroundColor White
Write-Host "   Terminal 1: cloudflared tunnel --url http://localhost:5000" -ForegroundColor Gray
Write-Host "   Terminal 2: cloudflared tunnel --url http://localhost:5001" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Copy the tunnel URLs and set them in AWS backend .env:" -ForegroundColor White
Write-Host "   DEEPSCAN_RESOLVER_URL=https://your-tunnel.trycloudflare.com" -ForegroundColor Gray
Write-Host "   DOOMSCROLLER_RESOLVER_URL=https://your-tunnel.trycloudflare.com" -ForegroundColor Gray
Write-Host ""
Write-Host "3. View logs: docker-compose logs -f" -ForegroundColor White
Write-Host "4. Stop services: docker-compose down" -ForegroundColor White
Write-Host ""
