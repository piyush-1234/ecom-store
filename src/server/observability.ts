/**
 * Error reporting.
 *
 * Deliberately dependency-free and provider-agnostic: errors are always emitted as
 * structured JSON on stderr, and optionally POSTed to `ERROR_WEBHOOK_URL` (which can
 * be a Sentry tunnel, a Slack relay, or an internal collector).
 *
 * Rules:
 *  - reporting must never throw, or it becomes a second failure
 *  - secrets and request bodies are never included
 */

export interface ErrorContext {
  route?: string;
  code?: string;
  userId?: string;
  adminId?: string;
  meta?: Record<string, string | number | boolean>;
}

interface ErrorPayload {
  level: 'error';
  timestamp: string;
  name: string;
  message: string;
  stack?: string;
  route?: string;
  code?: string;
  userId?: string;
  adminId?: string;
  meta?: Record<string, string | number | boolean>;
  environment: string;
}

function toPayload(error: unknown, context: ErrorContext): ErrorPayload {
  const isError = error instanceof Error;

  return {
    level: 'error',
    timestamp: new Date().toISOString(),
    name: isError ? error.name : 'NonErrorThrown',
    message: isError ? error.message : String(error),
    ...(isError && error.stack ? { stack: error.stack } : {}),
    ...(context.route ? { route: context.route } : {}),
    ...(context.code ? { code: context.code } : {}),
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.adminId ? { adminId: context.adminId } : {}),
    ...(context.meta ? { meta: context.meta } : {}),
    environment: process.env.NODE_ENV ?? 'development',
  };
}

/** Fire-and-forget: callers must not await this on a request path. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = toPayload(error, context);

  try {
    console.error(JSON.stringify(payload));
  } catch {
    // A broken logger must not break the request.
  }

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook) return;

  void fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    // Keep it short; a hanging sink must not hold a socket open for long.
    signal: AbortSignal.timeout(3_000),
  }).catch(() => {
    /* intentional: never surface reporting failures */
  });
}
