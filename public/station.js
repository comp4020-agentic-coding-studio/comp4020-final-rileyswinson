// The sticker station: where a sticker gets made, and it's out in the
// corridor, never in a stall. You draw its outline, in as many goes as you
// like, until the two ends meet. Then you choose the colour of its edge and
// of its inside, and draw on it. Then it's yours: the server keeps the
// picture and this browser remembers it's one of yours.

import { stickers } from "./stickers.js";

const SIZE = 192; // the sticker's picture, px
const MARGIN = 12; // room for the edge
const EDGE = 12; // how wide the edge is
const CLOSE = 11; // how near the start the end has to come for the two to join
const MAX_PNG = 60000; // what the server will take
const INKS = ["#111111", "#e8e4d8", "#d7263d", "#1b6ef3", "#19a85a", "#f2c200", "#ff5fa2", "#ff7a1a", "#8a2be2", "#6b4a2b"];

const el = document.getElementById("station");
const canvas = el.querySelector("canvas");
const g = canvas.getContext("2d");
const status = el.querySelector(".station-status");
const finish = el.querySelector(".station-finish");

let outline = []; // the outline so far, as points
let shape = null; // the outline, closed, once its ends have met
let away = false; // the line has left the start, so coming back means closing
let hover = null; // where the pointer is, between goes
let edge = INKS[1]; // the colour of the sticker's edge
let base = INKS[5]; // the colour of its inside
let ink = INKS[0]; // what you're drawing on it with
let nib = 5;
let marks = []; // what's drawn on it: { c, w, p: [[x, y], …] }
let mark = null; // the one being drawn
let dragging = false;
let finishing = false;

canvas.width = canvas.height = SIZE;

// --- the picture ---------------------------------------------------------------

const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r;
const closable = () => outline.length >= 3 && away;

function render() {
  g.clearRect(0, 0, SIZE, SIZE);
  g.lineJoin = g.lineCap = "round";
  if (!shape) {
    if (!outline.length) return;
    const start = outline[0];
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 2;
    g.beginPath();
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    // between goes: a dashed line to where the next one would start
    if (hover && !dragging) {
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(...outline[outline.length - 1]);
      g.lineTo(...hover);
      g.stroke();
      g.setLineDash([]);
    }
    // where it began, which is where it has to end; it fills when you're there
    const end = dragging ? outline[outline.length - 1] : hover;
    const home = closable() && end && near(end, start, CLOSE);
    g.beginPath();
    g.arc(start[0], start[1], home ? 7 : 5, 0, Math.PI * 2);
    g.fillStyle = home ? "#19a85a" : "#fff";
    g.fill();
    g.stroke();
    return;
  }
  // the edge, a little proud of the shape all round
  g.strokeStyle = g.fillStyle = edge;
  g.lineWidth = EDGE;
  g.stroke(shape);
  g.fill(shape);
  // the inside, and what's drawn on it, kept within the outline
  g.save();
  g.clip(shape);
  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  for (const m of marks) {
    g.strokeStyle = g.fillStyle = m.c;
    g.lineWidth = m.w;
    g.beginPath();
    if (m.p.length === 1) {
      g.arc(m.p[0][0], m.p[0][1], m.w / 2, 0, Math.PI * 2);
      g.fill();
    } else {
      m.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }
  g.restore();
}

// a closed, slightly smoothed path through the outline's points
function closed(pts) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const path = new Path2D();
  const start = mid(pts[pts.length - 1], pts[0]);
  path.moveTo(start[0], start[1]);
  pts.forEach((p, i) => {
    const m = mid(p, pts[(i + 1) % pts.length]);
    path.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  });
  path.closePath();
  return path;
}

function area(pts) {
  let a = 0;
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    a += x * ny - nx * y;
  });
  return Math.abs(a) / 2;
}

