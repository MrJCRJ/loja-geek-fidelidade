export type ApiErrorExtras = {
  tip?: string;
  code?: string;
  timeBalanceSeconds?: number;
  customerName?: string;
  customerId?: string;
};

export class ApiError extends Error {
  tip?: string;
  code?: string;
  timeBalanceSeconds?: number;
  customerName?: string;
  customerId?: string;

  constructor(message: string, extras?: ApiErrorExtras) {
    super(message);
    this.name = "ApiError";
    this.tip = extras?.tip;
    this.code = extras?.code;
    this.timeBalanceSeconds = extras?.timeBalanceSeconds;
    this.customerName = extras?.customerName;
    this.customerId = extras?.customerId;
  }
}
