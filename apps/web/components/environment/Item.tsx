import * as THREE from "three";

import { Interactable } from "@/components/interaction/Interactable";
import { FIRST_PAGE, LEDGER } from "@/game/data/floor";
import type { ItemSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { UNIT_BOX } from "./resources";

/** Old brass, kept bright enough to catch a torch beam across a dark room. */
const BRASS = new THREE.MeshStandardMaterial({
  color: "#b08d4e",
  roughness: 0.42,
  metalness: 0.85,
});

/** A cell: zinc case, one bright end. */
const ZINC = new THREE.MeshStandardMaterial({ color: "#4a4a50", roughness: 0.55, metalness: 0.7 });
const CAP = new THREE.MeshStandardMaterial({ color: "#c8b083", roughness: 0.4, metalness: 0.9 });

/** Board covers and a block of paper. */
const BOARD = new THREE.MeshStandardMaterial({ color: "#3a3128", roughness: 0.85 });
const LEAVES = new THREE.MeshStandardMaterial({ color: "#cbc3ae", roughness: 0.95 });

/**
 * A key on a surface.
 *
 * Built from boxes rather than imported: it is nine centimetres of metal seen
 * once, and a model of it would cost more to download than the room it sits in.
 */
export function Item({ spec }: { spec: ItemSpec }) {
  const carrying = useGameStore((state) => state.carrying);
  const spent = useGameStore((state) => state.spent);
  const take = useGameStore((state) => state.take);
  const spend = useGameStore((state) => state.spend);
  const recharge = useGameStore((state) => state.recharge);
  const read = useGameStore((state) => state.readNote);

  // A kept thing is remembered by what it is, a used one by which one it was.
  const gone = spec.keep ? carrying[spec.id] : spent[spec.instanceId];
  if (gone) return null;

  const pick = () => {
    if (spec.keep) {
      take(spec.id);
      // The notebook opens itself. It is the only place the rule is written,
      // and this is the moment the player can start following it.
      if (spec.id === LEDGER) read(FIRST_PAGE);
      return;
    }
    // Used where it is found rather than carried: there is nothing to do with
    // a spare cell except put it in the torch.
    spend(spec.instanceId);
    recharge();
  };

  return (
    <Interactable prompt={`Take the ${spec.label}`} onInteract={pick}>
      <group position={spec.position} rotation={[0, spec.yaw, 0]}>
        {spec.id === LEDGER ? (
          <>
            <mesh geometry={UNIT_BOX} material={BOARD} scale={[0.11, 0.014, 0.155]} />
            <mesh
              geometry={UNIT_BOX}
              material={LEAVES}
              position={[0.004, 0.001, 0]}
              scale={[0.104, 0.015, 0.148]}
            />
          </>
        ) : spec.keep ? (
          <>
            {/* Shank, bow and one ward, which is a key at arm's length. */}
            <mesh geometry={UNIT_BOX} material={BRASS} scale={[0.062, 0.005, 0.006]} />
            <mesh
              geometry={UNIT_BOX}
              material={BRASS}
              position={[-0.036, 0, 0]}
              scale={[0.022, 0.004, 0.019]}
            />
            <mesh
              geometry={UNIT_BOX}
              material={BRASS}
              position={[0.026, 0, 0.007]}
              scale={[0.012, 0.004, 0.009]}
            />
          </>
        ) : (
          <>
            <mesh geometry={UNIT_BOX} material={ZINC} scale={[0.05, 0.017, 0.017]} />
            <mesh
              geometry={UNIT_BOX}
              material={CAP}
              position={[0.027, 0, 0]}
              scale={[0.005, 0.009, 0.009]}
            />
          </>
        )}
      </group>
    </Interactable>
  );
}

export function Items({ items }: { items: readonly ItemSpec[] }) {
  return (
    <>
      {items.map((spec) => (
        <Item key={spec.instanceId} spec={spec} />
      ))}
    </>
  );
}
