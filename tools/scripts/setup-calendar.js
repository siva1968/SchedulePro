#!/usr/bin/env node

const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Setup script for SchedulePro Calendar Integration
 * Generates required environment variables and setup instructions
 */

console.log('🚀 SchedulePro Calendar Integration Setup\n');

// Generate encryption key
const encryptionKey = randomBytes(32).toString('hex');

console.log('📋 Required Environment Variables:');
console.log('=====================================\n');

console.log('# Calendar Integration Encryption');
console.log(`CALENDAR_ENCRYPTION_KEY=${encryptionKey}`);
console.log('');

console.log('# Google Calendar OAuth (if using Google Calendar)');
console.log('GOOGLE_CLIENT_ID=your_google_client_id');
console.log('GOOGLE_CLIENT_SECRET=your_google_client_secret');
console.log('');

console.log('# Microsoft Graph OAuth (if using Outlook Calendar)');
console.log('MICROSOFT_CLIENT_ID=your_microsoft_client_id');
console.log('MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret');
console.log('MICROSOFT_TENANT_ID=common  # or your specific tenant ID');
console.log('');

console.log('# API Configuration');
console.log('API_URL=http://localhost:3001  # Your API base URL');
console.log('FRONTEND_URL=http://localhost:3000  # Your frontend URL');
console.log('');

console.log('📝 Setup Instructions:');
console.log('======================\n');

console.log('1. Add the above environment variables to your .env file\n');

console.log('2. Google Calendar Setup (if needed):');
console.log('   - Go to https://console.cloud.google.com/');
console.log('   - Create a new project or select existing');
console.log('   - Enable Google Calendar API');
console.log('   - Create OAuth 2.0 credentials');
console.log('   - Add redirect URI: http://localhost:3001/api/v1/calendar/oauth/google/callback');
console.log('');

console.log('3. Microsoft Graph Setup (if needed):');
console.log('   - Go to https://portal.azure.com/');
console.log('   - Register a new application');
console.log('   - Add API permissions: Calendars.ReadWrite, User.Read, offline_access');
console.log('   - Add redirect URI: http://localhost:3001/api/v1/calendar/oauth/outlook/callback');
console.log('');

console.log('4. Database Schema:');
console.log('   - The calendar integration tables should already exist');
console.log('   - If not, run: npm run db:migrate');
console.log('');

console.log('5. Test the Integration:');
console.log('   - Start your API server: npm run dev');
console.log('   - Visit: http://localhost:3000/dashboard/calendar');
console.log('   - Try connecting a calendar provider');
console.log('');

console.log('🔐 Security Notes:');
console.log('==================\n');
console.log('- Keep your encryption key secure and never commit it to version control');
console.log('- In production, use strong, randomly generated keys');
console.log('- Regularly rotate OAuth secrets');
console.log('- Use HTTPS in production for all OAuth redirects');
console.log('');

console.log('✅ Setup complete! Copy the environment variables above to your .env file.');

// Optionally save to a file
const envContent = `
# Calendar Integration Encryption
CALENDAR_ENCRYPTION_KEY=${encryptionKey}

# Google Calendar OAuth (if using Google Calendar)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft Graph OAuth (if using Outlook Calendar)
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# API Configuration
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
`;

fs.writeFileSync(path.join(__dirname, '..', '..', '..', '.env.calendar-example'), envContent.trim());
console.log('\n📄 Example configuration saved to .env.calendar-example');
