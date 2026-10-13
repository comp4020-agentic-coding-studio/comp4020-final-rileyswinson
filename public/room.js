// Inside a stall: a box of six planes and a handful of rigid, flat-shaded
// boxes, seen through a camera that only ever rests at a few fixed stations,
// the way a point-and-click does. You turn, look up, crouch, or sit; the
// camera swings there and stops.

import { piss, plop } from "./sound.js";

const K = 5; // px per centimetre; everything below is in centimetres
const cm = (n) => n * K;
const W = cm(90); // wall to wall
const D = cm(150); // door to back wall
const H = cm(230); // floor to ceiling
const BACK = -75; // z of the back wall, cm
const DOOR = 75; // z of the door

const el = document.getElementById("room");
const viewport = el.querySelector(".viewport");
const camera = el.querySelector(".camera");
const world = el.querySelector(".world");
const arrows = Object.fromEntries([...el.querySelectorAll(".arrow")].map((a) => [a.dataset.turn, a]));
const actions = el.querySelector(".actions");
const timer = el.querySelector(".room-timer");

// --- geometry ----------------------------------------------------------------
// A plane is placed by its top-left corner: translate to the corner, then
// rotate about it. y points down, so the floor is y = 0 and the ceiling -H.

function plane(cls, w, h, transform) {
  const face = document.createElement("div");
  face.className = `face ${cls}`;
  face.style.width = `${w}px`;
  face.style.height = `${h}px`;
  face.style.transform = transform;
  return face;
}

// a box w × h × d, centred on x and z, standing on y (all cm)
function box(material, w, h, d, x, y, z) {
  [w, h, d, x, y, z] = [w, h, d, x, y, z].map(cm);
  const b = document.createElement("div");
  b.className = `box ${material}`;
  b.append(
    plane("f-front", w, h, `translate3d(${x - w / 2}px, ${y - h}px, ${z + d / 2}px)`),
    plane("f-back", w, h, `translate3d(${x + w / 2}px, ${y - h}px, ${z - d / 2}px) rotateY(180deg)`),
    plane("f-left", d, h, `translate3d(${x - w / 2}px, ${y - h}px, ${z - d / 2}px) rotateY(-90deg)`),
    plane("f-right", d, h, `translate3d(${x + w / 2}px, ${y - h}px, ${z + d / 2}px) rotateY(90deg)`),
    plane("f-top", w, d, `translate3d(${x - w / 2}px, ${y - h}px, ${z - d / 2}px) rotateX(90deg)`),
    plane("f-bottom", w, d, `translate3d(${x - w / 2}px, ${y}px, ${z + d / 2}px) rotateX(-90deg)`),
  );
  return b;
}

const exit = plane("surface exit", W, H, `translate3d(${W / 2}px, ${-H}px, ${cm(DOOR)}px) rotateY(180deg)`);
exit.innerHTML = `<button class="lock" type="button" aria-label="Unlock and leave"><span class="lock-label">occupied</span><span class="knob"></span></button>`;

world.append(
  plane("surface back", W, H, `translate3d(${-W / 2}px, ${-H}px, ${cm(BACK)}px)`),
  plane("surface left", D, H, `translate3d(${-W / 2}px, ${-H}px, ${cm(DOOR)}px) rotateY(90deg)`),
  plane("surface right", D, H, `translate3d(${W / 2}px, ${-H}px, ${cm(BACK)}px) rotateY(-90deg)`),
  exit,
  plane("surface ground", W, D, `translate3d(${-W / 2}px, 0, ${cm(BACK)}px) rotateX(90deg)`),
  plane("surface ceiling", W, D, `translate3d(${-W / 2}px, ${-H}px, ${cm(DOOR)}px) rotateX(-90deg)`),
  // the toilet, hung off the back wall: a rim, a narrower body under it, and
  // a seat on top. Under it is clear floor.
  box("ceramic", 36, 13, 54, 0, -30, BACK + 27),
  box("ceramic", 28, 14, 46, 0, -16, BACK + 23),
  box("seat", 38, 3, 52, 0, -43, BACK + 28),
  box("plate", 24, 16, 1.5, 0, -100, BACK + 0.75),
  // paper, on a bar off the right wall
  box("chrome", 10, 2, 2, 40, -73, BACK + 45),
  box("roll", 11, 11, 11, 37, -78.5, BACK + 45),
  // a brush in the corner, and a hook on the back of the door
  box("plastic", 10, 12, 10, 32, 0, BACK + 10),
  box("plastic", 1.5, 32, 1.5, 32, -12, BACK + 10),
  box("chrome", 2, 6, 3, 0, -165, DOOR - 1.5),
  // the light
  box("lamp", 30, 3, 60, 0, -227, 0),
);

