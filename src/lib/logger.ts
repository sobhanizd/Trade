/**
 * Minimal structured JSON logger with secret redaction. Logs go to stdout so
 * the host (Docker, systemd, PaaS) can collect them.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|p256dh|auth$|private/i;
const SENSITIVE_VALUE = [
  /bot\d{6,}:[A-Za-z0-9_-]{20,}/g, // telegram bot token in URLs
  /sk-ant-[A-Za-z0-9_-]+/g, // anthropic keys
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") {
    let s = value;
    for (const re of SENSITIVE_VALUE) s = s.replace(re, "[redacted]");
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  }
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return order[lvl] ?? order.info;
}

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  if (process.env.NODE_ENV === "test" && !process.env.TEST_LOGS) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(ctx ? (redact(ctx) as object) : {}) });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, c?: Record<string, unknown>) => write("debug", m, { ...base, ...c }),
      info: (m: string, c?: Record<string, unknown>) => write("info", m, { ...base, ...c }),
      warn: (m: string, c?: Record<string, unknown>) => write("warn", m, { ...base, ...c }),
      error: (m: string, c?: Record<string, unknown>) => write("error", m, { ...base, ...c }),
    };
  },
};
