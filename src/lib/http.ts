import { logger } from "./logger";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Label used in logs instead of the full URL (URLs may contain keys). */
  label?: string;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + JSON with timeout, bounded retries with exponential backoff + jitter,
 * and Retry-After handling for 429/418/5xx.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`${opts.label ?? "request"}: invalid JSON response`, null, false);
  }
}

export async function fetchText(url: string, opts: FetchJsonOptions = {}): Promise<string> {
  const { timeoutMs = 10_000, retries = 2, headers = {}, label = new URL(url).host } = opts;
  const f = opts.fetchImpl ?? fetch;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(url, {
        headers: { accept: "application/json, text/xml;q=0.9, */*;q=0.8", "user-agent": "CryptoPilotAI/0.1 (personal analysis app)", ...headers },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const retryable = res.status === 429 || res.status === 418 || res.status >= 500;
        throw new HttpError(
          `${label}: HTTP ${res.status}`,
          res.status,
          retryable,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        );
      }
      return await res.text();
    } catch (e) {
      lastErr =
        e instanceof HttpError
          ? e
          : new HttpError(
              `${label}: ${e instanceof Error && e.name === "AbortError" ? `timeout after ${timeoutMs}ms` : e instanceof Error ? e.message : "network error"}`,
              null,
              true,
            );
      const he = lastErr as HttpError;
      if (!he.retryable || attempt === retries) break;
      const backoff = he.retryAfterMs ?? Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
      logger.debug("http retry", { label, attempt: attempt + 1, backoffMs: Math.round(backoff), error: he.message });
      await sleep(Math.min(backoff, 15_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Simple serial rate limiter: ensures at least `minIntervalMs` between calls. */
export function createRateLimiter(minIntervalMs: number) {
  let next = 0;
  let chain: Promise<void> = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + minIntervalMs;
    });
    chain = run.catch(() => undefined);
    return run.then(fn);
  };
}
