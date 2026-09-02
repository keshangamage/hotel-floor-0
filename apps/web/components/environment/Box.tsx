import type { BoxSpec } from "@/game/types";

import { CASTS_SHADOW, MATERIALS, geometryFor } from "./resources";

/** Renders one BoxSpec with geometry sized so its textures tile correctly. */
export function Box({ spec }: { spec: BoxSpec }) {
  return (
    <mesh
      geometry={geometryFor(spec.size, spec.kind)}
      material={MATERIALS[spec.kind]}
      position={spec.position}
      rotation={spec.rotation}
      castShadow={CASTS_SHADOW[spec.kind]}
      receiveShadow
    />
  );
}
