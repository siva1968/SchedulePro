# Quick PowerShell script to test admin settings

# Login and get token
Write-Host "Logging in as admin..." -ForegroundColor Green
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@schedulepro.com","password":"TestPass123!"}'
$token = $loginResponse.access_token
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "Login successful!" -ForegroundColor Green
Write-Host ""

# Check email settings
Write-Host "Getting email settings..." -ForegroundColor Cyan
try {
    $emailSettings = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/email-settings" -Headers $headers
    Write-Host "Email settings found: $($emailSettings.Length) configurations" -ForegroundColor Green
    $emailSettings | ForEach-Object { 
        Write-Host "   - Provider: $($_.provider), Active: $($_.isActive)" -ForegroundColor Yellow 
    }
} catch {
    Write-Host "Email settings error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check registration status
Write-Host "Getting registration status..." -ForegroundColor Cyan
try {
    $regStatus = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/system-settings/auth/registration-status" -Headers $headers
    Write-Host "Registration is currently: $($regStatus.enabled) - $($regStatus.message)" -ForegroundColor Green
} catch {
    Write-Host "Registration status error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Get all system settings
Write-Host "Getting all system settings..." -ForegroundColor Cyan
try {
    $systemSettings = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/admin/system-settings" -Headers $headers
    Write-Host "System settings found: $($systemSettings.Length) settings" -ForegroundColor Green
    $systemSettings | ForEach-Object { 
        Write-Host "   - $($_.settingKey): $($_.settingValue) [$($_.category)]" -ForegroundColor Yellow 
    }
} catch {
    Write-Host "System settings error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Get organizations (for meeting providers)
Write-Host "Getting organizations..." -ForegroundColor Cyan
try {
    $orgs = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/organizations" -Headers $headers
    Write-Host "Organizations found: $($orgs.Length)" -ForegroundColor Green
    $orgs | ForEach-Object { 
        Write-Host "   - $($_.name) (ID: $($_.id))" -ForegroundColor Yellow 
        
        # Get meeting providers for this org
        try {
            $providers = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/organizations/$($_.id)/meeting-providers" -Headers $headers
            Write-Host "     Meeting Providers: $($providers.supportedMeetingProviders -join ', ')" -ForegroundColor Blue
            Write-Host "     Default: $($providers.defaultMeetingProvider)" -ForegroundColor Blue
        } catch {
            Write-Host "     Could not get meeting providers: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "Organizations error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Admin settings check completed!" -ForegroundColor Green
