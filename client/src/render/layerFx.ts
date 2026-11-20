import * as THREE from 'three';

/**
 * The skins' hit effects drawn from a few still layers that the game moves on every frame of the screen, not
 * from sheets of frames (2026-11-20: a sheet of 9 to 12 frames played at 30 to 45 a second jumped from drawing to
 * drawing however its frames were mixed, "about 30 fps"). Each skin's layers are cut by scripts/assets/build_skin_fx.py
 * from the brightest frame of its sheet (made with the image model), into an atlas of cells:
 *
 *   CORE    the white-hot middle, gone in a tenth of a second
 *   SHAPE   the strokes, rays, shards (the effect's own shape), thinning as they go
 *   SPARKS  the small specks, flying out
 *   GLOW    the soft light round it all
 *   ORDER   the order its light goes in (erosion maps: R the body's, or without one the core's, G the shape's, B the
 *           specks'; 0 first .. 1 last)
 *   BODY    where a shape is one solid piece in its middle (CLAUDE's), parting into spokes; without one, LATE: the
 *           specks of a later frame of the sheet (where it broke into sparkles), coming in as the shape goes
 *
 * A layer is drawn in a quad LAYER_ROOM times as large as the effect, grown, turned, pushed out from the middle,
 * eaten by its order and faded, by numbers worked out for the moment from the layers' spec (the manifest's
 * `layers`: how the sheet's light fell and how far it reached, measured from its frames). One quad, one draw and
 * one picture each, as a sheet's; the picture is smaller than the sheet it replaces.
 */
export interface LayerSpec {
  cols: number;
  rows: number;
  /** A hit's: the share of its light left every LIGHT_STEP_MS from the hit, as its sheet's frames held it. */
  light?: number[];
  /** A hit's: the share of the white light in its middle left every LIGHT_STEP_MS (the core layer's), as its sheet's. */
  core?: number[];
  /** A hit's: how much farther out the middle of its light went as it ended than where it started (its sheet's). */
  grow?: number;
  /** A hit's: the radius holding half its light as it starts, a share of half the cell. */
  reach?: number;
  /** A hold's: how fast it turns, radians a second; 0: it does not turn (a flame, slices), it flickers. */
  turn?: number;
  /** Grows along its width only (slices). */
  axis?: 'x';
  /** Whether it has a BODY layer. */
  body?: boolean;
  /** Whether it has LATE specks (in BODY's cell: a hit has one or the other). */
  late?: boolean;
}

export const CORE = 0;
export const SHAPE = 1;
export const SPARKS = 2;
export const GLOW = 3;
export const ORDER = 4;
export const BODY = 5;
export const LATE = 5;

/** Layers drawn in one quad at most (a cell can be drawn twice, in two poses: a hold's specks). */
export const SLOTS = 7;
/** How much larger the quad is than the effect at its first moment: room for its layers to grow and fly into. */
export const LAYER_ROOM = 1.5;
/** How long a hit's layers play (the user's rule: under 0.4 s). */
export const LAYER_BURST_MS = 320;
/** The spacing of a spec's `light`. */
export const LIGHT_STEP_MS = 20;

/**
 * One layer as drawn: its cell, how large (1 = as drawn; `stretch` times that across, 1 = as wide as high), turned
 * (radians), pushed out from the middle (share of the cell: what was at radius r is drawn at r + push), how bright
 * (0 = not drawn), and `cut`: how much of it is gone, in its `order` (1 R, 2 G, 3 B of the ORDER cell), or without
 * one how bright its light must be to stay.
 */
