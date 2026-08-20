import { CORRIDOR_LAYOUT } from "@/game/data/corridorLayout";

import { Box } from "./Box";

/**
 * Draws the corridor layout.
 *
 * Every box shares one geometry and one material per surface kind, so ~50
 * meshes cost a handful of GPU resources. If floors later grow past a few
 * hundred boxes, this is the place to switch to `InstancedMesh` batched by
 * kind — the `BoxSpec[]` input would not change.
 */
export function Corridor() {
  return (
    <group>
      {CORRIDOR_LAYOUT.map((spec, index) => (
        <Box key={index} spec={spec} />
      ))}
    </group>
  );
}
