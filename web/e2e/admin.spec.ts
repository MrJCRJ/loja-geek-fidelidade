/**
 * E2E smoke — GeekCentral admin login + tabs.
 * Uso (API rodando em :8787, web em :5173 ou STATIC_DIR):
 *   ADMIN_PASSWORD=... npx playwright test -c e2e/playwright.config.ts
 */
import { test, expect } from "playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:8787";
const password = process.env.ADMIN_PASSWORD || "admin123";

test.describe("GeekCentral admin", () => {
  test("login e abas principais", async ({ page }) => {
    await page.goto(`${baseURL}/admin`);
    await expect(page.getByRole("heading", { name: "GeekCentral" })).toBeVisible();
    await page.getByTestId("admin-password").fill(password);
    await page.getByTestId("admin-login").click();
    await expect(page.getByRole("tab", { name: "Feed VIP" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { name: "Novo VIP" })).toBeVisible();
    await page.getByRole("tab", { name: "Config" }).click();
    await expect(page.getByRole("heading", { name: "Backup SQLite" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pronto para loja (ops)" })).toBeVisible();
  });
});
