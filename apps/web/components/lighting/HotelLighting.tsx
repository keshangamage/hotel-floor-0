import {
  AMBIENT_INTENSITY,
  HEMISPHERE_INTENSITY,
} from "@/game/data/atmosphere";
import type { FloorLayout } from "@/game/types";
import { useGameStore } from "@/store/useGameStore";

import { CeilingLamp } from "./CeilingLamp";
import { TableLamp } from "@/components/environment/TableLamp";

import { RoomSpot } from "./RoomSpot";

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
      {layout.lamps.map((spec, index) => {
        // Switched off means dark, not gone. Returning null here took the
        // fixture with it, so flipping the switch made the lamp itself vanish
        // off the nightstand.
        const lit = spec.lit !== false && !(spec.id && lightsOff[spec.id]);

        if (spec.kind === "spot") {
          return (
            <RoomSpot
              key={index}
              // castShadow is left alone: how many lights cast is part of the
              // shader key too, so turning it off recompiles just as surely as
              // removing the light would.
              spec={lit ? spec : { ...spec, intensity: 0 }}
            />
          );
        }

        if (spec.kind === "bare") {
          return (
            <group key={index}>
              {spec.fixture === "table" ? <TableLamp spec={spec} lit={lit} /> : null}
              <pointLight
                position={spec.position}
                color={spec.color}
                intensity={lit ? spec.intensity : 0}
                distance={spec.distance ?? 6}
                decay={2}
              />
            </group>
          );
        }

        return <CeilingLamp key={index} spec={lit ? spec : { ...spec, lit: false }} />;
      })}
    </>
  );
}
