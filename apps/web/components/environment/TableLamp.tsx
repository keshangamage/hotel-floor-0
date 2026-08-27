import { useMemo } from "react";
import * as THREE from "three";

import type { LampSpec } from "@/game/types";

import { FIXTURE_MATERIAL } from "./resources";

/** Measured from the shade's centre, which is where the bulb sits. */
const SHADE_HEIGHT = 0.17;
const STEM_HEIGHT = 0.2;

/**
 * A bedside lamp: turned base, slim stem and a tapered shade.
 *
 * The shade is emissive and double sided, so it glows from the bulb inside
 * rather than reading as a dark box next to a mysteriously lit room.
 */
export function TableLamp({ spec, lit = true }: { spec: LampSpec; lit?: boolean }) {
  const shade = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Dark shade, gentle glow. The bulb sits inches away, so a bright
        // emissive on top of that lighting blows the shade out to pure white.
        color: "#2a2118",
        emissive: new THREE.Color(spec.color ?? "#ffb877"),
        emissiveIntensity: lit ? 0.75 : 0,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    [spec.color, lit],
  );

  // The light sits at the shade's centre; the fixture hangs below it.
  const base = -STEM_HEIGHT - SHADE_HEIGHT / 2;

  return (
    <group position={spec.position}>
      <mesh position={[0, base + 0.012, 0]} material={FIXTURE_MATERIAL} castShadow>
        <cylinderGeometry args={[0.075, 0.085, 0.024, 16]} />
      </mesh>
      <mesh position={[0, base + STEM_HEIGHT / 2, 0]} material={FIXTURE_MATERIAL} castShadow>
        <cylinderGeometry args={[0.014, 0.02, STEM_HEIGHT, 12]} />
      </mesh>
      <mesh material={shade}>
        <cylinderGeometry args={[0.082, 0.115, SHADE_HEIGHT, 20, 1, true]} />
      </mesh>
    </group>
  );
}
