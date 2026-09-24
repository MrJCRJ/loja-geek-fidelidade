import { afterEach, describe, expect, it } from "vitest";
import {
  isLanPairAllowed,
  isOnStoreNetwork,
  sameIpv4Slash24,
  setCentralLanIpsForTest,
  setStorePublicIpForTest,
} from "../src/store-network.js";
import { HOME_HOST, PUBLIC_API_HOST, SHOP_HOST, SHOP_PUBLIC_HOST } from "../src/request-scope.js";

function req(opts: { host?: string; cf?: string; ip?: string; xff?: string }) {
  return {
    ip: opts.ip || "127.0.0.1",
    headers: {
      host: opts.host,
      "cf-connecting-ip": opts.cf,
      "x-forwarded-for": opts.xff,
    },
  };
}

describe("Rede da loja (funcionário)", () => {
  afterEach(() => {
    setStorePublicIpForTest(null);
    setCentralLanIpsForTest(null);
  });

  it("mesma /24 conta como mesma rede", () => {
    expect(sameIpv4Slash24("192.168.3.70", "192.168.3.251")).toBe(true);
    expect(sameIpv4Slash24("192.168.3.70", "192.168.1.10")).toBe(false);
  });

  it("IP da LAN ou geek.local é a loja", () => {
    expect(isOnStoreNetwork(req({ host: "192.168.3.70" }))).toBe(true);
    expect(isOnStoreNetwork(req({ host: SHOP_HOST }))).toBe(true);
  });

  it("loja.geekloja via túnel: 127.0.0.1 não engana", () => {
    setStorePublicIpForTest("203.0.113.10");
    expect(isOnStoreNetwork(req({ host: SHOP_PUBLIC_HOST, ip: "127.0.0.1" }))).toBe(false);
  });

  it("mesmo IP público da Central (Wi‑Fi da loja + túnel) libera", () => {
    setStorePublicIpForTest("203.0.113.10");
    expect(
      isOnStoreNetwork(req({ host: SHOP_PUBLIC_HOST, cf: "203.0.113.10", ip: "127.0.0.1" })),
    ).toBe(true);
  });

  it("outro IP público (casa) bloqueia no host da loja", () => {
    setStorePublicIpForTest("203.0.113.10");
    expect(
      isOnStoreNetwork(req({ host: HOME_HOST, cf: "198.51.100.20", ip: "127.0.0.1" })),
    ).toBe(false);
  });

  it("CF-Connecting-IP na mesma /24 da LAN também vale", () => {
    setCentralLanIpsForTest(["192.168.3.70"]);
    expect(
      isOnStoreNetwork(req({ host: SHOP_PUBLIC_HOST, cf: "192.168.3.80", ip: "127.0.0.1" })),
    ).toBe(true);
  });
});

describe("Pareamento LAN", () => {
  it("IP da loja ou localhost libera", () => {
    expect(isLanPairAllowed(req({ host: "192.168.3.70" }))).toBe(true);
    expect(isLanPairAllowed(req({ host: "localhost" }))).toBe(true);
  });

  it("túnel / casa / API pública bloqueia", () => {
    expect(isLanPairAllowed(req({ host: HOME_HOST }))).toBe(false);
    expect(isLanPairAllowed(req({ host: SHOP_PUBLIC_HOST }))).toBe(false);
    expect(isLanPairAllowed(req({ host: PUBLIC_API_HOST }))).toBe(false);
  });
});