function at(e) {
  const r = canvas.getBoundingClientRect();
  const clamp = (n) => Math.min(SIZE - MARGIN, Math.max(MARGIN, n));
  return [clamp(((e.clientX - r.left) / r.width) * SIZE), clamp(((e.clientY - r.top) / r.height) * SIZE)];
}

function say(text) {
  status.textContent = text;
}

// which of the steps listed above the picture you're on
function stage(name) {
  el.dataset.stage = name;
  finish.disabled = !shape || finishing;
}

// the two ends have met
function join() {
  dragging = false;
  if (area(outline) < 900) {
    outline = [];
    away = false;
    render();
    return say("That's too small to be a sticker. Try a bigger outline.");
  }
  shape = closed(outline);
  say("");
  stage("decorate");
  render();
}

// --- the outline, then the drawing ---------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  if (finishing) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // a pointer that's already gone can't be held
  }
  const p = at(e);
  dragging = true;
  if (shape) {
    mark = { c: ink, w: nib, p: [p] };
    marks.push(mark);
  } else {
    if (el.dataset.stage !== "outline") stage("outline");
    say("");
    // a click back on the start closes it; anywhere else carries the line on
    if (closable() && near(p, outline[0], CLOSE)) return join();
    outline.push(p);
  }
  render();
});

canvas.addEventListener("pointermove", (e) => {
  const p = at(e);
  hover = p;
  if (!dragging) return render();
  const list = shape ? mark?.p : outline;
  if (!list) return;
  const last = list[list.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
  if (!shape) {
    // once the line has been somewhere, arriving back at the start closes it
    if (!near(p, outline[0], CLOSE * 2)) away = true;
    else if (closable() && near(p, outline[0], CLOSE)) return join();
  }
  list.push(p);
  render();
});

function lift() {
  dragging = false;
  mark = null;
  render();
}
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);
canvas.addEventListener("pointerleave", () => {
  hover = null;
  render();
});

// --- the colours, the size, and the buttons ----------------------------------------------

function swatches(row, get, set) {
  const sync = () => {
    for (const b of row.children) b.setAttribute("aria-checked", String(b.dataset.c === get()));
  };
  for (const c of INKS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.role = "radio";
    b.dataset.c = c;
    b.style.setProperty("--ink", c);
    b.setAttribute("aria-label", c);
    b.addEventListener("click", () => {
      set(c);
      sync();
      render();
    });
    row.append(b);
  }
  sync();
}
swatches(el.querySelector(".station-edge"), () => edge, (c) => (edge = c));
swatches(el.querySelector(".station-base"), () => base, (c) => (base = c));
swatches(el.querySelector(".station-ink"), () => ink, (c) => (ink = c));

const sizes = [...el.querySelectorAll(".station-size")];
const syncSizes = () => sizes.forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.w) === nib)));
for (const b of sizes) {
  b.addEventListener("click", () => {
    nib = Number(b.dataset.w);
    syncSizes();
  });
}
syncSizes();

function again() {
  outline = [];
  shape = null;
  away = false;
  hover = null;
  marks = [];
  mark = null;
  dragging = false;
  finishing = false;
  say("");
  stage("outline");
  render();
}
el.querySelector(".station-again").addEventListener("click", again);
el.querySelector(".station-close").addEventListener("click", () => station.close());

finish.addEventListener("click", () => {
  if (!shape || finishing) return;
  const png = canvas.toDataURL("image/png");
  if (png.length > MAX_PNG) return say("There's too much on it. Take some off, or start again.");
  finishing = true;
  finish.disabled = true;
  say("Finishing…");
  station.onFinish?.(png);
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.hidden) station.close();
});

export const station = {
  onFinish: null, // set by the caller: sends the picture to the server

  open() {
    el.hidden = false;
    again();
  },

  close() {
    el.hidden = true;
  },

  // the server kept it
  made(id, png) {
    stickers.addMine(id, png);
    again();
    stage("done");
    say("Done. It's with your stickers now.");
  },

  refused() {
    finishing = false;
    stage("decorate");
    say("That one wouldn't go through. Try something simpler.");
  },
};
