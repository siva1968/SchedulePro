const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function updatePassword() {
  try {
    console.log('Updating password for prasad.m@lsnsoft.com...');
    
    // Hash your original password
    const hashedPassword = await bcrypt.hash('Sita@1968@manu', 10);
    console.log('Generated hash for original password');
    
    // Update the user
    const updatedUser = await prisma.user.update({
      where: { email: 'prasad.m@lsnsoft.com' },
      data: { passwordHash: hashedPassword },
      select: { email: true }
    });
    
    console.log('Updated user:', updatedUser);
    
    // Verify the password works
    const user = await prisma.user.findUnique({
      where: { email: 'prasad.m@lsnsoft.com' },
      select: { passwordHash: true }
    });
    
    const isValid = await bcrypt.compare('Sita@1968@manu', user.passwordHash);
    console.log('Password verification:', isValid);
    
    if (isValid) {
      console.log('✅ Your original password has been restored successfully!');
      console.log('You can now login with: prasad.m@lsnsoft.com / Sita@1968@manu');
    } else {
      console.log('❌ Password verification failed');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updatePassword();
