const { PrismaClient } = require('@prisma/client');

async function checkAdminUser() {
  const prisma = new PrismaClient();
  
  try {
    const adminUsers = await prisma.user.findMany({
      where: { email: 'admin@example.com' },
      select: { 
        id: true, 
        email: true, 
        systemRole: true,
        firstName: true,
        lastName: true
      }
    });
    
    console.log('Admin users:', JSON.stringify(adminUsers, null, 2));
    
    if (adminUsers.length > 0 && adminUsers[0].systemRole !== 'SUPER_ADMIN') {
      console.log('Updating admin user to SUPER_ADMIN...');
      const updatedUser = await prisma.user.update({
        where: { email: 'admin@example.com' },
        data: { systemRole: 'SUPER_ADMIN' },
        select: { id: true, email: true, systemRole: true }
      });
      console.log('Updated admin user:', JSON.stringify(updatedUser, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUser();
