import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UserService } from './user/user.service';
import * as bcrypt from 'bcrypt';

async function updateUserPassword() {
  const app = await NestFactory.create(AppModule);
  const userService = app.get(UserService);
  
  try {
    const hash = await bcrypt.hash('Sita@1968@manu', 12);
    console.log('Generated hash:', hash);
    
    // Update user password directly
    const user = await userService.findByEmail('smasina@gmail.com');
    if (user) {
      user.passwordHash = hash;
      await userService.update(user.id, { passwordHash: hash });
      console.log('Password updated successfully');
      
      // Verify
      const updatedUser = await userService.findByEmail('smasina@gmail.com');
      const isValid = await bcrypt.compare('Sita@1968@manu', updatedUser.passwordHash);
      console.log('Password verification:', isValid);
    } else {
      console.log('User not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await app.close();
  }
}

updateUserPassword();
