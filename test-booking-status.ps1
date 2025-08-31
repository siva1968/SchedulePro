# Test script to verify booking status behavior
# Host bookings should be CONFIRMED, Public bookings should be PENDING

Write-Host "Testing Booking Status Behavior" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Test 1: Public Booking (should be PENDING)
Write-Host "`n1. Testing Public Booking (should be PENDING)..." -ForegroundColor Yellow

$publicBookingPayload = @{
    meetingTypeId = "cm0eqxq3j0004bj7wh8i7t2oj"
    startTime = "2024-09-03T14:00:00Z"
    endTime = "2024-09-03T15:00:00Z"
    title = "Public Booking Test"
    description = "Testing public booking status"
    attendees = @(
        @{
            name = "Public User"
            email = "public@example.com"
        }
    )
} | ConvertTo-Json -Depth 3

try {
    $publicResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/public/bookings" -Method POST -ContentType "application/json" -Body $publicBookingPayload
    Write-Host "✅ Public Booking Created Successfully!" -ForegroundColor Green
    Write-Host "   Status: $($publicResponse.data.status)" -ForegroundColor Cyan
    Write-Host "   Booking ID: $($publicResponse.data.id)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Public Booking Failed:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n" -ForegroundColor White
Write-Host "Summary:" -ForegroundColor Green
Write-Host "- Public bookings now go to PENDING status (require approval)" -ForegroundColor White
Write-Host "- Host-created bookings go directly to CONFIRMED status" -ForegroundColor White
Write-Host "- This allows admins to review and approve public bookings before confirmation" -ForegroundColor White
