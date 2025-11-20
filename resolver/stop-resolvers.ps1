# Stop Resolver Services
# Usage: .\stop-resolvers.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Stopping Resolver Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Stopping Docker containers..." -ForegroundColor Yellow
docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host "Containers stopped successfully ✓" -ForegroundColor Green
} else {
    Write-Host "ERROR: Failed to stop containers" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Services stopped." -ForegroundColor Green
Write-Host "Note: Remember to stop your Cloudflare tunnel processes manually if still running." -ForegroundColor Yellow
Write-Host ""
