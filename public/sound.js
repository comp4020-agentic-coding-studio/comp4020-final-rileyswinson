// The sounds, and there are only these:
//   - a door creaking when you hover it
//   - a knock on an occupied door
//   - one small click, the same for every button and choice
//   - the pen, the marker and the spray can, while a line is being drawn
//   - a faint peel when a sticker goes on
//   - a clock ticking when your time is nearly up
//   - pissing, shitting and flushing, which are recordings (see
//     audio/CREDITS.md); everything else is made here from noise and a few
//     oscillators
// It all goes out through one bus that squashes it hard, clips it, and keeps
// only the middle of the band, the way a cheap speaker in a tiled room
// would. Browsers only allow sound after a click or key press, so the very
// first hover is silent.

let ac;
let bus; // everything plays into this
let hall; // the corridor's version of a sound from inside a stall

const CLIPS = ["piss", "fart-1", "fart-2", "fart-3", "plop-1", "plop-2", "flush"];
const clips = new Map(); // name → decoded recording, once it's arrived

export function unlock() {
  ac ??= new AudioContext();
  if (ac.state !== "running") ac.resume();
  fetchClips(ac);
}
addEventListener("pointerdown", unlock, { once: true });
addEventListener("keydown", unlock, { once: true });

// for a test page: use this context instead of making one
export function setContext(context) {
  ac = context;
  bus = hall = undefined;
  return fetchClips(ac);
}

let fetching;
function fetchClips(ac) {
  fetching ??= Promise.all(
    CLIPS.map(async (name) => {
      try {
        const data = await (await fetch(`/audio/${name}.mp3`)).arrayBuffer();
        clips.set(name, await ac.decodeAudioData(data));
      } catch {
        // a recording that won't load is a sound that doesn't play; nothing else minds
      }
    }),
  );
  return fetching;
}

function ctx() {
  if (!ac || (ac.state !== "running" && !(ac instanceof OfflineAudioContext))) return null;
  if (!bus) build(ac);
  return ac;
}

// --- the bus ----------------------------------------------------------------------

// a gentle S-curve: loud things fold over instead of spiking
function clipCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  return curve;
}

function build(ac) {
  const inp = ac.createGain();
  // squash: anything over the threshold is held down hard and fast
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -28;
  comp.knee.value = 4;
  comp.ratio.value = 14;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  const makeup = ac.createGain();
  makeup.gain.value = 2.6;
  const clip = ac.createWaveShaper();
  clip.curve = clipCurve();
  clip.oversample = "2x";
  // the band: no bottom, no top, a bump in the middle
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 160;
  hp.Q.value = 0.9;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  lp.Q.value = 1.1;
  const honk = ac.createBiquadFilter();
  honk.type = "peaking";
  honk.frequency.value = 1900;
  honk.Q.value = 1.2;
  honk.gain.value = 5;
  // tiles: a short slap back off the walls
  const slap = ac.createDelay(0.1);
  slap.delayTime.value = 0.031;
  const slapBack = ac.createGain();
  slapBack.gain.value = 0.28;
  const slapLow = ac.createBiquadFilter();
  slapLow.type = "lowpass";
  slapLow.frequency.value = 2400;
  const out = ac.createGain();
  out.gain.value = 0.45; // the bump and the slap come after the clip, so leave them room

  inp.connect(comp).connect(makeup).connect(clip).connect(hp).connect(lp).connect(honk).connect(out);
  honk.connect(slap).connect(slapLow).connect(slapBack).connect(slap);
  slapBack.connect(out);
  out.connect(ac.destination);
  bus = inp;

  // heard through a door: what's left is low and dull
  const wall = ac.createBiquadFilter();
  wall.type = "lowpass";
  wall.frequency.value = 420;
  wall.Q.value = 0.8;
  wall.connect(inp);
  hall = wall;
}

// where a sound goes: into the room, or through a wall into the corridor
function into(ac, muffled, level) {
  const g = ac.createGain();
  g.gain.value = level;
  g.connect(muffled ? hall : bus);
  return g;
}

// two seconds of white noise, looped, shared by everything that hisses
let noiseBuffer;
function noise(ac) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ac.sampleRate) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

// a short burst of noise through a filter, with an envelope
function burst(ac, dest, { at = ac.currentTime, freq = 1000, q = 1, peak = 0.5, attack = 0.004, decay = 0.08 } = {}) {
  const src = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  src.connect(f).connect(env).connect(dest);
  src.start(at);
  src.stop(at + attack + decay + 0.05);
}

