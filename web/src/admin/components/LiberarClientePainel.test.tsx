import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "../../api";

vi.mock("../../api", () => ({
  api: vi.fn(),
}));

import { api } from "../../api";
import { LiberarClientePainel } from "./LiberarClientePainel";

const semHora = { id: "c0", name: "Sem Hora", username: "sem", level: "bronze", points: 0, time_balance_seconds: 0 } as Customer;
const comHora = { id: "c1", name: "Ana", username: "ana", level: "bronze", points: 0, time_balance_seconds: 3600 } as Customer;

function renderPainel(over: Partial<Parameters<typeof LiberarClientePainel>[0]> = {}) {
  const props = {
    stationId: "pc-1",
    stationName: "PC-01",
    customers: [semHora, comHora],
    refresh: vi.fn(async () => undefined),
    onError: vi.fn(),
    onToast: vi.fn(),
    askConfirm: vi.fn(async () => true),
    onClose: vi.fn(),
    ...over,
  };
  render(<LiberarClientePainel {...props} />);
  return props;
}

describe("LiberarClientePainel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue({ ok: true });
  });

  it("pede um cliente antes de liberar", () => {
    const props = renderPainel();
    fireEvent.click(screen.getByRole("button", { name: "Liberar neste PC" }));
    expect(props.onError).toHaveBeenCalledWith("Escolha um cliente já cadastrado");
    expect(props.askConfirm).not.toHaveBeenCalled();
  });

  it("não libera conta sem hora", () => {
    const props = renderPainel();
    fireEvent.click(screen.getByRole("button", { name: /Sem Hora/ }));
    fireEvent.click(screen.getByRole("button", { name: "Liberar neste PC" }));
    expect(props.onError).toHaveBeenCalledWith("Esse cliente está sem hora. Venda no Caixa e depois libere aqui.");
    expect(props.askConfirm).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("não chama a API se a confirmação for cancelada", async () => {
    const props = renderPainel({ askConfirm: vi.fn(async () => false) });
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Liberar neste PC" }));
    await waitFor(() => expect(props.askConfirm).toHaveBeenCalled());
    expect(api).not.toHaveBeenCalled();
  });

  it("libera o PC com o saldo da conta", async () => {
    const props = renderPainel();
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Liberar neste PC" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/stations/pc-1/desk-liberar", {
      method: "POST",
      body: JSON.stringify({ mode: "balance", customerId: "c1", customerName: "Ana" }),
    }),
    );
    expect(props.onToast).toHaveBeenCalledWith("PC-01 liberado para Ana", "ok");
    expect(props.onClose).toHaveBeenCalled();
    expect(props.refresh).toHaveBeenCalled();
  });

  it("cancelar fecha o painel", () => {
    const props = renderPainel();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onClose).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });
});
