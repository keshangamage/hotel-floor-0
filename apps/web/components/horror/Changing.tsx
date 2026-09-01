import { useMemo, useState } from "react";

import { Painting } from "@/components/environment/Painting";
import { CANVAS_MATERIALS } from "@/components/environment/resources";
import type { PaintingSpec } from "@/game/types";

import { useLookAway } from "./LookAway";

/**
 * A picture that is not the one that was hanging there.
 *
 * It changes only while the player is turned away, so they never see it swap.
 * The frame stays exactly where it is and only what is inside it differs,
 * which is what makes the player doubt their memory rather than the wall.
 */
export function Changing({ spec }: { spec: PaintingSpec }) {
  const [art, setArt] = useState(spec.art);

  // The picture hangs flat on the wall, so watch the wall in front of it
  // rather than its own plane.
  const at = useMemo(
    () => ({ x: spec.position[0], y: spec.position[1], z: spec.position[2] }),
    [spec.position],
  );

  useLookAway(at, () => {
    // The next one along, so it is a picture that belongs in this hotel. Never
    // back to the one that was there: a picture that changed and changed back
    // is a picture the player was wrong about.
    setArt((current) => current + 1);
  });

  return <Painting spec={art === spec.art ? spec : { ...spec, art }} />;
}

/** How many pictures there are to cycle through, for the tests to reason with. */
export const ARTWORK_COUNT = CANVAS_MATERIALS.length;
