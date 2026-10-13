// The hallway: four doors whose occupied/vacant state comes live from the
// server. No accounts; a random id in localStorage is the only identity.

import { creak, knock, piss, plop, flush } from "./sound.js";
import { room } from "./room.js";

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
  // optimistic default until the server answers: locked, not yet known
  door.classList.add("occupied");
  door.addEventListener("pointerenter", () => creakOpen(i));
  door.addEventListener("pointerleave", () => swingShut(i));
  door.addEventListener("focus", () => creakOpen(i));
  door.addEventListener("blur", () => swingShut(i));
  door.addEventListener("click", () => tryEnter(i));
  door.addEventListener("focus", () => lookAt(i));
  node.querySelector(".number").textContent = String(i + 1);
  hallway.querySelector(".doors").append(node);
  stalls.push({ door, label: node.querySelector(".lock-label"), countdown: node.querySelector(".countdown") });
}

function vacant(i) {
  return state.doors[i] && !state.doors[i].occupied;
}

function creakOpen(i) {
  if (!vacant(i) || stalls[i].door.classList.contains("open")) return;
  stalls[i].door.classList.add("open");
  creak();
}

function swingShut(i) {
  stalls[i].door.classList.remove("open");
}

function tryEnter(i) {
  if (!vacant(i)) {
    rattle(i);
    return;
  }
  // a tap on a touch screen has no hover, so the door creaks open on the way in
  creakOpen(i);
  socket?.send(JSON.stringify({ type: "enter", door: i }));
}

function restart(door, cls) {
  door.classList.remove(cls);
  void door.offsetWidth; // restart the animation
  door.classList.add(cls);
}

function rattle(i) {
  restart(stalls[i].door, "rattle");
  knock();
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
  hallway.hidden = inside;
  if (inside) room.enter();
  else room.exit();
  tick();
  // the first real state lands with transitions off; flush it before they
  // come back, or every door animates from the "occupied" placeholder
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
    const left = (mine.opensAt - (Date.now() + clockOffset)) / Math.max(1, mine.opensAt - enteredAt);
    room.tick(`the door opens in ${remaining(mine.opensAt)}`, left);
  }
}
setInterval(tick, 1000);

room.onLeave = () => socket?.send(JSON.stringify({ type: "leave" }));
room.onNoise = (kind) => socket?.send(JSON.stringify({ type: "noise", kind }));

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
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "doors") {
      const wasInside = state.you !== null;
      state = msg;
      clockOffset = msg.now - Date.now();
      if (!wasInside && state.you !== null) enteredAt = msg.now;
      render();
      if (wasInside && state.you === null) status.textContent = "";
    } else if (msg.type === "denied") {
      swingShut(msg.door);
      rattle(msg.door);
      status.textContent = "Someone got there first.";
    } else if (msg.type === "timeup") {
      status.textContent = "Time's up. The door swung open.";
    } else if (msg.type === "noise") {
      // heard through the door: low, and the door shivers a little
      if (msg.kind === "piss") piss({ muffled: true });
      else if (msg.kind === "shit") plop({ muffled: true });
      else flush({ full: msg.kind === "full", muffled: true });
      if (stalls[msg.door]) restart(stalls[msg.door].door, "noisy");
    }
  });

  socket.addEventListener("close", () => {
    status.textContent = "Lost the connection. Reconnecting…";
    setTimeout(() => connect(Math.min(retry * 2, 8000)), retry);
  });
}
connect();
