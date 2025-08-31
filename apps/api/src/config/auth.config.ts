export const authConfig = () => {
  // Validate critical secrets exist
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  
  if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET.length < 32) {
    throw new Error('REFRESH_TOKEN_SECRET must be at least 32 characters long');
  }
  
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 32) {
    console.log('DEBUG Docker: ENCRYPTION_KEY value:', JSON.stringify(process.env.ENCRYPTION_KEY));
    console.log('DEBUG Docker: ENCRYPTION_KEY length:', process.env.ENCRYPTION_KEY?.length);
    console.log('DEBUG Docker: All ENCRYPTION env vars:', Object.keys(process.env).filter(k => k.includes('ENCRYPTION')));
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
  }

  return {
    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m', // Shortened from 7d to 15m for security
      refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
      refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d', // Shortened from 30d to 7d
      encryptionKey: process.env.ENCRYPTION_KEY,
    },
    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      },
    },
  };
};
