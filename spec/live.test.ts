import { expect, inject, it } from "vitest";
import { WebSocket } from "ws";

// Crit 9: a change one person makes appears in every other open session
// within about a second, with no reload. Here the change is a door's
// occupied/vacant state, seen by two sessions at once.
const baseUrl = inject("baseUrl");

type Door = { occupied: boolean; opensAt: number | null };
type Bowl = { piss: number; poops: unknown[] };
type Stroke = { k: string; c: string; w: number; p: number[] };
type Wad = { id: string; left: number };
type Stuck = { id: string; u: number; v: number; r: number; s?: number };
type Msg = {
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

it("what one person leaves in a toilet, the next person in that stall finds", async () => {
  const a = await session();
  const b = await session();
  try {
    const door = a.first.doors!.findIndex((d) => !d.occupied);
    expect(door, "every stall is occupied, so there's nothing to test with").not.toBe(-1);

    a.ws.send(JSON.stringify({ type: "enter", door }));
    await a.next((m) => m.type === "doors" && m.you === door);
    a.ws.send(JSON.stringify({ type: "noise", kind: "shit" }));
    const left = await a.next((m) => m.type === "doors" && (m.bowl?.poops.length ?? 0) > 0);

    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);
    b.ws.send(JSON.stringify({ type: "enter", door }));
    const found = await b.next((m) => m.type === "doors" && m.you === door);
    expect(found.bowl?.poops).toEqual(left.bowl?.poops);

    b.ws.send(JSON.stringify({ type: "noise", kind: "full" }));
    await b.next((m) => m.type === "doors" && m.bowl?.poops.length === 0);
    b.ws.send(JSON.stringify({ type: "leave" }));
    await a.next((m) => m.type === "doors" && !m.doors![door].occupied);
  } finally {
    a.ws.close();
    b.ws.close();
  }
});

it("what one person draws on a wall, the next person in that stall sees", async () => {
  const a = await session();
  const b = await session();
  // the wall keeps everything from every run, so this run's line is its own
  const x = Math.round(Math.random() * 1000) / 10;
  const line = { k: "marker", c: "#d7263d", w: 0.5, p: [x, 120, x + 20.04, 118, x + 40, 125.5] };
  const kept = { ...line, p: [x, 120, Math.round((x + 20.04) * 10) / 10, 118, x + 40, 125.5] };
  try {
    const door = a.first.doors!.findIndex((d) => !d.occupied);
    expect(door, "every stall is occupied, so there's nothing to test with").not.toBe(-1);

    // nobody can draw from the corridor
    b.ws.send(JSON.stringify({ type: "stroke", face: "wall-left", stroke: line }));

    a.ws.send(JSON.stringify({ type: "enter", door }));
    const before = await a.next((m) => m.type === "stall");
    expect(before.marks!["wall-left"] ?? []).not.toContainEqual(kept);
    a.ws.send(JSON.stringify({ type: "stroke", face: "wall-left", stroke: line }));
    // rubbish is refused, quietly
    a.ws.send(JSON.stringify({ type: "stroke", face: "wall-left", stroke: { k: "pen", c: "#bad", w: 0.5, p: [1, 1] } }));
    a.ws.send(JSON.stringify({ type: "stroke", face: "wall-left", stroke: { ...line, k: "spray" } })); // no spray that thin
    a.ws.send(JSON.stringify({ type: "stroke", face: "../etc", stroke: line }));
    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);

    b.ws.send(JSON.stringify({ type: "enter", door }));
    const after = await b.next((m) => m.type === "stall" && m.door === door);
    const onWall = after.marks!["wall-left"];
    expect(onWall.at(-1)).toEqual(kept);
    expect(Object.keys(after.marks!)).not.toContain("../etc");
    b.ws.send(JSON.stringify({ type: "leave" }));
    await a.next((m) => m.type === "doors" && !m.doors![door].occupied);
  } finally {
    a.ws.close();
    b.ws.close();
  }
});

// the smallest PNG there is: one clear pixel
const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

