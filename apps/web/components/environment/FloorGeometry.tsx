import type { FloorLayout } from "@/game/types";

import { Box } from "./Box";

/**
 * Draws a floor's boxes. All share one geometry and one material per kind, so
 * the mesh count costs a handful of GPU resources. Batch into InstancedMesh
 * here if a floor grows past a few hundred boxes.
 */
export function FloorGeometry({ layout }: { layout: FloorLayout }) {
  return (
    <group>
      {layout.boxes.map((spec, index) => (
        <Box key={index} spec={spec} />
      ))}
    </group>
  );
}
