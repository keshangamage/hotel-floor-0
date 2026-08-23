/**
 * The game's sound, synthesised rather than loaded.
 *
 * Nothing here is a file: room tone and footsteps are shaped noise and a short
 * envelope, which costs no download and no decode. Real samples can replace any
 * one voice later without the callers changing.
 *
 * Web Audio only. No three, no React, so it stays testable and swappable.
 */

/** Browsers start a context suspended until the page has been interacted with. */
type Voice = { stop: () => void };

const NOISE_SECONDS = 2;

function whiteNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Integrated noise. Weighted to the low end, which is what a room sounds like. */
function brownNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export interface StepSprite {
  readonly offset: number;
  readonly duration: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private clips = new Map<string, AudioBuffer>();
  private steps: AudioBuffer | null = null;
  private sprite: readonly StepSprite[] = [];
  private lastStep = -1;

  /** Created on demand: constructing a context before a gesture just suspends it. */
  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const context = new Ctor();
    const master = context.createGain();
    master.gain.value = 0.7;
    // Catches footsteps landing on top of a door and a lamp at once.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(context.destination);

    this.context = context;
    this.master = master;
    this.white = whiteNoise(context);
    this.brown = brownNoise(context);
    return context;
  }

  /** Call from a user gesture, or every sound is silently dropped. */
  async resume(): Promise<void> {
    const context = this.ensure();
    if (context && context.state !== "running") await context.resume();
  }

  get running(): boolean {
    return this.context?.state === "running";
  }

  /**
   * Loads recorded footfalls. Until this resolves, and if it fails, steps are
   * synthesised instead, so the game is never silent waiting on a download.
   */
  async loadFootsteps(url: string, sprite: readonly StepSprite[]): Promise<void> {
    const context = this.ensure();
    if (!context || sprite.length === 0) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    this.steps = await context.decodeAudioData(await response.arrayBuffer());
    this.sprite = sprite;
  }

  /** Loads a one shot by name. Playing an unloaded name is a no-op, not a throw. */
  async loadClip(name: string, url: string): Promise<void> {
    const context = this.ensure();
    if (!context) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    this.clips.set(name, await context.decodeAudioData(await response.arrayBuffer()));
  }

  /**
   * Where the player is and which way they are facing.
   *
   * Without this every positional sound collapses to the origin, so a door at
   * the far end of the corridor would sound like it is inside your head.
   */
  setListener(
    position: readonly [number, number, number],
    forward: readonly [number, number, number],
  ): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    if (listener.positionX) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
      listener.forwardX.value = forward[0];
      listener.forwardY.value = forward[1];
      listener.forwardZ.value = forward[2];
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      // Safari still ships only the deprecated calls.
      const legacy = listener as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition(position[0], position[1], position[2]);
      legacy.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
  }

  /** A one shot coming from somewhere in the world, so it falls off with distance. */
  playAt(
    name: string,
    position: readonly [number, number, number],
    { rate = 1, gain = 1 }: { rate?: number; gain?: number } = {},
  ): void {
    const context = this.context;
    const buffer = this.clips.get(name);
    if (!context || !this.master || !buffer) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    // A corridor is long, so sounds have to carry without going flat up close.
    panner.refDistance = 1.6;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1.3;
    if (panner.positionX) {
      panner.positionX.value = position[0];
      panner.positionY.value = position[1];
      panner.positionZ.value = position[2];
    } else {
      (panner as unknown as { setPosition: (x: number, y: number, z: number) => void })
        .setPosition(position[0], position[1], position[2]);
    }

    const level = context.createGain();
    level.gain.value = gain;
    source.connect(panner).connect(level).connect(this.master);
    source.start();
  }

  /** One footfall, recorded if there is a recording and synthesised if not. */
  footstep(weight: number, left: boolean): void {
    if (this.steps && this.sprite.length > 0) this.sampledStep(weight);
    else this.synthStep(weight, left);
  }

  /**
   * A different take each time, never the same one twice running: an identical
   * repeat is what gives a sample library away.
   */
  private sampledStep(weight: number): void {
    const context = this.context;
    if (!context || !this.master || !this.steps) return;

    let index = Math.floor(Math.random() * this.sprite.length);
    if (this.sprite.length > 1 && index === this.lastStep) {
      index = (index + 1 + Math.floor(Math.random() * (this.sprite.length - 1))) % this.sprite.length;
    }
    this.lastStep = index;
    const clip = this.sprite[index];
    if (!clip) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.steps;
    // A little either side of unity, which reads as a different footfall
    // rather than as a pitched up copy.
    source.playbackRate.value = 0.94 + Math.random() * 0.12;

    const gain = context.createGain();
    gain.gain.value = weight * (0.85 + Math.random() * 0.3);
    source.connect(gain).connect(this.master);
    source.start(now, clip.offset, clip.duration);
  }

  /**
   * A footfall on carpet from nothing: a low body thump plus a high scuff.
   *
   * The two layers are the point. Noise alone reads as static, a tone alone as
   * a drum, and only together does it sound like weight landing on a floor.
   */
  private synthStep(weight: number, left: boolean): void {
    const context = this.ensure();
    if (!context || !this.master || !this.white) return;
    const now = context.currentTime;

    // Feet are never identical, and identical steps are what sound synthetic.
    const vary = 0.9 + Math.random() * 0.2;
    const foot = left ? 1.04 : 0.96;

    const body = context.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(84 * foot * vary, now);
    body.frequency.exponentialRampToValueAtTime(48 * foot, now + 0.11);
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.32 * weight * vary, now + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    body.connect(bodyGain).connect(this.master);
    body.start(now);
    body.stop(now + 0.16);

    const scuff = context.createBufferSource();
    scuff.buffer = this.white;
    scuff.playbackRate.value = vary;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1100 * foot * vary;
    band.Q.value = 0.8;
    const scuffGain = context.createGain();
    scuffGain.gain.setValueAtTime(0.0001, now);
    scuffGain.gain.exponentialRampToValueAtTime(0.12 * weight * vary, now + 0.006);
    scuffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    scuff.connect(band).connect(scuffGain).connect(this.master);
    scuff.start(now, Math.random() * (NOISE_SECONDS - 0.2));
    scuff.stop(now + 0.1);
  }

  /**
   * The bed the whole floor sits on: a low, slowly breathing hiss.
   *
   * Silence is what makes a space feel like a render. This is deliberately just
   * above hearing, so it registers only when it stops.
   */
  roomTone(level = 1): Voice | null {
    const context = this.ensure();
    if (!context || !this.master || !this.brown) return null;

    const source = context.createBufferSource();
    source.buffer = this.brown;
    source.loop = true;

    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 220;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05 * level, context.currentTime + 2.5);

    // A dead steady tone reads as a stuck buffer, so drift the filter slowly.
    const drift = context.createOscillator();
    drift.frequency.value = 0.05;
    const driftDepth = context.createGain();
    driftDepth.gain.value = 70;
    drift.connect(driftDepth).connect(low.frequency);

    source.connect(low).connect(gain).connect(this.master);
    source.start();
    drift.start();

    const voice: Voice = {
      stop: () => {
        const t = context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);
        source.stop(t + 0.5);
        drift.stop(t + 0.5);
        this.voices.delete(voice);
      },
    };
    this.voices.add(voice);
    return voice;
  }

  dispose(): void {
    for (const voice of [...this.voices]) voice.stop();
    this.voices.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}

/**
 * One engine for the page.
 *
 * A browser only allows an audio context to start from a user gesture, and only
 * a handful at a time, so this deliberately outlives the components that use it.
 */
export const audio = new AudioEngine();
