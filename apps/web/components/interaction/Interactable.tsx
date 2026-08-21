import type { ReactNode } from "react";

import { useInteractable } from "@/components/game/Interactions";

export interface InteractableProps {
  /** Verb shown in the prompt, e.g. "Open", "Close", "Locked". */
  prompt: string;
  onInteract: () => void;
  enabled?: boolean;
  children: ReactNode;
}

/**
 * Wraps anything in the scene to make it interactable. This is the only place
 * an object needs to opt in; the driver handles raycasting and the prompt.
 */
export function Interactable({ prompt, onInteract, enabled = true, children }: InteractableProps) {
  const group = useInteractable(prompt, onInteract, enabled);
  return <group ref={group}>{children}</group>;
}
