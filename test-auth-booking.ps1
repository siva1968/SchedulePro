# Test Authentication and Booking Creation

Write-Host "Testing Authentication and Booking Flow" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

# Step 1: Test if we can authenticate and get user info
Write-Host "`n1. Testing Authentication..." -ForegroundColor Yellow

# Test login first (you'll need to adjust credentials)
$loginPayload = @{
    email = "admin@schedulepro.com"
    password = "admin123"
} | ConvertTo-Json

try {
    Write-Host "Attempting login..." -ForegroundColor Cyan
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -ContentType "application/json" -Body $loginPayload
    $token = $loginResponse.access_token
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "   User: $($loginResponse.user.email)" -ForegroundColor Cyan
    Write-Host "   Token starts with: $($token.Substring(0, 20))..." -ForegroundColor Cyan
    
    # Step 2: Test authenticated endpoint
    Write-Host "`n2. Testing authenticated user info..." -ForegroundColor Yellow
    $userResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/me" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ User info retrieved!" -ForegroundColor Green
    Write-Host "   User ID: $($userResponse.id)" -ForegroundColor Cyan
    Write-Host "   System Role: $($userResponse.systemRole)" -ForegroundColor Cyan
    
    # Step 3: Test authenticated booking creation
    Write-Host "`n3. Testing authenticated booking creation..." -ForegroundColor Yellow
    $bookingPayload = @{
        meetingTypeId = "cm0eqxq3j0004bj7wh8i7t2oj"
        startTime = "2024-09-04T10:00:00Z"
        endTime = "2024-09-04T11:00:00Z"
        title = "Host Authenticated Booking Test"
        description = "Testing authenticated booking creation"
        attendees = @(
            @{
                name = "Host Test User"
                email = "hosttest@example.com"
            }
        )
    } | ConvertTo-Json -Depth 3
    
    $bookingResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/bookings" -Method POST -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    } -Body $bookingPayload
    
    Write-Host "✅ Authenticated Booking Created!" -ForegroundColor Green
    Write-Host "   Booking ID: $($bookingResponse.data.id)" -ForegroundColor Cyan
    Write-Host "   Status: $($bookingResponse.data.status)" -ForegroundColor Cyan
    Write-Host "   Attendee Status: $($bookingResponse.data.attendees[0].status)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Error occurred:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -match "404") {
        Write-Host "   This might indicate the endpoint doesn't exist or isn't accessible" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -match "401") {
        Write-Host "   This indicates authentication failed" -ForegroundColor Yellow
    } elseif ($_.Exception.Message -match "500") {
        Write-Host "   This indicates a server error - check API logs" -ForegroundColor Yellow
    }
}

Write-Host "`n" -ForegroundColor White
Write-Host "Summary:" -ForegroundColor Green
Write-Host "- If this test shows status CONFIRMED, the fix is working" -ForegroundColor White
Write-Host "- If this test shows status PENDING, there's still an issue" -ForegroundColor White
Write-Host "- If authentication fails, the user might not be properly logged in" -ForegroundColor White
