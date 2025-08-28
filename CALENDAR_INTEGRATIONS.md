# Calendar Integrations - Implementation Guide

## 🎯 Overview

This document provides a comprehensive guide for the improved calendar integrations in SchedulePro, supporting Google Calendar, Microsoft Outlook, and CalDAV providers with advanced features like conflict detection, encryption, and real-time synchronization.

## 🔧 Architecture

### Core Components

1. **Calendar Services**
   - `GoogleCalendarService` - Google Calendar API integration
   - `OutlookCalendarService` - Microsoft Graph API integration  
   - `CalDAVService` - CalDAV protocol support
   - `EncryptionService` - Token encryption/decryption
   - `ConflictDetectionService` - Cross-calendar conflict detection

2. **Controllers**
   - `CalendarOAuthController` - OAuth flow handling
   - `CalendarSyncController` - Manual sync operations
   - `CalendarWebhookController` - Real-time webhook processing
   - `CalendarController` - CRUD operations

3. **Database Models**
   - Enhanced `CalendarIntegration` with encrypted tokens
   - Support for multiple providers per user
   - Conflict detection settings

## 🚀 Setup Instructions

### 1. Install Dependencies

The required packages are already included in package.json:
- `googleapis` - Google Calendar API
- `@microsoft/microsoft-graph-client` - Microsoft Graph API
- `axios` - HTTP client for CalDAV

### 2. Environment Configuration

Run the setup script to generate required environment variables:

```bash
node tools/scripts/setup-calendar.js
```

Add the generated variables to your `.env` file:

```env
# Calendar Integration Encryption
CALENDAR_ENCRYPTION_KEY=your_generated_key_here

# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft Graph OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# API Configuration
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

### 3. OAuth Provider Setup

#### Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3001/api/v1/calendar/oauth/google/callback`
6. Copy Client ID and Secret to your .env file

#### Microsoft Outlook Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add API permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
4. Add redirect URI: `http://localhost:3001/api/v1/calendar/oauth/outlook/callback`
5. Copy Application ID and Secret to your .env file

## 📚 API Reference

### OAuth Endpoints

#### Google Calendar
```bash
# Initiate OAuth flow
GET /api/v1/calendar/oauth/google?integrationName=My%20Calendar

# OAuth callback (handled automatically)
GET /api/v1/calendar/oauth/google/callback

# Get calendars
GET /api/v1/calendar/oauth/google/calendars?integrationId=uuid

# Get events
GET /api/v1/calendar/oauth/google/events?integrationId=uuid&timeMin=ISO&timeMax=ISO
```

#### Outlook Calendar
```bash
# Initiate OAuth flow
GET /api/v1/calendar/oauth/outlook?integrationName=My%20Outlook

# OAuth callback (handled automatically)
GET /api/v1/calendar/oauth/outlook/callback

# Get calendars
GET /api/v1/calendar/oauth/outlook/calendars?integrationId=uuid

# Get events
GET /api/v1/calendar/oauth/outlook/events?integrationId=uuid&timeMin=ISO&timeMax=ISO
```

### Calendar Management

```bash
# List integrations
GET /api/v1/calendar/integrations

# Create integration (for CalDAV)
POST /api/v1/calendar/integrations
{
  "provider": "CALDAV",
  "name": "My CalDAV Calendar",
  "serverUrl": "https://caldav.example.com",
  "username": "user@example.com",
  "password": "password",
  "calendarPath": "/caldav/user@example.com/calendar/"
}

# Update integration
PUT /api/v1/calendar/integrations/:id

# Delete integration
DELETE /api/v1/calendar/integrations/:id
```

### Sync Operations

```bash
# Sync booking to calendar
POST /api/v1/calendar/sync/:bookingId

# Remove booking from calendar
DELETE /api/v1/calendar/sync/:bookingId

# Check conflicts
POST /api/v1/calendar/conflicts
{
  "startTime": "2024-01-01T10:00:00Z",
  "endTime": "2024-01-01T11:00:00Z",
  "excludeBookingId": "optional-booking-id"
}
```

### Webhooks

```bash
# Google Calendar webhook
POST /api/v1/calendar/webhooks/google

# Outlook Calendar webhook  
POST /api/v1/calendar/webhooks/outlook

# CalDAV manual sync trigger
POST /api/v1/calendar/webhooks/caldav/sync
{
  "integrationId": "uuid",
  "userId": "uuid"
}
```

## 🔒 Security Features

### Token Encryption

All access tokens and refresh tokens are encrypted using AES-256-CTR:

```typescript
// Automatic encryption during storage
const integration = await calendarService.createIntegration(userId, {
  provider: CalendarProvider.GOOGLE,
  accessToken: 'raw_token', // Automatically encrypted
  refreshToken: 'raw_refresh_token' // Automatically encrypted
});

// Automatic decryption during use
const decryptedToken = await encryptionService.decrypt(integration.accessToken);
```

