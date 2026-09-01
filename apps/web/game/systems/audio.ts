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

/** Room tone, which is retuned as the player descends rather than restarted. */
export interface ToneVoice {
  stop(): void;
  /** 0 at the top of the hotel, 1 at the bottom of what is under it. */
  depth(level: number): void;
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

  /**
   * Master level, 0 to 1.
   *
   * Ramped rather than set: a gain that jumps clicks, and dragging a slider
   * would do it on every pixel.
   */
  setVolume(level: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    const clamped = Math.max(0, Math.min(1, level));
    this.master.gain.setTargetAtTime(clamped, context.currentTime, 0.02);
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

  /** Sends a voice out through the world, or straight to the mix if it has no place. */
  private route(position?: readonly [number, number, number]): AudioNode | null {
    const context = this.context;
    if (!context || !this.master) return null;
    if (!position) return this.master;

    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
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
    panner.connect(this.master);
    return panner;
  }

  /**
   * The arrival bell.
   *
   * Two partials a fifth apart with different decays, which is what a struck
   * piece of metal does. One sine reads as a test tone.
   */
  ding(position?: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out) return;
    const now = context.currentTime;

    for (const [ratio, level, decay] of [[1, 0.3, 1.9], [1.5, 0.13, 1.2], [2.76, 0.05, 0.7]] as const) {
      const partial = context.createOscillator();
      partial.type = "sine";
      partial.frequency.value = 660 * ratio;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      partial.connect(gain).connect(out);
      partial.start(now);
      partial.stop(now + decay + 0.05);
    }
  }

  /** Doors running on their track: noise pushed through a moving band. */
  slide(seconds: number, position?: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out || !this.white) return;
    const now = context.currentTime;

