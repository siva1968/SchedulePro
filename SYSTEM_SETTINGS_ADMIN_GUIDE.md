# System Settings Management (Super Admin Only)

## Overview
SchedulePro now supports system-wide settings that can be configured and managed by system administrators through secure API endpoints. This includes controlling user registration and other system behaviors.

## Features
- **Super Admin Only**: System settings can only be managed by users with `ADMIN` or `SUPER_ADMIN` system roles
- **Registration Control**: Enable/disable user registration system-wide
- **Flexible Settings**: Support for various setting types with categories
- **Audit Trail**: Track who updated which settings and when
- **Default Values**: Sensible defaults when settings are not configured

## System Admin Setup

### 1. Grant System Admin Role
To manage system settings, a user must have system admin privileges. Run this SQL command:

```sql
-- Replace 'your-email@example.com' with the actual admin email
UPDATE users SET system_role = 'ADMIN' WHERE email = 'your-email@example.com';
```

### 2. Authentication
All system settings endpoints require:
- Valid JWT token (obtained through login)
- System admin role (`ADMIN` or `SUPER_ADMIN`)

## API Endpoints

### Base URL: `/admin/system-settings`

All endpoints require `Authorization: Bearer <jwt-token>` header.

### 1. Get All System Settings
```http
GET /admin/system-settings
```

Optional query parameter:
- `category` - Filter by setting category

### 2. Get Setting by Key
```http
GET /admin/system-settings/{settingKey}
```

### 3. Create New System Setting
```http
POST /admin/system-settings
Content-Type: application/json

{
  "settingKey": "registration_enabled",
  "settingValue": "true",
  "description": "Controls whether new user registration is allowed",
  "category": "authentication"
}
```

### 4. Update System Setting
```http
PUT /admin/system-settings/{settingKey}
Content-Type: application/json

{
  "settingValue": "false",
  "description": "Updated description"
}
```

### 5. Delete System Setting
```http
DELETE /admin/system-settings/{settingKey}
```

### 6. Get Registration Status (Admin Only)
```http
GET /admin/system-settings/auth/registration-status
Authorization: Bearer <jwt-token>
```

Returns:
```json
{
  "enabled": true,
  "message": "User registration is enabled"
}
```

**Note**: This endpoint requires admin authentication. There is no public endpoint for registration status for security reasons.

### 7. Toggle Registration (Super Admin)
```http
POST /admin/system-settings/auth/toggle-registration
Content-Type: application/json

{
  "enabled": false
}
```

## Registration Control Implementation

### How It Works
1. **Default Behavior**: Registration is enabled by default if no setting exists
2. **Setting Check**: Every registration attempt checks the `registration_enabled` setting
3. **Error Response**: When disabled, users get a clear error message
4. **Admin Override**: Admins can always manage settings regardless of registration status

### Setting Values
- `registration_enabled`: `"true"` or `"false"` (stored as string)
- Category: `"authentication"`
- Description: Explains the setting's purpose

## Usage Flow

1. **Login as System Admin**: Authenticate with admin credentials
2. **Check Current Status**: GET `/admin/system-settings/auth/registration-status`
3. **Toggle Registration**: POST `/admin/system-settings/auth/toggle-registration` with desired state
4. **Verify Change**: Registration attempts will now respect the new setting

## Example Complete Flow

```bash
# 1. Login as admin
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'

# Save the JWT token from response

# 2. Check current registration status
curl -X GET http://localhost:3001/api/v1/admin/system-settings/auth/registration-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Disable registration
curl -X POST http://localhost:3001/api/v1/admin/system-settings/auth/toggle-registration \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 4. Test registration (should fail)
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'

# 5. Re-enable registration
curl -X POST http://localhost:3001/api/v1/admin/system-settings/auth/toggle-registration \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## System Settings Categories

- **authentication**: Registration, login policies, OAuth settings
- **general**: System-wide configurations
- **security**: Security-related settings
- **features**: Feature flags and toggles

## Security Considerations

- Only system administrators can access system settings
- Setting keys are unique and validated
- All changes are audited with user information
- Registration setting affects all users immediately
- Super admins can always access admin functions regardless of registration status

## Error Handling

- **403 Forbidden**: User doesn't have system admin role
- **404 Not Found**: Setting key doesn't exist
- **400 Bad Request**: Invalid setting data or duplicate key
- **401 Unauthorized**: Registration disabled (for registration attempts)

## Available Settings

### Current Settings
- `registration_enabled` (authentication): Controls user registration

### Future Settings (Extensible)
- `user_invite_only` (authentication): Require invitations for new users
- `max_organizations_per_user` (general): Limit organization memberships
- `maintenance_mode` (general): System maintenance mode
- `oauth_enabled` (authentication): Enable/disable OAuth providers
- `email_verification_required` (authentication): Require email verification

## Troubleshooting

- **403 Forbidden**: User doesn't have system admin role
- **Registration still works after disabling**: Check if setting was properly saved
- **Can't access admin endpoints**: Verify JWT token and user role
- **Build errors**: Make sure SystemSettingsModule is imported in AppModule
