import { Clone, useGLTF } from "@react-three/drei";
import type { Object3D } from "three";

import type { PropSpec } from "@/game/types";

/** One optimised library for every prop: one request, shared textures. */
export const PROPS_URL = "/models/props.glb";

interface PropsGltf {
  nodes: Record<string, Object3D>;
}

/**
 * Draws a prop from the library. Collision comes from an invisible box in the
 * layout, so art and physics stay independent.
 */
export function Prop({ spec }: { spec: PropSpec }) {
  // Draco is disabled: drei would fetch its decoder from a CDN, and the library
  // is meshopt compressed anyway.
  const { nodes } = useGLTF(PROPS_URL, false) as unknown as PropsGltf;
  const source = nodes[spec.id];
  if (!source) return null;

  return (
    <Clone
      object={source}
      position={spec.position}
      rotation={[0, spec.yaw, 0]}
      scale={spec.scale ?? 1}
      castShadow
      receiveShadow
    />
  );
}

useGLTF.preload(PROPS_URL, false);
