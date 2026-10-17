import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "../api";

vi.mock("../api", () => ({
  api: vi.fn(),
}));

import { api } from "../api";
import { sellCustomerTime } from "./sellTime";

const customer = { id: "c1", name: "Ana", level: "bronze", points: 0 } as Customer;

function opts(over: Partial<Parameters<typeof sellCustomerTime>[0]> = {}) {
  return {
    customer,
    payMethod: "pix" as const,
    input: { amountReais: 10 },
    askConfirm: vi.fn(async () => true),
    onError: vi.fn(),
    amountError: "Informe um valor",
    ...over,
  };
}

describe("sellCustomerTime", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue({ creditedSeconds: 3600 });
  });

  it("pede a forma de pagamento", async () => {
    const onError = vi.fn();
    const askConfirm = vi.fn(async () => true);
    const result = await sellCustomerTime(opts({ payMethod: "", onError, askConfirm }));
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith("Escolha Pix, cartão ou dinheiro");
    expect(askConfirm).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("usa a mensagem de valor vazio", async () => {
    const onError = vi.fn();
    const result = await sellCustomerTime(
      opts({ input: { amountReais: 0 }, onError, amountError: "Informe um valor em reais" }),
    );
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith("Informe um valor em reais");
    expect(api).not.toHaveBeenCalled();
  });

  it("não vende se a confirmação for cancelada", async () => {
    const askConfirm = vi.fn(async () => false);
    const result = await sellCustomerTime(opts({ askConfirm }));
    expect(result).toBeNull();
    expect(askConfirm).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("confirma e credita com a forma escolhida", async () => {
    const result = await sellCustomerTime(opts());
    expect(result).toEqual({ creditedSeconds: 3600 });
    expect(api).toHaveBeenCalledWith("/api/customers/c1/time/sale", {
      method: "POST",
      body: JSON.stringify({ amountReais: 10, paymentMethod: "pix" }),
    });
  });
});
