import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { CEILING_HEIGHT } from "@/game/data/dimensions";
import { buildFloor } from "@/game/data/floor";
import { generateFloor } from "@/game/generation/generateFloor";
import { createAmbience, stepAmbience } from "@/game/systems/ambience";
import { audio } from "@/game/systems/audio";
import { presenceOn, STAND_HEIGHT } from "@/game/systems/presence";
import { createRandom } from "@/game/systems/random";
import { useGameStore } from "@/store/useGameStore";

/**
 * The noise the hotel makes when the player is doing nothing.
 *
 * Everything here is unprompted, which is what separates it from the rest of
 * the game's sound: footsteps and doors answer an input, and these do not. A
 * building that is only audible when touched is a set.
 *
 * Mounted alongside Audio, outside the floor scene, because the audio context
 * cannot be rebuilt on an elevator ride without losing the gesture that
 * allowed it to start.
 */
export function Ambience() {
  const phase = useGameStore((state) => state.phase);
  const floorNumber = useGameStore((state) => state.floorNumber);
  const seed = useGameStore((state) => state.seed);

  const spec = useMemo(() => generateFloor(floorNumber, seed), [floorNumber, seed]);
  const layout = useMemo(() => buildFloor(spec), [spec]);

  // Per floor, so the same floor of the same hotel always settles the same way.
  const random = useMemo(
    () => createRandom(`${seed}:ambience:${floorNumber}`),
    [seed, floorNumber],
  );
  const timers = useRef(createAmbience(floorNumber, random));
  useEffect(() => {
    timers.current = createAmbience(floorNumber, random);
  }, [floorNumber, random]);

  /** Whoever is on this floor is where the whispering comes from. */
  const voice = useMemo(() => {
    const stand = presenceOn(spec);
    if (stand) return [stand.x, STAND_HEIGHT, stand.z] as const;
    return [0, STAND_HEIGHT, (spec.corridorFrom + spec.corridorTo) / 2] as const;
  }, [spec]);

  // A failing fixture hums for as long as it is failing.
  const failing = useMemo(
    () => layout.lamps.filter((lamp) => lamp.flicker).map((lamp) => lamp.position),
    [layout],
  );

  useEffect(() => {
    if (phase !== "playing" || failing.length === 0) return;
    let cancelled = false;
    const running: { stop: () => void }[] = [];

    void audio.resume().then(() => {
      if (cancelled) return;
      for (const at of failing) {
        const hum = audio.buzz([at[0], at[1] - 0.1, at[2]]);
        if (hum) running.push(hum);
      }
    });

    return () => {
      cancelled = true;
      for (const hum of running) hum.stop();
    };
  }, [phase, failing]);

  useFrame((_, delta) => {
    // A paused hotel does not settle, and nothing whispers at an empty
    // corridor while the player is reading the menu.
    if (!audio.running || phase !== "playing") return;

    const heard = stepAmbience(timers.current, Math.min(delta, 0.05), floorNumber, random);

    if (heard.creak) {
      // From the structure rather than the room: above the ceiling, off to one
      // side, somewhere along the length of the corridor.
      audio.creak([
        random.float(-0.9, 0.9),
        CEILING_HEIGHT + 0.4,
        random.float(spec.corridorFrom, spec.corridorTo),
      ]);
    }

    if (heard.whisper) audio.whisper(voice);
  });

  return null;
}
