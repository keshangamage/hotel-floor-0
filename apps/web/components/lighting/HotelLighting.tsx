import {
  AMBIENT_INTENSITY,
  HEMISPHERE_INTENSITY,
} from "@/game/data/atmosphere";
import type { FloorLayout } from "@/game/types";

import { CeilingLamp } from "./CeilingLamp";

/**
 * All lighting for one floor. Ambient and hemisphere are kept very low so the
 * fixtures do the work and the flashlight still matters later.
 */
export function HotelLighting({ layout }: { layout: FloorLayout }) {
  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <hemisphereLight args={["#4a4238", "#14100e", HEMISPHERE_INTENSITY]} />
      {layout.lamps.map((spec, index) => (
        <CeilingLamp key={index} spec={spec} />
      ))}
    </>
  );
}
