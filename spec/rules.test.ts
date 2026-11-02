import { describe, expect, inject, it } from "vitest";
import { type Session, session } from "./session.ts";

// The rules the stalls keep, whatever else changes. Each describe block is one
// of them; the README says why each one is there.
const baseUrl = inject("baseUrl");

// a stall nobody is in, or the test can't run
function freeDoor(s: Session, except: number[] = []): number {
  const door = s.first.doors!.findIndex((d, i) => !d.occupied && !except.includes(i));
  expect(door, "not enough empty stalls to test with").not.toBe(-1);
  return door;
}

async function goIn(s: Session, door: number) {
  s.ws.send(JSON.stringify({ type: "enter", door }));
  await s.next((m) => m.type === "stall" && m.door === door);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function closeAll(...all: Session[]) {
  for (const s of all) s.ws.send(JSON.stringify({ type: "leave" }));
  await pause(100);
  for (const s of all) s.ws.close();
}

describe("some sounds are heard by everyone, and the rest only by whoever makes them", () => {
  it("a sound from inside a stall reaches everyone else, in the corridor and in the other stalls", async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(a, door);
      await goIn(c, freeDoor(c, [door]));

      a.ws.send(JSON.stringify({ type: "noise", kind: "piss" }));
      for (const other of [b, c]) {
        const heard = await other.next((m) => m.type === "noise");
        expect(heard).toMatchObject({ door, kind: "piss" });
      }
      // whoever made it hears their own, played where they are, not the
      // corridor's muffled copy
      await expect(a.next((m) => m.type === "noise")).rejects.toThrow();
    } finally {
      await closeAll(a, b, c);
    }
  });

  it("a knock reaches everyone: the one inside, the one knocking, and everyone else", async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(a, door);
      await goIn(c, freeDoor(c, [door]));

      b.ws.send(JSON.stringify({ type: "knock", door }));
      for (const s of [a, b, c]) expect((await s.next((m) => m.type === "knock")).door).toBe(door);
    } finally {
      await closeAll(a, b, c);
    }
  });

  it("drawing, sticking and picking up stickers send nothing to anyone else", async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(c, freeDoor(c, [door]));
      await goIn(a, door);
      await pause(100);
      const [bHad, cHad] = [b.seen.length, c.seen.length];

      const x = Math.round(Math.random() * 1000) / 10;
      a.ws.send(JSON.stringify({ type: "stroke", face: "wall-left", stroke: { k: "pen", c: "#111111", w: 1.2, p: [x, 80, x + 10, 80] } }));
      a.ws.send(JSON.stringify({ type: "pile:take", id: "trash00001" }));
      await a.next((m) => m.type === "pocket" && m.pocket!.trash00001 === 1);
      a.ws.send(JSON.stringify({ type: "stick", face: "wall-left", sticker: { id: "trash00001", u: x, v: 90, r: 0 } }));
      await a.next((m) => m.type === "stuck");
      await pause(500);

      expect(b.seen.slice(bHad), "the corridor was told").toEqual([]);
      expect(c.seen.slice(cHad), "the next stall was told").toEqual([]);
    } finally {
      await closeAll(a, b, c);
    }
  });
});

describe("only one person is ever in a stall", () => {
  it("of two people pushing the same door at the same moment, exactly one gets in", async () => {
    const [a, b] = [await session(), await session()];
    try {
      const door = freeDoor(a);
      const answer = (s: Session) =>
        s.next((m) => (m.type === "stall" || m.type === "denied") && m.door === door).then((m) => m.type);
      const answers = Promise.all([answer(a), answer(b)]);
      a.ws.send(JSON.stringify({ type: "enter", door }));
      b.ws.send(JSON.stringify({ type: "enter", door }));
      expect((await answers).sort()).toEqual(["denied", "stall"]);
    } finally {
      await closeAll(a, b);
    }
  });

  it("someone in a stall can't hold a second one", async () => {
    const a = await session();
    try {
      const door = freeDoor(a);
      const other = freeDoor(a, [door]);
      await goIn(a, door);
      a.ws.send(JSON.stringify({ type: "enter", door: other }));
      await a.next((m) => m.type === "denied" && m.door === other);
      a.ws.send(JSON.stringify({ type: "leave" }));
      const after = await a.next((m) => m.type === "doors" && !m.doors![door].occupied);
      expect(after.doors![other].occupied).toBe(false);
    } finally {
      await closeAll(a);
    }
  });
});

