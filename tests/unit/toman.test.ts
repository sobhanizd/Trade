import { describe, expect, it } from "vitest";
import { formatToman } from "@/components/toman/context";
import { parseTomanInput } from "@/components/toman/rate-box";
import { DEFAULT_TOMAN_PER_EUR, parseSettings } from "@/lib/settings/schema";

describe("toman", () => {
  it("parses Latin and Persian digits with separators", () => {
    expect(parseTomanInput("292,600")).toBe(292600);
    expect(parseTomanInput("۲۹۲٬۶۰۰")).toBe(292600);
    expect(parseTomanInput(" 292600 ")).toBe(292600);
    expect(parseTomanInput("abc")).toBeNull();
    expect(parseTomanInput("0")).toBeNull();
  });
  it("formats small, medium and huge amounts readably", () => {
    expect(formatToman(52668.4, "en")).toBe("52,668 Toman");
    expect(formatToman(29_260_456, "fa")).toBe("29,260,000 تومان");
    expect(formatToman(21_728_964_000, "fa")).toBe("21.73 میلیارد تومان");
    expect(formatToman(21_728_964_000, "en")).toBe("21.73 billion Toman");
  });
  it("starts at 300,000 Toman per euro until the user enters a rate", () => {
    expect(DEFAULT_TOMAN_PER_EUR).toBe(300_000);
    expect(parseSettings({}).toman).toEqual({ show: true, perEur: 300_000, updatedAt: null });
    // Older saved settings without a rate also get the starting value.
    expect(parseSettings({ toman: { show: true, perEur: null, updatedAt: null } }).toman.perEur).toBe(300_000);
    // A rate the user entered is kept.
    expect(parseSettings({ toman: { show: true, perEur: 295_600, updatedAt: "2026-10-14T12:30:14.123Z" } }).toman.perEur).toBe(295_600);
  });
});
