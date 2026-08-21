import { useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import {
  createInteractionRegistry,
  REACH,
  type InteractableEntry,
  type InteractionRegistry,
} from "@/game/systems/interaction";
import { input } from "@/game/systems/input";
import { useGameStore } from "@/store/useGameStore";

const InteractionContext = createContext<InteractionRegistry | null>(null);

export function InteractionProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => createInteractionRegistry(), []);
  return (
    <InteractionContext.Provider value={registry}>{children}</InteractionContext.Provider>
  );
}

export function useInteractions(): InteractionRegistry {
  const registry = useContext(InteractionContext);
  if (!registry) throw new Error("useInteractions must be used inside an InteractionProvider");
  return registry;
}

/**
 * Registers a scene node as interactable. The entry object is stable and its
 * fields are refreshed each render, so changing the prompt or handler does not
 * churn the registry.
 */
export function useInteractable(
  prompt: string,
  onInteract: () => void,
  enabled = true,
): React.RefObject<THREE.Group | null> {
  const registry = useInteractions();
  const group = useRef<THREE.Group>(null);
  const latest = useRef({ prompt, onInteract, enabled });

  useEffect(() => {
    latest.current = { prompt, onInteract, enabled };
  }, [prompt, onInteract, enabled]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    // Getters keep the entry live without mutating it after render.
    const entry: InteractableEntry = {
      object: node,
      get prompt() {
        return latest.current.prompt;
      },
      get enabled() {
        return latest.current.enabled;
      },
      onInteract: () => latest.current.onInteract(),
    };
    registry.add(entry);
    return () => registry.remove(entry);
  }, [registry]);

  return group;
}

const raycaster = new THREE.Raycaster();
const CENTRE = new THREE.Vector2(0, 0);
const targets: THREE.Object3D[] = [];

/**
 * Casts from the centre of the screen each frame and drives the prompt.
 * Must sit after the Player so it reads the camera's final position.
 */
export function InteractionDriver() {
  const camera = useThree((state) => state.camera);
  const registry = useInteractions();
  const focused = useRef<InteractableEntry | null>(null);

  useFrame(() => {
    const store = useGameStore.getState();
    let hit: InteractableEntry | null = null;

    if (store.phase === "playing") {
      raycaster.setFromCamera(CENTRE, camera);
      raycaster.far = REACH;

      targets.length = 0;
      for (const entry of registry.entries) {
        if (entry.enabled) targets.push(entry.object);
      }

      const hits = raycaster.intersectObjects(targets, true);
      const first = hits[0];
      if (first) hit = registry.resolve(first.object);
    }

    if (hit !== focused.current) {
      focused.current = hit;
      // Only touches the store when the prompt actually changes.
      store.setInteractPrompt(hit ? hit.prompt : null);
    }

    if (hit && store.phase === "playing" && input.consumePress("interact")) {
      hit.onInteract();
    }
  });

  return null;
}
