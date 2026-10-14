/** Recognisable icon glyph + brand-like color per coin (purely decorative; the symbol is always shown as text too). */
const STYLE: Record<string, { glyph: string; bg: string }> = {
  BTC: { glyph: "₿", bg: "linear-gradient(135deg,#f7931a,#ffc246)" },
  ETH: { glyph: "Ξ", bg: "#627eea" },
  BNB: { glyph: "⬡", bg: "#f0b90b" },
  SOL: { glyph: "◎", bg: "#9945ff" },
  XLM: { glyph: "✦", bg: "linear-gradient(135deg,#2a2a3d,#5c5c7a)" },
  ADA: { glyph: "₳", bg: "#0033ad" },
  LTC: { glyph: "Ł", bg: "#345d9d" },
  TRX: { glyph: "◆", bg: "#eb0029" },
  XRP: { glyph: "✕", bg: "#23292f" },
  DOGE: { glyph: "Ð", bg: "#c2a633" },
  PAXG: { glyph: "Au", bg: "linear-gradient(135deg,#b8860b,#ffd76a)" },
  XAUT: { glyph: "Au", bg: "linear-gradient(135deg,#b8860b,#ffd76a)" },
};

export function coinStyle(symbol: string) {
  return STYLE[symbol] ?? { glyph: symbol.slice(0, 1), bg: "#7b4dff" };
}
