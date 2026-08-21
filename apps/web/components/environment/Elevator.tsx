import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState } from "react";

import {
  CAR_CENTRE,
  DISPLAY_POSITION,
  DOOR_Z,
  ELEVATOR,
  PANEL_POSITION,
  PANEL_WIDTH,
} from "@/game/data/elevator";
import { useGameStore } from "@/store/useGameStore";

import { FIXTURE_MATERIAL, LAMP_PANEL_MATERIAL, MATERIALS, UNIT_BOX } from "./resources";
import { SevenSegment } from "./SevenSegment";
import { SlidingDoor } from "./SlidingDoor";

/** Colder than the corridor tungsten, so the car reads as a different space. */
const CAR_LIGHT_COLOR = "#cfe0ff";

const PANEL_SIZE: [number, number, number] = [PANEL_WIDTH, ELEVATOR.doorHeight, ELEVATOR.doorThickness];

export function Elevator() {
  const camera = useThree((state) => state.camera);
  const floorNumber = useGameStore((state) => state.floorNumber);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  // Proximity call, until the buttons become interactive in Milestone 3.
  useFrame(() => {
    const dz = camera.position.z - ELEVATOR.frontZ;
    const dx = camera.position.x;
    const near = Math.hypot(dx, dz) < ELEVATOR.callRadius;
    if (near !== openRef.current) {
      openRef.current = near;
      setOpen(near);
    }
  });

  return (
    <group>
      <SlidingDoor
        closedAt={[-PANEL_WIDTH / 2, ELEVATOR.doorHeight / 2, DOOR_Z]}
        size={PANEL_SIZE}
        stroke={-PANEL_WIDTH}
        open={open}
      />
      <SlidingDoor
        closedAt={[PANEL_WIDTH / 2, ELEVATOR.doorHeight / 2, DOOR_Z]}
        size={PANEL_SIZE}
        stroke={PANEL_WIDTH}
        open={open}
      />

      <SevenSegment value={String(floorNumber)} position={DISPLAY_POSITION} />

      {/* Button panel. Interaction lands in Milestone 3. */}
      <group position={PANEL_POSITION} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={UNIT_BOX} material={MATERIALS.metal} scale={[0.16, 0.44, 0.02]} />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <mesh
            key={index}
            geometry={UNIT_BOX}
            material={FIXTURE_MATERIAL}
            position={[index % 2 === 0 ? -0.035 : 0.035, 0.15 - Math.floor(index / 2) * 0.1, 0.015]}
            scale={[0.045, 0.045, 0.012]}
          />
        ))}
      </group>

      {/* Car ceiling light. */}
      <group position={[CAR_CENTRE[0], ELEVATOR.carHeight, CAR_CENTRE[2]]}>
        <mesh geometry={UNIT_BOX} material={LAMP_PANEL_MATERIAL} position={[0, -0.03, 0]} scale={[0.7, 0.02, 0.5]} />
        <pointLight
          color={CAR_LIGHT_COLOR}
          intensity={5}
          distance={5}
          decay={2}
          position={[0, -0.12, 0]}
        />
      </group>
    </group>
  );
}
