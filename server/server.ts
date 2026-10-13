import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { marked } from "marked";
import { WebSocketServer, WebSocket } from "ws";
import { Doors } from "./doors.ts";

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
// a visit's length, overridable so tests don't wait ten minutes
const MAX_STAY_MS = Number(process.env.MAX_STAY_MS ?? 10 * 60 * 1000);
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
const lastNoise = new Map<string, number>();

const send = (ws: WebSocket, msg: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

// `now` lets each client correct for its own clock when counting down
const doorsMsg = (clientId: string) => ({
  type: "doors",
  doors: doors.view(),
  you: doors.doorOf(clientId),
  now: Date.now(),
});

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

  ws.on("message", (raw) => {
    let msg: { type?: string; door?: number; kind?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "enter" && typeof msg.door === "number") {
      if (!doors.enter(id, msg.door)) send(ws, { type: "denied", door: msg.door });
    } else if (msg.type === "leave") {
      doors.leave(id);
    } else if (msg.type === "noise" && NOISES.has(msg.kind ?? "")) {
      // what happens in a stall is heard outside it, within reason
      const door = doors.doorOf(id);
      const now = Date.now();
      if (door === null || now - (lastNoise.get(id) ?? 0) < NOISE_GAP_MS) return;
      lastNoise.set(id, now);
      for (const [other, otherId] of sockets) {
        if (otherId !== id) send(other, { type: "noise", door, kind: msg.kind });
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
