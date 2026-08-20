import type { BoxSpec } from "@/game/types";

import { CASTS_SHADOW, MATERIALS, UNIT_BOX } from "./resources";

/**
 * Renders one `BoxSpec` as a scaled instance of the shared unit cube.
 *
 * Every surface in the hotel — walls, slabs, doors, trim — is one of these.
 */
export function Box({ spec }: { spec: BoxSpec }) {
  return (
    <mesh
      geometry={UNIT_BOX}
      material={MATERIALS[spec.kind]}
      position={spec.position}
      scale={spec.size}
      castShadow={CASTS_SHADOW[spec.kind]}
      receiveShadow
    />
  );
}
