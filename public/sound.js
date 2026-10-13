// Everything is synthesised; there are no audio files. Browsers only allow
// sound after a click or key press, so the very first hover is silent.

let ac;

export function unlock() {
  ac ??= new AudioContext();
  if (ac.state !== "running") ac.resume();
}
addEventListener("pointerdown", unlock, { once: true });
addEventListener("keydown", unlock, { once: true });

function ctx() {
  return ac && ac.state === "running" ? ac : null;
}

// two seconds of white noise, looped, shared by every watery sound
let noiseBuffer;
function noise(ac) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

// through a stall door, everything above a few hundred hertz is lost
function output(ac, muffled, level) {
  const gain = ac.createGain();
  gain.gain.value = level;
  if (!muffled) {
    gain.connect(ac.destination);
    return gain;
  }
  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 420;
  lowpass.Q.value = 0.7;
  gain.connect(lowpass).connect(ac.destination);
  return gain;
}

// --- the corridor ------------------------------------------------------------

// a creak is stick-slip: a rapid train of tiny clicks whose rate wanders
export function creak() {
  const ac = ctx();
  if (!ac) return;
  const dur = 0.9;
  const t0 = ac.currentTime;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 700;
  filter.Q.value = 6;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  filter.connect(gain).connect(ac.destination);

  let t = t0;
  while (t < t0 + dur) {
    const click = ac.createOscillator();
    click.type = "sawtooth";
    click.frequency.value = 180 + Math.random() * 120;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.6, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    click.connect(env).connect(filter);
    click.start(t);
    click.stop(t + 0.015);
    // the rate slows as the door swings
    t += 0.008 + ((t - t0) / dur) * 0.03 + Math.random() * 0.006;
  }
}

export function knock() {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const offset of [0, 0.09]) {
    const osc = ac.createOscillator();
    osc.frequency.setValueAtTime(140, t0 + offset);
    osc.frequency.exponentialRampToValueAtTime(60, t0 + offset + 0.08);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.5, t0 + offset);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.1);
    osc.connect(env).connect(ac.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.12);
  }
}

// --- the stall ---------------------------------------------------------------
// Both return how long they last, in seconds, so a button can wait it out.

// a stream: band-limited noise that wavers, drifts lower as it weakens, and
// sputters out, over a low wash of water
export function piss({ muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  const dur = 4 + Math.random() * 3;
  const t0 = ac.currentTime;
  const master = output(ac, muffled, muffled ? 0.55 : 0.3);

  const src = noise(ac);
  const stream = ac.createBiquadFilter();
  stream.type = "bandpass";
  stream.frequency.setValueAtTime(2200, t0);
  stream.frequency.linearRampToValueAtTime(1400, t0 + dur);
  stream.Q.value = 1.4;

  const water = ac.createBiquadFilter();
  water.type = "lowpass";
  water.frequency.value = 500;
  const waterGain = ac.createGain();
  waterGain.gain.value = 0.6;

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(1, t0 + 0.4);
  env.gain.setValueAtTime(1, t0 + dur - 1.4);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // the waver
  const lfo = ac.createOscillator();
  lfo.frequency.value = 4.5 + Math.random() * 2;
  const depth = ac.createGain();
  depth.gain.value = 0.25;
  lfo.connect(depth).connect(env.gain);
  lfo.start(t0);
  lfo.stop(t0 + dur);

  // sputters near the end
  const sputter = ac.createGain();
  sputter.gain.value = 1;
  for (let t = t0 + dur - 1.2; t < t0 + dur - 0.15; t += 0.15 + Math.random() * 0.25) {
    sputter.gain.setValueAtTime(0.1, t);
    sputter.gain.setValueAtTime(1, t + 0.06 + Math.random() * 0.05);
  }

  src.connect(stream).connect(env);
  src.connect(water).connect(waterGain).connect(env);
  env.connect(sputter).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
  return dur;
}

// a flush: the rush, which the half button cuts short, a gurgle as the last
// of it goes down, then the cistern hissing as it refills
export function flush({ full = true, muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  const rush = full ? 3.2 : 1.6;
  const t0 = ac.currentTime;
  const master = output(ac, muffled, muffled ? 0.6 : 0.4);

  const src = noise(ac);
  const sweep = ac.createBiquadFilter();
  sweep.type = "lowpass";
  sweep.frequency.setValueAtTime(250, t0);
  sweep.frequency.exponentialRampToValueAtTime(2600, t0 + 0.5);
  sweep.frequency.setValueAtTime(2600, t0 + rush - 0.6);
  sweep.frequency.exponentialRampToValueAtTime(300, t0 + rush);
  sweep.Q.value = 1.2;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(1, t0 + 0.35);
  env.gain.setValueAtTime(1, t0 + rush - 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + rush + 0.2);
  src.connect(sweep).connect(env).connect(master);
  src.start(t0);
  src.stop(t0 + rush + 0.3);

  const gurgle = noise(ac);
  const throat = ac.createBiquadFilter();
  throat.type = "bandpass";
  throat.frequency.value = 320;
  throat.Q.value = 3;
  const gEnv = ac.createGain();
  const gStart = t0 + rush - 0.3;
  gEnv.gain.setValueAtTime(0.0001, gStart);
  gEnv.gain.exponentialRampToValueAtTime(0.8, gStart + 0.1);
  gEnv.gain.exponentialRampToValueAtTime(0.0001, gStart + 1.4);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 7 + Math.random() * 4;
  const depth = ac.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(gEnv.gain);
  lfo.start(gStart);
  lfo.stop(gStart + 1.5);
  gurgle.connect(throat).connect(gEnv).connect(master);
  gurgle.start(gStart);
  gurgle.stop(gStart + 1.5);

  const refill = noise(ac);
  const hiss = ac.createBiquadFilter();
  hiss.type = "bandpass";
  hiss.frequency.value = 4200;
  hiss.Q.value = 0.8;
  const hEnv = ac.createGain();
  const hStart = t0 + rush;
  const fill = full ? 6 : 3.5;
  hEnv.gain.setValueAtTime(0.0001, hStart);
  hEnv.gain.exponentialRampToValueAtTime(0.18, hStart + 0.4);
  hEnv.gain.setValueAtTime(0.18, hStart + fill - 1);
  hEnv.gain.exponentialRampToValueAtTime(0.0001, hStart + fill);
  refill.connect(hiss).connect(hEnv).connect(master);
  refill.start(hStart);
  refill.stop(hStart + fill + 0.1);

  return rush + 1; // the buttons free up once the rush is over
}

// one to three plops: a sine that falls fast, and a short splash after each
export function plop({ muffled = false } = {}) {
  const ac = ctx();
  if (!ac) return 0;
  const t0 = ac.currentTime;
  const master = output(ac, muffled, muffled ? 0.6 : 0.55);
  const count = 1 + Math.floor(Math.random() * 3);
  let t = t0 + 0.25;
  for (let i = 0; i < count; i++) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220 + Math.random() * 90, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + 0.25);

    const src = noise(ac);
    const splash = ac.createBiquadFilter();
    splash.type = "bandpass";
    splash.frequency.value = 900;
    splash.Q.value = 1;
    const splashEnv = ac.createGain();
    splashEnv.gain.setValueAtTime(0.0001, t + 0.01);
    splashEnv.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
    splashEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(splash).connect(splashEnv).connect(master);
    src.start(t + 0.01);
    src.stop(t + 0.16);

    t += 0.35 + Math.random() * 0.7;
  }
  return t - t0;
}
