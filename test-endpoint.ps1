# Test script to check if the endpoint works without auth
try {
    Write-Host "Testing public endpoint..."
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/v1/health" -Method GET
    Write-Host "Health Status: $($response.StatusCode)"
    Write-Host "Health Content: $($response.Content)"
} catch {
    Write-Host "Health Error: $($_.Exception.Message)"
}

Write-Host "`nWaiting for any existing booking creation to complete..."
Start-Sleep 5

Write-Host "`nChecking recent API logs..."
docker-compose logs api --tail=10
