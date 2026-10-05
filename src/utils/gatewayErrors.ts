export class GatewayServiceError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayServiceError";
    this.status = status;
  }
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
