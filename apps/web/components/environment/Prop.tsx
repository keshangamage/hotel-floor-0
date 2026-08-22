import { Clone, useGLTF } from "@react-three/drei";
import type { Object3D } from "three";

import type { PropSpec } from "@/game/types";

/** Two libraries: mansion fixtures and the furniture pack. Ids are unique. */
export const PROPS_URL = "/models/props.glb";
export const FURNITURE_URL = "/models/furniture.glb";

interface PropsGltf {
  nodes: Record<string, Object3D>;
}

/**
 * Draws a prop from the library. Collision comes from an invisible box in the
 * layout, so art and physics stay independent.
 */
export function Prop({ spec }: { spec: PropSpec }) {
  // Draco is disabled: drei would fetch its decoder from a CDN, and both
  // libraries are meshopt compressed anyway.
  const mansion = useGLTF(PROPS_URL, false) as unknown as PropsGltf;
  const furniture = useGLTF(FURNITURE_URL, false) as unknown as PropsGltf;
  const source = mansion.nodes[spec.id] ?? furniture.nodes[spec.id];
  if (!source) return null;

  return (
    // The transform goes on a wrapper, never on the Clone. Meshopt centres each
    // mesh and stores the decode offset and scale on its node, so setting
    // position or scale on the clone itself replaces that decode and renders
    // the prop sunk into the floor at the wrong size.
    <group position={spec.position} rotation={[0, spec.yaw, 0]} scale={spec.scale ?? 1}>
      <Clone object={source} castShadow receiveShadow />
    </group>
  );
}

useGLTF.preload(PROPS_URL, false);
useGLTF.preload(FURNITURE_URL, false);
