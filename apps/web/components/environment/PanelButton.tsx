import * as THREE from "three";

import { Interactable } from "@/components/interaction/Interactable";

import { UNIT_BOX } from "./resources";

const BASE = new THREE.MeshStandardMaterial({ color: "#26262a", roughness: 0.5, metalness: 0.5 });

export interface PanelButtonProps {
  position: [number, number, number];
  prompt: string;
  onPress: () => void;
  /** Lit buttons glow; dead ones stay dark. */
  lit?: boolean;
  active?: boolean;
  size?: number;
  color?: string;
}

/** A single pressable button. Used for elevator floors and light switches. */
export function PanelButton({
  position,
  prompt,
  onPress,
  lit = false,
  active = true,
  size = 0.045,
  color = "#ff8c2a",
}: PanelButtonProps) {
  // Declared rather than mutated, so R3F owns the material's lifecycle.
  const glow = lit ? 3 : active ? 0.12 : 0.02;

  return (
    <Interactable prompt={prompt} onInteract={onPress}>
      <group position={position}>
        <mesh geometry={UNIT_BOX} material={BASE} scale={[size * 1.35, size * 1.35, 0.012]} />
        <mesh geometry={UNIT_BOX} position={[0, 0, 0.009]} scale={[size, size, 0.01]}>
          <meshStandardMaterial
            color="#1a1a1d"
            emissive={color}
            emissiveIntensity={glow}
            roughness={0.6}
          />
        </mesh>
      </group>
    </Interactable>
  );
}
