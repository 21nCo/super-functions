/**
 * Error classes for the HTTP abstraction layer
 */

export class RouterError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'RouterError';
    Object.setPrototypeOf(this, RouterError.prototype);
  }

  toResponse(): Response {
    return Response.json(
      {
        error: this.message,
        code: this.code,
      },
      { status: this.statusCode }
    );
  }
}

export class BadRequestError extends RouterError {
  constructor(message: string = 'Bad Request', code?: string) {
    super(message, 400, code);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends RouterError {
  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, 401, code);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends RouterError {
  constructor(message: string = 'Forbidden', code?: string) {
    super(message, 403, code);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends RouterError {
  constructor(message: string = 'Not Found', code?: string) {
    super(message, 404, code);
    this.name = 'NotFoundError';
  }
}

export class MethodNotAllowedError extends RouterError {
  constructor(message: string = 'Method Not Allowed', code?: string) {
    super(message, 405, code);
    this.name = 'MethodNotAllowedError';
  }
}

export class ConflictError extends RouterError {
  constructor(message: string = 'Conflict', code?: string) {
    super(message, 409, code);
    this.name = 'ConflictError';
  }
}

export class UnprocessableEntityError extends RouterError {
  constructor(message: string = 'Unprocessable Entity', code?: string) {
    super(message, 422, code);
    this.name = 'UnprocessableEntityError';
  }
}

export class PayloadTooLargeError extends RouterError {
  constructor(message: string = 'Payload Too Large', code?: string) {
    super(message, 413, code);
    this.name = 'PayloadTooLargeError';
  }
}

export class TooManyRequestsError extends RouterError {
  constructor(message: string = 'Too Many Requests', code?: string) {
    super(message, 429, code);
    this.name = 'TooManyRequestsError';
  }
}

export class InternalServerError extends RouterError {
  constructor(message: string = 'Internal Server Error', code?: string) {
    super(message, 500, code);
    this.name = 'InternalServerError';
  }
}

export class NotImplementedError extends RouterError {
  constructor(message: string = 'Not Implemented', code?: string) {
    super(message, 501, code);
    this.name = 'NotImplementedError';
  }
}

export class ServiceUnavailableError extends RouterError {
  constructor(message: string = 'Service Unavailable', code?: string) {
    super(message, 503, code);
    this.name = 'ServiceUnavailableError';
  }
}
