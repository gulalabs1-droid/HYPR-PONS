// Original score for each film, synthesized from scratch (no samples, nothing to license).
// node music.mjs <story> <out.wav>
import { writeFileSync } from "node:fs";

const SR = 44100;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const N = name => { // "A4", "C#5", "Bb3" → midi number
  const [, letter, acc, oct] = name.match(/^([A-G])([#b]?)(-?\d)$/);
  return 12 * (Number(oct) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0);
};
const chord = s => s.split(" ").map(N);

function track(duration) {
  const n = Math.ceil(duration * SR);
  return { L: new Float32Array(n), R: new Float32Array(n), dry: { L: new Float32Array(n), R: new Float32Array(n) }, duration, n };
}
let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Warm pad: detuned sines with soft harmonics and slow swells. Goes to the reverb bus. */
function pad(tr, notes, t0, dur, amp = .1, { attack = 1.6, release = 2.2, bright = .3 } = {}) {
  const start = Math.floor(t0 * SR), len = Math.floor((dur + release) * SR);
  notes.forEach((m, k) => {
    const f = midi(m), pan = .5 + (k / Math.max(1, notes.length - 1) - .5) * .6;
    [-7, 0, 7].forEach(cents => {
      const ff = f * Math.pow(2, cents / 1200), ph = rand() * 6.28;
      for (let i = 0; i < len && start + i < tr.n; i++) {
        const t = i / SR;
        const env = t < attack ? Math.sin((t / attack) * Math.PI / 2) ** 2 : t < dur ? 1 : Math.cos(Math.min(1, (t - dur) / release) * Math.PI / 2) ** 2;
        const w = 2 * Math.PI * ff * t + ph;
        const v = (Math.sin(w) + bright * Math.sin(2 * w) + bright * .35 * Math.sin(3 * w)) * env * amp / (3 * notes.length ** .5);
        tr.L[start + i] += v * (1 - pan); tr.R[start + i] += v * pan;
      }
    });
  });
}
/** Soft felt piano: decaying partials with a gentle hammer. */
function piano(tr, m, t0, amp = .16, { len = 4.5, pan = .5 } = {}) {
  const f = midi(m), start = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const partials = [[1, 1, 1.1], [2, .42, 1.9], [3, .2, 2.8], [4, .09, 3.6], [5, .04, 4.5]];
  for (let i = 0; i < n && start + i < tr.n; i++) {
    const t = i / SR, atk = Math.min(1, t / .006);
    let v = 0;
    for (const [h, a, d] of partials) v += a * Math.sin(2 * Math.PI * f * h * (1 + .0004 * h * h) * t) * Math.exp(-t * d * (f > 600 ? 1.25 : 1));
    v *= atk * amp * (1 - Math.min(1, Math.max(0, (t - len + .4) / .4)));
    tr.L[start + i] += v * (1 - pan) * 1.2; tr.R[start + i] += v * pan * 1.2;
  }
}
/** Electric piano for the late-night film: sine with tremolo and a soft bell. */
function keys(tr, notes, t0, dur = 2.2, amp = .09) {
  notes.forEach((m, k) => {
    const f = midi(m), start = Math.floor((t0 + k * .018) * SR), n = Math.floor((dur + 1.5) * SR);
    for (let i = 0; i < n && start + i < tr.n; i++) {
      const t = i / SR, env = Math.min(1, t / .01) * Math.exp(-t * .9) * (t > dur ? Math.exp(-(t - dur) * 3) : 1);
      const trem = 1 - .25 * (1 + Math.sin(2 * Math.PI * 4.2 * t)) / 2;
      const v = (Math.sin(2 * Math.PI * f * t) + .18 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 6)) * env * trem * amp;
      tr.L[start + i] += v * (.4 + .2 * Math.sin(2 * Math.PI * 4.2 * t)); tr.R[start + i] += v * (.6 - .2 * Math.sin(2 * Math.PI * 4.2 * t));
    }
  });
}
/** Heartbeat-like low thump. Kept dry so it stays tight. */
function thump(tr, t0, amp = .5) {
  const start = Math.floor(t0 * SR), n = Math.floor(.9 * SR);
  let ph = 0;
  for (let i = 0; i < n && start + i < tr.n; i++) {
    const t = i / SR, f = 38 + 34 * Math.exp(-t * 18);
    ph += 2 * Math.PI * f / SR;
    const v = Math.sin(ph) * Math.exp(-t * 5.5) * Math.min(1, t / .004) * amp * .5;
    tr.dry.L[start + i] += v; tr.dry.R[start + i] += v;
  }
}
/** Chat message blip. */
function blip(tr, t0, amp = .05, up = 1) {
  const start = Math.floor(t0 * SR), n = Math.floor(.25 * SR);
  for (let i = 0; i < n && start + i < tr.n; i++) {
    const t = i / SR, f = 1046 * up * (1 + .5 * Math.min(1, t / .03));
    const v = (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 26) * Math.min(1, t / .002) * amp;
    tr.L[start + i] += v; tr.R[start + i] += v;
  }
}
/** Filtered-noise swell into a reveal. */
function riser(tr, t0, dur, amp = .08) {
  const start = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < n && start + i < tr.n; i++) {
    const k = i / n, a = .02 + .5 * k * k;
    lp += a * ((rand() * 2 - 1) - lp);
    const v = lp * k * k * amp;
    tr.L[start + i] += v; tr.R[start + i] += v * .9;
  }
}
/** Vinyl crackle and hiss. */
function vinyl(tr, t0, t1, amp = .02) {
  let lp = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(tr.n, t1 * SR); i++) {
    lp += .08 * ((rand() * 2 - 1) - lp);
    let v = lp * amp * .6;
    if (rand() < .00035) v += (rand() * 2 - 1) * amp * 6;
    tr.dry.L[i] += v; tr.dry.R[i] += v;
  }
}
/** Soft brushed hat. */
function hat(tr, t0, amp = .02) {
  const start = Math.floor(t0 * SR), n = Math.floor(.12 * SR); let prev = 0;
  for (let i = 0; i < n && start + i < tr.n; i++) { const x = rand() * 2 - 1, hp = x - prev; prev = x; const v = hp * Math.exp(-i / SR * 40) * amp; tr.dry.L[start + i] += v * .8; tr.dry.R[start + i] += v; }
}

