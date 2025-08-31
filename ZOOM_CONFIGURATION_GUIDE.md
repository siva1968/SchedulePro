# Zoom Integration Configuration Guide

## 🎯 Overview
This guide will walk you through setting up Zoom integration in SchedulePro to enable automatic Zoom meeting creation for bookings.

## 📋 Prerequisites
- Zoom account (Pro, Business, Education, or Enterprise)
- Access to Zoom Marketplace (for creating OAuth app)
- SchedulePro application running

## 🔧 Step 1: Create Zoom OAuth App

### 1.1 Access Zoom Marketplace
1. Go to [Zoom Marketplace](https://marketplace.zoom.us/)
2. Sign in with your Zoom account
3. Click **"Develop"** in the top menu
4. Select **"Build App"**

### 1.2 Create OAuth App
1. Choose **"OAuth"** app type
2. Select **"User-managed app"**
3. Fill in the app information:
   - **App Name**: "SchedulePro Integration" (or your preferred name)
   - **Short Description**: "Calendar scheduling with Zoom meetings"
   - **Company Name**: Your company name
   - **Contact Name**: Your name
   - **Contact Email**: Your email

### 1.3 Configure App Information
1. **App Type**: Choose "User-managed app"
2. **Would you like to publish this app on Zoom App Marketplace?**: No (unless you want to publish publicly)
3. **Short Description**: Brief description of your app
4. **Long Description**: Detailed description (optional)

### 1.4 Configure Scopes
Add the following scopes (these are REQUIRED for SchedulePro integration):
- ✅ **meeting:write** - Create scheduled meetings via API
- ✅ **meeting:read** - Read meeting details and settings
- ✅ **user:read** - Read user profile information
- ✅ **calendar:read** - Read calendar data (for scheduling conflicts)
- ✅ **calendar:write** - Write to calendar (for meeting creation)

### 1.5 Configure Redirect URLs
Add your redirect URL:
```
http://localhost:3001/api/v1/calendar/oauth/zoom/callback
```

For production, replace with your actual domain:
```
https://yourdomain.com/api/v1/calendar/oauth/zoom/callback
```

### 1.6 Enable Required APIs

In your Zoom app configuration, go to the **"Features"** tab and enable:

#### Required Features:
- ✅ **OAuth** - For user authentication
- ✅ **Meetings SDK** - For meeting creation and management

#### API Permissions to Enable:
Navigate to **"Scopes"** and ensure these are checked:
- ✅ **meeting:write:admin** - Create meetings as admin
- ✅ **meeting:read:admin** - Read meeting details as admin  
- ✅ **user:read** - Access user profile
- ✅ **calendar:read** - Read calendar information
- ✅ **calendar:write** - Modify calendar

#### Event Subscriptions (Optional but Recommended):
If you want real-time updates, enable these webhooks:
- Meeting Started
- Meeting Ended
- Participant Joined/Left

### 1.7 Get App Credentials
After creating the app, you'll see:
- **Client ID**: Copy this value
- **Client Secret**: Copy this value (keep it secure!)

## 🔑 Step 2: Configure Environment Variables

### 2.1 Update .env File
Open your `.env` file and update the Zoom configuration:

```env
# Zoom Configuration
ZOOM_CLIENT_ID="your_zoom_client_id_here"
ZOOM_CLIENT_SECRET="your_zoom_client_secret_here"
ZOOM_REDIRECT_URI="http://localhost:3001/api/v1/calendar/oauth/zoom/callback"
```

### 2.2 Replace Placeholder Values
Replace the current placeholder values:
```env
# FROM:
ZOOM_CLIENT_ID="PASTE_YOUR_ZOOM_CLIENT_ID_HERE"
ZOOM_CLIENT_SECRET="PASTE_YOUR_ZOOM_CLIENT_SECRET_HERE"

# TO:
ZOOM_CLIENT_ID="your_actual_client_id"
ZOOM_CLIENT_SECRET="your_actual_client_secret"
```

## 🚀 Step 3: Restart Application

### 3.1 Restart Docker Containers
```bash
cd c:\Users\prasa\source\repos\schedulepro
docker-compose down
docker-compose up -d
```

### 3.2 Verify Services
Check that all services are running:
```bash
docker-compose ps
```

## 🔗 Step 4: Connect Zoom in SchedulePro

### 4.1 Access Calendar Settings
1. Open SchedulePro in your browser: `http://localhost:3000`
2. Log in to your account
3. Go to **Dashboard** → **Calendar Integration**

### 4.2 Connect Zoom
1. Click **"Connect Zoom"** button
2. You'll be redirected to Zoom's authorization page
3. Sign in to your Zoom account
4. Grant permissions to SchedulePro
5. You'll be redirected back to SchedulePro

### 4.3 Verify Integration
- You should see Zoom listed as a connected integration
- Status should show as "Active" or "Connected"

## 📋 Zoom App Marketplace Configuration Checklist

### App Type Configuration
- [ ] **App Type**: OAuth
- [ ] **Development/Production**: Start with Development
- [ ] **User-managed app**: Yes
- [ ] **Marketplace publication**: No (unless publishing publicly)

### OAuth Configuration  
- [ ] **Redirect URI**: `http://localhost:3001/api/v1/calendar/oauth/zoom/callback`
- [ ] **Whitelist URL**: `http://localhost:3001`
- [ ] **OAuth Scopes**: All 5 required scopes enabled

### API Permissions Required
- [ ] **meeting:write** - Core requirement for creating meetings
- [ ] **meeting:read** - Core requirement for reading meeting details
- [ ] **user:read** - Core requirement for user authentication
- [ ] **calendar:read** - For scheduling conflict detection
- [ ] **calendar:write** - For calendar integration

### Features to Enable
- [ ] **OAuth Authentication** - Primary requirement
- [ ] **Meeting SDK** - For meeting management APIs
- [ ] **Webhook Events** (Optional) - For real-time updates

### Credentials Security
- [ ] **Client ID**: Copied and secured
- [ ] **Client Secret**: Copied and kept confidential
- [ ] **Environment Variables**: Updated in `.env` file
- [ ] **Production URLs**: Updated for production deployment

## ✅ Step 5: Test Zoom Integration

### 5.1 Create Test Booking
1. Create a new booking with **Meeting Provider** set to **Zoom**
2. Complete the booking process
3. Check that a Zoom meeting URL is generated

### 5.2 Verify Meeting Creation
- The booking should have a Zoom meeting URL like: `https://zoom.us/j/xxxxxxxxxx`
- Check your Zoom account - the meeting should appear in your scheduled meetings

## 🔧 Configuration Details

### Required Zoom APIs and Endpoints

#### OAuth 2.0 Endpoints
```
Authorization URL: https://zoom.us/oauth/authorize
Token URL: https://zoom.us/oauth/token
```

#### Zoom REST API v2 Endpoints Used
```
User Profile: GET https://api.zoom.us/v2/users/me
Create Meeting: POST https://api.zoom.us/v2/users/me/meetings
```

#### Required OAuth Scopes
```
meeting:write meeting:read user:read calendar:read calendar:write
```

### Zoom Client SDK APIs to Enable

When configuring your Zoom app in the Zoom Marketplace, ensure these **specific APIs are enabled**:

#### 1. **Meeting APIs** (Primary requirement)
- **POST /users/me/meetings** - Create instant and scheduled meetings
- **GET /users/me/meetings** - List user's meetings
- **PATCH /users/me/meetings/{meetingId}** - Update meeting details
- **DELETE /users/me/meetings/{meetingId}** - Delete meetings

#### 2. **User APIs** (Required for authentication)
- **GET /users/me** - Get user profile information
- **GET /users/me/settings** - Get user settings (for timezone, etc.)

#### 3. **Calendar APIs** (Optional but recommended)
- **GET /users/me/calendar/events** - Read calendar events
- **POST /users/me/calendar/events** - Create calendar events

#### 4. **Webhook APIs** (Optional for real-time updates)
- **Meeting Started** webhook
- **Meeting Ended** webhook  
- **Participant Joined** webhook

### Meeting Settings Applied by SchedulePro
```json
{
  "type": 2,                    // Scheduled meeting
  "host_video": true,           // Host video on by default
  "participant_video": true,    // Participant video on by default
  "join_before_host": false,    // Host must start meeting
  "mute_upon_entry": false,     // Participants not muted by default
  "watermark": false,           // No watermark
  "use_pmi": false,            // Use random meeting ID
  "approval_type": 2,          // Automatic approval
  "audio": "both",             // VoIP and phone
  "auto_recording": "none"     // No automatic recording
}
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. "Invalid Client ID" Error
**Solution**: Verify your `ZOOM_CLIENT_ID` in `.env` file matches the one from Zoom Marketplace

#### 2. "Redirect URI Mismatch" Error
**Solution**: Ensure the redirect URI in your Zoom app matches exactly:
```
http://localhost:3001/api/v1/calendar/oauth/zoom/callback
```

#### 3. "Insufficient Privileges" Error
**Solution**: Check that your Zoom account has the required plan (Pro or higher) and necessary scopes are enabled

#### 4. Integration Shows as "Disconnected"
**Solutions**:
- Check if access token has expired
- Re-authorize the integration
- Verify environment variables are correct

### Debug Steps

#### 1. Check Environment Variables
```bash
# Verify Zoom config is loaded
docker-compose exec api printenv | grep ZOOM
```

#### 2. Check API Logs
```bash
# View API logs for Zoom-related errors
docker-compose logs api | grep -i zoom
```

#### 3. Test OAuth Flow
1. Go to: `http://localhost:3001/api/v1/calendar/oauth/zoom/url`
2. Check if it returns a valid authorization URL

## 📝 Production Configuration

### For Production Deployment

#### 1. Update Environment Variables
```env
ZOOM_REDIRECT_URI="https://yourdomain.com/api/v1/calendar/oauth/zoom/callback"
```

#### 2. Update Zoom App Settings
- Add production redirect URI to your Zoom app
- Update any domain-specific settings

#### 3. SSL Certificate
Ensure your production domain has a valid SSL certificate for OAuth to work properly.

## 🎉 Success Confirmation

After successful configuration, you should be able to:
- ✅ See Zoom in the calendar integrations list
- ✅ Connect/disconnect Zoom integration
- ✅ Create bookings with automatic Zoom meeting links
- ✅ View Zoom meetings in your Zoom account
- ✅ Receive meeting invitations with Zoom links

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review API logs: `docker-compose logs api`
3. Verify your Zoom app configuration in Zoom Marketplace
4. Ensure all environment variables are correctly set

---

**Status**: Ready for Configuration  
**Last Updated**: September 1, 2025  
**Version**: Production Ready
