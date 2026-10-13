import { expect, inject, it } from "vitest";
import { WebSocket } from "ws";

// Crit 9: a change one person makes appears in every other open session
// within about a second, with no reload. Here the change is a door's
// occupied/vacant state, seen by two sessions at once.
const baseUrl = inject("baseUrl");

type Door = { occupied: boolean; opensAt: number | null };
type Msg = { type: string; doors?: Door[]; you?: number | null; door?: number; kind?: string };

function session(): Promise<{ ws: WebSocket; next: (pred: (m: Msg) => boolean) => Promise<Msg>; first: Msg }> {
  const url = new URL("/live", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("id", `spec-${crypto.randomUUID()}`);
  const ws = new WebSocket(url);
  const inbox: Msg[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(String(raw)));
    waiters.splice(0).forEach((w) => w());
  });

  // resolves with the first message (from now on) matching pred, or fails
  // after a second, which is the spec's bound
  const next = (pred: (m: Msg) => boolean) =>
    new Promise<Msg>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("no matching update within 1s")), 1000);
      const look = () => {
        const i = inbox.findIndex(pred);
        if (i === -1) return void waiters.push(look);
        clearTimeout(timeout);
        resolve(inbox.splice(0, i + 1)[i]);
      };
      look();
    });

  return next((m) => m.type === "doors").then((first) => ({ ws, next, first }));
}

it("a door one session takes shows as occupied in another within a second", async () => {
  const a = await session();
  const b = await session();
  try {
    const door = a.first.doors!.findIndex((d) => !d.occupied);
    expect(door, "every stall is occupied, so there's nothing to test with").not.toBe(-1);

    a.ws.send(JSON.stringify({ type: "enter", door }));
    await b.next((m) => m.type === "doors" && m.doors![door].occupied);

    // the second person to push the same door is turned away
    b.ws.send(JSON.stringify({ type: "enter", door }));
    await b.next((m) => m.type === "denied" && m.door === door);

    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);
  } finally {
    a.ws.close();
    b.ws.close();
  }
});

it("a noise made inside a stall reaches the corridor within a second", async () => {
  const a = await session();
  const b = await session();
  try {
    const door = a.first.doors!.findIndex((d) => !d.occupied);
    expect(door, "every stall is occupied, so there's nothing to test with").not.toBe(-1);

    // only someone in a stall can make one
    b.ws.send(JSON.stringify({ type: "noise", kind: "piss" }));
    await expect(a.next((m) => m.type === "noise")).rejects.toThrow();

    a.ws.send(JSON.stringify({ type: "enter", door }));
    await b.next((m) => m.type === "doors" && m.doors![door].occupied);
    a.ws.send(JSON.stringify({ type: "noise", kind: "piss" }));
    const heard = await b.next((m) => m.type === "noise");
    expect(heard.door).toBe(door);
    expect(heard.kind).toBe("piss");

    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);
  } finally {
    a.ws.close();
    b.ws.close();
  }
});
