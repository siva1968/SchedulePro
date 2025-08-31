# Timezone-Aware Email Implementation Plan

## 🎯 Objective
Implement timezone-aware email functionality where:
- **Account holders** see times in their preferred timezone from settings
- **Public users** see times in the timezone they selected during booking
- **All emails** go through the centralized email service

## 🔧 Implementation Status

### ✅ Current System Analysis
- ✅ Centralized email service exists (`EmailService`)
- ✅ User timezone preferences stored in `users.timezone` field
- ✅ Booking timezone stored in `bookings.timezone` field
- ✅ Attendee timezone stored in `booking_attendees.timezone` field
- ✅ Frontend timezone selection components exist

### 🚀 Enhancements Needed

#### 1. Enhanced Email Service Methods

```typescript
// New helper methods to add to EmailService

/**
 * Get user's preferred timezone from database
 */
private async getUserTimezone(userId: string): Promise<string> {
  try {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true }
    });
    return user?.timezone || 'UTC';
  } catch (error) {
    this.logger.warn(`Failed to fetch user timezone for ${userId}:`, error);
    return 'UTC';
  }
}

/**
 * Get appropriate timezone based on user type
 * - Account holders use their saved timezone preference
 * - Public users use the timezone selected during booking
 */
private async getEmailTimezone(user: any, fallbackTimezone?: string): Promise<string> {
  if (user?.id) {
    // Registered user - use their timezone preference
    return await this.getUserTimezone(user.id);
  } else {
    // Public user - use the timezone they selected during booking
    return fallbackTimezone || user?.timezone || 'UTC';
  }
}

/**
 * Centralized email sending with timezone information
 */
async sendTimezoneAwareEmail(options: EmailOptions & { 
  timezone?: string; 
  recipientType?: 'account_holder' | 'public_user' 
}): Promise<EmailSendResult> {
  // Add timezone footer to HTML emails
  if (options.timezone && options.html) {
    const timezoneFooter = `
      <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 6px; font-size: 12px; color: #6b7280;">
        <p style="margin: 0;"><strong>🌍 Timezone Information:</strong></p>
        <p style="margin: 5px 0;">All times displayed in: <strong>${options.timezone}</strong></p>
        <p style="margin: 5px 0;">Type: <strong>${options.recipientType === 'account_holder' ? 'Account Preference' : 'Selected During Booking'}</strong></p>
      </div>
    `;
    options.html = options.html.replace('</body>', `${timezoneFooter}</body>`);
  }

  // Add timezone info to text emails
  if (options.timezone && options.text) {
    const timezoneText = `\n\nTIMEZONE INFO:\nAll times in: ${options.timezone}\nType: ${options.recipientType === 'account_holder' ? 'Account Preference' : 'Selected During Booking'}`;
    options.text += timezoneText;
  }

  return await this.sendEmail(options);
}
```

#### 2. Update Email Methods

**Booking Confirmation (`sendBookingConfirmation`)**
```typescript
// Replace timezone detection
const attendeeTimezone = await this.getEmailTimezone(
  booking.attendees[0], 
  booking.timezone || booking.attendees[0]?.timezone
);

// Use enhanced email sending
return await this.sendTimezoneAwareEmail({
  to: booking.attendees[0]?.email,
  subject: `Booking Confirmed: ${booking.meetingType.name}`,
  text: textContent,
  html: html,
  timezone: attendeeTimezone,
  recipientType: booking.attendees[0]?.userId ? 'account_holder' : 'public_user'
});
```

**Host Notification (`sendBookingNotificationToHost`)**
```typescript
// Use host's preferred timezone
const hostTimezone = await this.getEmailTimezone(booking.host);

// Use enhanced email sending
return await this.sendTimezoneAwareEmail({
  to: booking.host.email,
  subject: `New Booking: ${booking.meetingType.name}`,
  text: textContent,
  html: html,
  timezone: hostTimezone,
  recipientType: 'account_holder'
});
```

**Reschedule Notifications (`sendBookingReschedule`)**
```typescript
// Enhanced timezone detection for both parties
const attendeeTimezone = await this.getEmailTimezone(
  booking.attendees[0], 
  booking.timezone || booking.attendees[0]?.timezone
);
const hostTimezone = await this.getEmailTimezone(booking.host);

// Enhanced email sending for attendee
results.push(await this.sendTimezoneAwareEmail({
  to: booking.attendees[0]?.email,
  subject: `Booking Rescheduled: ${booking.meetingType.name}`,
  text: attendeeTextContent,
  html: attendeeHtml,
  timezone: attendeeTimezone,
  recipientType: booking.attendees[0]?.userId ? 'account_holder' : 'public_user'
}));

// Enhanced email sending for host (if needed)
if (rescheduledBy === 'attendee') {
  results.push(await this.sendTimezoneAwareEmail({
    to: booking.host.email,
    subject: `Booking Rescheduled by Attendee: ${booking.meetingType.name}`,
    text: hostTextContent,
    html: hostHtml,
    timezone: hostTimezone,
    recipientType: 'account_holder'
  }));
}
```

#### 3. Email Template Enhancements

**Enhanced Timezone Information Section**
```html
<div class="timezone-info">
  <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information</h4>
  <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
  <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
  <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
  <p style="margin: 5px 0; font-size: 11px; color: #9ca3af;">
    ${recipientType === 'account_holder' ? '⚙️ From your account timezone preference' : '🌐 From timezone selected during booking'}
  </p>
</div>
```

#### 4. Testing Strategy

**Manual Testing**
1. Create account holder with specific timezone (e.g., PST)
2. Create public booking with different timezone (e.g., EST)
3. Test all email flows:
   - Booking confirmation
   - Host notifications
   - Reschedule notifications
   - Approval/decline emails

**Expected Results**
- Account holders see times in their saved timezone preference
- Public users see times in booking-selected timezone
- All emails include clear timezone indication
- Footer shows timezone source (account vs booking selection)

### 🔧 Database Schema (Already Complete)

✅ **User Model**
- `timezone` field with default 'UTC'

✅ **Booking Model**  
- `timezone` field for booking-specific timezone

✅ **BookingAttendee Model**
- `timezone` field for attendee-specific timezone

### 📱 Frontend Integration (Already Complete)

✅ **Timezone Selection Components**
- `TimezoneSelect` component
- User settings page with timezone preference
- Booking flow with timezone selection

## 🎯 Next Steps

1. **Apply Email Service Enhancements**
   - Add helper methods for timezone detection
   - Create centralized timezone-aware email sending

2. **Update Existing Email Methods**
   - Modify booking confirmation emails
   - Update host notification emails
   - Enhance reschedule notification emails

3. **Testing & Validation**
   - Test with different timezone scenarios
   - Verify email provider consolidation
   - Confirm timezone display accuracy

4. **Documentation**
   - Update API documentation
   - Add timezone email examples
   - Document configuration options

## 🔍 Benefits

✅ **User Experience**
- Account holders see familiar timezone preferences
- Public users see times in their chosen timezone
- Clear timezone information prevents confusion

✅ **System Consistency**
- All emails use centralized email service
- Consistent timezone handling across all email types
- Proper fallback mechanisms

✅ **Maintainability**
- Single point of email configuration
- Reusable timezone logic
- Easy to add new email types

This implementation ensures that all email communications respect user timezone preferences while maintaining a centralized, consistent email delivery system.
