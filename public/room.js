// Inside a stall: a box of six planes and a handful of rigid, flat-shaded
// shapes, seen through a camera that only ever rests at a few fixed stations,
// the way a point-and-click does. You turn, look up or down, crouch under
// the bowl, or sit; the camera swings there and stops. Anything you can see,
// bar the floor, you can draw on: hover it and the word "draw" appears, click and the
// camera goes right up to that spot, and then you've a marker in your hand.

import * as sound from "./sound.js";
import { stickers } from "./stickers.js";

const K = 5; // px per centimetre; everything below is in centimetres
const R = 8; // canvas px per centimetre: the grain of a marker line
const cm = (n) => n * K;
const W = cm(90); // wall to wall
const D = cm(150); // door to back wall
const H = cm(205); // floor to ceiling
const BACK = -75; // z of the back wall, cm
const DOOR = 75; // z of the door
const TOILET = BACK + 27; // z of the middle of the bowl

// each stall's lamp is its own colour: the blue they fit in public toilets
// so nobody can find a vein, then a red, a green and an amber
const LAMPS = ["72 96 255", "255 48 72", "52 214 120", "255 150 36"];

// the markers: the same list the server accepts
const INKS = ["#111111", "#e8e4d8", "#d7263d", "#1b6ef3", "#19a85a", "#f2c200", "#ff5fa2", "#ff7a1a", "#8a2be2", "#6b4a2b"];
// what there is to draw with, and the two widths each comes in (cm), narrower first
const TOOLS = { pen: [0.5, 1.2], marker: [0.5, 1.2], spray: [5, 11.25] };

const el = document.getElementById("room");
const viewport = el.querySelector(".viewport");
const camera = el.querySelector(".camera");
const world = el.querySelector(".world");
const arrows = Object.fromEntries([...el.querySelectorAll(".arrow")].map((a) => [a.dataset.turn, a]));
const actions = el.querySelector(".actions");
const timer = el.querySelector(".room-timer");
const verb = el.querySelector(".verb");
const palette = el.querySelector(".palette");

// --- a little vector maths ------------------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

// --- geometry ----------------------------------------------------------------
// A plane is a point in the world (its top-left corner, px) and two unit
// vectors: which way its width runs and which way its height runs. Their
// cross product is the side it shows. The same three vectors give the CSS
// matrix that puts it there and, later, where a click on it lands.
// A clipped plane paints on a flat child, because Chrome drops a clip-path
// that sits directly on a 3D-transformed element.

const faces = new Map(); // name → everything about a face you can draw on

function plane(name, cls, w, h, o, u, v, clip) {
  const n = cross(u, v);
  const face = document.createElement("div");
  face.className = `face ${cls}`;
  face.style.width = `${w}px`;
  face.style.height = `${h}px`;
  face.style.transform = `matrix3d(${u.join(",")},0,${v.join(",")},0,${n.join(",")},0,${o.join(",")},1)`;
  let skin = face;
  if (clip) {
    face.classList.add("clipped");
    skin = document.createElement("div");
    skin.className = "skin";
    skin.style.clipPath = clip;
    face.append(skin);
  }
  if (name) {
    face.classList.add("drawable");
    face.dataset.face = name;
    faces.set(name, { name, el: face, skin, o, u, v, n, w, h, ink: null, marks: [] });
  }
  return face;
}

// a box w × h × d, centred on x and z, standing on y (all cm). A name makes
// its faces drawable, as name/front, name/top and so on.
function box(material, name, w, h, d, x, y, z) {
  [w, h, d, x, y, z] = [w, h, d, x, y, z].map(cm);
  const id = (side) => (name ? `${name}/${side}` : null);
  const b = document.createElement("div");
  b.className = `box ${material}`;
  b.append(
    plane(id("front"), "f-front", w, h, [x - w / 2, y - h, z + d / 2], [1, 0, 0], [0, 1, 0]),
    plane(id("back"), "f-back", w, h, [x + w / 2, y - h, z - d / 2], [-1, 0, 0], [0, 1, 0]),
    plane(id("left"), "f-left", d, h, [x - w / 2, y - h, z - d / 2], [0, 0, 1], [0, 1, 0]),
    plane(id("right"), "f-right", d, h, [x + w / 2, y - h, z + d / 2], [0, 0, -1], [0, 1, 0]),
    plane(id("top"), "f-top", w, d, [x - w / 2, y - h, z - d / 2], [1, 0, 0], [0, 0, 1]),
    plane(id("bottom"), "f-bottom", w, d, [x - w / 2, y, z + d / 2], [1, 0, 0], [0, 0, -1]),
  );
  return b;
}

// the corners of an n-gon round an ellipse, in the order that makes the
// sides face outward
function ring(rx, rz, sides) {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((i + 0.5) * 2 * Math.PI) / sides;
    return [rx * Math.cos(a), -rz * Math.sin(a)];
  });
}

// a clip path for a cap: an n-gon, with a hole through it if asked
function capClip(rx, rz, pts, flipZ, hole) {
  const path = (ps) =>
    ps.map(([vx, vz], i) => `${i ? "L" : "M"}${(rx + vx).toFixed(1)} ${(rz + (flipZ ? -vz : vz)).toFixed(1)}`).join(" ") + " Z";
  let d = path(pts);
  if (hole) d += " " + path(ring(hole[0], hole[1], 16));
  return `path(evenodd, "${d}")`;
}

