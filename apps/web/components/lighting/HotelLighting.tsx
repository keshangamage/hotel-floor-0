import {
  AMBIENT_INTENSITY,
  HEMISPHERE_INTENSITY,
} from "@/game/data/atmosphere";
import type { FloorLayout } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { CeilingLamp } from "./CeilingLamp";

/**
 * All lighting for one floor. Ambient and hemisphere are kept very low so the
 * fixtures do the work and the flashlight still matters later.
 */
export function HotelLighting({ layout }: { layout: FloorLayout }) {
  const lightsOff = useGameStore((state) => state.lightsOff);
  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <hemisphereLight args={["#4a4238", "#14100e", HEMISPHERE_INTENSITY]} />
      {layout.lamps.map((spec, index) =>
        spec.id && lightsOff[spec.id] ? null : spec.kind === "bare" ? (
          <pointLight
            key={index}
            position={spec.position}
            color={spec.color}
            intensity={spec.intensity}
            distance={spec.distance ?? 6}
            decay={2}
          />
        ) : (
          <CeilingLamp key={index} spec={spec} />
        ),
      )}
    </>
  );
}