    const source = context.createBufferSource();
    source.buffer = this.white;
    source.loop = true;

    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.4;
    // Rises as the doors gather speed and falls as they arrive, which is what
    // makes it read as something moving rather than a hiss.
    band.frequency.setValueAtTime(320, now);
    band.frequency.linearRampToValueAtTime(900, now + seconds * 0.45);
    band.frequency.linearRampToValueAtTime(260, now + seconds);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.12);
    gain.gain.setValueAtTime(0.09, now + seconds - 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

    source.connect(band).connect(gain).connect(out);
    source.start(now, Math.random() * 1.5);
    source.stop(now + seconds + 0.05);
  }

  /**
   * The car under way: a motor that is felt more than heard.
   *
   * Not positional. The player is inside the thing making the noise, so it
   * comes from everywhere, and panning it would put the machinery in one ear.
   */
  motor(): Voice | null {
    const context = this.ensure();
    if (!context || !this.master || !this.brown) return null;
    const now = context.currentTime;

    const rumble = context.createBufferSource();
    rumble.buffer = this.brown;
    rumble.loop = true;
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 320;

    // A little tone under the rumble, or it sounds like wind rather than a machine.
    const hum = context.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 47;
    const humGain = context.createGain();
    humGain.gain.value = 0.05;
    const humLow = context.createBiquadFilter();
    humLow.type = "lowpass";
    humLow.frequency.value = 260;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.7);

    rumble.connect(low).connect(gain);
    hum.connect(humGain).connect(humLow).connect(gain);
    gain.connect(this.master);
    rumble.start();
    hum.start();

    const voice: Voice = {
      stop: () => {
        const t = context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
        // Winding down, not cut off.
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        hum.frequency.linearRampToValueAtTime(28, t + 0.9);
        rumble.stop(t + 1);
        hum.stop(t + 1);
        this.voices.delete(voice);
      },
    };
    this.voices.add(voice);
    return voice;
  }

  /**
   * Knuckles on a door panel: three knocks, from somewhere in the world.
   *
   * Wood struck rather than a click, so a short burst of filtered noise over a
   * body that drops fast. The three are unevenly spaced, because a metronome
   * reads as a machine and a hand does not keep time.
   */
  knock(position: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out || !this.white) return;
    const now = context.currentTime;

    for (const [offset, level] of [[0, 1], [0.29, 0.86], [0.53, 0.94]] as const) {
      const start = now + offset;

      const body = context.createOscillator();
      body.type = "triangle";
      body.frequency.setValueAtTime(180, start);
      body.frequency.exponentialRampToValueAtTime(70, start + 0.07);
      const bodyGain = context.createGain();
      bodyGain.gain.setValueAtTime(0.0001, start);
      bodyGain.gain.exponentialRampToValueAtTime(0.34 * level, start + 0.004);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      body.connect(bodyGain).connect(out);
      body.start(start);
      body.stop(start + 0.15);

      const rap = context.createBufferSource();
      rap.buffer = this.white;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1600;
      band.Q.value = 1.1;
      const rapGain = context.createGain();
      rapGain.gain.setValueAtTime(0.0001, start);
      rapGain.gain.exponentialRampToValueAtTime(0.1 * level, start + 0.003);
      rapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      rap.connect(band).connect(rapGain).connect(out);
      rap.start(start, Math.random());
      rap.stop(start + 0.06);
    }
  }

  /** A switch or a button, so pressing one is not silent. */
  click(position?: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out) return;
    const now = context.currentTime;

    const tick = context.createOscillator();
    tick.type = "square";
    tick.frequency.setValueAtTime(2100, now);
    tick.frequency.exponentialRampToValueAtTime(900, now + 0.03);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    tick.connect(gain).connect(out);
    tick.start(now);
    tick.stop(now + 0.06);
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
   * A second set of steps, a little behind and a little quieter.
   *
   * Placed in the world and delayed, so it arrives from where the player is
   * not. Deliberately uses the same recordings as their own feet: something
   * walking exactly like you is worse than something that does not.
   */
  echoStep(delaySeconds: number, position: readonly [number, number, number]): void {
    this.sampledStep(0.5, { delay: delaySeconds, position, rate: 0.93 });
  }

  /**
   * A different take each time, never the same one twice running: an identical
   * repeat is what gives a sample library away.
   */
  private sampledStep(
    weight: number,
    options: {
      delay?: number;
      rate?: number;
      position?: readonly [number, number, number];
    } = {},
  ): void {
    const context = this.context;
    if (!context || !this.master || !this.steps) return;

    let index = Math.floor(Math.random() * this.sprite.length);
    if (this.sprite.length > 1 && index === this.lastStep) {
      index = (index + 1 + Math.floor(Math.random() * (this.sprite.length - 1))) % this.sprite.length;
    }
    this.lastStep = index;
    const clip = this.sprite[index];
    if (!clip) return;

    const out = this.route(options.position);
    if (!out) return;
    const now = context.currentTime + (options.delay ?? 0);

    const source = context.createBufferSource();
    source.buffer = this.steps;
    // A little either side of unity, which reads as a different footfall
    // rather than as a pitched up copy.
    source.playbackRate.value = (options.rate ?? 1) * (0.94 + Math.random() * 0.12);

    const gain = context.createGain();
    gain.gain.value = weight * (0.85 + Math.random() * 0.3);
    source.connect(gain).connect(out);
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
  roomTone(level = 1, depth = 0): ToneVoice | null {
    const context = this.ensure();
    if (!context || !this.master || !this.brown) return null;

    const source = context.createBufferSource();
    source.buffer = this.brown;
    source.loop = true;

    // Deeper floors are heavier and duller, which is the whole of the descent
    // as far as the ear is concerned.
    const cutoff = (d: number) => 220 - d * 95;
    const weight = (d: number) => 0.05 * level * (1 + d * 0.55);

    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = cutoff(depth);

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(weight(depth), context.currentTime + 2.5);

    // A dead steady tone reads as a stuck buffer, so drift the filter slowly.
    const drift = context.createOscillator();
    drift.frequency.value = 0.05;
    const driftDepth = context.createGain();
    driftDepth.gain.value = 70;
    drift.connect(driftDepth).connect(low.frequency);

    source.connect(low).connect(gain).connect(this.master);
    source.start();
    drift.start();

    const voice: ToneVoice = {
      stop: () => {
        const t = context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.4);
        source.stop(t + 0.5);
        drift.stop(t + 0.5);
        this.voices.delete(voice);
      },
      // Slid over, not cut to: a tone that steps is a tone the player hears as
      // a sound effect rather than as the building.
      depth: (next) => {
        const t = context.currentTime;
        for (const [param, value] of [
          [low.frequency, cutoff(next)],
          [gain.gain, weight(next)],
        ] as const) {
          param.cancelScheduledValues(t);
          param.setValueAtTime(param.value, t);
          param.linearRampToValueAtTime(value, t + 2);
        }
      },
    };
    this.voices.add(voice);
    return voice;
  }

  /**
   * A fixture that is failing, heard from under it.
   *
   * Mains hum and its harmonics rather than a tone: a fluorescent buzzes at
   * twice the supply frequency, and the raggedness is what says the fitting is
   * going rather than merely on. This makes the flicker anomaly audible from
   * round a corner, which is the point of it.
   */
  buzz(position: readonly [number, number, number]): Voice | null {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out || !this.white) return null;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.8);
    gain.connect(out);

    // Twice the supply frequency, plus the harmonic that makes it grating.
    const tones: OscillatorNode[] = [];
    for (const [hz, level, type] of [[120, 0.026, "square"], [240, 0.012, "sawtooth"]] as const) {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      const dull = context.createBiquadFilter();
      dull.type = "lowpass";
      dull.frequency.value = 1400;
      const level_ = context.createGain();
      level_.gain.value = level;
      osc.connect(dull).connect(level_).connect(gain);
      osc.start();
      tones.push(osc);
    }

    // The starter crackling. Without it the hum is a machine, not a fault.
    const crackle = context.createBufferSource();
    crackle.buffer = this.white;
    crackle.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 3200;
    band.Q.value = 2.4;
    const crackleGain = context.createGain();
    crackleGain.gain.value = 0.0035;
    crackle.connect(band).connect(crackleGain).connect(gain);
    crackle.start(0, Math.random());

    // Two rates that never line up, so it never settles into a rhythm.
    const wobble = context.createOscillator();
    wobble.frequency.value = 7.3;
    const wobbleDepth = context.createGain();
    wobbleDepth.gain.value = 0.35;
    wobble.connect(wobbleDepth).connect(gain.gain);
    wobble.start();

    const voice: Voice = {
      stop: () => {
        const t = context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.3);
        for (const osc of tones) osc.stop(t + 0.4);
        wobble.stop(t + 0.4);
        crackle.stop(t + 0.4);
        this.voices.delete(voice);
      },
    };
    this.voices.add(voice);
    return voice;
  }

  /**
   * The building settling: one long groan from somewhere in the structure.
   *
   * A resonant band swept slowly across noise, which is what timber under load
   * actually does. Slow on purpose, because a short one is a footstep.
   */
  creak(position: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out || !this.brown) return;
    const now = context.currentTime;
    const length = 0.9 + Math.random() * 0.9;

    const source = context.createBufferSource();
    source.buffer = this.brown;

    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 9;
    // Bends up under the load and settles back, never quite to where it began.
    const start = 210 + Math.random() * 150;
    band.frequency.setValueAtTime(start, now);
    band.frequency.exponentialRampToValueAtTime(start * 1.7, now + length * 0.6);
    band.frequency.exponentialRampToValueAtTime(start * 1.15, now + length);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + length * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

    source.connect(band).connect(gain).connect(out);
    source.start(now, Math.random());
    source.stop(now + length + 0.05);
  }

  /**
   * Someone speaking, too quietly and too far off to be words.
   *
   * Bursts of noise inside the band a voice occupies, shaped into something
   * with the length and spacing of syllables. Never words: a player who can
   * make out a word will argue about which word, and the sound has done its
   * work already by being a person.
   */
  whisper(position: readonly [number, number, number]): void {
    const context = this.ensure();
    const out = this.route(position);
    if (!context || !out || !this.white) return;

    let at = context.currentTime;
    const syllables = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < syllables; i += 1) {
      const length = 0.07 + Math.random() * 0.13;

      const source = context.createBufferSource();
      source.buffer = this.white;

      // Two resonances, which is roughly what makes breath read as a mouth.
      const throat = context.createBiquadFilter();
      throat.type = "bandpass";
      throat.frequency.value = 480 + Math.random() * 320;
      throat.Q.value = 4;
      const mouth = context.createBiquadFilter();
      mouth.type = "bandpass";
      mouth.frequency.value = 1500 + Math.random() * 1100;
      mouth.Q.value = 2.6;

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.022, at + length * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);

      source.connect(throat).connect(mouth).connect(gain).connect(out);
      source.start(at, Math.random());
      source.stop(at + length + 0.02);

      at += length + 0.03 + Math.random() * 0.1;
    }
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
