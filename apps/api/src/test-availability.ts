// Test script to verify our improved availability error messaging
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BookingsService } from './bookings/bookings.service';
import { AvailabilityService } from './availability/availability.service';

async function testAvailabilityErrorMessages() {
  const app = await NestFactory.create(AppModule);
  
  const bookingsService = app.get(BookingsService);
  const availabilityService = app.get(AvailabilityService);
  
  console.log('Testing improved availability error messages...\n');
  
  // Test 1: User with no availability configured
  try {
    console.log('Test 1: User with no availability configured');
    const result = await bookingsService.getAvailableSlots('non-existent-user-id', '2024-12-15', 30);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: User with availability but not for the requested day
  try {
    console.log('Test 2: Testing AvailabilityService error messaging');
    const result = await availabilityService.getAvailableSlots('test-user-id', '2024-12-15', 30);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  await app.close();
}

if (require.main === module) {
  testAvailabilityErrorMessages().catch(console.error);
}
