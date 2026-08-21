import type { BoxSpec } from "@/game/types";

import { CASTS_SHADOW, MATERIALS, geometryFor } from "./resources";

/** Renders one BoxSpec with geometry sized so its textures tile correctly. */
export function Box({ spec }: { spec: BoxSpec }) {
  return (
    <mesh
      geometry={geometryFor(spec.size)}
      material={MATERIALS[spec.kind]}
      position={spec.position}
      castShadow={CASTS_SHADOW[spec.kind]}
      receiveShadow
    />
  );
}