export interface LayerPose {
  cell: number;
  scale: number;
  angle: number;
  push: number;
  gain: number;
  cut: number;
  order?: number;
  stretch?: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Fast, then slower: what a thing thrown out does. */
const out = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

/** Light that halves in about 90 ms, for a spec that does not say how its sheet's fell. */
const FALLBACK_LIGHT = Array.from({ length: 15 }, (_, i) => (i === 14 ? 0 : Math.exp(-(i * LIGHT_STEP_MS) / 130)));

/** The share of a hit's light left `ms` after it (its spec's `light`, between its points; none past its end). */
export function lightAt(light: readonly number[] | undefined, ms: number): number {
  const curve = light && light.length > 1 ? light : FALLBACK_LIGHT;
  const at = Math.max(0, ms) / LIGHT_STEP_MS;
  const i = Math.floor(at);
  if (i >= curve.length - 1) return 0;
  return Math.max(0, curve[i] + (curve[i + 1] - curve[i]) * (at - i));
}

/**
 * A hit `ms` after it. At 0 every layer is whole, as drawn: the sheet's first frame. Then the white middle goes as its
 * sheet's did, shrinking to its middle, the shape spreads as far out as the sheet's light went (pushed out more than
 * grown) and thins in its order as fast as the sheet's light fell, the specks fly out and go one by one, and the glow
 * fades with the light. White light goes by thinning more than by dimming: dimmed, it turns grey.
 */
export function burstPoses(ms: number, spec: LayerSpec): LayerPose[] {
  const light = lightAt(spec.light, ms);
  // the light that is left, as bright as it can be while thinning: white dimmed turns grey (but never brighter
  // than its last twentieth of light allows, so that it ends without a step)
  const bright = (power: number) => light ** power * Math.min(1, 20 * light);
  // (the white middle never outlasts the burst's first two thirds)
  const white = (spec.core ? lightAt(spec.core, ms) : (1 - clamp01(ms / 90)) ** 2) * (1 - smooth(120, 220, ms));
  const e = out(ms / LAYER_BURST_MS);
  const spread = Math.max(0, (spec.grow ?? 1.2) - 1) * e;
  const scale = 1 + 0.3 * spread;
  const push = 0.9 * spread * ((spec.reach ?? 0.4) / 2);
  // slices grow along their width only
  const stretch = spec.axis === 'x' ? 1 / scale : 1;
  const poses: LayerPose[] = [
    { cell: GLOW, scale: 1 + 0.5 * spread, angle: 0, push: 0, gain: 0.5 * light ** 0.8, cut: 0, stretch },
    { cell: SHAPE, scale, angle: 0.04 * e, push, gain: bright(0.2), cut: 0.98 * (1 - light ** 0.8), order: 2, stretch },
    { cell: SPARKS, scale: 1 + 0.08 * e, angle: 0.04 * e, push: push + 0.26 * e, gain: 1, cut: smooth(60, LAYER_BURST_MS, ms), order: 3 },
    // (without a body the core shrinks to its middle in its order; with one, the order is the body's: it dims)
    spec.body
      ? { cell: CORE, scale: 1 + 0.1 * out(ms / 80), angle: 0, push: 0, gain: white, cut: 0 }
      : { cell: CORE, scale: 1 + 0.1 * out(ms / 80), angle: 0, push: 0, gain: Math.min(1, 3 * white), cut: 0.98 * (1 - white ** 0.85), order: 1 },
  ];
  // the sparkles the sheet broke into, coming in as the shape goes and flying on
  if (spec.late) poses.push({ cell: LATE, scale: 1 + 0.06 * e, angle: 0.04 * e, push: 1.3 * push, gain: smooth(50, 130, ms) * (1 - smooth(200, LAYER_BURST_MS, ms)), cut: 0 });
  // a solid middle parts into spokes a little ahead of the strokes
  if (spec.body) poses.splice(1, 0, { cell: BODY, scale, angle: 0.04 * e, push: 0.6 * push, gain: bright(0.3), cut: 0.98 * (1 - light ** 1.2), order: 1, stretch });
  return poses;
}

/**
 * The light of a held long note `ms` into its time: a loop with no seam. The shape turns (`turn`) or, where it
 * must not (a flame, slices), flickers in its order; everything breathes; the specks flow out of the middle in two
 * waves, each fading in and out.
 */
export function holdPoses(ms: number, spec: LayerSpec): LayerPose[] {
  const s = ms / 1000;
  const wave = (hz: number, phase = 0) => Math.sin(2 * Math.PI * hz * s + phase);
  const angle = (spec.turn ?? 0.9) * s;
  const flicker = spec.turn === 0 ? 0.14 + 0.08 * wave(2.3) + 0.05 * wave(5.9, 1) : 0;
  const size = 1 + 0.04 * wave(5.3);
  const stretch = spec.axis === 'x' ? 1 / size : 1;
  const bright = 0.9 + 0.1 * wave(1.4);
  const a = fract(s * 1.7);
  const b = fract(s * 1.7 + 0.5);
  const poses: LayerPose[] = [
    { cell: GLOW, scale: 1 + 0.05 * wave(2.3), angle: 0, push: 0, gain: 0.8 + 0.1 * wave(3.1), cut: 0, stretch },
    { cell: SHAPE, scale: size, angle, push: 0, gain: bright, cut: flicker, order: 2, stretch },
    { cell: SPARKS, scale: 0.7, angle: 0.3 * s, push: 0.28 * a, gain: 0.9 * Math.sin(Math.PI * a), cut: 0 },
    { cell: SPARKS, scale: 0.7, angle: -0.3 * s + 2.1, push: 0.28 * b, gain: 0.9 * Math.sin(Math.PI * b), cut: 0 },
    { cell: CORE, scale: 1 + 0.12 * wave(7.3) + 0.06 * wave(11.7, 1), angle: 0, push: 0, gain: 0.95 + 0.05 * wave(9.1), cut: 0 },
  ];
  if (spec.body) poses.splice(1, 0, { cell: BODY, scale: size, angle, push: 0, gain: bright, cut: flicker, order: 1, stretch });
  return poses;
}

/** A layered quad's numbers, written into its material each frame (setPoses). */
export interface LayerUniforms {
  cells: THREE.Vector4[];
  poses: THREE.Vector4[];
  cuts: THREE.Vector4[];
  orderCell: THREE.Vector4;
  atlas: Pick<LayerSpec, 'cols' | 'rows'>;
}

/** Where a cell is in its atlas, in texture coordinates (cells read row by row from the top left; images load with flipY). */
export function cellOf({ cols, rows }: Pick<LayerSpec, 'cols' | 'rows'>, cell: number): THREE.Vector4 {
  const c = cell % cols;
  const r = Math.floor(cell / cols);
  return new THREE.Vector4(c / cols, 1 - (r + 1) / rows, 1 / cols, 1 / rows);
}

export function layerUniforms(atlas: Pick<LayerSpec, 'cols' | 'rows'>): LayerUniforms {
  return {
    cells: Array.from({ length: SLOTS }, () => new THREE.Vector4()),
    poses: Array.from({ length: SLOTS }, () => new THREE.Vector4(1, 0, 0, 0)),
    cuts: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 1, 0, 0)),
    orderCell: cellOf(atlas, ORDER),
    atlas,
  };
}