/** Schroeder reverb on the wet bus, then mix with the dry bus, soft-clip and normalise. */
function master(tr, { wet = .38, fadeIn = .4, fadeOut = 1.4 } = {}) {
  const verb = (x, offset) => {
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
    const aps = [556, 441, 341].map(d => ({ buf: new Float32Array(d + offset), i: 0 }));
    const out = new Float32Array(x.length);
    for (let n = 0; n < x.length; n++) {
      let s = 0;
      for (const c of combs) { const y = c.buf[c.i]; c.lp = y * .7 + c.lp * .3; c.buf[c.i] = x[n] * .5 + c.lp * .86; c.i = (c.i + 1) % c.buf.length; s += y; }
      s /= combs.length;
      for (const a of aps) { const b = a.buf[a.i]; const y = -s + b; a.buf[a.i] = s + b * .5; a.i = (a.i + 1) % a.buf.length; s = y; }
      out[n] = s;
    }
    return out;
  };
  const wl = verb(tr.L, 0), wr = verb(tr.R, 23);
  const L = new Float32Array(tr.n), R = new Float32Array(tr.n);
  let peak = 0;
  for (let i = 0; i < tr.n; i++) {
    const t = i / SR, fade = Math.min(1, t / fadeIn, (tr.duration - t) / fadeOut);
    L[i] = Math.tanh((tr.L[i] * (1 - wet * .5) + wl[i] * wet * 2.2 + tr.dry.L[i]) * 1.1) * Math.max(0, fade);
    R[i] = Math.tanh((tr.R[i] * (1 - wet * .5) + wr[i] * wet * 2.2 + tr.dry.R[i]) * 1.1) * Math.max(0, fade);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = .89 / (peak || 1);
  return { L: L.map(v => v * g), R: R.map(v => v * g) };
}
function wav(path, { L, R }) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(L[i] * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * 32767), 46 + i * 4); }
  writeFileSync(path, buf);
}

