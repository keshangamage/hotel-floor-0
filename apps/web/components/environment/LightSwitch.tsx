import { useCallback } from "react";

import { Interactable } from "@/components/interaction/Interactable";
import type { SwitchSpec } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { FIXTURE_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";

/** Wall plate that toggles one lamp by id. */
export function LightSwitch({ spec }: { spec: SwitchSpec }) {
  const on = useGameStore((state) => !state.lightsOff[spec.targetLampId]);
  const toggleLight = useGameStore((state) => state.toggleLight);
  const toggle = useCallback(() => toggleLight(spec.targetLampId), [toggleLight, spec.targetLampId]);

  return (
    <Interactable prompt={on ? "Turn off" : "Turn on"} onInteract={toggle}>
      <group position={spec.position} rotation={[0, spec.yaw, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.trim} scale={[0.02, 0.11, 0.08]} />
        {/* The rocker tips with the state, so the switch reads at a glance. */}
        <mesh
          geometry={UNIT_BOX}
          material={FIXTURE_MATERIAL}
          position={[0.014, on ? 0.016 : -0.016, 0]}
          scale={[0.012, 0.045, 0.05]}
        />
      </group>
    </Interactable>
  );
}
