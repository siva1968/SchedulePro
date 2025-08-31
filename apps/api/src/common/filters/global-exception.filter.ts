import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApplicationError } from '../errors/application.errors';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;
    requestId?: string;
    details?: any;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const errorResponse = this.buildErrorResponse(exception, request);
    
    // Log the error
    this.logError(exception, request, errorResponse);
    
    // Send response
    response.status(errorResponse.error.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, request: Request): ErrorResponse {
    let statusCode: number;
    let message: string;
    let code: string;
    let details: any;

    if (exception instanceof ApplicationError) {
      // Our custom application errors
      statusCode = exception.statusCode;
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      // NestJS HTTP exceptions
      statusCode = exception.getStatus();
      message = exception.message;
      code = this.getCodeFromHttpStatus(statusCode);
      
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        details = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      // Generic errors
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : exception.message;
      code = 'INTERNAL_SERVER_ERROR';
    } else {
      // Unknown exceptions
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      code = 'UNKNOWN_ERROR';
    }

    return {
      success: false,
      error: {
        code,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'] as string,
        ...(details && { details }),
      },
    };
  }

  private logError(exception: unknown, request: Request, errorResponse: ErrorResponse): void {
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const userId = (request as any).user?.id || 'anonymous';
    
    const logContext = {
      method,
      url,
      ip,
      userAgent,
      userId,
      statusCode: errorResponse.error.statusCode,
      requestId: errorResponse.error.requestId,
    };

    if (errorResponse.error.statusCode >= 500) {
      // Server errors - log as error with full context
      this.logger.error(
        `${method} ${url} - ${errorResponse.error.message}`,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
    } else {
      // Client errors - log as warning
      this.logger.warn(
        `${method} ${url} - ${errorResponse.error.message}`,
        logContext,
      );
    }
  }

  private getCodeFromHttpStatus(status: number): string {
    const statusMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    
    return statusMap[status] || 'HTTP_ERROR';
  }
}
