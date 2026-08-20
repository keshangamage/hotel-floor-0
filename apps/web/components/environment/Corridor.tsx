import type { FloorLayout } from "@/game/types";

import { Box } from "./Box";

/**
 * Draws a floor's boxes. All share one geometry and one material per kind, so
 * ~50 meshes cost a handful of GPU resources. Batch into InstancedMesh here if
 * a floor ever grows past a few hundred boxes.
 */
export function Corridor({ layout }: { layout: FloorLayout }) {
  return (
    <group>
      {layout.boxes.map((spec, index) => (
        <Box key={index} spec={spec} />
      ))}
    </group>
  );
}