// --- the camera --------------------------------------------------------------
// Where the viewer stands for each view, in cm, and how far they tip their
// head. Facing a side wall they step to the far side of the stall, which is
// the only way to see much of a wall at arm's length.

const stations = {
  front: { x: 0, y: -155, z: 50, pitch: 28 },
  left: { x: 30, y: -155, z: 40, pitch: 12 },
  right: { x: -30, y: -155, z: 40, pitch: 12 },
  exit: { x: 0, y: -155, z: 25, pitch: 18 }, // enough to take in the latch
  up: { x: 0, y: -155, z: 50, pitch: -30 },
  down: { x: 0, y: -45, z: 50, pitch: 22 }, // a crouch, to see under the bowl
  sit: { x: 0, y: -112, z: BACK + 34, pitch: 10 },
};

let yaw = 0; // kept continuous, so a turn always goes the short way round
let tilt = "level"; // level | up | down
let seated = false;
let P = 600; // focal length, px: set from the viewport so the field of view holds

const facing = () => ["front", "left", "exit", "right"][(((yaw % 360) + 360) % 360) / 90];
const station = () => (seated ? stations.sit : tilt !== "level" ? stations[tilt] : stations[facing()]);

function apply() {
  const s = station();
  // the inverse of the viewer: undo their position, then their rotation, then
  // put the eye at the focal distance
  camera.style.transform =
    `translateZ(${P}px) rotateX(${-s.pitch}deg) rotateY(${-yaw}deg) ` +
    `translate3d(${-cm(s.x)}px, ${-cm(s.y)}px, ${-cm(s.z)}px)`;
  ui();
}

function move(seconds) {
  camera.style.transitionDuration = `${seconds}s`;
  apply();
}

function fit() {
  P = Math.round(viewport.clientHeight * 0.75);
  viewport.style.perspective = `${P}px`;
  apply();
}

function turn(dir) {
  if (seated) return;
  if (dir === "left" || dir === "right") {
    if (tilt !== "level") return;
    yaw += dir === "left" ? 90 : -90;
  } else if (dir === "up") {
    if (tilt === "down") tilt = "level";
    else if (tilt === "level" && facing() === "front") tilt = "up";
    else return;
  } else if (dir === "down") {
    if (tilt === "up") tilt = "level";
    else if (tilt === "level" && facing() === "front") tilt = "down";
    else return;
  }
  move(0.7);
}

function sit() {
  seated = true;
  yaw += 180; // you turn round to sit
  move(1.3);
}

function stand() {
  seated = false;
  yaw -= 180;
  move(1.1);
}

// --- what you can do from here ------------------------------------------------

function act(label, fn, always = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (always) b.classList.add("always");
  b.addEventListener("click", fn);
  actions.append(b);
}

let busyUntil;
function relieve(kind, synth) {
  const seconds = synth() || 2;
  room.onNoise?.(kind);
  actions.classList.add("busy");
  clearTimeout(busyUntil);
  busyUntil = setTimeout(() => actions.classList.remove("busy"), seconds * 1000);
}

function ui() {
  const f = facing();
  const level = tilt === "level" && !seated;
  arrows.left.classList.toggle("on", level);
  arrows.right.classList.toggle("on", level);
  arrows.up.classList.toggle("on", !seated && ((level && f === "front") || tilt === "down"));
  arrows.down.classList.toggle("on", !seated && ((level && f === "front") || tilt === "up"));

  actions.replaceChildren();
  actions.classList.remove("busy");
  if (seated) {
    act("piss", () => relieve("piss", piss));
    act("shit", () => relieve("shit", plop));
    act("stand up", stand, true);
  } else if (level && f === "front") {
    act("sit down", sit);
  } else if (level && f === "exit") {
    act("unlock and leave", () => room.onLeave?.());
  }
}

for (const [dir, a] of Object.entries(arrows)) a.addEventListener("click", () => turn(dir));
exit.querySelector(".lock").addEventListener("click", () => room.onLeave?.());

addEventListener("keydown", (e) => {
  if (el.hidden) return;
  const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (!dir) return;
  e.preventDefault();
  turn(dir);
});

addEventListener("resize", () => {
  if (el.hidden) return;
  camera.style.transitionDuration = "0s";
  fit();
});

// --- in and out ----------------------------------------------------------------

export const room = {
  // set by the caller: these go to the server
  onLeave: null,
  onNoise: null,

  enter() {
    if (!el.hidden) return;
    yaw = 0;
    tilt = "level";
    seated = false;
    el.hidden = false;
    camera.style.transitionDuration = "0s";
    fit();
    void camera.offsetWidth; // land the first view before the fade lifts
    requestAnimationFrame(() => el.classList.add("in"));
  },

  exit() {
    el.hidden = true;
    el.classList.remove("in");
  },

  tick(text) {
    timer.textContent = text;
  },

  turn,
  sit,
  stand,
};