describe("whatever someone puts in the world, everyone else can see", () => {
  it("a sticker on the outside of a door reaches every open window, and every window opened later", async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(c, freeDoor(c, [door]));
      await goIn(a, door);
      a.ws.send(JSON.stringify({ type: "pile:take", id: "trash00002" }));
      await a.next((m) => m.type === "pocket" && m.pocket!.trash00002 === 1);
      a.ws.send(JSON.stringify({ type: "leave" }));
      await b.next((m) => m.type === "doors" && !m.doors![door].occupied);

      const where = { id: "trash00002", u: Math.round(Math.random() * 100) / 100, v: 0.5, r: 3 };
      a.ws.send(JSON.stringify({ type: "stick:outside", door, sticker: where }));
      const has = (m: { type: string; outside?: { u: number }[][] }) =>
        m.type === "outside" && m.outside![door].some((s) => s.u === where.u);
      for (const s of [b, c]) await s.next(has); // the corridor, and someone shut in a stall

      const d = await session();
      try {
        await d.next(has); // someone who wasn't there when it went on
      } finally {
        d.ws.close();
      }
    } finally {
      await closeAll(a, b, c);
    }
  });
});

describe("nobody sees anyone else, only what they did", () => {
  it("a door shows only whether it's taken and when it opens, never who's in it", async () => {
    const [a, b] = [await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(a, door);
      const seen = await b.next((m) => m.type === "doors" && m.doors![door].occupied);
      for (const d of seen.doors!) expect(Object.keys(d).sort()).toEqual(["occupied", "opensAt"]);
    } finally {
      await closeAll(a, b);
    }
  });

  it("someone arriving in the corridor, standing about and going away isn't announced", async () => {
    const b = await session();
    try {
      await pause(100);
      const had = b.seen.length;
      const c = await session();
      await pause(300);
      c.ws.close();
      await pause(300);
      expect(b.seen.slice(had)).toEqual([]);
    } finally {
      b.ws.close();
    }
  });
});

describe("everyone is, and stays, anonymous", () => {
  it("nobody is ever sent anyone else's id, whatever that person does", async () => {
    const [a, b, c] = [await session(), await session(), await session()];
    try {
      const door = freeDoor(a);
      await goIn(c, freeDoor(c, [door]));

      // a does everything there is to do
      a.ws.send(JSON.stringify({ type: "sticker:make", png: DOT }));
      const id = (await a.next((m) => m.type === "sticker:made")).id!;
      await goIn(a, door);
      a.ws.send(JSON.stringify({ type: "noise", kind: "shit" }));
      a.ws.send(JSON.stringify({ type: "stroke", face: "door", stroke: { k: "marker", c: "#d7263d", w: 0.5, p: [10, 10, 20, 20] } }));
      a.ws.send(JSON.stringify({ type: "stick", face: "door", sticker: { id, u: 30, v: 30, r: 0 } }));
      a.ws.send(JSON.stringify({ type: "pile:leave", id }));
      a.ws.send(JSON.stringify({ type: "pile:take", id: "trash00003" }));
      b.ws.send(JSON.stringify({ type: "knock", door }));
      await pause(200);
      a.ws.send(JSON.stringify({ type: "leave" }));
      await b.next((m) => m.type === "doors" && !m.doors![door].occupied);
      a.ws.send(JSON.stringify({ type: "stick:outside", door, sticker: { id: "trash00003", u: 0.5, v: 0.5, r: 0 } }));

      // and b goes in after them, and finds what they left
      await goIn(b, door);
      await pause(300);

      for (const s of [b, c]) expect(JSON.stringify(s.seen)).not.toContain(a.id);
    } finally {
      await closeAll(a, b, c);
    }
  });

  it("the site sets no cookies", async () => {
    for (const path of ["/", "/readme/"]) {
      const res = await fetch(new URL(path, baseUrl));
      expect(res.headers.get("set-cookie"), path).toBeNull();
    }
  });

  it("an id is a random token, so a name or an email address can't be one", async () => {
    const { WebSocket } = await import("ws");
    for (const id of ["someone@example.com", "Jo Bloggs"]) {
      const url = new URL("/live", baseUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("id", id);
      const ws = new WebSocket(url);
      const code = await new Promise<number>((resolve) => ws.on("close", resolve));
      expect(code, id).toBe(1008);
    }
  });
});

// the smallest PNG there is: one clear pixel
const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