// an n-sided ring of faces round an ellipse rx × rz, h tall, standing on y:
// what a box is too square for. `inside` turns it inside out, for a bowl.
function prism(material, name, rx, rz, h, x, y, z, { sides = 8, top = true, bottom = true, inside = false, hole = null } = {}) {
  [rx, rz, h, x, y, z] = [rx, rz, h, x, y, z].map(cm);
  const id = (side) => (name ? `${name}/${side}` : null);
  const g = document.createElement("div");
  g.className = `box ${material}`;
  const pts = ring(rx, rz, sides);
  const order = inside ? [...pts].reverse() : pts;
  for (let i = 0; i < sides; i++) {
    const [ax, az] = order[i];
    const [bx, bz] = order[(i + 1) % sides];
    const len = Math.hypot(bx - ax, bz - az);
    const u = [(bx - ax) / len, 0, (bz - az) / len];
    const side = plane(id(`s${i}`), "f-side", len, h, [x + ax, y - h, z + az], u, [0, 1, 0]);
    // flat-shaded by where it faces: toward the viewer light, away dark
    side.style.setProperty("--tint", `rgb(0 0 0 / ${(0.1 + (0.3 * (1 - u[0])) / 2).toFixed(2)})`);
    g.append(side);
  }
  const holePx = hole && hole.map(cm);
  if (top && !inside) {
    g.append(plane(id("top"), "f-top", 2 * rx, 2 * rz, [x - rx, y - h, z - rz], [1, 0, 0], [0, 0, 1], capClip(rx, rz, pts, false, holePx)));
  }
  if (bottom && !inside) {
    g.append(plane(id("bottom"), "f-bottom", 2 * rx, 2 * rz, [x - rx, y, z + rz], [1, 0, 0], [0, 0, -1], capClip(rx, rz, pts, true, holePx)));
  }
  if (bottom && inside) {
    // the floor of a bowl faces up
    g.append(plane(id("floor"), "f-top", 2 * rx, 2 * rz, [x - rx, y, z - rz], [1, 0, 0], [0, 0, 1], capClip(rx, rz, pts, false, null)));
  }
  return g;
}

// a flat n-gon lying face up, for the water
function pool(material, rx, rz, x, y, z) {
  [rx, rz, x, y, z] = [rx, rz, x, y, z].map(cm);
  const g = document.createElement("div");
  g.className = `box ${material}`;
  g.append(plane(null, "f-top", 2 * rx, 2 * rz, [x - rx, y, z - rz], [1, 0, 0], [0, 0, 1], capClip(rx, rz, ring(rx, rz, 16), false, null)));
  return g;
}

// a drum lying on its side, its axis running front to back: for the roll of
// paper. r and len in cm, centred on x, y, z.
function drum(material, name, r, len, x, y, z, sides = 10) {
  [r, len, x, y, z] = [r, len, x, y, z].map(cm);
  const id = (side) => (name ? `${name}/${side}` : null);
  const g = document.createElement("div");
  g.className = `box ${material}`;
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = ((i + 0.5) * 2 * Math.PI) / sides;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  pts.forEach(([ax, ay], i) => {
    const [bx, by] = pts[(i + 1) % sides];
    const w = Math.hypot(bx - ax, by - ay);
    const u = [(bx - ax) / w, (by - ay) / w, 0];
    const side = plane(id(`s${i}`), "f-side", w, len, [x + ax, y + ay, z - len / 2], u, [0, 0, 1]);
    // lit from above: u[0] is how far this side faces down
    side.style.setProperty("--tint", `rgb(0 0 0 / ${(0.04 + 0.42 * ((1 + u[0]) / 2)).toFixed(2)})`);
    g.append(side);
  });
  g.append(
    plane(id("front"), "f-cap", 2 * r, 2 * r, [x - r, y - r, z + len / 2], [1, 0, 0], [0, 1, 0], capClip(r, r, pts, false, null)),
    plane(id("back"), "f-cap", 2 * r, 2 * r, [x + r, y - r, z - len / 2], [-1, 0, 0], [0, 1, 0], capClip(r, r, pts.map(([px, py]) => [-px, py]), false, null)),
  );
  return g;
}

// --- the room ------------------------------------------------------------------

const exit = plane("door", "surface exit", W, H, [W / 2, -H, cm(DOOR)], [-1, 0, 0], [0, 1, 0]);
// the latch on the back of the door: slide it across and you're out
exit.innerHTML =
  `<button class="lock" type="button" data-verb="unlock" aria-label="Unlock and leave">` +
  `<span class="lock-label">occupied</span><span class="knob"></span></button>`;
const latch = exit.querySelector(".lock");

// the flush plate carries its two buttons
const plate = box("plate", "plate", 24, 16, 1.5, 0, -100, BACK + 0.75);
plate.querySelector(".f-front").insertAdjacentHTML(
  "beforeend",
  `<button class="flush half" type="button" data-verb="half flush" aria-label="Half flush"></button>` +
    `<button class="flush full" type="button" data-verb="full flush" aria-label="Full flush"></button>`,
);

// The hole in the seat, the rim under it and the bowl below that are one
// sixteen-sided well, the same shape all the way down, so there's nothing to
// see between them.
const HOLE = [12, 17];

// the water sits in a group of its own, so a flush can take it (and whatever
// is floating on it) down and bring it back
const water = pool("water", HOLE[0], HOLE[1], 0, -39, TOILET);
const waterGroup = document.createElement("div");
waterGroup.className = "box water-group";
waterGroup.append(water);

