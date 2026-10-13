import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { marked } from "marked";
import { WebSocketServer, WebSocket } from "ws";
import { Doors } from "./doors.ts";
import { type BowlUse } from "./bowls.ts";
import { Stalls } from "./stalls.ts";

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
// a visit's length, overridable so tests don't wait ten minutes
const MAX_STAY_MS = Number(process.env.MAX_STAY_MS ?? 5 * 60 * 1000);
// a dropped connection keeps its stall this long, so a reload doesn't lose it
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 15 * 1000);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function readmePage(): Promise<string> {
  const body = await marked.parse(await readFile(join(ROOT, "README.md"), "utf8"));
  return `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>About the stalls</title><link rel="stylesheet" href="/readme.css"></head>
<body><main>${body}<p><a href="/">Back to the stalls</a></p></main></body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/readme" || url.pathname === "/readme/") {
      res.writeHead(200, { "content-type": TYPES[".html"] });
      res.end(await readmePage());
      return;
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = normalize(join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) throw new Error("outside public/");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});

// --- live door state ---------------------------------------------------------

const wss = new WebSocketServer({ server, path: "/live" });
const sockets = new Map<WebSocket, string>();
const dropTimers = new Map<string, NodeJS.Timeout>();
// one noise per person per second and a half; nobody needs more
const NOISE_GAP_MS = 1500;
const NOISES = new Set(["piss", "shit", "half", "full"]);
// everything the stalls hold lives on the data volume (fly.toml mounts /data)
const stalls = new Stalls(4, process.env.DATA_DIR ?? join(ROOT, "data"));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stalls.save(), process.exit(0)));
const lastNoise = new Map<string, number>();

const send = (ws: WebSocket, msg: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

// `now` lets each client correct for its own clock when counting down, and
// whoever is in a stall is told what's in its toilet
const doorsMsg = (clientId: string) => {
  const you = doors.doorOf(clientId);
  return {
    type: "doors",
    doors: doors.view(),
    you,
    bowl: you === null ? null : stalls.bowl(you),
    now: Date.now(),
  };
};

// everything in a stall, for whoever just went in: what's on every face
// (lines and stickers, in the order they went on), the pile under the bowl,
// and the pictures of any stickers among those
const stallMsg = (door: number) => ({
  type: "stall",
  door,
  marks: stalls.marks(door),
  pile: stalls.pile(door),
  stickers: stalls.pngs(stalls.idsIn(door)),
});

const pileMsg = (door: number) => ({
  type: "pile",
  door,
  pile: stalls.pile(door),
  stickers: stalls.pngs(stalls.pile(door).map((w) => w.id)),
});

// what's stuck on the outside of every door, which everyone sees
const outsideMsg = () => {
  const outside = stalls.outsideAll();
  return { type: "outside", outside, stickers: stalls.pngs(outside.flat().map((o) => o.id)) };
};

// What each person has picked up from the piles and not yet stuck anywhere.
// It's kept here, not in the browser, so nobody carries more than the piles
// gave them.
const pocketMsg = (clientId: string) => {
  const pocket = stalls.pocket(clientId);
  return { type: "pocket", pocket, stickers: stalls.pngs(Object.keys(pocket)) };
};

// every window one person has open
function toClient(clientId: string, msg: unknown) {
  for (const [other, otherId] of sockets) if (otherId === clientId) send(other, msg);
}

// everyone in a stall: usually one person, but they may have two windows
function toStall(door: number, msg: unknown, except?: WebSocket) {
  for (const [other, otherId] of sockets) {
    if (other !== except && doors.doorOf(otherId) === door) send(other, msg);
  }
}

const doors = new Doors({
  count: 4,
  maxStayMs: MAX_STAY_MS,
  onChange: (evicted) => {
    for (const [ws, clientId] of sockets) {
      if (evicted?.clientId === clientId) send(ws, { type: "timeup", door: evicted.door });
      send(ws, doorsMsg(clientId));
    }
  },
});

wss.on("connection", (ws, req) => {
  const id = new URL(req.url ?? "", "http://localhost").searchParams.get("id");
  if (!id || !/^[\w-]{8,64}$/.test(id)) return ws.close(1008, "missing id");

  sockets.set(ws, id);
  clearTimeout(dropTimers.get(id));
  dropTimers.delete(id);
  send(ws, doorsMsg(id));
  send(ws, outsideMsg());
  send(ws, pocketMsg(id));
  const already = doors.doorOf(id);
  if (already !== null) send(ws, stallMsg(already));

  ws.on("message", (raw) => {
    let msg: {
      type?: string;
      door?: number;
      kind?: string;
      face?: unknown;
      stroke?: unknown;
      png?: unknown;
      ids?: unknown;
      id?: unknown;
      sticker?: unknown;
    };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "enter" && typeof msg.door === "number") {
      if (doors.enter(id, msg.door)) {
        stalls.restock(msg.door); // ten of each of the usual stickers, for whoever's just come in
        send(ws, stallMsg(msg.door));
      }
      else send(ws, { type: "denied", door: msg.door });
    } else if (msg.type === "stroke") {
      // a line drawn on something in the stall: kept, and passed to any
      // other window open on the same stall
      const door = doors.doorOf(id);
      if (door === null) return;
      const stroke = stalls.stroke(door, msg.face, msg.stroke);
      if (stroke) toStall(door, { type: "stroke", face: msg.face, stroke }, ws);
    } else if (msg.type === "sticker:make") {
      // a new sticker, made out in the corridor; its maker gets the id
      const made = stalls.make(msg.png, id);
      send(ws, made ? { type: "sticker:made", id: made, png: msg.png } : { type: "sticker:refused" });
    } else if (msg.type === "sticker:mine") {
      // which of the stickers a browser remembers making are still here
      send(ws, { type: "sticker:mine", known: Object.keys(stalls.pngs(msg.ids)) });
    } else if (msg.type === "sticker:get") {
      send(ws, { type: "stickers", stickers: stalls.pngs(msg.ids) });
    } else if (msg.type === "pile:leave") {
      // the pile under the bowl: ten of one of yours, or as many as make it ten
      const door = doors.doorOf(id);
      if (door !== null && stalls.leave(door, msg.id)) toStall(door, pileMsg(door));
    } else if (msg.type === "pile:take") {
      // one copy comes off the pile and goes with you, if you haven't one already
      const door = doors.doorOf(id);
      if (door === null) return;
      if (!stalls.take(id, door, msg.id)) return send(ws, { type: "pile:denied", id: msg.id });
      toClient(id, pocketMsg(id));
      toStall(door, pileMsg(door));
    } else if (msg.type === "stick") {
      // one of your own, or one you picked up, stuck on something in the stall
      const door = doors.doorOf(id);
      if (door === null) return;
      const stuck = stalls.stick(id, door, msg.face, msg.sticker);
      if (!stuck) return;
      toClient(id, pocketMsg(id));
      toStall(door, { type: "stuck", face: msg.face, sticker: stuck, stickers: stalls.pngs([stuck.id]) });
    } else if (msg.type === "stick:outside" && typeof msg.door === "number" && msg.door >= 0 && msg.door < 4) {
      // or on the outside of a door, for everyone to see
      if (!stalls.stickOutside(id, msg.door, msg.sticker)) return;
      toClient(id, pocketMsg(id));
      for (const other of sockets.keys()) send(other, outsideMsg());
    } else if (msg.type === "leave") {
      doors.leave(id);
    } else if (msg.type === "noise" && NOISES.has(msg.kind ?? "")) {
      // what happens in a stall is heard outside it, within reason
      const door = doors.doorOf(id);
      const now = Date.now();
      if (door === null || now - (lastNoise.get(id) ?? 0) < NOISE_GAP_MS) return;
      lastNoise.set(id, now);
      stalls.use(door, msg.kind as BowlUse);
      for (const [other, otherId] of sockets) {
        if (otherId !== id) send(other, { type: "noise", door, kind: msg.kind });
        else send(other, doorsMsg(id));
      }
    }
  });

  ws.on("close", () => {
    sockets.delete(ws);
    // still connected in another tab? then they haven't left
    if ([...sockets.values()].includes(id)) return;
    dropTimers.set(
      id,
      setTimeout(() => {
        dropTimers.delete(id);
        doors.leave(id);
      }, RECONNECT_GRACE_MS),
    );
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`stalls open on :${PORT}`));
