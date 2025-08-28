# Email Settings Management (System Admin Only)

## Overview
SchedulePro now supports multiple email providers (Nodemailer/SMTP, SendGrid, and Zepto Mail) that can be configured and managed by system administrators through secure API endpoints.

## Features
- **Multiple Email Providers**: Support for Nodemailer (SMTP), SendGrid, and Zepto Mail
- **System Admin Only**: Email settings can only be managed by users with `ADMIN` or `SUPER_ADMIN` system roles
- **Dynamic Provider Switching**: Active email provider can be changed without restarting the application
- **Email Testing**: Built-in functionality to test email configurations
- **Secure Storage**: Sensitive information like API keys are stored securely in the database
- **Forgot Password Integration**: Automatic integration with the forgot password functionality

## System Admin Setup

### 1. Grant System Admin Role
To manage email settings, a user must have system admin privileges. Run this SQL command:

```sql
-- Replace 'your-email@example.com' with the actual admin email
UPDATE users SET system_role = 'ADMIN' WHERE email = 'your-email@example.com';
```

### 2. Authentication
All email settings endpoints require:
- Valid JWT token (obtained through login)
- System admin role (`ADMIN` or `SUPER_ADMIN`)

## API Endpoints

### Base URL: `/admin/email-settings`

All endpoints require `Authorization: Bearer <jwt-token>` header.

### 1. Get All Email Settings
```http
GET /admin/email-settings
```

### 2. Get Email Settings by ID
```http
GET /admin/email-settings/{id}
```

### 3. Create New Email Settings
```http
POST /admin/email-settings
Content-Type: application/json

{
  "provider": "SENDGRID", // or "NODEMAILER" or "ZEPTO"
  "fromEmail": "noreply@yourdomain.com",
  "fromName": "Your Company Name",
  "replyToEmail": "support@yourdomain.com", // optional
  
  // For SendGrid
  "sendgridApiKey": "SG.your-sendgrid-api-key",
  
  // For Zepto Mail
  "zeptoApiKey": "your-zepto-api-key",
  "zeptoApiUrl": "https://api.zeptomail.in/v1.1/email", // optional
  
  // For Nodemailer/SMTP
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpSecure": false,
  "smtpUsername": "your-smtp-username",
  "smtpPassword": "your-smtp-password"
}
```

### 4. Update Email Settings
```http
PUT /admin/email-settings/{id}
Content-Type: application/json

{
  "isActive": true,
  // ... other fields to update
}
```

### 5. Delete Email Settings
```http
DELETE /admin/email-settings/{id}
```
Note: Cannot delete active email settings.

### 6. Test Email Configuration
```http
POST /admin/email-settings/{id}/test
Content-Type: application/json

{
  "testEmail": "test@example.com"
}
```

### 7. Activate Email Settings
```http
POST /admin/email-settings/{id}/activate
```

## Email Provider Configurations

### SendGrid Setup
1. Create a SendGrid account
2. Generate an API key with "Mail Send" permissions
3. Create email settings with `provider: "SENDGRID"`
4. Provide the API key in `sendgridApiKey` field

### Zepto Mail Setup
1. Create a Zepto Mail account
2. Generate an API key
3. Create email settings with `provider: "ZEPTO"`
4. Provide the API key in `zeptoApiKey` field

### Nodemailer/SMTP Setup
1. Configure SMTP settings from your email provider
2. Create email settings with `provider: "NODEMAILER"`
3. Provide SMTP configuration fields

## Usage Flow

1. **Login as System Admin**: Authenticate with admin credentials
2. **Create Email Configuration**: POST to `/admin/email-settings` with provider details
3. **Test Configuration**: POST to `/admin/email-settings/{id}/test` to verify setup
4. **Activate Configuration**: POST to `/admin/email-settings/{id}/activate` to make it active
5. **Forgot Password Works**: The forgot password feature will now use the active email provider

## Security Considerations

- Only system administrators can access email settings
- API keys and passwords are stored in the database (consider encryption for production)
- Email settings are validated before activation
- Test emails are sent to verify configuration
- Only one email provider can be active at a time

## Environment Variables (Fallback)

If no email settings are configured in the database, the system will fall back to environment variables:

```env
# Nodemailer/SMTP
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@schedulepro.com
SMTP_FROM_NAME=SchedulePro

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@schedulepro.com
SENDGRID_FROM_NAME=SchedulePro

# Zepto Mail
ZEPTO_API_KEY=
ZEPTO_FROM_EMAIL=noreply@schedulepro.com
ZEPTO_FROM_NAME=SchedulePro
ZEPTO_API_URL=https://api.zeptomail.in/v1.1/email
```

## Error Handling

- Invalid email provider configurations return detailed error messages
- Test failures are logged with specific error details
- Authentication failures return 403 Forbidden
- Non-existent email settings return 404 Not Found

## Example Complete Flow

```bash
# 1. Login as admin
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'

# Save the JWT token from response

# 2. Create SendGrid configuration
curl -X POST http://localhost:3001/admin/email-settings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "SENDGRID",
    "fromEmail": "noreply@yourdomain.com",
    "fromName": "Your Company",
    "sendgridApiKey": "SG.your-api-key-here"
  }'

# 3. Test the configuration
curl -X POST http://localhost:3001/admin/email-settings/SETTINGS_ID/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "test@example.com"}'

# 4. Activate the configuration
curl -X POST http://localhost:3001/admin/email-settings/SETTINGS_ID/activate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

- **403 Forbidden**: User doesn't have system admin role
- **Email test fails**: Check API keys, SMTP credentials, or network connectivity
- **Provider switch fails**: Ensure the new configuration is valid
- **Build errors**: Make sure all dependencies are installed and database is migrated
