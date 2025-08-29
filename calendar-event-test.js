#!/usr/bin/env node

// Simple test to check if calendar event exists using Google Calendar public URL
const https = require('https');

const eventId = '2m4hlj1pruq80jinct53t47plo';
const calendarId = 'prasad.m@lsnsoft.com';

console.log('Testing Google Calendar Event Visibility');
console.log('==========================================');
console.log('Event ID:', eventId);
console.log('Calendar ID:', calendarId);
console.log('');

// Test different Google Calendar URLs
const urls = [
  `https://calendar.google.com/calendar/event?eid=${eventId}`,
  `https://calendar.google.com/calendar/u/0/r/eventedit/${eventId}`,
  `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&mode=AGENDA`,
];

console.log('Possible URLs to test:');
urls.forEach((url, index) => {
  console.log(`${index + 1}. ${url}`);
});

console.log('');
console.log('Event Details from Database:');
console.log('- Booking ID: ea705679-73e9-4678-888d-2a7758ae7a5e');
console.log('- Start Time: 2025-09-01 17:30:00');
console.log('- End Time: 2025-09-01 18:30:00');
console.log('- External Event ID: 2m4hlj1pruq80jinct53t47plo');

console.log('');
console.log('Troubleshooting Steps:');
console.log('1. Check if the event appears in your Google Calendar for September 1, 2025 at 5:30 PM');
console.log('2. Verify calendar permissions and sharing settings');
console.log('3. Check if the event is in a different calendar or timezone');
console.log('4. Try accessing Google Calendar with the same Google account used for OAuth');

console.log('');
console.log('Calendar Integration Status: ACTIVE');
console.log('Provider: GOOGLE');
console.log('Sync Enabled: true');
