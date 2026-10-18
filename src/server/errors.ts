import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { reportError } from '@/server/observability';

/**
 * Typed application errors.
 *
 * Services throw `AppError`; the HTTP layer maps it to a status + safe message.
 * Anything that is *not* an AppError is treated as an unexpected failure and its
 * details are never sent to the client (they are logged instead), so a Prisma or
 * stack-trace leak is impossible by construction.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'PHONE_TAKEN'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_OTP'
  | 'OTP_EXPIRED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Field-level validation failure, shaped for easy form binding on the client. */
export class ValidationError extends AppError {
  constructor(error: ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    super('VALIDATION_ERROR', 'Please check the highlighted fields.', 422, { fields });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/**
 * Convert any thrown value into a JSON NextResponse.
 * Unexpected errors are logged with full detail but returned as a generic 500.
 */
export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (isAppError(error)) {
    if (error.status >= 500) {
      reportError(error, { code: error.code });
    }
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  // Unexpected: report with full detail, return something safe.
  reportError(error, { code: 'INTERNAL' });
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}
