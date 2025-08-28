const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test user
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const testUser = await prisma.user.upsert({
    where: { email: 'test@schedulepro.com' },
    update: {},
    create: {
      email: 'test@schedulepro.com',
      passwordHash: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      timezone: 'America/New_York',
      isEmailVerified: true,
      subscriptionPlan: 'pro',
    },
  });

  console.log(`✅ Created test user: ${testUser.email}`);

  // Create test organization
  const testOrg = await prisma.organization.upsert({
    where: { slug: 'test-org' },
    update: {},
    create: {
      name: 'Test Organization',
      slug: 'test-org',
      description: 'A test organization for development',
      email: 'contact@test-org.com',
      subscriptionPlan: 'pro',
      ownerId: testUser.id,
    },
  });

  console.log(`✅ Created test organization: ${testOrg.slug}`);

  // Add user as organization member
  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: testUser.id,
        organizationId: testOrg.id,
      },
    },
    update: {},
    create: {
      userId: testUser.id,
      organizationId: testOrg.id,
      role: 'OWNER',
      title: 'Founder & CEO',
      status: 'active',
    },
  });

  console.log(`✅ Added user as organization member`);

  // Create sample meeting types
  const meetingTypes = [
    {
      name: '30-Minute Consultation',
      description: 'Quick consultation call to discuss your needs',
      duration: 30,
      price: 0,
    },
    {
      name: '1-Hour Strategy Session',
      description: 'In-depth strategy session to plan your project',
      duration: 60,
      price: 150,
    },
    {
      name: '15-Minute Quick Chat',
      description: 'Brief introductory call',
      duration: 15,
      price: 0,
    },
  ];

  for (const meetingType of meetingTypes) {
    const existing = await prisma.meetingType.findFirst({
      where: {
        organizationId: testOrg.id,
        hostId: testUser.id,
        name: meetingType.name,
      },
    });

    if (!existing) {
      await prisma.meetingType.create({
        data: {
          ...meetingType,
          organizationId: testOrg.id,
          hostId: testUser.id,
          bufferBefore: 5,
          bufferAfter: 5,
          maxBookingsPerDay: 10,
          allowCancellation: true,
          allowRescheduling: true,
          requiredNoticeMinutes: 60,
          locationType: 'ONLINE',
          locationDetails: {
            platform: 'zoom',
            url: 'https://zoom.us/j/example',
          },
        },
      });
    }
  }

  console.log(`✅ Created ${meetingTypes.length} meeting types`);

  // Create sample availability (Monday to Friday, 9 AM to 5 PM)
  const workDays = [1, 2, 3, 4, 5]; // Monday to Friday
  
  for (const dayOfWeek of workDays) {
    const existing = await prisma.availability.findFirst({
      where: {
        userId: testUser.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
      },
    });

    if (!existing) {
      await prisma.availability.create({
        data: {
          userId: testUser.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          type: 'RECURRING',
          isBlocked: false,
        },
      });
    }
  }

  console.log(`✅ Created availability for weekdays`);

  // Create a sample booking
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0); // 10 AM tomorrow

  const endTime = new Date(tomorrow);
  endTime.setMinutes(endTime.getMinutes() + 30);

  const sampleMeetingType = await prisma.meetingType.findFirst({
    where: {
      organizationId: testOrg.id,
      hostId: testUser.id,
    },
  });

  if (sampleMeetingType) {
    const sampleBooking = await prisma.booking.create({
      data: {
        meetingTypeId: sampleMeetingType.id,
        hostId: testUser.id,
        startTime: tomorrow,
        endTime: endTime,
        title: 'Sample Consultation',
        description: 'This is a sample booking for testing',
        status: 'CONFIRMED',
        locationType: 'ONLINE',
        locationDetails: {
          platform: 'zoom',
          url: 'https://zoom.us/j/sample123',
        },
        paymentStatus: 'PAID',
        attendees: {
          create: [
            {
              email: 'client@example.com',
              name: 'Jane Doe',
              phoneNumber: '+1-555-0123',
              status: 'CONFIRMED',
            },
          ],
        },
      },
      include: {
        attendees: true,
      },
    });

    console.log(`✅ Created sample booking: ${sampleBooking.id}`);
  }

  console.log('🎉 Database seeding completed!');
  console.log('');
  console.log('🔐 Test Credentials:');
  console.log(`Email: ${testUser.email}`);
  console.log('Password: password123');
  console.log('');
  console.log(`🏢 Organization: ${testOrg.name} (${testOrg.slug})`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
