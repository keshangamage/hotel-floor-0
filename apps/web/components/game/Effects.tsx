import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";

/**
 * The difference between a lit 3D scene and a render is mostly here.
 *
 * Order matters: occlusion is applied to raw lighting, bloom needs HDR values,
 * so tone mapping comes after it, and the grade and grain sit last.
 */
export function Effects() {
  return (
    <EffectComposer
      // MSAA on the composer's target, since the canvas AA is bypassed once
      // rendering goes through here. Two samples holds 60fps.
      multisampling={2}
      frameBufferType={THREE.HalfFloatType}
    >
      {/*
       * Ambient occlusion is the single biggest win: it darkens contacts and
       * corners, which is what stops furniture reading as objects floating in
       * a lit room. Half resolution to stay inside the frame budget.
       */}
      <N8AO
        halfRes
        quality="medium"
        aoRadius={1.1}
        distanceFalloff={0.9}
        intensity={2.6}
        aoSamples={16}
        denoiseSamples={4}
        color="#0a0806"
      />

      {/* Only the lamps are above the threshold, so only the lamps bleed. */}
      <Bloom
        luminanceThreshold={0.65}
        luminanceSmoothing={0.3}
        intensity={0.55}
        mipmapBlur
      />

      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />

      {/* Warm, desaturated and slightly crushed, like an old hotel at night. */}
      <HueSaturation hue={0.02} saturation={-0.12} />
      <BrightnessContrast brightness={-0.02} contrast={0.14} />

      <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
      <Noise opacity={0.028} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  );
}
