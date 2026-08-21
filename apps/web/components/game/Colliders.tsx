import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { createColliderSet, emptyCollider, type ColliderSet } from "@/game/systems/colliders";
import type { AABB, BoxSpec } from "@/game/types";

const ColliderContext = createContext<ColliderSet | null>(null);

export function ColliderProvider({
  boxes,
  children,
}: {
  boxes: readonly BoxSpec[];
  children: ReactNode;
}) {
  const set = useMemo(() => createColliderSet(boxes), [boxes]);
  return <ColliderContext.Provider value={set}>{children}</ColliderContext.Provider>;
}

export function useColliders(): ColliderSet {
  const set = useContext(ColliderContext);
  if (!set) throw new Error("useColliders must be used inside a ColliderProvider");
  return set;
}

/**
 * A collider the caller repositions each frame. Registration happens in an
 * effect, not in render, so StrictMode's double mount cannot leak one.
 */
export function useDynamicCollider(): AABB {
  const set = useColliders();
  const box = useMemo(() => emptyCollider(), []);
  useEffect(() => {
    set.add(box);
    return () => set.remove(box);
  }, [set, box]);
  return box;
}
