import type { PaintingSpec } from "@/game/types";

import { CANVAS_MATERIALS, MATERIALS, UNIT_BOX } from "./resources";

/** Frame border width and how far the art stands off the wall. */
const BORDER = 0.055;
const DEPTH = 0.05;

/**
 * A framed picture built from primitives rather than an imported frame.
 *
 * The mansion's ornate frame is a near-flat plate whose oval is painted into
 * the texture, not modelled, so there is nothing to sit artwork inside. Built
 * here, every dimension is known and the art always fits its frame.
 */
export function Painting({ spec }: { spec: PaintingSpec }) {
  const material = CANVAS_MATERIALS[spec.art % CANVAS_MATERIALS.length]!;

  return (
    <group
      position={spec.position}
      // Local +Z faces into the corridor.
      rotation={[0, spec.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
    >
      <mesh
        geometry={UNIT_BOX}
        material={MATERIALS.wood}
        scale={[spec.width + BORDER * 2, spec.height + BORDER * 2, DEPTH]}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 0, DEPTH / 2 + 0.002]} material={material} receiveShadow>
        <planeGeometry args={[spec.width, spec.height]} />
      </mesh>
    </group>
  );
}
