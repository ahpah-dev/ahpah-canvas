export class GatewayServiceError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayServiceError";
    this.status = status;
  }
}

/** Compatible gateways can return an HTTP-style error inside a successful SSE/JSON response. */
export function gatewayErrorStatus(error: unknown, fallback = 502): number {
  const item = error && typeof error === 'object' ? error as { status?: unknown; status_code?: unknown; code?: unknown; type?: unknown; message?: unknown } : {};
  for (const value of [item.status, item.status_code, item.code]) {
    const status = Number(value);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  const code = `${item.code || ''} ${item.type || ''}`.toLowerCase();
  if (/invalid_api_key|authentication_error|unauthorized|missing_api_key/.test(code)) return 401;
  if (/permission_denied|permission_error|access_denied|forbidden/.test(code)) return 403;
  if (/insufficient_quota|insufficient_balance|payment_required/.test(code)) return 402;
  if (/rate_limit|quota_exceeded|too_many_requests/.test(code)) return 429;
  if (/model_not_found|not_found/.test(code)) return 404;
  if (/invalid_request|bad_request/.test(code)) return 400;
  const message = typeof error === 'string' ? error : typeof item.message === 'string' ? item.message : '';
  if (/(?:invalid|incorrect|missing|expired|revoked)\s+(?:gateway\s+)?(?:api[ _-]?key|access token)|unauthori[sz]ed|authentication (?:failed|required)|no active credentials/i.test(message)) return 401;
  if (/permission denied|access denied|forbidden/i.test(message)) return 403;
  if (/insufficient (?:balance|credits|quota)|payment required/i.test(message)) return 402;
  if (/rate[ _-]?limit|too many requests|quota exceeded/i.test(message)) return 429;
  return fallback;
}

export class EmptyCompletionError extends Error {
  model: string;
  reason?: 'token_limit';
  constructor(message: string, model: string, reason?: 'token_limit') {
    super(message);
    this.name = "EmptyCompletionError";
    this.model = model;
    this.reason = reason;
  }
}

export class NoAnswerError extends Error {
  constructor(model: string) {
    super(`${model} did not start an answer in time.`);
    this.name = "NoAnswerError";
  }
}
