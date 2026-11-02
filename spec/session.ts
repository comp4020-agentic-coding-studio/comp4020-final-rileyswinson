import { inject } from "vitest";
import { WebSocket } from "ws";

// One person's open window on the app, talking to the running server over
// /live, as the browser does. Shared by every spec file that needs one.
const baseUrl = inject("baseUrl");

export type Door = { occupied: boolean; opensAt: number | null };
type Bowl = { piss: number; poops: unknown[] };
type Stroke = { k: string; c: string; w: number; p: number[] };
type Wad = { id: string; left: number };
type Stuck = { id: string; u: number; v: number; r: number; s?: number };
export type Msg = {
  type: string;
  doors?: Door[];
  you?: number | null;
  door?: number;
  kind?: string;
  bowl?: Bowl | null;
  face?: string;
  stroke?: Stroke;
  marks?: Record<string, (Stroke | Stuck)[]>;
  id?: string | null;
  png?: string;
  pile?: Wad[];
  pocket?: Record<string, number>;
  stickers?: Record<string, string>;
  outside?: Stuck[][];
  sticker?: Stuck;
};

export type Session = { ws: WebSocket; id: string; seen: Msg[]; next: (pred: (m: Msg) => boolean) => Promise<Msg>; first: Msg };

export function session(): Promise<Session> {
  const url = new URL("/live", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const id = `spec-${crypto.randomUUID()}`;
  url.searchParams.set("id", id);
  const ws = new WebSocket(url);
  const inbox: Msg[] = [];
  // everything this window has ever been sent, for checks on what it was told
  const seen: Msg[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    inbox.push(msg);
    seen.push(msg);
    waiters.splice(0).forEach((w) => w());
  });

  // resolves with the first message (from now on) matching pred, or fails
  // after a second, which is the spec's bound
  const next = (pred: (m: Msg) => boolean) =>
    new Promise<Msg>((resolve, reject) => {
      // a wait that has given up must stop looking, or it takes the next
      // matching message out of the inbox from under whoever waits for it later
      let waiting = true;
      const timeout = setTimeout(() => {
        waiting = false;
        reject(new Error("no matching update within 1s"));
      }, 1000);
      const look = () => {
        if (!waiting) return;
        const i = inbox.findIndex(pred);
        if (i === -1) return void waiters.push(look);
        clearTimeout(timeout);
        resolve(inbox.splice(0, i + 1)[i]);
      };
      look();
    });

  return next((m) => m.type === "doors").then((first) => ({ ws, id, seen, next, first }));
}