// ---------------- scores (cue times match the stories) ----------------
const scores = {
  "room-stays"() {
    const tr = track(37);
    // Act 1: someone goes live to almost no one. A minor, sparse.
    pad(tr, chord("A2 E3 A3 C4"), .3, 7.6, .09, { attack: 2.5 });
    pad(tr, chord("F2 C3 A3 C4 E4"), 8.2, 5.4, .11);
    [["E5", 1.0], ["C5", 2.4], ["A4", 3.8], ["E5", 5.6], ["D5", 6.8], ["C5", 8.3], ["E5", 9.6], ["G5", 11.0], ["A5", 12.3]].forEach(([m, t]) => piano(tr, N(m), t, .13, { pan: .45 + rand() * .1 }));
    [9.0, 10.8, 12.1].forEach(t => blip(tr, t, .045));
    // Act 2: the stream ends. Thump, then a falling line.
    thump(tr, 13.7, .55);
    pad(tr, chord("D2 A2 D3 F3"), 13.7, 4.2, .1, { attack: 1.2, release: 1.6, bright: .15 });
    [["A4", 13.9], ["G4", 15.1], ["F4", 16.3], ["E4", 17.5]].forEach(([m, t]) => piano(tr, N(m), t, .12, { len: 5 }));
    // The silence: a single held note.
    pad(tr, [N("E5")], 18.6, 1.6, .035, { attack: .8, release: 1.4, bright: 0 });
    // Act 3: the room is still there. Lift into C major.
    riser(tr, 19.6, 1.7, .1);
    thump(tr, 21.2, .4);
    pad(tr, chord("C3 G3 C4 E4"), 21.2, 2.2, .13); pad(tr, chord("G2 D3 G3 B3 D4"), 23.4, 2.2, .13);
    pad(tr, chord("A2 E3 A3 C4 E4"), 25.6, 2.2, .13); pad(tr, chord("F2 C3 F3 A3 C4"), 27.8, 2.2, .14);
    [["C5", 21.3], ["E5", 21.55], ["G5", 21.8], ["E5", 22.8], ["D5", 23.5], ["B4", 24.2], ["C5", 25.0], ["E5", 25.7], ["A5", 26.6], ["G5", 27.3]].forEach(([m, t]) => piano(tr, N(m), t, .12));
    [23.3, 23.8, 25.0].forEach(t => blip(tr, t, .04)); blip(tr, 26.6, .05, 1.5);
    // Act 4: "Streams end. Communities shouldn't." then the brand.
    thump(tr, 28.1, .5); thump(tr, 29.7, .6);
    pad(tr, chord("G2 D3 G3 B3 D4 G4"), 30.0, 2.0, .15);
    riser(tr, 30.4, 1.6, .08);
    pad(tr, chord("C2 G2 C3 G3 C4 E4 G4"), 32.0, 3.2, .17, { release: 3 });
    [["C5", 32.0], ["G5", 32.2], ["E6", 32.45], ["C6", 33.6]].forEach(([m, t]) => piano(tr, N(m), t, .12, { len: 5 }));
    thump(tr, 32.0, .45);
    return master(tr);
  },
  "night-one"() {
    const tr = track(33);
    // Each night opens with a heartbeat; the harmony fills in as the room fills in.
    [.6, 4.7, 8.7, 12.7].forEach((t, i) => thump(tr, t, .35 + i * .07));
    pad(tr, chord("D3 A3"), .4, 4.0, .07, { attack: 2, bright: .1 });
    piano(tr, N("D5"), 1.2, .1); piano(tr, N("A4"), 3.0, .08);
    pad(tr, chord("Bb2 F3 Bb3 D4"), 4.6, 3.9, .09);
    [["F5", 5.0], ["D5", 5.8], ["C5", 6.9], ["D5", 7.7]].forEach(([m, t]) => piano(tr, N(m), t, .11));
    pad(tr, chord("F2 C3 F3 A3 C4"), 8.6, 3.9, .11);
    [["A4", 8.9], ["C5", 9.3], ["F5", 9.7], ["E5", 10.5], ["C5", 11.1], ["A5", 11.8]].forEach(([m, t]) => piano(tr, N(m), t, .11));
    pad(tr, chord("C3 G3 C4 E4"), 12.6, 2.4, .12); pad(tr, chord("D3 A3 D4 F4 A4"), 15.0, 2.4, .13);
    [12.9, 13.35, 13.8, 14.25, 14.7, 15.4, 15.9, 16.4].forEach((t, i) => piano(tr, N(["C5", "E5", "G5", "E5", "D5", "F5", "A5", "D6"][i]), t, .1));
    [[5.6], [6.9], [9.3], [10.3], [11.3], [13.0], [13.45], [13.9], [14.35]].forEach(([t]) => blip(tr, t, .035));
    blip(tr, 15.0, .05, 1.5);
    // "You never needed millions." — hush, then the lift on "the ones who come back".
    pad(tr, chord("Bb2 F3 Bb3 D4"), 17.6, 2.0, .08, { attack: .8 });
    riser(tr, 18.3, 1.6, .08);
    thump(tr, 19.9, .55);
    pad(tr, chord("F2 C3 F3 A3 C4 F4"), 19.9, 1.9, .15);
    // HYPR remembers.
    pad(tr, chord("F2 C3 F3 A3"), 21.8, 1.5, .12); pad(tr, chord("C3 G3 C4 E4"), 23.3, 1.5, .12);
    pad(tr, chord("D3 A3 D4 F4"), 24.8, 1.5, .12); pad(tr, chord("Bb2 F3 Bb3 D4"), 26.3, 1.5, .13);
    [["C5", 22.0], ["F5", 22.4], ["A5", 22.8], ["G5", 23.5], ["E5", 24.0], ["F5", 24.9], ["D5", 25.5], ["F5", 26.4], ["Bb5", 27.0]].forEach(([m, t]) => piano(tr, N(m), t, .11));
    [23.4, 23.6, 23.8, 24.0, 24.2].forEach((t, i) => blip(tr, t, .025, 1 + i * .12));
    // Brand: F major, open and resolved.
    thump(tr, 27.9, .45);
    pad(tr, chord("F2 C3 F3 A3 C4 F4 A4"), 27.9, 3.4, .17, { release: 2.6 });
    [["F5", 27.9], ["C6", 28.15], ["A5", 28.4], ["F6", 29.4]].forEach(([m, t]) => piano(tr, N(m), t, .11, { len: 5 }));
    return master(tr);
  },
  "two-am"() {
    const tr = track(28);
    vinyl(tr, 0, 28, .03);
    // The clock: barely-there ticks.
    for (let s = .5; s < 4.8; s += 1) blip(tr, s, .012, .5);
    keys(tr, chord("F3 A3 C4 E4"), .6, 3.6, .06); keys(tr, chord("E3 G3 B3 D4"), 4.8, 3.6, .06);
    // Finding the room: a slow, warm late-night groove.
    const prog = [["D3 F3 A3 C4", 8.8], ["C3 E3 G3 B3", 11.0], ["F3 A3 C4 E4", 13.2], ["E3 G3 B3 D4", 15.4]];
    prog.forEach(([c, t]) => { keys(tr, chord(c), t, 2.0, .085); pad(tr, [chord(c)[0] - 12], t, 2.0, .06, { attack: .3, release: .8, bright: .1 }); });
    for (let t = 8.8; t < 18.6; t += 1.1) { thump(tr, t, .28); hat(tr, t + .55, .025); }
    [9.8, 10.8, 11.8, 12.9].forEach(t => blip(tr, t, .035)); blip(tr, 16.3, .05, 1.2); blip(tr, 17.3, .05, 1.5);
    [["A5", 14.6], ["G5", 15.3], ["E5", 16.0], ["C6", 17.3]].forEach(([m, t]) => piano(tr, N(m), t, .07));
    // "Some places feel like home. Even online."
    keys(tr, chord("F3 A3 C4 E4 G4"), 18.9, 3.4, .09);
    pad(tr, chord("F2 C3 A3"), 18.9, 3.2, .08);
    riser(tr, 20.8, 1.6, .05);
    // Brand: C major 9, settled.
    keys(tr, chord("C3 G3 B3 D4 E4"), 22.6, 4.0, .1);
    pad(tr, chord("C2 G2 E3 G3"), 22.6, 3.6, .1, { release: 2 });
    piano(tr, N("E5"), 22.7, .08); piano(tr, N("G5"), 23.0, .07); piano(tr, N("D6"), 23.4, .06);
    return master(tr, { wet: .32 });
  },
};

const [story, out] = process.argv.slice(2);
wav(out, scores[story]());
console.log(`wrote ${out}`);
