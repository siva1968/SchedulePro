#!/usr/bin/env powershell
# Test script to verify the meeting link generation fix

Write-Host "🧪 TESTING MEETING LINK GENERATION FIX" -ForegroundColor Green
Write-Host "=" * 50

# Test payload for creating a host booking
$testPayload = @{
    meetingTypeId = "test-meeting-type-id"
    startTime = "2025-09-02T10:00:00Z"
    endTime = "2025-09-02T11:00:00Z"
    attendees = @(
        @{
            name = "Test Customer"
            email = "test@example.com"
        }
    )
    meetingProvider = "MICROSOFT_TEAMS"
    notes = "Testing meeting link generation fix"
} | ConvertTo-Json -Depth 3

Write-Host "📋 Test Payload:" -ForegroundColor Yellow
Write-Host $testPayload

Write-Host "`n🔗 Expected Behavior:" -ForegroundColor Cyan
Write-Host "1. Booking gets created successfully"
Write-Host "2. Meeting provider is set to MICROSOFT_TEAMS"
Write-Host "3. Meeting link gets generated automatically"
Write-Host "4. Booking is updated with the meeting URL"
Write-Host "5. Email notifications include the meeting link"

Write-Host "`n🐛 Previous Issue:" -ForegroundColor Red
Write-Host "- Host bookings were created without meeting URLs"
Write-Host "- Meeting link generation was missing from createHostBooking"
Write-Host "- Emails sent without meeting links"

Write-Host "`n✅ Fix Applied:" -ForegroundColor Green
Write-Host "- Added meeting link generation step in createHostBooking method"
Write-Host "- Happens after booking creation, before email notifications"
Write-Host "- Updates booking with meetingUrl before sending emails"
Write-Host "- Includes comprehensive error handling and logging"

Write-Host "`n🎯 To Test Manually:" -ForegroundColor Magenta
Write-Host "1. Go to http://localhost:3000"
Write-Host "2. Login as a host user"
Write-Host "3. Create a new booking"
Write-Host "4. Check that meeting URL appears in booking details"
Write-Host "5. Verify email contains the meeting link"

Write-Host "`n📊 Debug Logs to Watch:" -ForegroundColor Blue
Write-Host "docker-compose logs api | grep '🔗 DEBUG'"

Write-Host "`n" + "=" * 50
Write-Host "READY FOR TESTING!" -ForegroundColor Green
