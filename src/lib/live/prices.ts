"use client";
/**
 * Live prices in the browser from Binance's PUBLIC market-data WebSocket
 * (miniTicker: last price + 24h open). No account or key. One shared socket for
 * the whole page; streams are added with SUBSCRIBE; automatic reconnect with
 * backoff and a mirror host fallback.
 */
export interface Tick {
  symbol: string; // e.g. BTCUSDT
  price: number;
  open24h: number;
  change24hPct: number;
  at: number;
}
type Listener = (t: Tick) => void;
type StatusListener = (s: LiveStatus) => void;
export type LiveStatus = "connecting" | "live" | "offline";

const HOSTS = ["wss://stream.binance.com:9443/ws", "wss://data-stream.binance.vision/ws"];

class LiveFeed {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<StatusListener>();
  private last = new Map<string, Tick>();
  private status: LiveStatus = "connecting";
  private attempt = 0;
  private hostIdx = 0;
  private reqId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  subscribe(symbol: string, fn: Listener): () => void {
    const key = symbol.toUpperCase();
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
      this.send("SUBSCRIBE", [key]);
    }
    set.add(fn);
    const cached = this.last.get(key);
    if (cached) fn(cached);
    this.ensure();
    return () => {
      set!.delete(fn);
      if (set!.size === 0) {
        this.listeners.delete(key);
        this.send("UNSUBSCRIBE", [key]);
      }
    };
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: LiveStatus) {
    this.status = s;
    for (const f of this.statusListeners) f(s);
  }

  private send(method: "SUBSCRIBE" | "UNSUBSCRIBE", symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN && symbols.length) {
      this.ws.send(JSON.stringify({ method, params: symbols.map((s) => `${s.toLowerCase()}@miniTicker`), id: this.reqId++ }));
    }
  }

  private ensure() {
    if (this.ws || typeof window === "undefined" || this.listeners.size === 0) return;
    this.setStatus("connecting");
    const ws = new WebSocket(HOSTS[this.hostIdx]);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.send("SUBSCRIBE", [...this.listeners.keys()]);
    };
    ws.onmessage = (ev) => {
      let d: { e?: string; s?: string; c?: string; o?: string; E?: number };
      try {
        d = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (d.e !== "24hrMiniTicker" || !d.s) return;
      const price = Number(d.c);
      const open = Number(d.o);
      if (!(price > 0)) return;
      const tick: Tick = { symbol: d.s, price, open24h: open, change24hPct: open > 0 ? ((price - open) / open) * 100 : 0, at: d.E ?? Date.now() };
      this.last.set(d.s, tick);
      if (this.status !== "live") this.setStatus("live");
      this.listeners.get(d.s)?.forEach((f) => f(tick));
    };
    ws.onclose = () => {
      this.ws = null;
      this.setStatus("offline");
      if (this.listeners.size === 0) return;
      this.attempt++;
      if (this.attempt % 2 === 0) this.hostIdx = (this.hostIdx + 1) % HOSTS.length;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt, 5));
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.ensure(), delay);
    };
    ws.onerror = () => ws.close();
  }
}

let feed: LiveFeed | null = null;
export function liveFeed(): LiveFeed {
  if (!feed) feed = new LiveFeed();
  return feed;
}
