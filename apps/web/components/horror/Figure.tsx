import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { audio, type FadingVoice } from "@/game/systems/audio";
import { distanceTo, isFacing, isWatched, type Watcher } from "@/game/systems/observation";
import { LINGER, STAND_HEIGHT, TOO_CLOSE, presenceOn } from "@/game/systems/presence";
import type { FloorSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

export const FIGURE_URL = "/models/figure.glb";

/** How far it rides above the floor, and how far it drifts, in metres. */
const HOVER = 0.06;
const DRIFT = 0.04;

/**
 * Seconds it takes to go.
 *
 * Long enough not to read as a dropped frame, short enough that it is still
 * the answer to being looked at rather than a thing politely excusing itself.
 */
const FADE = 0.55;

/**
 * The floors it is heard on, as opposed to merely seen on.
 *
 * The descent, and nowhere else. On the fifth floor the player is still
 * judging what is in front of them and writing it down, and a sound effect
 * would answer the question for them. Under the hotel there is nothing left to
 * judge, so it is allowed to be loud.
 */
const HAUNTED = new Set([-1, -2, -3]);

/**
 * Seconds between moans while it is in view.
 *
 * Longer than it usually survives being looked at, so most sightings get one.
 * It repeats for the player who catches it out of the corner of an eye and
 * keeps it there rather than turning: the sound is what tells them they did
 * not imagine the shape, and it is the only thing in the game that does.
 */
const MOAN_EVERY = 7;

// Reused every frame so the loop stays allocation free.
const forward = new THREE.Vector3();
const watcher: Watcher = { at: { x: 0, y: 0, z: 0 }, facing: { x: 0, y: 0, z: -1 } };

/**
 * Someone standing in the corridor, on the floors under the hotel.
 *
 * It does nothing. It does not approach, and it cannot be reached: looking
 * straight at it for half a second is enough for it to not be there, and
 * walking at it is enough as well. There is never a second chance to check,
 * which is the whole of it, and is why nothing in the game ever confirms it.
 *
 * Mount this keyed on the floor. Its one piece of state is whether it has been
 * spent, and a new floor is a new one.
 */
export function Figure({ spec }: { spec: FloorSpec }) {
  const camera = useThree((state) => state.camera);
  const phase = useGameStore((state) => state.phase);
  // The deepest floor walked so far. Read from what has been visited rather
  // than stored separately, so a save carries it without a second field.
  const visited = useGameStore((state) => state.visited);
  const deepest = useMemo(
    () => Math.min(...Object.keys(visited).map(Number).filter(Number.isFinite), Infinity),
    [visited],
  );
  const stand = useMemo(() => presenceOn(spec, deepest), [spec, deepest]);
  const haunted = HAUNTED.has(spec.floorNumber);

  const { scene } = useGLTF(FIGURE_URL, false);
  // Cloned rather than used directly: drei hands out one cached scene, and a
  // floor change mounts the next figure before the last one has let go of it.
  const model = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // Cloned per figure. The material comes from drei's cache, so fading the
      // one the loader handed out would leave the next floor's figure already
      // half gone before the player got there.
      const material = (object.material as THREE.Material).clone();
      // Set now rather than when the fade starts: flipping this later needs a
      // shader recompile, and the hitch would land on the exact frame the
      // player is watching.
      material.transparent = true;
      object.material = material;
    });
    return copy;
  }, [scene]);

  // Cloning a material makes one that nothing else will free.
  useEffect(() => {
    const made: THREE.Material[] = [];
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) made.push(object.material as THREE.Material);
    });
    return () => {
      for (const material of made) material.dispose();
    };
  }, [model]);
  const group = useRef<THREE.Group>(null);
  const seen = useRef({
    facing: false, held: 0, going: false, gone: false, drift: 0, fade: 1,
    // Starts due, so the first sighting is not seven seconds of silence.
    watched: false, sinceMoan: MOAN_EVERY,
  });
  const breath = useRef<FadingVoice | null>(null);

  /**
   * Breathing, for as long as it is there.
   *
   * The only sound it makes. It does not speak and it does not move, so this
   * is the whole of the warning that the floor is not empty, and it comes from
   * where the thing is standing rather than from the mix, so a player who
   * hears it can tell which end of the corridor to not look at.
   *
   * Started here rather than in Audio because what knows it has gone is what
   * decided it: a corridor that is empty and still breathing would be the game
   * confirming what the player thinks they saw, and nothing here confirms it.
   */
  useEffect(() => {
    if (!stand || phase !== "playing") return;
    // Driven off once is driven off for good. This effect runs again every
    // time the game is unpaused, and it does not get to come back.
    if (seen.current.going || seen.current.gone) return;

    let cancelled = false;
    void audio.resume().then(() => {
      if (cancelled || seen.current.going) return;
      breath.current = audio.breath([stand.x, STAND_HEIGHT, stand.z]);
    });

    return () => {
      cancelled = true;
      breath.current?.stop();
      breath.current = null;
    };
  }, [stand, phase]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node || !stand) return;
    const state = seen.current;
    if (state.gone) return;
    if (useGameStore.getState().phase !== "playing") return;

    const step = Math.min(delta, 0.05);

    // A sheet with nothing under it does not stand still. The model carries no
    // rig, so this is the whole of its motion: it is counted from delta rather
    // than the clock, which means a paused game stops it where it is.
    state.drift += step;
    node.position.y = HOVER + Math.sin(state.drift * 0.85) * DRIFT;

    // On its way out. It keeps drifting while it goes, so what the player sees
    // is something leaving rather than a mesh being switched off.
    if (state.going) {
      state.fade = Math.max(0, state.fade - step / FADE);
      // Reached through the group's ref rather than a list built up here: the
      // compiler owns anything a hook returned, and this writes every frame.
      node.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          (object.material as THREE.Material).opacity = state.fade;
        }
      });
      if (state.fade === 0) {
        state.gone = true;
        node.visible = false;
      }
      return;
    }

    camera.getWorldDirection(forward);
    watcher.at.x = camera.position.x;
    watcher.at.y = camera.position.y;
    watcher.at.z = camera.position.z;
    watcher.facing.x = forward.x;
    watcher.facing.y = forward.y;
    watcher.facing.z = forward.z;

    const target = { x: stand.x, y: STAND_HEIGHT, z: stand.z };

    // It makes a noise while the player can see it. The same wide cone the
    // rest of the game counts as watched, so it covers the corner of an eye,
    // and the same range, so the far end of the corridor stays quiet: a shape
    // down there is something the player has to walk towards to be sure of.
    if (haunted) {
      state.watched = isWatched(watcher, target, state.watched);
      state.sinceMoan += step;
      if (state.watched && state.sinceMoan >= MOAN_EVERY) {
        state.sinceMoan = 0;
        audio.playAt("ghost", [stand.x, STAND_HEIGHT, stand.z], { gain: 0.9 });
      }
    }

    const facing = isFacing(watcher, target, state.facing);
    if (facing !== state.facing) {
      state.facing = facing;
      state.held = 0;
    } else {
      state.held += step;
    }

    // Walking at it counts as looking at it. Otherwise the player arrives, and
    // whatever they find there is an answer.
    if (distanceTo(watcher, target) < TOO_CLOSE || (facing && state.held >= LINGER)) {
      state.going = true;
      // Leaves over the same half second the shape does, so there is never a
      // frame where the corridor is empty and something in it is breathing.
      breath.current?.stop(FADE);
      breath.current = null;
    }
  });

  if (!stand) return null;

  return (
    // Turned away from the lift, so the player only ever gets its back.
    //
    // It has a face. They do not see it: looking straight at this thing is
    // what makes it not be there, so the one view of it anybody gets is from
    // behind, standing in the light, not turning round.
    <group ref={group} position={[stand.x, 0, stand.z]} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(FIGURE_URL, false);