world.append(
  plane("wall-back", "surface back", W, H, [-W / 2, -H, cm(BACK)], [1, 0, 0], [0, 1, 0]),
  plane("wall-left", "surface left", D, H, [-W / 2, -H, cm(DOOR)], [0, 0, -1], [0, 1, 0]),
  plane("wall-right", "surface right", D, H, [W / 2, -H, cm(BACK)], [0, 0, 1], [0, 1, 0]),
  exit,
  // the floor is the one thing you can't draw on
  plane(null, "surface ground", W, D, [-W / 2, 0, cm(BACK)], [1, 0, 0], [0, 0, 1]),
  plane("ceiling", "surface ceiling", W, D, [-W / 2, -H, cm(DOOR)], [1, 0, 0], [0, 0, -1]),
  // the toilet, hung off the back wall: a block flat against the wall, an
  // eight-sided body out from it, open at the top; the bowl inside that; a
  // seat with a hole over it. Under it is clear floor, but for the waste
  // pipe, which comes out of the back and goes down through a collar.
  box("ceramic", "back", 36, 29, 14, 0, -22, BACK + 7),
  prism("pipe", "pipe", 5, 5, 22, 0, 0, BACK + 8, { top: false, bottom: false }),
  prism("pipe", "collar", 7, 7, 1.5, 0, 0, BACK + 8, { bottom: false }),
  prism("ceramic", "body", 19, 27, 27, 0, -22, TOILET, { top: false }),
  prism("bowl", "bowl", HOLE[0], HOLE[1], 25, 0, -24, TOILET, { sides: 16, inside: true, top: false }),
  waterGroup,
  prism("seat", "seat", 20, 28, 3, 0, -49, TOILET, { hole: HOLE, bottom: false }),
  prism("seat", "seat-rim", HOLE[0], HOLE[1], 3, 0, -49, TOILET, { sides: 16, inside: true, top: false, bottom: false }),
  plate,
  // paper: a steel dispenser on the right wall. A plate against the wall, a
  // cheek at each end holding the spindle, a hood over the top with a lip at
  // the front, the roll inside, and a sheet hanging out under the lip.
  box("chrome", "holder-back", 1, 17, 15.4, 44.5, -69.5, BACK + 45),
  box("chrome", "holder-near", 9, 13, 1, 40, -71.5, BACK + 52.2),
  box("chrome", "holder-far", 9, 13, 1, 40, -71.5, BACK + 37.8),
  box("chrome", "holder-top", 14.6, 1, 15.4, 37.7, -85, BACK + 45),
  box("chrome", "holder-lip", 1, 4.5, 15.4, 30.9, -81.5, BACK + 45),
  box("chrome", "spindle", 1.4, 1.4, 13.4, 37.5, -77.3, BACK + 45),
  drum("roll", "roll", 5.5, 10, 37.5, -78, BACK + 45),
  box("roll", "sheet", 0.3, 12, 9.6, 32.1, -66, BACK + 45),
  // a brush in the corner, and a hook on the back of the door
  box("plastic", "cup", 10, 12, 10, 32, 0, BACK + 10),
  box("plastic", "handle", 1.5, 32, 1.5, 32, -12, BACK + 10),
  box("chrome", "hook", 2, 6, 3, 0, -150, DOOR - 1.5),
  // one strip of LED, in the middle of the ceiling
  box("lamp", null, 3, 3, 36, 0, -202, 0),
);

// --- the camera --------------------------------------------------------------
// Where the viewer stands for each view, in cm, and how far they tip their
// head. Facing a partition they step up to it, so the wall fills the view
// and the door is only just there at its edge.

const stations = {
  front: { x: 0, y: -148, z: 22, pitch: 6 }, // looking straight ahead
  left: { x: 10, y: -143, z: 22, pitch: 8 },
  right: { x: -10, y: -143, z: 22, pitch: 8 },
  exit: { x: 0, y: -148, z: -5, pitch: 14 }, // far enough back to take in the latch
  up: { x: 0, y: -148, z: 22, pitch: -30 },
  under: { x: 0, y: -45, z: 50, pitch: 22 }, // a crouch, to see under it
  sit: { x: 0, y: -80, z: TOILET + 7, pitch: 4 },
};

// how far the head tips for the "down" look, from wherever you're standing
const LOOK_DOWN = 38;

let yaw = 0; // kept continuous, so a turn always goes the short way round
let tilt = "level"; // level | down | up | under; the last two only facing the toilet
let seated = false;
let zoom = null; // when drawing: the face, and where the camera went to meet it
let P = 600; // focal length, px: set from the viewport so the field of view holds

const facing = () => ["front", "left", "exit", "right"][(((yaw % 360) + 360) % 360) / 90];
const station = () => {
  if (zoom) return zoom;
  if (seated) return stations.sit;
  if (tilt === "up" || tilt === "under") return stations[tilt];
  const s = stations[facing()];
  return tilt === "down" ? { ...s, pitch: LOOK_DOWN } : s;
};
const heading = () => zoom?.yaw ?? yaw;