/** Writes the layers' poses, `gain` times as bright (the slots past them are not drawn). */
export function setPoses(u: LayerUniforms, poses: readonly LayerPose[], gain = 1): void {
  for (let i = 0; i < SLOTS; i++) {
    const p = poses[i];
    if (!p) {
      u.poses[i].w = 0;
      continue;
    }
    u.cells[i].copy(cellOf(u.atlas, p.cell));
    u.poses[i].set(Math.max(1e-3, p.scale), p.angle, p.push, Math.max(0, p.gain * gain));
    u.cuts[i].set(p.cut, Math.max(1e-3, p.stretch ?? 1), p.order ?? 0, 0);
  }
}

/**
 * The material of a layered quad: light on black, added to the screen as lightMaterial adds a sheet's
 * (premultiplied; light at least `core` bright turns white, toward the lane's colour where the effect takes it),
 * its layers laid one over another as light over light ("screen": white over colour stays white, never brighter).
 * `inset`: half a pixel of a cell, so that a layer never reads its neighbour's.
 */
export function layerMaterial(params: THREE.MeshBasicMaterialParameters, core: number, u: LayerUniforms, inset: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    ...params,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.layerCell = { value: u.cells };
    shader.uniforms.layerPose = { value: u.poses };
    shader.uniforms.layerCut = { value: u.cuts };
    shader.uniforms.layerOrder = { value: u.orderCell };
    shader.fragmentShader = `uniform vec4 layerCell[ ${SLOTS} ];\nuniform vec4 layerPose[ ${SLOTS} ];\nuniform vec4 layerCut[ ${SLOTS} ];\nuniform vec4 layerOrder;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec2 layerP = ( vMapUv - 0.5 ) * ${LAYER_ROOM.toFixed(3)};
        vec3 light = vec3( 0.0 );
        for ( int i = 0; i < ${SLOTS}; i ++ ) {
          vec4 pose = layerPose[ i ];
          if ( pose.w <= 0.0 ) continue;
          vec4 cut = layerCut[ i ];
          float c = cos( pose.y );
          float s = sin( pose.y );
          vec2 q = vec2( c * layerP.x + s * layerP.y, - s * layerP.x + c * layerP.y ) / ( pose.x * vec2( 1.0, cut.y ) );
          float r = length( q );
          q *= max( r - pose.z, 0.0 ) / max( r, 1e-4 );
          vec2 st = q + 0.5;
          vec4 cell = layerCell[ i ];
          // The picture is read with its rate of change taken from the place unclamped, and read everywhere, a cell's
          // outside then multiplied away: a lookup skipped by some pixels of a block and not by others (or one whose
          // place is clamped) leaves the GPU no good rate of change there, and it reads its smallest copy of the whole
          // atlas instead (lines along the edge of each layer's cell, seen in SwiftShader).
          vec2 place = cell.xy + st * cell.zw;
          vec2 gx = dFdx( place );
          vec2 gy = dFdy( place );
          float inside = step( 0.0, st.x ) * step( st.x, 1.0 ) * step( 0.0, st.y ) * step( st.y, 1.0 );
          vec2 at = clamp( st, ${inset.toFixed(5)}, ${(1 - inset).toFixed(5)} );
          vec3 texel = sRGBTransferOETF( textureGrad( map, cell.xy + at * cell.zw, gx, gy ) ).rgb * inside;
          float keep;
          if ( cut.z > 0.5 ) {
            vec3 order = sRGBTransferOETF( textureGrad( map, layerOrder.xy + at * layerOrder.zw, gx, gy ) ).rgb;
            float o = cut.z < 1.5 ? order.r : ( cut.z < 2.5 ? order.g : order.b );
            // (the edge it goes at narrows as it goes: what is left at the end is the last of it, not a haze)
            keep = smoothstep( cut.x - 0.04 - 0.11 * ( 1.0 - cut.x ), cut.x, o );
          } else {
            keep = smoothstep( cut.x - 0.15, cut.x, max( texel.r, max( texel.g, texel.b ) ) );
          }
          texel = min( texel * ( keep * pose.w ), vec3( 1.0 ) );
          light = light + texel - light * texel;
        }
        // nothing reaches the quad's edge in a line
        vec2 edge = abs( vMapUv - 0.5 );
        // (smoothstep with its edges the wrong way round is undefined in GLSL: some GPUs draw lines with it)
        light *= 1.0 - smoothstep( 0.44, 0.5, max( edge.x, edge.y ) );
        float lightCore = smoothstep( ${core.toFixed(3)}, 1.0, max( light.r, max( light.g, light.b ) ) );
        vec3 lit = mix( sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb, vec3( 1.0 ), lightCore ) * light;
        float lightAlpha = diffuseColor.a;
        diffuseColor.rgb = sRGBTransferEOTF( vec4( lit, 1.0 ) ).rgb * lightAlpha;
        diffuseColor.a = max( lit.r, max( lit.g, lit.b ) ) * lightAlpha;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `layers${core}${inset}`;
  return material;
}
