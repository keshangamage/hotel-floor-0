import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { BoxSpec, FloorLayout } from "@/game/types";

import { CASTS_SHADOW, MATERIALS, geometryFor } from "./resources";

/**
 * Boxes that share a geometry are one draw call, not one each.
 *
 * A floor is around 180 boxes and they fall into about 55 shapes, so batching
 * them by shape cuts the draw calls by roughly seventy per cent. That saving
 * is paid four times over: three lights cast here, and a shadow map is the
 * whole scene drawn again from that light.
 *
 * The trade is frustum culling. Each batch has one bounding volume covering
 * every instance in it, so a batch spread down the corridor is drawn whenever
 * any part of it is in view. In a straight corridor the player can see most of
 * the floor anyway, and the lights casting shadows see all of it, so there was
 * little for per-mesh culling to reject.
 */
function batches(layout: FloorLayout): [string, BoxSpec[]][] {
  const groups = new Map<string, BoxSpec[]>();
  for (const box of layout.boxes) {
    if (box.visible === false) continue;
    // The same key the geometry cache uses, so one batch is one geometry.
    const key = `${box.kind}:${box.size.map((n) => n.toFixed(3)).join()}`;
    const found = groups.get(key);
    if (found) found.push(box);
    else groups.set(key, [box]);
  }
  return [...groups];
}

// Reused while filling a batch, so building a floor allocates four objects
// rather than four per box.
const place = new THREE.Vector3();
const turn = new THREE.Quaternion();
const angles = new THREE.Euler();
const unscaled = new THREE.Vector3(1, 1, 1);
const matrix = new THREE.Matrix4();

function Batch({ boxes }: { boxes: readonly BoxSpec[] }) {
  const first = boxes[0]!;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => geometryFor(first.size, first.kind), [first]);

  // Layout rather than effect: the matrices have to be in place before the
  // first frame, or the floor appears stacked at the origin for one of them.
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;

    boxes.forEach((box, i) => {
      place.set(box.position[0], box.position[1], box.position[2]);
      if (box.rotation) {
        angles.set(box.rotation[0], box.rotation[1], box.rotation[2]);
        turn.setFromEuler(angles);
      } else {
        turn.identity();
      }
      node.setMatrixAt(i, matrix.compose(place, turn, unscaled));
    });
    node.instanceMatrix.needsUpdate = true;
    // Culling and shadow bounds both read this, and it is not derived from the
    // instance matrices on its own.
    node.computeBoundingSphere();
  }, [boxes]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, MATERIALS[first.kind], boxes.length]}
      castShadow={CASTS_SHADOW[first.kind]}
      receiveShadow
    />
  );
}

/**
 * Draws a floor's boxes. Geometry and materials are shared by kind and size,
 * and everything sharing a pair is drawn in one call.
 */
export function FloorGeometry({ layout }: { layout: FloorLayout }) {
  const groups = useMemo(() => batches(layout), [layout]);

  return (
    <group>
      {groups.map(([key, boxes]) => (
        <Batch key={key} boxes={boxes} />
      ))}
    </group>
  );
}
