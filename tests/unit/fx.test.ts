import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
import { convertRow, fxFrom } from "@/lib/fx";
import { fmtBig, fmtMoney, fmtPrice } from "@/lib/format";
import { defaultSettings } from "@/lib/settings/schema";
import type { MarketRow } from "@/lib/market/types";

const strip = (s: string) => s.replace(/[⁦-⁩]/g, "");
const with_ = (patch: Partial<ReturnType<typeof defaultSettings>>) => ({ ...defaultSettings(), ...patch });

describe("display currency", () => {
  it("EUR uses the automatic rate unless the user typed one", () => {
    expect(fxFrom(with_({ displayCurrency: "EUR" }), 0.9).rate).toBeCloseTo(0.9);
    const manual = fxFrom(with_({ displayCurrency: "EUR", fxManual: { usdPerEur: 1.25, updatedAt: null } }), 0.9);
    expect(manual.rate).toBeCloseTo(0.8);
    expect(manual.manual).toBe(true);
  });
  it("Toman = USD × EUR rate × Toman per euro", () => {
    const fx = fxFrom(with_({ displayCurrency: "IRT", toman: { show: true, perEur: 292_600, updatedAt: null } }), 0.9);
    expect(fx.currency).toBe("IRT");
    expect(fx.rate).toBeCloseTo(0.9 * 292_600);
  });
  it("falls back to euro, then dollar, when a rate is missing", () => {
    expect(fxFrom(with_({ displayCurrency: "IRT" }), 0.9).currency).toBe("EUR");
    expect(fxFrom(with_({ displayCurrency: "IRT" }), null).currency).toBe("USD");
    expect(fxFrom(with_({ displayCurrency: "EUR" }), null)).toMatchObject({ currency: "USD", rate: 1 });
  });
  it("converts money fields of a market row but not percentages", () => {
    const row = { price: 100, marketCap: 1000, volume24h: 10, high24h: 110, low24h: 90, change24h: 5 } as MarketRow;
    expect(convertRow(row, 2)).toMatchObject({ price: 200, marketCap: 2000, volume24h: 20, high24h: 220, low24h: 180, change24h: 5 });
  });
  it("formats Toman as whole numbers with the Persian word", () => {
    expect(strip(fmtPrice(21_712_345_678.4, "IRT"))).toBe("21,712,345,678 تومان");
    expect(strip(fmtMoney(-1500.6, "IRT"))).toBe("-1,501 تومان");
    expect(strip(fmtBig(4.36e17, "IRT"))).toBe("436,000 هزار میلیارد تومان");
    expect(strip(fmtBig(2.5e9, "IRT"))).toBe("2.5 میلیارد تومان");
    expect(fmtPrice(1.5, "EUR")).toBe("€1.50");
  });
});