it("a sticker goes from its maker, by way of the pile, onto walls and onto a door", async () => {
  const a = await session();
  const b = await session();
  try {
    const door = a.first.doors!.findIndex((d) => !d.occupied);
    expect(door, "every stall is occupied, so there's nothing to test with").not.toBe(-1);

    // made out in the corridor; not everything is a sticker
    a.ws.send(JSON.stringify({ type: "sticker:make", png: "data:text/html;base64,PGI+" }));
    await a.next((m) => m.type === "sticker:refused");
    a.ws.send(JSON.stringify({ type: "sticker:make", png: DOT }));
    const id = (await a.next((m) => m.type === "sticker:made")).id!;

    // its maker sticks one on a wall, over a line that was there first, and
    // then draws over the sticker: all three are kept, in that order
    a.ws.send(JSON.stringify({ type: "enter", door }));
    await a.next((m) => m.type === "stall");
    const x = Math.round(Math.random() * 1000) / 10;
    const under = { k: "pen", c: "#111111", w: 1.2, p: [x, 60, x + 30, 60] };
    const over = { k: "spray", c: "#1b6ef3", w: 15, p: [x, 61, x + 30, 61] };
    a.ws.send(JSON.stringify({ type: "stroke", face: "wall-right", stroke: under }));
    a.ws.send(JSON.stringify({ type: "stick", face: "wall-right", sticker: { id, u: x + 15, v: 60, r: 5 } }));
    const stuck = (await a.next((m) => m.type === "stuck")).sticker!;
    a.ws.send(JSON.stringify({ type: "stroke", face: "wall-right", stroke: over }));

    // and leaves ten under the toilet for other people
    a.ws.send(JSON.stringify({ type: "pile:leave", id }));
    const left = await a.next((m) => m.type === "pile" && m.pile!.some((w) => w.id === id));
    expect(left.pile!.at(-1)).toEqual({ id, left: 10 });
    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);

    // the next person in finds all of it, layered the way it went on
    b.ws.send(JSON.stringify({ type: "enter", door }));
    const found = await b.next((m) => m.type === "stall" && m.door === door);
    expect(found.marks!["wall-right"].slice(-3)).toEqual([under, stuck, over]);
    expect(found.stickers![id]).toBe(DOT);

    // every stall has ten of each of the usual three when you come in
    for (const usual of ["trash00001", "trash00002", "trash00003"]) {
      expect(found.pile!.find((w) => w.id === usual)).toEqual({ id: usual, left: 10 });
    }

    // it isn't theirs, so they can't stick it until they've taken one, and
    // one is all they can carry of it
    const where = { id, u: 20, v: 150, r: -8 };
    b.ws.send(JSON.stringify({ type: "stick", face: "door", sticker: where }));
    b.ws.send(JSON.stringify({ type: "pile:take", id }));
    expect((await b.next((m) => m.type === "pocket")).pocket).toEqual({ [id]: 1 });
    expect((await b.next((m) => m.type === "pile")).pile!.find((w) => w.id === id)).toEqual({ id, left: 9 });
    b.ws.send(JSON.stringify({ type: "pile:take", id }));
    await b.next((m) => m.type === "pile:denied");

    // leaving more only ever brings it back up to ten; with ten there, it does nothing
    b.ws.send(JSON.stringify({ type: "pile:leave", id }));
    expect((await b.next((m) => m.type === "pile")).pile!.find((w) => w.id === id)).toEqual({ id, left: 10 });
    b.ws.send(JSON.stringify({ type: "pile:leave", id }));

    // the one they have goes on the back of the door, which spends it, and then they can take another
    b.ws.send(JSON.stringify({ type: "stick", face: "door", sticker: where }));
    expect((await b.next((m) => m.type === "pocket")).pocket).toEqual({});
    await b.next((m) => m.type === "stuck");
    b.ws.send(JSON.stringify({ type: "pile:take", id }));
    b.ws.send(JSON.stringify({ type: "pile:take", id: "trash00001" }));
    expect((await b.next((m) => m.type === "pocket" && Object.keys(m.pocket!).length === 2)).pocket).toEqual({ [id]: 1, trash00001: 1 });
    const taken = await b.next((m) => m.type === "pile" && m.pile!.find((w) => w.id === "trash00001")!.left === 9);
    expect(taken.pile!.find((w) => w.id === id)).toEqual({ id, left: 9 });

    // out with them it goes, onto the outside of a door, where everyone sees it
    b.ws.send(JSON.stringify({ type: "leave" }));
    await a.next((m) => m.type === "doors" && !m.doors![door].occupied);
    b.ws.send(JSON.stringify({ type: "stick:outside", door, sticker: { id, u: 0.3, v: 0.2, r: -4 } }));
    const seen = await a.next((m) => m.type === "outside" && m.outside![door].some((s) => s.id === id));
    expect(seen.stickers![id]).toBe(DOT);
    expect((await b.next((m) => m.type === "pocket")).pocket).toEqual({ trash00001: 1 });

    // and the usual one they took has been put back by the time the next person's in
    a.ws.send(JSON.stringify({ type: "enter", door }));
    const restocked = await a.next((m) => m.type === "stall" && m.door === door);
    expect(restocked.pile!.find((w) => w.id === "trash00001")).toEqual({ id: "trash00001", left: 10 });
    expect(restocked.pile!.find((w) => w.id === id)).toEqual({ id, left: 9 });
    a.ws.send(JSON.stringify({ type: "leave" }));
    await b.next((m) => m.type === "doors" && !m.doors![door].occupied);
  } finally {
    a.ws.close();
    b.ws.close();
  }
});
