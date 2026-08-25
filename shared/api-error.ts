export type ApiErrorExtras = {
  tip?: string;
  code?: string;
  timeBalanceSeconds?: number;
};

export class ApiError extends Error {
  tip?: string;
  code?: string;
  timeBalanceSeconds?: number;

  constructor(message: string, extras?: ApiErrorExtras) {
    super(message);
    this.name = "ApiError";
    this.tip = extras?.tip;
    this.code = extras?.code;
    this.timeBalanceSeconds = extras?.timeBalanceSeconds;
  }
}
