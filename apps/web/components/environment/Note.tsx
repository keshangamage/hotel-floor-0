import { useMemo } from "react";
import * as THREE from "three";

import { Interactable } from "@/components/interaction/Interactable";
import type { NoteSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { UNIT_BOX } from "./resources";

/** Hotel stationery: brighter than anything around it, so it draws the eye. */
const PAPER = new THREE.MeshStandardMaterial({ color: "#d8d2c0", roughness: 0.92 });

export function Note({ spec }: { spec: NoteSpec }) {
  const read = useGameStore((state) => state.readNote);
  const offer = useGameStore((state) => state.offer);
  // Squared up paper on a worn desk looks placed by a level designer.
  const tilt = useMemo(() => (spec.id.length % 5) * 0.03 - 0.06, [spec.id]);

  return (
    <Interactable
      prompt="Read"
      onInteract={() => {
        read(spec);
        // A page that opens a floor is the only way on. The lift answers
        // again afterwards, but only for the one below, which is the whole
        // shape of the way out: down.
        if (spec.opens !== undefined) offer(spec.opens);
      }}
    >
      <mesh
        geometry={UNIT_BOX}
        material={PAPER}
        position={spec.position}
        rotation={[0, spec.yaw + tilt, 0]}
        scale={[0.21, 0.002, 0.148]}
        castShadow
        receiveShadow
      />
    </Interactable>
  );
}

export function Notes({ notes }: { notes: readonly NoteSpec[] }) {
  return (
    <>
      {notes.map((spec) => (
        <Note key={spec.id} spec={spec} />
      ))}
    </>
  );
}