function apply() {
  const s = station();
  // the inverse of the viewer: undo their position, then their rotation, then
  // put the eye at the focal distance
  camera.style.transform =
    `translateZ(${P}px) rotateX(${-s.pitch}deg) rotateY(${-heading()}deg) ` +
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

// Up and down run through a short ladder. Facing the toilet it's the whole
// thing: up — straight ahead — down at it — under it. Facing anything else
// it's just straight ahead and down. Looking straight or down, you can turn,
// and the head stays where it was.
const ladder = ["up", "level", "down", "under"];
const rungs = () => (facing() === "front" ? ladder : ["level", "down"]);
const canTurn = () => !seated && !zoom && (tilt === "level" || tilt === "down");

function turn(dir) {
  if (seated || zoom) return;
  if (dir === "left" || dir === "right") {
    if (!canTurn()) return;
    yaw += dir === "left" ? 90 : -90;
  } else {
    const r = rungs();
    const next = r[r.indexOf(tilt) + (dir === "down" ? 1 : -1)];
    if (!next) return;
    tilt = next;
  }
  move(0.7);
  return true; // it moved
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

// --- from the screen back into the room ------------------------------------------
// The camera is a yaw and a pitch at a point. A point on the screen is a ray
// out through the focal length; turned the way the camera is turned, it
// meets a face somewhere, and that somewhere is in the face's own cm.

function turned(v, yawDeg, pitchDeg) {
  const p = rad(pitchDeg);
  const y = rad(yawDeg);
  const [x, yy, z] = v;
  const y1 = yy * Math.cos(p) - z * Math.sin(p);
  const z1 = yy * Math.sin(p) + z * Math.cos(p);
  return [x * Math.cos(y) + z1 * Math.sin(y), y1, -x * Math.sin(y) + z1 * Math.cos(y)];
}

function rayAt(clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  const s = station();
  return {
    from: [cm(s.x), cm(s.y), cm(s.z)],
    dir: turned([clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2), -P], heading(), s.pitch),
  };
}

// where a ray lands on a face, in cm across and down it; null if it misses
function landing(face, ray) {
  const along = dot(face.n, ray.dir);
  if (Math.abs(along) < 1e-6) return null;
  const t = dot(face.n, sub(face.o, ray.from)) / along;
  if (t <= 0) return null;
  const rel = sub(add(ray.from, scale(ray.dir, t)), face.o);
  return [dot(rel, face.u) / K, dot(rel, face.v) / K];
}

// --- drawing -------------------------------------------------------------------
// Each face keeps a canvas, made the first time anything lands on it, and a
// list of what's on it: lines and stickers, oldest first, each drawn over
// the ones before. A stroke is what it was drawn with, a colour, a width and
// a run of points in the face's own cm, so it's the same stroke whatever
// the screen. A sticker is which one, where, and how askew.

const tenth = (n) => Math.round(n * 10) / 10;

function inkOn(face) {
  if (!face.ink) {
    const c = document.createElement("canvas");
    c.className = "ink";
    c.width = Math.round((face.w / K) * R);
    c.height = Math.round((face.h / K) * R);
    face.skin.prepend(c); // under the latch, the buttons: anything that's fixed to the face
    face.ink = c.getContext("2d");
  }
  return face.ink;
}

// Three things to draw with. The paint pen is opaque and bright. The
// permanent marker is the same colour gone dull, and see-through. The mini
// spray is wide, and made of specks.

function muted(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * 0.62 + 22);
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

// a small seeded generator (mulberry32), so a spray stroke comes out speck
// for speck the same every time it's painted, here or on anyone else's screen
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPRAY_STEP = 0.4; // cm between puffs along the line
const sprayStart = (s) => ({
  rand: seeded(Math.imul(Math.round(s.p[0] * 10) + 1, 73856093) ^ Math.imul(Math.round(s.p[1] * 10) + 1, 19349663) ^ parseInt(s.c.slice(1), 16)),
  from: 0, // the point the can has reached
  carry: SPRAY_STEP, // how far along the next segment the next puff falls
  begun: false,
});

// sprays from wherever `st` says the can had got to, to the end of the stroke
function spray(g, s, st) {
  const p = s.p;
  const half = s.w / 2;
  g.fillStyle = s.c;
  const puff = (x, y) => {
    // the wider the can, the more specks it takes to fill
    for (let n = 0, count = Math.round(8 * s.w); n < count; n++) {
      const a = st.rand() * Math.PI * 2;
      const r = half * Math.pow(st.rand(), 0.9); // thick in the middle, thin at the edge
      const size = (0.12 + st.rand() * 0.035 * s.w) * R; // a wider can throws bigger specks
      g.globalAlpha = 0.45 + st.rand() * 0.5;
      g.fillRect((x + Math.cos(a) * r) * R, (y + Math.sin(a) * r) * R, size, size);
    }
  };
  if (!st.begun) {
    puff(p[0], p[1]);
    st.begun = true;
  }
  for (let i = st.from; i < p.length / 2 - 1; i++) {
    const [x0, y0, x1, y1] = [p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = st.carry;
    for (; d <= len; d += SPRAY_STEP) puff(x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len);
    st.carry = d - len;
    st.from = i + 1;
  }
  g.globalAlpha = 1;
}

// paints a whole stroke onto a face's ink, or onto another canvas if given
function paint(face, s, g = inkOn(face)) {
  const k = s.k ?? "pen"; // lines from before there was a choice were all pen
  if (k === "spray") return spray(g, s, sprayStart(s));
  const p = s.p;
  g.lineCap = g.lineJoin = "round";
  g.globalAlpha = k === "marker" ? 0.6 : 1;
  g.strokeStyle = g.fillStyle = k === "marker" ? muted(s.c) : s.c;
  g.lineWidth = s.w * R;
  g.beginPath();
  if (p.length === 2) {
    g.arc(p[0] * R, p[1] * R, (s.w * R) / 2, 0, Math.PI * 2);
    g.fill();
  } else {
    g.moveTo(p[0] * R, p[1] * R);
    for (let i = 1; i < p.length / 2; i++) g.lineTo(p[i * 2] * R, p[i * 2 + 1] * R);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function stamp(face, st, image) {
  const g = inkOn(face);
  const size = st.s * R;
  g.save();
  g.translate(st.u * R, st.v * R);
  g.rotate(rad(st.r));
  g.drawImage(image, -size / 2, -size / 2, size, size);
  g.restore();
}

// Everything on a face, from the bottom up. A sticker whose picture hasn't
// arrived yet is left out, and the whole face is done again when it does, so
// it ends up under whatever was put on after it.
function redraw(face) {
  const g = inkOn(face);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  let asked = false;
  for (const m of face.marks) {
    if (!("id" in m)) paint(face, m);
    else {
      const image = stickers.image(m.id, asked ? null : () => redraw(face));
      if (image) stamp(face, m, image);
      else asked = true;
    }
  }
}

// one more thing on a face, on top
function put(name, m) {
  const face = faces.get(name);
  if (!face) return;
  face.marks.push(m);
  if (!("id" in m)) return paint(face, m);
  const image = stickers.image(m.id, () => redraw(face));
  if (image) stamp(face, m, image);
}

// The line in progress is drawn on a canvas of its own, wiped and redrawn
// whole as it grows, and only set down on the face when the pen lifts. A
// see-through marker drawn bit by bit would darken at every join otherwise.
let live = null;
function liveOn(face) {
  live ??= Object.assign(document.createElement("canvas"), { className: "ink" }).getContext("2d");
  const ink = inkOn(face).canvas;
  if (live.canvas.width !== ink.width || live.canvas.height !== ink.height) {
    live.canvas.width = ink.width;
    live.canvas.height = ink.height;
  }
  if (live.canvas.previousSibling !== ink) ink.after(live.canvas);
  return live;
}

const tool = { k: "pen", c: INKS[2], w: TOOLS.pen[0] };

for (const c of INKS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swatch";
  b.role = "radio";
  b.dataset.c = c;
  b.style.setProperty("--ink", c);
  b.setAttribute("aria-label", c);
  b.addEventListener("click", () => pick({ c }));
  palette.querySelector(".inks").append(b);
}
for (const b of palette.querySelectorAll(".tool")) b.addEventListener("click", () => pick({ k: b.dataset.k }));
const nibs = [...palette.querySelectorAll(".nib")]; // the narrower, then the wider, of whatever's in your hand
nibs.forEach((nib, i) => nib.addEventListener("click", () => pick({ w: TOOLS[tool.k][i] })));
palette.querySelector(".done").addEventListener("click", () => done());
// a sticker instead of a line: choose which, then click where on this surface
palette.querySelector(".add-sticker").addEventListener("click", async () => {
  const id = await stickers.choose();
  if (id && zoom) stickers.place(id);
});

function pick(change) {
  // narrower or wider carries over from one tool to the next
  const size = Math.max(0, TOOLS[tool.k].indexOf(tool.w));
  Object.assign(tool, change);
  if (!TOOLS[tool.k].includes(tool.w)) tool.w = TOOLS[tool.k][size];
  for (const b of palette.querySelectorAll(".tool")) b.setAttribute("aria-checked", String(b.dataset.k === tool.k));
  for (const b of palette.querySelectorAll(".swatch")) b.setAttribute("aria-checked", String(b.dataset.c === tool.c));
  nibs.forEach((b, i) => b.setAttribute("aria-checked", String(TOOLS[tool.k][i] === tool.w)));
}
pick({});

// the camera goes to meet the spot you clicked: square on to the face, a
// hand's reach off it (further for a wall, closer for a roll of paper),
// and never through anything
function zoomInto(face, u, v) {
  const spot = add(face.o, add(scale(face.u, cm(u)), scale(face.v, cm(v))));
  const reach = cm(clamp((Math.max(face.w, face.h) / K) * 0.75, 10, 30));
  const at = add(spot, scale(face.n, reach));
  const x = clamp(at[0], -W / 2 + cm(4), W / 2 - cm(4));
  const y = clamp(at[1], -H + cm(4), -cm(4));
  const z = clamp(at[2], cm(BACK) + cm(4), cm(DOOR) - cm(4));
  const fwd = scale(face.n, -1);
  const pitch = deg(Math.asin(clamp(fwd[1], -1, 1)));
  let zy = yaw;
  if (Math.abs(fwd[1]) < 0.999) {
    const target = deg(Math.atan2(-fwd[0], -fwd[2]));
    zy = yaw + (((target - yaw + 540) % 360) - 180); // the short way round
  }
  zoom = { face, x: x / K, y: y / K, z: z / K, pitch, yaw: zy };
  el.classList.add("drawing");
  palette.hidden = false;
  sound.click(); // a wall isn't a button, but stepping up to one is the same click
  move(0.9);
}

function done() {
  if (!zoom) return;
  stickers.place(null);
  finish();
  zoom = null;
  el.classList.remove("drawing");
  palette.hidden = true;
  move(0.9);
}

let stroke = null; // the one being drawn: its face, the stroke so far, and the can if it's spray

function begin(e) {
  if (!zoom || e.button !== 0 || stickers.placing) return; // a click with a sticker chosen sticks it
  const face = zoom.face;
  const at = landing(face, rayAt(e.clientX, e.clientY));
  if (!at || at[0] < 0 || at[1] < 0 || at[0] > face.w / K || at[1] > face.h / K) return;
  try {
    viewport.setPointerCapture(e.pointerId); // so the line carries on if the pen leaves the window
  } catch {
    // a pointer that's already gone can't be held; the line just ends at the edge
  }
  const s = { k: tool.k, c: tool.c, w: tool.w, p: [tenth(at[0]), tenth(at[1])] };
  stroke = { face, s, can: s.k === "spray" ? sprayStart(s) : null };
  sound.drawing.start(s.k);
  grow();
}

function extend(e) {
  if (!stroke) return;
  const { face, s } = stroke;
  const at = landing(face, rayAt(e.clientX, e.clientY));
  if (!at) return;
  const u = tenth(clamp(at[0], 0, face.w / K));
  const v = tenth(clamp(at[1], 0, face.h / K));
  const n = s.p.length;
  const moved = Math.hypot(u - s.p[n - 2], v - s.p[n - 1]);
  if (moved < 0.2) return; // the pen hasn't really moved
  s.p.push(u, v);
  sound.drawing.move(moved);
  grow();
}

// shows the stroke as it now stands: spray goes straight on, speck by
// speck; a pen or a marker is redrawn whole on the canvas above
function grow() {
  const { face, s, can } = stroke;
  if (can) return spray(inkOn(face), s, can);
  const g = liveOn(face);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  paint(face, s, g);
}

function finish() {
  if (!stroke) return;
  sound.drawing.stop();
  const { face, s, can } = stroke;
  stroke = null;
  face.marks.push(s);
  if (!can) {
    live.clearRect(0, 0, live.canvas.width, live.canvas.height);
    paint(face, s);
  }
  room.onStroke?.(face.name, s);
}

viewport.addEventListener("pointerdown", begin);
viewport.addEventListener("pointermove", extend);
viewport.addEventListener("pointerup", finish);
viewport.addEventListener("pointercancel", finish);

// --- stickers ------------------------------------------------------------------
// The pile under the bowl is where stickers change hands. It's a heap, not a
// stack: every copy lies loose on the floor, or on the ones under it, so the
// heap is as big as what's been left there.

// under the bowl, but not square under it: off to the left, forward, and askew
const PILE_X = -8;
const PILE_Z = TOILET + 10;
const PILE_TURN = 14; // degrees
const WAD_CM = 12; // a sticker's width
const COPY_CM = 0.12; // how much higher a sticker lies than the one under it

// the spot on the floor where the pile goes, there even when the pile isn't
const pileU = [Math.cos(rad(PILE_TURN)), 0, Math.sin(rad(PILE_TURN))];
const pileV = [-Math.sin(rad(PILE_TURN)), 0, Math.cos(rad(PILE_TURN))];
const spot = plane(
  null,
  "pile-spot",
  cm(16),
  cm(16),
  add([cm(PILE_X), -cm(0.5), cm(PILE_Z)], add(scale(pileU, -cm(8)), scale(pileV, -cm(8)))),
  pileU,
  pileV,
);
spot.dataset.verb = "pile";
const pileGroup = document.createElement("div");
pileGroup.className = "box pile";
world.append(spot, pileGroup);

let pile = []; // [{ id, left }], bottom first

// Every copy in the pile is a sticker of its own, dropped rather than
// stacked: strewn round the spot at any angle, the kinds mixed up, each one
// lying on whatever it landed on. Where each falls comes from its sticker
// and which copy it is, so the heap looks the same every time and to
// everyone, and taking one lifts one off rather than reshuffling the lot.
function drawPile() {
  pileGroup.replaceChildren();
  const copies = [];
  for (const wad of pile) {
    for (let n = 0; n < wad.left; n++) {
      const rand = seeded([...wad.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, n * 7919 + 7));
      copies.push({ id: wad.id, order: rand(), rand });
    }
  }
  copies.sort((a, b) => a.order - b.order);
  // the more there are, the further the heap spreads
  const spread = Math.min(17, 6 + Math.sqrt(copies.length) * 1.1);
  const lying = [];
  for (const copy of copies) {
    const { rand } = copy;
    const far = spread * Math.pow(rand(), 0.7);
    const around = rand() * Math.PI * 2;
    const x = PILE_X + Math.cos(around) * far;
    const z = PILE_Z + Math.sin(around) * far;
    // it rests just above the highest thing under it
    const y = lying.reduce((top, o) => (Math.hypot(o.x - x, o.z - z) < WAD_CM * 0.8 ? Math.max(top, o.y) : top), 0.4) + COPY_CM;
    lying.push({ x, y, z });
    const turn = rand() * Math.PI * 2;
    const u = [Math.cos(turn), 0, Math.sin(turn)];
    const v = [-Math.sin(turn), 0, Math.cos(turn)];
    const half = cm(WAD_CM / 2);
    const sticker = plane(null, "loose", 2 * half, 2 * half, add([cm(x), -cm(y), cm(z)], add(scale(u, -half), scale(v, -half))), u, v);
    sticker.dataset.verb = "pile";
    sticker.append(stickers.img(copy.id, "loose-art"));
    pileGroup.append(sticker);
  }
}

// the picker: what's in the pile to take, and what's yours to leave
const picker = el.querySelector(".picker");

function tile(id, label, onClick, disabled = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile";
  b.disabled = disabled;
  const tag = document.createElement("span");
  tag.textContent = label;
  b.append(stickers.img(id, "tile-art"), tag);
  b.addEventListener("click", onClick);
  return b;
}

const FULL = 10; // the most of one sticker a pile holds

function renderPicker() {
  if (picker.hidden) return;
  const counts = new Map(pile.map((wad) => [wad.id, wad.left]));
  picker.querySelector(".picker-note").textContent = counts.size
    ? 'Take one of each. Stick them with "add a sticker", when you\'re drawing.'
    : "Nothing here yet.";
  picker.querySelector(".picker-pile").replaceChildren(
    ...[...counts].map(([id, n]) => {
      const have = !!stickers.pocket[id];
      return tile(id, have ? `×${n} · you have one` : `×${n}`, () => room.onPile?.("take", id), have);
    }),
  );
  picker.querySelector(".picker-mine-note").textContent = stickers.mine.length
    ? "Leave some of yours. The pile holds ten of each."
    : "You haven't made any. The sticker station is out in the corridor.";
  picker.querySelector(".picker-mine").replaceChildren(
    ...stickers.mine.map(({ id }) => {
      const there = counts.get(id) ?? 0;
      const label = there >= FULL ? "ten there already" : there ? `top up to ${FULL}` : `leave ${FULL}`;
      return tile(id, label, () => room.onPile?.("leave", id), there >= FULL);
    }),
  );
}

function openPicker() {
  picker.hidden = false;
  verb.hidden = true;
  sound.click(); // the pile isn't a button either
  renderPicker();
}

function closePicker() {
  picker.hidden = true;
}

picker.querySelector(".picker-close").addEventListener("click", closePicker);
picker.addEventListener("click", (e) => {
  if (e.target === picker) closePicker(); // a click on the dark around it
});

// what you're carrying changed, or you made a sticker
stickers.on(renderPicker);

// --- the bowl ------------------------------------------------------------------
// What goes in stays in until a flush, and it stays for the next person too:
// the server keeps each stall's bowl and tells us what's in it. The water
// yellows, and anything solid floats until a full flush takes it.

let bowl = { piss: 0, poops: [] };
let shown = ""; // what's drawn, so the same news twice doesn't redraw it
let draining = false;
let poopEls = [];
const CLEAN = [14, 18, 34];
const USED = [150, 128, 18];

function drawBowl() {
  const key = JSON.stringify(bowl);
  if (key === shown) return;
  shown = key;
  const p = Math.min(1, bowl.piss / 3);
  const c = CLEAN.map((a, i) => Math.round(a + (USED[i] - a) * p));
  water.style.setProperty("--water", `rgb(${c.join(" ")})`);
  poopEls.forEach((e) => e.remove());
  poopEls = bowl.poops.map((o) => box("poop", null, o.w, 2.5, o.d, o.x, -38, TOILET + o.z));
  waterGroup.append(...poopEls);
}

// news from the server. Mid-flush it waits: the water has to go down first.
function setBowl(next) {
  bowl = next;
  if (!draining) drawBowl();
}

let refill;
function drain(full) {
  const down = full ? 1.4 : 1;
  clearTimeout(refill);
  draining = true;
  waterGroup.style.transition = `transform ${down}s cubic-bezier(0.5, 0, 0.8, 0.4)`;
  waterGroup.style.transform = `translate3d(0, ${cm(full ? 15 : 8)}px, 0)`;
  refill = setTimeout(() => {
    draining = false;
    drawBowl();
    waterGroup.style.transition = `transform ${full ? 6 : 3.5}s ease-out`;
    waterGroup.style.transform = "translate3d(0, 0, 0)";
  }, down * 1000 + 200);
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

// each noise: how it sounds, and what it does here before the server answers
const noises = {
  piss: { sound: () => sound.piss() },
  shit: { sound: () => sound.plop() },
  half: { sound: () => sound.flush({ full: false }), then: () => drain(false) },
  full: { sound: () => sound.flush({ full: true }), then: () => drain(true) },
};

let busyUntil;
function make(kind) {
  if (el.classList.contains("busy")) return;
  const seconds = noises[kind].sound() || 2;
  noises[kind].then?.();
  room.onNoise?.(kind);
  el.classList.add("busy");
  clearTimeout(busyUntil);
  busyUntil = setTimeout(() => el.classList.remove("busy"), seconds * 1000);
}

// the latch slides across to vacant, and then you're out
let unlocking;
function unlock() {
  if (seated || zoom || latch.classList.contains("open")) return;
  latch.classList.add("open");
  latch.querySelector(".lock-label").textContent = "vacant";
  clearTimeout(unlocking);
  unlocking = setTimeout(() => {
    room.onLeave?.();
    // if the door didn't open (no connection), it locks itself again
    unlocking = setTimeout(relock, 1500);
  }, 450);
}

function relock() {
  clearTimeout(unlocking);
  latch.classList.remove("open");
  latch.querySelector(".lock-label").textContent = "occupied";
}

function ui() {
  const f = facing();
  const free = !seated && !zoom;
  const atToilet = free && f === "front";
  const r = rungs();
  arrows.left.classList.toggle("on", canTurn());
  arrows.right.classList.toggle("on", canTurn());
  arrows.up.classList.toggle("on", free && r.indexOf(tilt) > 0);
  arrows.down.classList.toggle("on", free && r.indexOf(tilt) < r.length - 1);

  actions.replaceChildren();
  if (zoom) return;
  if (seated) {
    act("piss", () => make("piss"));
    act("shit", () => make("shit"));
    act("stand up", stand, true);
  } else if (atToilet && (tilt === "level" || tilt === "down")) {
    act("sit down", sit);
    act("half flush", () => make("half"));
    act("full flush", () => make("full"));
  } else if (canTurn() && f === "exit") {
    act("unlock and leave", unlock);
  }
}

for (const [dir, a] of Object.entries(arrows)) a.addEventListener("click", () => turn(dir));
plate.querySelector(".flush.half").addEventListener("click", () => make("half"));
plate.querySelector(".flush.full").addEventListener("click", () => make("full"));
latch.addEventListener("click", unlock);

// the verb under the cursor: what hovering a thing would do, if anything
// The browser says what's under the pointer, with one gap: it loses track of
// a wall that runs on past the viewer (the partitions, seen from the toilet
// view, do). When it finds nothing at all, the ray is asked instead. The
// room is a box, so a ray from inside it leaves through exactly one surface.
const SURFACES = ["wall-back", "wall-left", "wall-right", "door", "ceiling"];

function target(e) {
  const hit = e.target.closest?.("[data-verb], .face.drawable");
  if (hit || !viewport.contains(e.target) || e.target.closest(".face")) return hit;
  const ray = rayAt(e.clientX, e.clientY);
  for (const name of SURFACES) {
    const face = faces.get(name);
    const at = landing(face, ray);
    if (at && at[0] >= 0 && at[1] >= 0 && at[0] <= face.w / K && at[1] <= face.h / K) return face.el;
  }
  return null;
}

function verbFor(t) {
  if (!t || seated || zoom) return null;
  const v = t.dataset.verb;
  if (v === "pile") return pile.length ? "take" : "leave stickers";
  return v ?? "draw";
}

el.addEventListener("pointermove", (e) => {
  const v = verbFor(target(e));
  verb.hidden = !v;
  el.classList.toggle("verbing", !!v);
  if (v) {
    verb.textContent = v;
    verb.style.translate = `${e.clientX}px ${e.clientY}px`;
  }
});

el.addEventListener("pointerleave", () => {
  verb.hidden = true;
  el.classList.remove("verbing");
});

viewport.addEventListener("click", (e) => {
  if (zoom) {
    // up close with a sticker chosen: it goes on right there, a little
    // askew, over whatever's under it. It shows when the server says so.
    if (!stickers.placing) return;
    const face = zoom.face;
    const at = landing(face, rayAt(e.clientX, e.clientY));
    if (!at || at[0] < 0 || at[1] < 0 || at[0] > face.w / K || at[1] > face.h / K) return;
    room.onStick?.(face.name, { id: stickers.placing, u: at[0], v: at[1], r: Math.round((Math.random() - 0.5) * 24) });
    sound.peel();
    return stickers.place(null);
  }
  const t = target(e);
  const v = verbFor(t);
  if (!v) return;
  if (t.dataset.verb === "pile") return openPicker();
  if (v !== "draw") return; // the latch and the flush buttons answer for themselves
  const face = faces.get(t.dataset.face);
  const at = landing(face, rayAt(e.clientX, e.clientY));
  if (at) zoomInto(face, at[0], at[1]);
});

addEventListener("keydown", (e) => {
  if (el.hidden) return;
  if (e.key === "Escape") {
    if (!picker.hidden || zoom) sound.click(); // stepping back with a key sounds like the button would
    if (!picker.hidden) return closePicker();
    return done();
  }
  const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
  if (!dir) return;
  e.preventDefault();
  if (turn(dir)) sound.click(); // an arrow key sounds like the arrow on screen
});

addEventListener("resize", () => {
  if (el.hidden) return;
  camera.style.transitionDuration = "0s";
  fit();
});

// --- the lamp ------------------------------------------------------------------
// It can't quite hold its charge. Every so often it dips a few times, fast,
// and the whole room dips with it, since every tint is scaled by --lamp.

let lastSecond = null; // the last second of the countdown that was acted on
let flickerTimer;
const setLamp = (level) => el.style.setProperty("--lamp", level.toFixed(2));

function scheduleFlicker() {
  clearTimeout(flickerTimer);
  flickerTimer = setTimeout(flicker, 7000 + Math.random() * 15000);
}

function flicker() {
  const steps = 2 + Math.floor(Math.random() * 4);
  let t = 0;
  for (let i = 0; i < steps; i++) {
    const dip = 0.3 + Math.random() * 0.4;
    setTimeout(() => setLamp(dip), t);
    t += 40 + Math.random() * 70;
    setTimeout(() => setLamp(1), t);
    t += 60 + Math.random() * 120;
  }
  flickerTimer = setTimeout(scheduleFlicker, t);
}

// --- in and out ----------------------------------------------------------------

export const room = {
  // set by the caller: these go to the server
  onLeave: null,
  onNoise: null,
  onStroke: null,
  onPile: null, // ("take" | "leave", sticker id)
  onStick: null, // (face name, { id, u, v, r })

  enter(door = 0) {
    if (!el.hidden) return;
    el.style.setProperty("--lamp-rgb", LAMPS[door % LAMPS.length]);
    yaw = 0;
    tilt = "level";
    seated = false;
    zoom = null;
    stroke = null;
    live?.clearRect(0, 0, live.canvas.width, live.canvas.height); // a line cut off by the door opening
    el.hidden = false;
    el.classList.remove("busy", "verbing", "drawing");
    relock();
    palette.hidden = true;
    verb.hidden = true;
    setLamp(1);
    drawBowl();
    el.style.setProperty("--sight", "1");
    camera.style.transitionDuration = "0s";
    fit();
    void camera.offsetWidth; // land the first view before the fade lifts
    requestAnimationFrame(() => el.classList.add("in"));
    scheduleFlicker();
  },

  exit() {
    el.hidden = true;
    closePicker();
    el.classList.remove("in");
    clearTimeout(flickerTimer);
  },

  // the clock on the door, as words, and as the fraction of the visit left,
  // which is how far the dark has yet to close in
  tick(text, left, seconds) {
    // the clock is heard twice: a few ticks at half a minute to go, and
    // every second of the last five
    if (seconds !== lastSecond) {
      lastSecond = seconds;
      if (seconds === 30) sound.clock(4);
      else if (seconds >= 1 && seconds <= 5) sound.clock(1);
    }
    timer.textContent = text;
    el.style.setProperty("--sight", Math.max(0.12, Math.min(1, left)).toFixed(3));
  },

  // everything in this stall, when you go in: what's on every face, in the
  // order it went on, and the pile
  setStall({ marks = {}, pile: wads = [] }) {
    for (const face of faces.values()) {
      const had = face.marks.length > 0;
      face.marks = marks[face.name] ? [...marks[face.name]] : [];
      if (had || face.marks.length) redraw(face);
    }
    this.setPile(wads);
  },

  setPile(wads) {
    pile = wads;
    drawPile();
    renderPicker();
  },

  // one more line or sticker, from the server: someone else's line, or a
  // sticker anyone (you included) has just stuck
  addStroke: put,
  addStuck: put,

  // a knock on this stall's door, felt a moment after it's heard
  shake() {
    el.classList.remove("shaken");
    void el.offsetWidth; // so a second knock shakes it again
    el.classList.add("shaken");
  },

  setBowl,
  turn,
  sit,
  stand,
  make,
  done,
  // for a test page: go and draw on a named face at a spot, in cm
  zoomAt: (name, u, v) => zoomInto(faces.get(name), u, v),
  landing: (name, x, y) => landing(faces.get(name), rayAt(x, y)),
};
