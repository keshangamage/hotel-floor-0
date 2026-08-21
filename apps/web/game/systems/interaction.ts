import type { Object3D } from "three";

/** How far the player can reach, in metres. */
export const REACH = 2.4;

/** Read-only: entries expose live values through getters, never mutation. */
export interface InteractableEntry {
  /** Registered scene node. Raycast hits are resolved back up to this. */
  readonly object: Object3D;
  /** Verb shown in the prompt, e.g. "Open" or "Locked". */
  readonly prompt: string;
  readonly enabled: boolean;
  onInteract(): void;
}

export interface InteractionRegistry {
  readonly entries: InteractableEntry[];
  add(entry: InteractableEntry): void;
  remove(entry: InteractableEntry): void;
  /** Resolves a raycast hit back to the entry that registered it. */
  resolve(object: Object3D): InteractableEntry | null;
}

export function createInteractionRegistry(): InteractionRegistry {
  const entries: InteractableEntry[] = [];

  return {
    entries,
    add(entry) {
      if (!entries.includes(entry)) entries.push(entry);
    },
    remove(entry) {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    },
    resolve(object) {
      // Hits land on the mesh, so walk up to whichever ancestor registered.
      let node: Object3D | null = object;
      while (node) {
        for (const entry of entries) if (entry.object === node) return entry;
        node = node.parent;
      }
      return null;
    },
  };
}
