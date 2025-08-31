import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Generate or use existing request ID
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    
    // Add to request headers
    req.headers['x-request-id'] = requestId;
    
    // Add to response headers
    res.setHeader('x-request-id', requestId);
    
    next();
  }
}
