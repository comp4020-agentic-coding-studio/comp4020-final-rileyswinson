// The hallway: four doors whose occupied/vacant state comes live from the
// server. No accounts; a random id in localStorage is the only identity.

import * as sound from "./sound.js";
import { room } from "./room.js";
import { stickers } from "./stickers.js";
import { station } from "./station.js";

const DOOR_COUNT = 4;

const clientId = (() => {
  try {
    let id = localStorage.getItem("stall-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("stall-id", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

const hallway = document.getElementById("hallway");
const status = hallway.querySelector(".status");
const template = document.getElementById("door-template");

let state = { doors: [], you: null };
let clockOffset = 0; // server time minus local time
let enteredAt = 0; // server time when you went in, for how much of the visit is left
let socket;

// --- build the doors -------------------------------------------------------

const stalls = [];
for (let i = 0; i < DOOR_COUNT; i++) {
  const node = template.content.firstElementChild.cloneNode(true);
  const door = node.querySelector(".door");
  door.dataset.door = String(i);
  door.addEventListener("pointerenter", () => creakOpen(i));
  door.addEventListener("pointerleave", () => swingShut(i));
  door.addEventListener("focus", () => creakOpen(i));
  door.addEventListener("blur", () => swingShut(i));
  door.addEventListener("click", (e) => (stickers.placing ? stickOn(i, e) : tryEnter(i)));
  door.addEventListener("focus", () => lookAt(i));
  node.querySelector(".number").textContent = String(i + 1);
  hallway.querySelector(".doors").append(node);
  // stickers go on the door itself, so they swing with it
  const stuck = document.createElement("span");
  stuck.className = "stuck-layer";
  node.querySelector(".panel").prepend(stuck);
  stalls.push({
    door,
    label: node.querySelector(".lock-label"),
    countdown: node.querySelector(".countdown"),
    doorway: node.querySelector(".doorway"),
    stuck,
  });
}

function vacant(i) {
  return state.doors[i] && !state.doors[i].occupied;
}

function creakOpen(i) {
  // with a sticker ready to go on, the door stays put so there's something to stick it to
  if (!vacant(i) || stalls[i].door.classList.contains("open") || stickers.placing) return;
  stalls[i].door.classList.add("open");
  sound.creak();
}

function swingShut(i) {
  stalls[i].door.classList.remove("open");
}

function tryEnter(i) {
  if (!vacant(i)) {
    // it's shut, so you knock: the server tells everyone, you included
    send({ type: "knock", door: i });
    return;
  }
  // a tap on a touch screen has no hover, so the door creaks open on the way in
  creakOpen(i);
  send({ type: "enter", door: i });
}

// the sticker you chose, on the outside of a door, where you clicked
function stickOn(i, e) {
  const r = stalls[i].doorway.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width;
  const v = (e.clientY - r.top) / r.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return;
  send({ type: "stick:outside", door: i, sticker: { id: stickers.placing, u, v, r: Math.round((Math.random() - 0.5) * 24) } });
  stickers.place(null);
  sound.peel();
}

// everything stuck on the outside of every door
function renderOutside(outside) {
  outside.forEach((list, i) => {
    stalls[i]?.stuck.replaceChildren(
      ...list.map((o) => {
        const img = stickers.img(o.id, "sticker");
        img.style.left = `${o.u * 100}%`;
        img.style.top = `${o.v * 100}%`;
        img.style.rotate = `${o.r}deg`;
        return img;
      }),
    );
  });
}

function restart(door, cls) {
  door.classList.remove(cls);
  void door.offsetWidth; // restart the animation
  door.classList.add(cls);
}

function rattle(i) {
  restart(stalls[i].door, "rattle");
}

// --- render ----------------------------------------------------------------

function render() {
  state.doors.forEach((d, i) => {
    const { door, label } = stalls[i];
    door.classList.toggle("occupied", d.occupied);
    if (d.occupied) door.classList.remove("open");
    else if (door.matches(":hover, :focus-visible")) creakOpen(i);
    door.setAttribute("aria-disabled", String(d.occupied));
    door.setAttribute("aria-label", `Stall ${i + 1}, ${d.occupied ? "occupied" : "vacant"}`);
    label.textContent = d.occupied ? "occupied" : "vacant";
  });

  const inside = state.you !== null;
  if (hallway.hidden !== inside) stickers.place(null); // a new place; choose again
  hallway.hidden = inside;
  if (inside) {
    station.close(); // stickers are made out here, not in there
    room.enter(state.you);
  } else room.exit();
  tick();
  // The first real state: the latches stop being blank, that's flushed with
  // transitions still off, and only then do transitions come back. Otherwise
  // every latch fades in from whatever it was showing before anyone knew.
  document.body.classList.remove("unknown");
  void document.body.offsetWidth;
  document.body.classList.remove("loading");
}

function remaining(opensAt) {
  const ms = Math.max(0, opensAt - (Date.now() + clockOffset));
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// countdowns only; state changes arrive from the server
function tick() {
  state.doors.forEach((d, i) => {
    stalls[i].countdown.textContent = d.occupied && d.opensAt ? `opens in ${remaining(d.opensAt)}` : "";
  });
  const mine = state.you !== null && state.doors[state.you];
  if (mine) {
    const ms = mine.opensAt - (Date.now() + clockOffset);
    room.tick(`the door opens in ${remaining(mine.opensAt)}`, ms / Math.max(1, mine.opensAt - enteredAt), Math.ceil(ms / 1000));
  }
}
setInterval(tick, 1000);

// a socket that is still connecting (or reconnecting) throws on send
function send(msg) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

room.onLeave = () => send({ type: "leave" });
room.onNoise = (kind) => send({ type: "noise", kind });
room.onStroke = (face, stroke) => send({ type: "stroke", face, stroke });
room.onPile = (kind, id) => send({ type: `pile:${kind}`, id });
room.onStick = (face, sticker) => send({ type: "stick", face, sticker });
station.onFinish = (png) => send({ type: "sticker:make", png });
hallway.querySelector(".station-open").addEventListener("click", () => station.open());
// out here, a sticker goes on a door: choose one, then click the door
hallway.querySelector(".stick-open").addEventListener("click", async () => {
  const id = await stickers.choose();
  if (id) stickers.place(id);
});

// --- camera ------------------------------------------------------------------
// The corridor is wider than the screen on purpose. The mouse pans it, a
// finger drags it, focus swings to the focused door, and left alone it drifts.

const wall = hallway.querySelector(".wall");
const cam = { x: 0 };
const target = { x: 0 };
let lastInput = 0;
let drag = null;

function overflow() {
  return Math.max(0, wall.offsetWidth - hallway.clientWidth);
}

// nx in -0.5..0.5: how far along the corridor the viewer is looking. A plain
// sideways pan; no tilting of the wall, which felt like too much.
function look(nx) {
  target.x = -nx * overflow();
  lastInput = performance.now();
}

function lookAt(i) {
  const stall = stalls[i].door.closest(".stall");
  const centre = stall.offsetLeft + stall.offsetWidth / 2;
  const nx = centre / wall.offsetWidth - 0.5;
  look(Math.max(-0.5, Math.min(0.5, nx)));
}

hallway.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" && !drag) return;
  if (drag) {
    const dx = e.clientX - drag.startX;
    const nx = Math.max(-0.5, Math.min(0.5, drag.nx - dx / Math.max(1, overflow())));
    look(nx);
    return;
  }
  look(e.clientX / hallway.clientWidth - 0.5);
});

hallway.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  drag = { startX: e.clientX, nx: -target.x / Math.max(1, overflow()) };
  hallway.classList.add("dragging");
});

for (const type of ["pointerup", "pointercancel"]) {
  hallway.addEventListener(type, () => {
    drag = null;
    hallway.classList.remove("dragging");
  });
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function frame(t) {
  // nobody's steering: a slow wander, so the far doors still turn up
  if (!reduceMotion && t - lastInput > 4000) {
    target.x = -Math.sin(t / 14000) * 0.4 * overflow();
  }
  const ease = reduceMotion ? 1 : 0.06;
  cam.x += (target.x - cam.x) * ease;
  wall.style.transform = `translate3d(${cam.x}px, 0, 0)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- live connection -------------------------------------------------------

function connect(retry = 500) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/live?id=${encodeURIComponent(clientId)}`);

  socket.addEventListener("open", () => {
    retry = 500;
    status.textContent = "";
    // the stickers this browser remembers making: does the server still have them?
    if (stickers.mine.length) send({ type: "sticker:mine", ids: stickers.mine.map((m) => m.id) });
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "doors") {
      const wasInside = state.you !== null;
      state = msg;
      clockOffset = msg.now - Date.now();
      if (!wasInside && state.you !== null) enteredAt = msg.now;
      if (msg.bowl) room.setBowl(msg.bowl);
      render();
      if (wasInside && state.you === null) status.textContent = "";
    } else if (msg.type === "denied") {
      swingShut(msg.door);
      rattle(msg.door);
      status.textContent = "Someone got there first.";
    } else if (msg.type === "timeup") {
      status.textContent = "Time's up. The door swung open.";
    } else if (msg.type === "stall") {
      stickers.learn(msg.stickers);
      room.setStall(msg);
    } else if (msg.type === "pile") {
      stickers.learn(msg.stickers);
      room.setPile(msg.pile);
    } else if (msg.type === "stuck") {
      stickers.learn(msg.stickers);
      room.addStuck(msg.face, msg.sticker);
    } else if (msg.type === "outside") {
      stickers.learn(msg.stickers);
      renderOutside(msg.outside);
    } else if (msg.type === "pocket") {
      stickers.learn(msg.stickers);
      stickers.setPocket(msg.pocket);
    } else if (msg.type === "sticker:mine") {
      stickers.keepMine(msg.known);
    } else if (msg.type === "sticker:made") {
      station.made(msg.id, msg.png);
    } else if (msg.type === "sticker:refused") {
      station.refused();
    } else if (msg.type === "stroke") {
      room.addStroke(msg.face, msg.stroke);
    } else if (msg.type === "knock") {
      // someone's knocking on a stall: everyone hears it and sees the door
      // take it, and whoever's inside feels it a moment later
      sound.knock();
      rattle(msg.door);
      if (state.you === msg.door) room.shake();
    } else if (msg.type === "noise") {
      // heard through the door: low, and the door shivers a little
      if (msg.kind === "piss") sound.piss({ muffled: true });
      else if (msg.kind === "shit") sound.plop({ muffled: true });
      else sound.flush({ full: msg.kind === "full", muffled: true });
      if (stalls[msg.door]) restart(stalls[msg.door].door, "noisy");
    }
  });

  socket.addEventListener("close", () => {
    status.textContent = "Lost the connection. Reconnecting…";
    setTimeout(() => connect(Math.min(retry * 2, 8000)), retry);
  });
}
connect();
