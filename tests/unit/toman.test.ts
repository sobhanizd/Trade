import { describe, expect, it } from "vitest";
import { formatToman } from "@/components/toman/context";
import { parseTomanInput } from "@/components/toman/rate-box";

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
});
