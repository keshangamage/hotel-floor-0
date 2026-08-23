/**
 * Cuts a recording of someone walking into individual footfalls.
 *
 * The game triggers one step per stride, timed off distance travelled, so a
 * continuous loop is no use: it would drift out of phase with the legs and
 * ignore how fast the player is moving. This finds the footfalls, keeps the
 * cleanest and most varied of them, and writes them as one sprite plus a table
 * of offsets.
 *
 *   node tools/build-audio.mjs
 *
 * Decoding uses afconvert, which ships with macOS.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = "footstep.mp3";
const DOOR_SOURCE = "door.mp3";
const OUT_AUDIO = "apps/web/public/audio/footsteps.wav";
const OUT_DOOR = "apps/web/public/audio/door.wav";
const OUT_TABLE = "apps/web/game/data/footsteps.generated.ts";

const RATE = 24000;
/** How many distinct steps to keep. Enough that a repeat is never obvious. */
const KEEP = 8;
/** A footfall cannot follow another this closely, so anything nearer is the
 *  same step's transient being counted twice. */
const REFRACTORY = 0.14;
/** Captured either side of the onset: a little run up, then the whole tail. */
const LEAD = 0.012;
const TAIL = 0.34;
/** A door swing takes 0.9s, so the creak is trimmed to cover it and no more. */
const DOOR_SECONDS = 0.95;

function decode(file) {
  const wav = join(tmpdir(), `hf0-${process.pid}.wav`);
  execFileSync("afconvert", [file, "-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", wav]);
  const raw = readFileSync(wav);
  rmSync(wav, { force: true });

  let pos = 12;
  let data = null;
  while (pos < raw.length - 8) {
    const id = raw.toString("ascii", pos, pos + 4);
    const size = raw.readUInt32LE(pos + 4);
    if (id === "data") { data = raw.subarray(pos + 8, pos + 8 + size); break; }
    pos += 8 + size + (size & 1);
  }
  if (!data) throw new Error("no data chunk");
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = data.readInt16LE(i * 2) / 32768;
  return samples;
}

const audio = decode(SOURCE);
console.log(`decoded ${(audio.length / RATE).toFixed(2)}s at ${RATE} Hz`);

// Energy envelope in 5ms windows.
const win = Math.round(RATE * 0.005);
const env = new Float32Array(Math.floor(audio.length / win));
for (let w = 0; w < env.length; w += 1) {
  let acc = 0;
  for (let i = w * win; i < (w + 1) * win; i += 1) acc += audio[i] * audio[i];
  env[w] = Math.sqrt(acc / win);
}
const peak = env.reduce((m, v) => Math.max(m, v), 0);

// An onset is a rise past the threshold, but only once the signal has dropped
// well below it again, and never inside the refractory window.
const rise = peak * 0.2;
const fall = peak * 0.07;
const gapWindows = Math.round(REFRACTORY / 0.005);
const onsets = [];
let armed = true;
for (let w = 0; w < env.length; w += 1) {
  if (armed && env[w] > rise) {
    const last = onsets.at(-1);
    if (last === undefined || w - last >= gapWindows) onsets.push(w);
    armed = false;
  } else if (!armed && env[w] < fall) {
    armed = true;
  }
}
console.log(`${onsets.length} footfalls found`);

// Score each: loud, and preceded by quiet, which means a clean attack rather
// than a step landing on the tail of the one before.
const lead = Math.round(LEAD * RATE);
const tail = Math.round(TAIL * RATE);
const candidates = onsets.map((w) => {
  const start = Math.max(0, w * win - lead);
  const end = Math.min(audio.length, start + lead + tail);
  let loudest = 0;
  for (let i = start; i < end; i += 1) loudest = Math.max(loudest, Math.abs(audio[i]));
  let before = 0;
  for (let i = Math.max(0, start - Math.round(0.08 * RATE)); i < start; i += 1) {
    before = Math.max(before, Math.abs(audio[i]));
  }
  return { start, end, loudest, clean: loudest / (before + 0.02), at: (w * win) / RATE };
});

