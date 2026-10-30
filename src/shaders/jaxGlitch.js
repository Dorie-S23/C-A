import * as THREE from 'three';

// Jax coming apart in the maze: horizontal slices of him jump sideways
// (like a torn video frame) and flash magenta/cyan, over faint scanlines.
// A low hum of it all the time, in bursts when he stutters (burst()).
//
// Patched into his own materials (onBeforeCompile), so it rides his
// skinning and lighting: the slices shift after he's posed, in view space.

const GLITCH_VERTEX = /* glsl */ `
  #include <project_vertex>
  {
    // Bands across him, reshuffled several times a second.
    float tick = floor(uGlitchTime * 14.0);
    float band = floor(mvPosition.y * 7.0 + jaxHash(tick) * 5.0);
    float roll = jaxHash(band * 3.17 + tick);
    // How many bands tear grows with the glitch amount.
    vGlitchBand = step(1.0 - 0.22 * uGlitch, roll) * (0.35 + 0.65 * uGlitch);
    gl_Position.x += (jaxHash(band + tick * 1.37) - 0.5) * 0.16 * vGlitchBand * gl_Position.w;
  }
`;

const GLITCH_FRAGMENT = /* glsl */ `
  #include <dithering_fragment>
  {
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.4 + uGlitchTime * 30.0);
    gl_FragColor.rgb *= 1.0 - 0.07 * scan * (0.4 + uGlitch);
    // Torn bands flash one of his glitch colours.
    vec3 tint = mod(floor(gl_FragCoord.y / 6.0 + uGlitchTime * 9.0), 2.0) < 1.0
      ? vec3(1.0, 0.18, 0.78) : vec3(0.2, 0.95, 1.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, tint, min(0.55 * vGlitchBand, 0.85));
  }
`;

const HASH = /* glsl */ `
  float jaxHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
`;

const HUM = .18; // the glitch amount between bursts
const BURST_SECONDS = .35;
// Severity (setSeverity, 0..1): how far gone he is, on top of the level.
// At full: a much higher hum, every amount nearly doubled (more slices
// torn, and further), and bursts that come on their own every second or so.
const SEVERE_HUM = .5, SEVERE_GAIN = .9;
const SEVERE_BURST_GAP = [.6, 1.4], CALM_BURST_GAP = [2.5, 4.5];

/**
 * Adds the glitch to every material under `root` (his own, from this load).
 * @returns {{ update(deltaSeconds: number): void, burst(): void,
 *   setLevel(level: number): void, setSeverity(severity: number): void,
 *   readonly severity: number, uniforms: object }}
 */
export function applyJaxGlitch(root) {
  const uniforms = { uGlitchTime: { value: 0 }, uGlitch: { value: HUM } };
  const patched = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (patched.has(material)) continue;
      patched.add(material);
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        const declarations = `uniform float uGlitchTime;\nuniform float uGlitch;\nvarying float vGlitchBand;\n`;
        shader.vertexShader = declarations + HASH + shader.vertexShader
          .replace('#include <project_vertex>', GLITCH_VERTEX);
        shader.fragmentShader = declarations + shader.fragmentShader
          .replace('#include <dithering_fragment>', GLITCH_FRAGMENT);
      };
      material.customProgramCacheKey = () => 'jaxGlitch';
      material.needsUpdate = true;
    }
  });
  let burst = 0, level = 1, severity = 0, nextBurst = Infinity;
  const gap = () => THREE.MathUtils.lerp(...[0, 1].map(i => THREE.MathUtils.lerp(CALM_BURST_GAP[i], SEVERE_BURST_GAP[i], severity)), Math.random());
  return {
    uniforms,
    get severity() { return severity; },
    update(deltaSeconds) {
      uniforms.uGlitchTime.value += deltaSeconds;
      burst = Math.max(0, burst - deltaSeconds);
      if (severity > 0 && (nextBurst -= deltaSeconds) <= 0) { burst = BURST_SECONDS * (1 + severity); nextBurst = gap(); }
      const flare = burst > 0 ? .55 + .45 * Math.random() : 0; // ragged, not a smooth pulse
      const hum = HUM + (SEVERE_HUM - HUM) * severity;
      uniforms.uGlitch.value = level * Math.max(hum, flare) * (1 + SEVERE_GAIN * severity);
    },
    /** How far gone he is (0..1), on top of the level: see SEVERE_*. */
    setSeverity(value) {
      const next = THREE.MathUtils.clamp(value, 0, 1);
      if (next > 0 && severity === 0) nextBurst = gap();
      severity = next;
      if (!severity) nextBurst = Infinity;
    },
    /** A short, strong tear (call it as he stutters). */
    burst() { burst = BURST_SECONDS; },
    /** Scales all of it: 1 coming apart, lower calmer (talking to her). */
    setLevel(value) { level = THREE.MathUtils.clamp(value, 0, 1); },
  };
}
