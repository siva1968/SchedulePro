export class ApplicationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    if (details) {
      this.message += ` Details: ${JSON.stringify(details)}`;
    }
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string = 'Access forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends ApplicationError {
  constructor(message: string = 'Too many requests') {
    super(message, 'TOO_MANY_REQUESTS', 429);
    this.name = 'TooManyRequestsError';
  }
}

// Specific domain errors
export class BookingNotFoundError extends NotFoundError {
  constructor(bookingId: string) {
    super('Booking', bookingId);
    this.name = 'BookingNotFoundError';
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super('User', identifier);
    this.name = 'UserNotFoundError';
  }
}

export class MeetingTypeNotFoundError extends NotFoundError {
  constructor(meetingTypeId: string) {
    super('Meeting Type', meetingTypeId);
    this.name = 'MeetingTypeNotFoundError';
  }
}

export class TimeSlotUnavailableError extends ConflictError {
  constructor(startTime: string, endTime: string) {
    super(`Time slot from ${startTime} to ${endTime} is not available`);
    this.name = 'TimeSlotUnavailableError';
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class EmailAlreadyExistsError extends ConflictError {
  constructor(email: string) {
    super(`User with email '${email}' already exists`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class CalendarIntegrationError extends ApplicationError {
  constructor(message: string, provider?: string) {
    const fullMessage = provider 
      ? `Calendar integration error (${provider}): ${message}`
      : `Calendar integration error: ${message}`;
    super(fullMessage, 'CALENDAR_INTEGRATION_ERROR', 502);
    this.name = 'CalendarIntegrationError';
  }
}

export class EmailServiceError extends ApplicationError {
  constructor(message: string) {
    super(`Email service error: ${message}`, 'EMAIL_SERVICE_ERROR', 502);
    this.name = 'EmailServiceError';
  }
}