// a thump: a sine that falls, with a knock of noise on the front
function thud(ac, dest, { at = ac.currentTime, from = 150, to = 55, peak = 0.7, decay = 0.14, knock = 0.3 } = {}) {
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + decay);
  const env = ac.createGain();
  env.gain.setValueAtTime(peak, at);
  env.gain.exponentialRampToValueAtTime(0.001, at + decay);
  osc.connect(env).connect(dest);
  osc.start(at);
  osc.stop(at + decay + 0.02);
  if (knock) burst(ac, dest, { at, freq: 900, q: 0.7, peak: knock, decay: 0.03 });
}

// a tick: the smallest click there is
function tick(ac, dest, { at = ac.currentTime, freq = 2600, peak = 0.35, decay = 0.012 } = {}) {
  burst(ac, dest, { at, freq, q: 2, peak, attack: 0.001, decay });
}

// one of the recordings: from `offset` for `dur` seconds, fading out over `fade`
function play(ac, dest, name, { at = ac.currentTime, offset = 0, dur, fade = 0.05, rate = 1, level = 1 } = {}) {
  const buffer = clips.get(name);
  if (!buffer) return 0;
  const length = Math.min(dur ?? Infinity, (buffer.duration - offset) / rate);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const env = ac.createGain();
  env.gain.setValueAtTime(level, at);
  env.gain.setValueAtTime(level, at + Math.max(0, length - fade));
  env.gain.linearRampToValueAtTime(0, at + length);
  src.connect(env).connect(dest);
  src.start(at, offset, length * rate + 0.05);
  return length;
}

// --- the corridor -----------------------------------------------------------------

// A door creaking open on its hinge. A creak is stick-slip: a rapid train of
// tiny clicks whose rate wanders, and slows as the door swings.
export function creak() {
  const ac = ctx();
  if (!ac) return;
  const dur = 0.9;
  const at = ac.currentTime;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 700;
  filter.Q.value = 6;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  filter.connect(gain).connect(into(ac, false, 1));
  for (let t = at; t < at + dur; t += 0.008 + ((t - at) / dur) * 0.03 + Math.random() * 0.006) {
    const click = ac.createOscillator();
    click.type = "sawtooth";
    click.frequency.value = 180 + Math.random() * 120;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.6, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    click.connect(env).connect(filter);
    click.start(t);
    click.stop(t + 0.015);
  }
}

// knuckles on an occupied door: everyone hears it
export function knock() {
  const ac = ctx();
  if (!ac) return;
  const dest = into(ac, false, 1);
  const t0 = ac.currentTime;
  for (const [after, peak] of [[0, 0.6], [0.11, 0.55], [0.22, 0.6]]) {
    thud(ac, dest, { at: t0 + after, from: 150, to: 62, peak, decay: 0.08 });
  }
}

// --- the one click --------------------------------------------------------------------
// Every button, every choice, every step you take makes this and nothing else.

export function click() {
  const ac = ctx();
  if (!ac) return;
  const dest = into(ac, false, 1);
  const at = ac.currentTime + 0.02;
  thud(ac, dest, { at, from: 110, to: 45, peak: 0.4, decay: 0.07, knock: 0.2 });
  tick(ac, dest, { at: at + 0.004, freq: 3200, peak: 0.13, decay: 0.008 });
}

// any button, anywhere
document.addEventListener("click", (e) => {
  if (e.target.closest?.("button")) click();
});

// --- stickers ---------------------------------------------------------------------------

// a sticker going on: a very faint peel off its backing
export function peel() {
  const ac = ctx();
  if (!ac) return;
  const dest = into(ac, false, 0.4);
  const t0 = ac.currentTime;
  const src = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(1500, t0);
  f.frequency.exponentialRampToValueAtTime(4200, t0 + 0.3);
  f.Q.value = 2.5;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.3, t0 + 0.05);
  env.gain.setValueAtTime(0.3, t0 + 0.24);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
  // the crackle as the glue lets go
  const lfo = ac.createOscillator();
  lfo.type = "square";
  lfo.frequency.setValueAtTime(40, t0);
  lfo.frequency.exponentialRampToValueAtTime(90, t0 + 0.3);
  const depth = ac.createGain();
  depth.gain.value = 0.15;
  lfo.connect(depth).connect(env.gain);
  lfo.start(t0);
  lfo.stop(t0 + 0.35);
  src.connect(f).connect(env).connect(dest);
  src.start(t0);
  src.stop(t0 + 0.4);
}

// --- drawing --------------------------------------------------------------------------
// A line is one sound that lasts as long as the pen is down. It starts when
// the pen lands, is steered by how fast it moves, and stops when it lifts.

let line = null;