### OAuth Security

- State parameters prevent CSRF attacks
- Redirect URIs are validated
- Tokens are stored encrypted
- Refresh tokens enable long-term access

## ⚡ Features

### Conflict Detection

Comprehensive conflict detection across all connected calendars:

```typescript
const conflictResult = await conflictDetectionService.checkConflicts(
  userId,
  startTime,
  endTime,
  excludeBookingId
);

if (conflictResult.hasConflicts) {
  console.log(`Found ${conflictResult.conflicts.length} conflicts`);
  conflictResult.conflicts.forEach(conflict => {
    console.log(`- ${conflict.title} (${conflict.provider})`);
  });
}
```

### Multi-Provider Support

- **Google Calendar**: Full OAuth 2.0 integration with Google Meet support
- **Microsoft Outlook**: Graph API integration with Teams meeting support  
- **CalDAV**: Standards-based integration for various providers (Nextcloud, etc.)

### Real-Time Synchronization

- Google Calendar: Push notifications via webhooks
- Outlook Calendar: Microsoft Graph webhooks
- CalDAV: Periodic sync (CalDAV doesn't support push notifications)

### Bidirectional Sync

- Events created in SchedulePro sync to external calendars
- External calendar changes trigger conflict detection
- Automatic meeting room support for enterprise scenarios

## 🔄 Sync Flow

### Booking Creation

1. User creates a booking in SchedulePro
2. System checks for conflicts across all active integrations
3. If no conflicts, booking is created
4. Calendar events are created in all synced calendars
5. Meeting links are generated (Google Meet/Teams)

### External Calendar Changes

1. External calendar sends webhook notification
2. SchedulePro processes the change
3. Conflict detection runs for affected time slots
4. Users are notified of any conflicts
5. Alternative time slots are suggested if needed

## 🧪 Testing

### Manual Testing

1. Start the API server: `npm run dev`
2. Visit: `http://localhost:3000/dashboard/calendar`
3. Connect a calendar provider
4. Create a test booking
5. Verify event appears in external calendar
6. Create a conflicting event externally
7. Verify conflict detection works

### API Testing

```bash
# Test Google OAuth initiation
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/v1/calendar/oauth/google?integrationName=Test"

# Test conflict detection
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"startTime":"2024-01-01T10:00:00Z","endTime":"2024-01-01T11:00:00Z"}' \
  "http://localhost:3001/api/v1/calendar/conflicts"
```

## 🚨 Troubleshooting

### Common Issues

#### OAuth Redirect Mismatch
**Problem**: OAuth fails with redirect URI mismatch
**Solution**: Ensure redirect URIs in OAuth provider match exactly:
- Google: `http://localhost:3001/api/v1/calendar/oauth/google/callback`
- Outlook: `http://localhost:3001/api/v1/calendar/oauth/outlook/callback`

#### Token Encryption Errors
**Problem**: "Encryption key required" error
**Solution**: Generate and set `CALENDAR_ENCRYPTION_KEY` environment variable

#### CalDAV Connection Issues
**Problem**: CalDAV discovery fails
**Solution**: 
- Verify server URL format (include protocol)
- Check username/password credentials
- Ensure CalDAV is enabled on server

#### Webhook Not Receiving
**Problem**: Real-time updates not working
**Solution**:
- Verify webhook URLs are publicly accessible
- Check firewall settings
- For development, use ngrok or similar for local testing

### Debug Mode

Enable detailed logging:

```env
DEBUG=schedulepro:calendar*
LOG_LEVEL=debug
```

## 🔮 Future Enhancements

### Planned Features

1. **Apple Calendar Integration** - CalDAV-based integration for iCloud
2. **Zoom Integration** - Direct meeting creation
3. **Room Booking** - Enhanced meeting room management
4. **Smart Scheduling** - AI-powered time suggestions
5. **Bulk Operations** - Import/export calendar events
6. **Custom Webhooks** - User-defined webhook endpoints

### Performance Optimizations

1. **Caching Layer** - Redis-based calendar event caching
2. **Batch Operations** - Bulk calendar API calls
3. **Background Jobs** - Async conflict detection
4. **Rate Limiting** - API quota management

## 📞 Support

For implementation questions or issues:

1. Check the troubleshooting section above
2. Review API logs for error details
3. Test with minimal configuration first
4. Verify OAuth provider settings

## 🎉 Conclusion

The enhanced calendar integration system provides enterprise-grade functionality with robust security, comprehensive provider support, and real-time synchronization. The modular architecture allows for easy extension and maintenance while ensuring reliable operation across different calendar providers.
