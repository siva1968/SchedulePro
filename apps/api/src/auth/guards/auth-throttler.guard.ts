import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): string {
    // Use IP address + endpoint for tracking
    return `${req.ip}-${req.route?.path || req.url}`;
  }

  protected generateKey(context: ExecutionContext, tracker: string): string {
    const request = context.switchToHttp().getRequest();
    const endpoint = request.route?.path || request.url;
    
    // Different rate limits for different auth endpoints
    if (endpoint.includes('login')) {
      return `auth-login-${tracker}`;
    } else if (endpoint.includes('register')) {
      return `auth-register-${tracker}`;
    } else if (endpoint.includes('forgot-password')) {
      return `auth-forgot-${tracker}`;
    } else if (endpoint.includes('reset-password')) {
      return `auth-reset-${tracker}`;
    }
    
    return `auth-general-${tracker}`;
  }
}
