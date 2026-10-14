"use client";
/** Same-origin JSON fetch with consistent error messages. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error(typeof navigator !== "undefined" && !navigator.onLine ? "You appear to be offline." : "Network error — please try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  // Expired session → back to login (but not for the login call itself, whose 401 means "wrong password").
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload deliberately clears client state after sign-out
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, data });
  return data as T;
}