function startLine(kind) {
  const ac = ctx();
  if (!ac) return;
  stopLine();
  const dest = into(ac, false, 1);
  const t0 = ac.currentTime;
  const src = noise(ac);
  const f = ac.createBiquadFilter();
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  if (kind === "spray") {
    // the hiss of the can: wide, steady, with the rattle of the ball first
    f.type = "bandpass";
    f.frequency.value = 3600;
    f.Q.value = 0.7;
    env.gain.exponentialRampToValueAtTime(0.5, t0 + 0.06);
    for (let i = 0; i < 3; i++) tick(ac, dest, { at: t0 + i * 0.045, freq: 1900, peak: 0.3, decay: 0.015 });
  } else if (kind === "marker") {
    // felt on paint: a dry scratch that only sounds while it moves
    f.type = "bandpass";
    f.frequency.value = 2200;
    f.Q.value = 1.2;
  } else {
    // a paint pen's nib: a thin squeak that only sounds while it moves
    f.type = "bandpass";
    f.frequency.value = 3200;
    f.Q.value = 6;
    tick(ac, dest, { at: t0, freq: 2400, peak: 0.25, decay: 0.01 });
  }
  src.connect(f).connect(env).connect(dest);
  src.start(t0);
  line = { ac, src, f, env, kind, dest };
}

// the pen moved `speed` cm since last time; a line only sounds while it moves
function moveLine(speed) {
  if (!line || line.kind === "spray") return;
  const { ac, env, f, kind } = line;
  const now = ac.currentTime;
  const level = Math.min(kind === "pen" ? 0.35 : 0.45, speed * (kind === "pen" ? 0.18 : 0.25));
  env.gain.cancelScheduledValues(now);
  env.gain.setTargetAtTime(Math.max(0.0001, level), now, 0.02);
  env.gain.setTargetAtTime(0.0001, now + 0.08, 0.05); // and dies if it doesn't move again
  if (kind === "pen") f.frequency.setTargetAtTime(2600 + Math.min(1, speed / 3) * 1600, now, 0.03);
}

function stopLine() {
  if (!line) return;
  const { ac, env, src, kind, dest } = line;
  const now = ac.currentTime;
  env.gain.cancelScheduledValues(now);
  env.gain.setTargetAtTime(0.0001, now, kind === "spray" ? 0.05 : 0.02);
  src.stop(now + 0.3);
  if (kind === "spray") tick(ac, dest, { at: now + 0.02, freq: 1600, peak: 0.2, decay: 0.02 });
  line = null;
}

export const drawing = { start: startLine, move: moveLine, stop: stopLine };

// --- the clock --------------------------------------------------------------------------

// `count` ticks of a clock, a tick and a tock by turns, half a second apart
export function clock(count = 1) {
  const ac = ctx();
  if (!ac) return;
  const dest = into(ac, false, 0.8);
  const t0 = ac.currentTime;
  for (let i = 0; i < count; i++) {
    const at = t0 + i * 0.5;
    tick(ac, dest, { at, freq: i % 2 ? 1700 : 2300, peak: 0.5, decay: 0.02 });
    thud(ac, dest, { at, from: i % 2 ? 420 : 560, to: 300, peak: 0.12, decay: 0.03, knock: 0 });
  }
}

// --- the toilet -----------------------------------------------------------------------------
// Recordings. Each returns how long it lasts, in seconds, so a button can
// wait it out, and each has a muffled form for everyone in the corridor.

// a stream into the water: a stretch of the recording, of no fixed length,
// starting somewhere different each time and trailing off
export function piss({ muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  const dur = 4 + Math.random() * 3;
  const offset = Math.random() * 1.8;
  return play(ac, into(ac, muffled, muffled ? 1.6 : 0.9), "piss", { offset, dur, fade: 1.3, rate: 0.96 + Math.random() * 0.08 });
}

// a fart, then one to three things landing in the water
export function plop({ muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  const dest = into(ac, muffled, muffled ? 1.8 : 0.9);
  const t0 = ac.currentTime;
  const pick = (names) => names[Math.floor(Math.random() * names.length)];
  let t = 0.1;
  t += play(ac, dest, pick(["fart-1", "fart-2", "fart-3"]), { at: t0 + t, rate: 0.9 + Math.random() * 0.25 });
  t += 0.15 + Math.random() * 0.35;
  for (let i = 0, count = 1 + Math.floor(Math.random() * 3); i < count; i++) {
    const length = play(ac, dest, pick(["plop-1", "plop-2"]), { at: t0 + t, rate: 0.85 + Math.random() * 0.3 });
    t += length + (i < count - 1 ? 0.2 + Math.random() * 0.6 : 0);
  }
  return t;
}

// a cistern emptying into the bowl: all of it for a full flush, the first
// part for a half
export function flush({ full = true, muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  return play(ac, into(ac, muffled, muffled ? 1.8 : 0.9), "flush", full ? { fade: 0.4 } : { dur: 3.2, fade: 1 });
}