// Take the best, but spread across the recording: consecutive steps in one
// stretch sound alike, and the point of keeping several is variety.
const chosen = [];
for (const c of [...candidates].sort((a, b) => b.clean - a.clean)) {
  if (chosen.length >= KEEP) break;
  if (chosen.some((o) => Math.abs(o.at - c.at) < 0.9)) continue;
  chosen.push(c);
}
chosen.sort((a, b) => a.at - b.at);

// Normalise each to the same peak so no one step jumps out, then fade the ends
// to stop the cut clicking.
const fadeIn = Math.round(0.003 * RATE);
const fadeOut = Math.round(0.06 * RATE);
const steps = chosen.map((c) => {
  const out = new Float32Array(c.end - c.start);
  const gain = 0.85 / c.loudest;
  for (let i = 0; i < out.length; i += 1) {
    let v = audio[c.start + i] * gain;
    if (i < fadeIn) v *= i / fadeIn;
    const left = out.length - i;
    if (left < fadeOut) v *= left / fadeOut;
    out[i] = v;
  }
  return out;
});

const total = steps.reduce((n, s) => n + s.length, 0);
const pcm = Buffer.alloc(total * 2);
const table = [];
let cursor = 0;
for (const step of steps) {
  table.push({ offset: cursor / RATE, duration: step.length / RATE });
  for (let i = 0; i < step.length; i += 1) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(step[i] * 32767))), (cursor + i) * 2);
  }
  cursor += step.length;
}

function wav(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22); head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** Normalise to a set peak and fade both ends, so a cut never clicks. */
function shape(source, from, length, target = 0.85) {
  const out = new Float32Array(length);
  let loudest = 0;
  for (let i = 0; i < length; i += 1) loudest = Math.max(loudest, Math.abs(source[from + i] ?? 0));
  const gain = loudest > 0 ? target / loudest : 1;
  const fadeIn = Math.round(0.004 * RATE);
  const fadeOut = Math.round(0.07 * RATE);
  for (let i = 0; i < length; i += 1) {
    let v = (source[from + i] ?? 0) * gain;
    if (i < fadeIn) v *= i / fadeIn;
    const left = length - i;
    if (left < fadeOut) v *= left / fadeOut;
    out[i] = v;
  }
  return out;
}

const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(pcm.length, 40);

mkdirSync("apps/web/public/audio", { recursive: true });
writeFileSync(OUT_AUDIO, Buffer.concat([header, pcm]));
writeFileSync(OUT_TABLE, `// Generated by tools/build-audio.mjs. Do not edit.
/** Where each footfall sits in the sprite, in seconds. */
export const FOOTSTEPS = ${JSON.stringify(table.map((t) => ({
  offset: Number(t.offset.toFixed(4)),
  duration: Number(t.duration.toFixed(4)),
})), null, 2)} as const;
`);

// The door creak is continuous, with no transient to find. Take the busiest
// window of it instead: that is where the hinge is actually complaining.
const door = decode(DOOR_SOURCE);
const doorLength = Math.round(DOOR_SECONDS * RATE);
let best = 0;
let bestEnergy = -1;
const stride = Math.round(0.01 * RATE);
for (let start = 0; start + doorLength <= door.length; start += stride) {
  let energy = 0;
  for (let i = start; i < start + doorLength; i += 8) energy += door[i] * door[i];
  if (energy > bestEnergy) { bestEnergy = energy; best = start; }
}
writeFileSync(OUT_DOOR, wav(shape(door, best, doorLength)));
console.log(`door: ${(door.length / RATE).toFixed(2)}s in, kept ${DOOR_SECONDS}s from ${(best / RATE).toFixed(2)}s`);

console.log(`\nkept ${steps.length} steps, taken from across the recording:`);
for (const [i, c] of chosen.entries()) {
  console.log(`  ${i}  at ${c.at.toFixed(2)}s  peak ${c.loudest.toFixed(3)}  attack ${c.clean.toFixed(1)}x`);
}
console.log(`\nwrote ${OUT_AUDIO}  ${(total / RATE).toFixed(2)}s  ${((44 + pcm.length) / 1024).toFixed(0)} KB`);
console.log(`wrote ${OUT_DOOR}`);
console.log(`wrote ${OUT_TABLE}`);
