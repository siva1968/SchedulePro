# Booking Cancellation with Calendar Integration

## Overview
The booking cancellation functionality has been enhanced to properly handle Google Calendar integration. When a booking is cancelled, you now have two options:

1. **Update the calendar event to show it's cancelled** (default behavior)
2. **Remove the event completely from the calendar**

## API Endpoints

### 1. Cancel Booking (Authenticated)
```
POST /api/v1/bookings/{id}/cancel
```

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Meeting cancelled due to schedule conflict",
  "removeFromCalendar": false  // optional, defaults to false
}
```

**Response:**
```json
{
  "id": "booking_id",
  "status": "CANCELLED",
  "title": "Meeting Title",
  "startTime": "2025-08-29T15:00:00Z",
  "endTime": "2025-08-29T16:00:00Z",
  "notes": "Original notes\nCancellation reason: Meeting cancelled due to schedule conflict",
  "calendarResult": {
    "success": true,
    "action": "updated_as_cancelled"
  }
}
```

### 2. Cancel Booking (Public)
```
POST /api/v1/public/bookings/{id}/cancel
```

**Request Body:**
```json
{
  "token": "cancellation_token",
  "reason": "Can't attend the meeting",
  "removeFromCalendar": true  // optional, defaults to false
}
```

### 3. Remove Booking from Calendar Only
```
POST /api/v1/bookings/{id}/remove-from-calendar
```

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "provider": "GOOGLE",
  "integrationName": "Primary Calendar"
}
```

## Behavior Options

### Option 1: Update Calendar Event as Cancelled (Default)
- Event title is prefixed with `[CANCELLED]`
- Event description includes cancellation reason
- Event status is set to "cancelled" in Google Calendar
- Event remains visible in calendar but marked as cancelled
- Time slot remains blocked

### Option 2: Remove Event from Calendar
- Event is completely deleted from Google Calendar
- Time slot becomes available for other bookings
- No trace of the event remains in the calendar

## Integration Details

### Google Calendar Integration
- Uses Google Calendar API to update or delete events
- Requires valid calendar integration with access tokens
- Handles authentication errors gracefully
- Falls back gracefully if calendar update fails

### Database Changes
- Booking status is always updated to `CANCELLED`
- Cancellation reason is appended to booking notes
- Calendar integration remains linked unless explicitly removed
- External calendar event ID is cleared only when event is deleted

## Error Handling

- Calendar integration failures don't prevent booking cancellation
- Detailed error logging for troubleshooting
- Graceful fallback if Google Calendar API is unavailable
- Clear error messages for invalid tokens or permissions

## Example Usage

### Cancel and update calendar event:
```bash
curl -X POST http://localhost:3001/api/v1/bookings/abc123/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Schedule conflict",
    "removeFromCalendar": false
  }'
```

### Cancel and remove from calendar:
```bash
curl -X POST http://localhost:3001/api/v1/bookings/abc123/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "No longer needed",
    "removeFromCalendar": true
  }'
```

### Public cancellation:
```bash
curl -X POST http://localhost:3001/api/v1/public/bookings/abc123/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "token": "cancellation_token_here",
    "reason": "Can\\'t attend",
    "removeFromCalendar": true
  }'
```

## Notes

- The default behavior (when `removeFromCalendar` is not specified or is `false`) is to update the calendar event to show it's cancelled
- This preserves the meeting history while clearly indicating it's been cancelled
- Use `removeFromCalendar: true` when you want to completely free up the time slot
- Email notifications are sent regardless of the calendar action chosen
- Calendar integration must be properly configured and active for these features to work
