import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AzureADStrategy extends PassportStrategy(Strategy, 'azure-ad') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get('MICROSOFT_CLIENT_ID'),
      clientSecret: configService.get('MICROSOFT_CLIENT_SECRET'),
      callbackURL: `${configService.get('API_URL')}/api/v1/auth/azure/callback`,
      scope: ['user.read'],
      tenant: 'common', // Use 'common' to allow any Azure AD tenant
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    // Extract user information from Azure AD profile
    const user = {
      azureId: profile.id,
      email: profile.emails?.[0]?.value || profile.userPrincipalName,
      firstName: profile.name?.givenName || profile.givenName,
      lastName: profile.name?.familyName || profile.surname,
      displayName: profile.displayName,
      accessToken,
      refreshToken,
      provider: 'azure-ad',
    };

    return user;
  }
}
