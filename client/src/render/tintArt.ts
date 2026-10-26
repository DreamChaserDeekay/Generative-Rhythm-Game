import * as THREE from 'three';

/**
 * Skin pictures drawn in code, in "tint" form: red is how much of the part's colour shows (0 dark
 * … 1 the colour itself), green how far it is then lifted toward white, alpha the shape. One
 * picture serves every lane colour and palette (the colour-blind one too); tintMaterial puts the
 * colour in.
 */
export type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** Fill style of a tint picture: `k` of the colour, then `white` toward white, at `alpha`. */
export function ink(k: number, white = 0, alpha = 1): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${c(k)},${c(white)},0,${Math.min(1, Math.max(0, alpha))})`;
}

/** The colour as seen in a tint picture: k ≤ 1 darkens it, k > 1 lifts it toward white (never all the way). */
export function tone(k: number, alpha = 1): string {
  return k <= 1 ? ink(k, 0, alpha) : ink(1, Math.min(0.7, (k - 1) * 1.6), alpha);
}

export function paintTexture(w: number, h: number, paint: Paint): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  paint(g, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  // the channels are amounts, not colours: no sRGB decoding. Premultiplied, so a filtered edge keeps
  // its amounts (a transparent texel would pull them toward 0: a dark fringe); tintMaterial divides
  texture.colorSpace = THREE.NoColorSpace;
  texture.premultiplyAlpha = true;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Puts the material's colour into a tint picture (see Paint); vertex colours still shade it after.
 * Red 0 is `base` (black unless given); `gain` brightens the result like CSS `filter: brightness()`.
 * The mixing is done in sRGB, as the mockups' CSS mixes: 18 % of a colour in linear light would
 * show at about twice that.
 */
export function tintMaterial(params: THREE.MeshBasicMaterialParameters, { base = 0x000000, gain = 1 } = {}): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial(params);
  const tintBase = { value: new THREE.Color(base) };
  const tintGain = { value: gain };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tintBase = tintBase;
    shader.uniforms.tintGain = tintGain;
    shader.fragmentShader = `uniform vec3 tintBase;\nuniform float tintGain;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 tintTexel = texture2D( map, vMapUv );
        vec2 tintAmount = tintTexel.rg / max( tintTexel.a, 1e-4 );
        vec3 tintFrom = sRGBTransferOETF( vec4( tintBase, 1.0 ) ).rgb;
        vec3 tintTo = sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb;
        vec3 tinted = min( mix( mix( tintFrom, tintTo, tintAmount.x ), vec3( 1.0 ), tintAmount.y ) * tintGain, vec3( 1.0 ) );
        diffuseColor.rgb = sRGBTransferEOTF( vec4( tinted, 1.0 ) ).rgb;
        diffuseColor.a *= tintTexel.a;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'tint';
  return material;
}

/**
 * A flipbook of light on black, in the material's colour, as the sheets drew the crystal set's
 * flipbooks: the light takes the colour and its brightest core (from `core` up) stays white.
 * The light is added to what is behind it, and the canvas is made only as opaque as the light is
 * bright: its black (the whole picture is opaque) would otherwise hide a background video or the
 * visualizer behind the see-through canvas around the gear.
 */
export function lightMaterial(params: THREE.MeshBasicMaterialParameters, core: number): THREE.MeshBasicMaterial {
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
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 lightTexel = texture2D( map, vMapUv );
        vec3 light = sRGBTransferOETF( lightTexel ).rgb;
        float lightCore = smoothstep( ${core.toFixed(3)}, 1.0, max( light.r, max( light.g, light.b ) ) );
        vec3 lit = mix( sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb, vec3( 1.0 ), lightCore ) * light;
        // premultiplied: the colour as much as it shows, the alpha as bright as the light
        float lightAlpha = diffuseColor.a * lightTexel.a;
        diffuseColor.rgb = sRGBTransferEOTF( vec4( lit, 1.0 ) ).rgb * lightAlpha;
        diffuseColor.a = max( lit.r, max( lit.g, lit.b ) ) * lightAlpha;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `light${core}`;
  return material;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

// ---------- notes, seen from above (canvas top = the far edge) ----------

/**
 * FLAT and STEM are plain bars. The others are families, each with its own long note (LONG_OF):
 * CHAMFER a machined plate with cut corners, ROUND a coin, STAR4 a compass star stretched along the
 * judge line, STAR5 a five-pointed star; each as wide as its lane lets a note be.
 */
export type NoteStyle = 'flat' | 'stem' | 'chamfer' | 'round' | 'star4' | 'star5';
export const NOTE_STYLES: NoteStyle[] = ['flat', 'stem', 'chamfer', 'round', 'star4', 'star5'];

/**
 * The lane a note is drawn for: its key's colour, the scratch or a side lane. The families mark
 * a key's notes by it (see noteMark), so they are told apart without their colour too.
 */
export type NoteMark = 'white' | 'blue' | 'gold' | 'scratch' | 'side';

/** A note of a lane of `mark`, filling w×h (the note's own proportions seen from above). */
export type NotePaint = (g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark) => void;

/**
 * How much longer along the track than across it the families draw their marks, cuts and ends, so
 * they keep their shape where the camera flattens the track (about this much near the judge line).
 */
const NOTE_STRETCH = 1.7;

/**
 * How tall the coin and the stars look for their width at the judge line (the bars keep a fixed
 * depth): the coin round, the five-pointed star as drawn, the compass star wide.
 */
const NOTE_SHAPE: Partial<Record<NoteStyle, number>> = { round: 1, star4: 0.62, star5: 0.95 };

/**
 * How deep a note of `style` is along the track: a bar `base` deep; the coin and the stars as deep
 * as keeps their shape at the judge line for a note `width` wide, where the camera shows the track
 * `flatten` times shorter along than across (no shallower than a bar, nor over three times as deep:
 * the plane camera and very wide lanes flatten them a little).
 */
export function noteDepthOf(style: NoteStyle, base: number, width: number, flatten: number): number {
  const shape = NOTE_SHAPE[style];
  return shape === undefined ? base : Math.min(base * 3, Math.max(base, width * shape * flatten));
}

/**
 * How deep a lane's notes are, for notes `share` as wide as a key lane's (`depth` deep): the
 * families keep their shape in a wider lane (the scratch) or a narrower one (a side lane), deeper
 * or shallower (no more than three bars deep); the plain bars stay as deep.
 */
export function laneDepthOf(style: NoteStyle, depth: number, share: number, base: number): number {
  return style === 'flat' || style === 'stem' ? depth : Math.min(base * 3, depth * share);
}

/** Sizes in the mockups are px on a note 51.5 px deep: `u(n)` turns them into px of this picture. */
const unit = (h: number) => (n: number) => (n * h) / 51.5;

function polygon(g: CanvasRenderingContext2D, points: [number, number][]): void {
  g.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

/** How much a face turned toward (dx, dy) on the screen catches the light, which comes from the far left (-1 … 1). */
function litBy(dx: number, dy: number): number {
  const len = Math.hypot(dx, dy) || 1;
  return (-0.55 * dx - 0.83 * dy) / len;
}

/**
 * A plate's outline with its four corners cut at 45° on the screen, `c` across (NOTE_STRETCH times
 * that along), moved in by `t` (as thick on the screen along the track as across it).
 */
function chamferOutline(x: number, y: number, w: number, h: number, c: number, t = 0): [number, number][] {
  const st = NOTE_STRETCH;
  const k = t * Math.tan(Math.PI / 8);
  const [l, r, top, bottom] = [x + t, x + w - t, y + t * st, y + h - t * st];
  const cut = c + k;
  return [
    [x + cut, top],
    [x + w - cut, top],
    [r, y + cut * st],
    [r, y + h - cut * st],
    [x + w - cut, bottom],
    [x + cut, bottom],
    [l, y + h - cut * st],
    [l, y + cut * st],
  ];
}

/**
 * The lane's mark at a family note's middle, `r` across: a ring on a white key's note, a triangle
 * pointing up the track on a blue key's, a diamond on a gold key's, two slashes on the scratch's,
 * none on a side lane's. Filled, or drawn as an outline.
 */
function noteMark(g: CanvasRenderingContext2D, mark: NoteMark, cx: number, cy: number, r: number, colour: string, filled: boolean): void {
  if (mark === 'side') return;
  g.save();
  g.translate(cx, cy);
  g.scale(1, NOTE_STRETCH);
  g.fillStyle = colour;
  g.strokeStyle = colour;
  g.lineWidth = r * 0.34;
  g.lineJoin = 'miter';
  const shape = (points: [number, number][]) => {
    polygon(
      g,
      points.map(([x, y]) => [x * r, y * r]),
    );
    if (filled) g.fill();
    else g.stroke();
  };
  if (mark === 'white') {
    g.beginPath();
    g.arc(0, 0, filled ? r * 0.62 : r * 0.72, 0, Math.PI * 2);
    if (filled) g.fill();
    else g.stroke();
  } else if (mark === 'blue') {
    shape([
      [0, -0.95],
      [0.95, 0.68],
      [-0.95, 0.68],
    ]);
  } else if (mark === 'gold') {
    shape([
      [0, -1],
      [0.95, 0],
      [0, 1],
      [-0.95, 0],
    ]);
  } else {
    g.lineWidth = r * 0.42;
    g.lineCap = 'butt';
    g.beginPath();
    for (const dx of [-0.55, 0.55]) {
      g.moveTo((dx - 0.36) * r, 0.9 * r);
      g.lineTo((dx + 0.36) * r, -0.9 * r);
    }
    g.stroke();
  }
  g.restore();
}

/**
 * CHAMFER: a machined plate, its corners cut at 45° on the screen: a light band across its middle
 * third (its time), darker bands to its far and near edges, a lit facet at its left end and a
 * shaded one at its right, a dark rim, and its lane's mark engraved in the band.
 */
function chamferNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const st = NOTE_STRETCH;
  const c = Math.min(w * 0.075, (h * 0.3) / st);
  const rim = Math.max(1.2, Math.min(w * 0.02, h * 0.035));
  polygon(g, chamferOutline(0, 0, w, h, c));
  g.fillStyle = tone(0.3);
  g.fill();
  g.save();
  polygon(g, chamferOutline(0, 0, w, h, c, rim));
  g.clip();
  const [b0, b1] = [h * 0.33, h * 0.67];
  g.fillStyle = tone(0.84);
  g.fillRect(0, 0, w, b0);
  g.fillStyle = mark === 'scratch' ? ink(1, 0.55) : tone(1.12);
  g.fillRect(0, b0, w, b1 - b0);
  g.fillStyle = tone(0.6);
  g.fillRect(0, b1, w, h - b1);
  // the end facets: the cut corners and a strip in from each end, lit on the left, in shade on the right
  const f = c * 1.7;
  for (const [x0, x1, fill] of [
    [0, f, ink(1, 1, 0.3)],
    [w - f, w, ink(0, 0, 0.24)],
  ] as [number, number, string][]) {
    g.fillStyle = fill;
    g.fillRect(x0, 0, x1 - x0, h);
  }
  // a fine light edge along the far side
  g.fillStyle = ink(1, 0.5, 0.55);
  g.fillRect(0, 0, w, Math.max(1, rim * st * 0.6));
  g.restore();
  noteMark(g, mark, w / 2, h / 2, Math.min(w * 0.055, h * 0.085), mark === 'scratch' ? tone(0.35) : tone(0.42), false);
}

/**
 * ROUND: a coin lying on the track, as wide as any note and as deep as keeps it round (see
 * noteDepthOf): a bright rim inside a dark one, a raised edge round a sunk field, a glint on the
 * edge at its far left, and its lane's mark in the middle. Nothing crosses it.
 */
function roundNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const st = NOTE_STRETCH;
  const [cx, cy, rx, ry] = [w / 2, h / 2, w / 2, h / 2];
  const t = Math.max(1.2, Math.min(w * 0.022, h * 0.03));
  const ellipse = (inset: number) => {
    g.beginPath();
    g.ellipse(cx, cy, Math.max(0.1, rx - inset), Math.max(0.1, ry - inset * st), 0, 0, Math.PI * 2);
  };
  const edge = t * 2.2;
  const field = edge + Math.min(rx, ry / st) * 0.2;
  for (const [inset, fill] of [
    [0, tone(0.3)],
    [t, tone(1.38)],
    [edge, tone(1.02)],
    [field, tone(0.8)],
  ] as [number, string][]) {
    ellipse(inset);
    g.fillStyle = fill;
    g.fill();
  }
  g.save();
  ellipse(edge);
  g.clip();
  g.beginPath();
  g.ellipse(cx - rx * 0.4, cy - ry * 0.5, rx * 0.3, ry * 0.15, -0.3, 0, Math.PI * 2);
  g.fillStyle = ink(1, 0.75, 0.6);
  g.fill();
  g.restore();
  noteMark(g, mark, cx, cy, Math.min(w * 0.055, h * 0.085), tone(0.36), true);
}

/**
 * A star of `points` tips (px of the note's picture about its middle; the note is as deep as keeps it a star on the screen), each tip
 * split along its axis into a lit and a shaded facet, with a dark outline. `tip(i)` and `waist(i)`
 * give the i-th tip and the inner corner after it.
 */
function facetedStar(g: CanvasRenderingContext2D, tips: [number, number][], waists: [number, number][], outline: number): void {
  const n = tips.length;
  polygon(g, tips.flatMap((p, i) => [p, waists[i]]));
  g.lineWidth = outline * 2;
  g.lineJoin = 'miter';
  g.miterLimit = 6;
  g.strokeStyle = tone(0.3);
  g.stroke();
  for (let i = 0; i < n; i++) {
    const tip = tips[i];
    for (const side of [waists[(i + n - 1) % n], waists[i]]) {
      // the facet faces away from the tip's axis toward its inner corner
      const len = Math.hypot(tip[0], tip[1]) || 1;
      const [ax, ay] = [tip[0] / len, tip[1] / len];
      const along = side[0] * ax + side[1] * ay;
      const lit = litBy(side[0] - ax * along, side[1] - ay * along);
      g.fillStyle = tone(0.9 + 0.32 * lit);
      polygon(g, [tip, side, [0, 0]]);
      g.fill();
      // the seam between the facets would show as a hairline gap: cover it
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 0.6;
      g.stroke();
    }
  }
}

/** Points round the middle at `angles` (radians from the right, up is negative), `reach(i)` far. */
function around(angles: number[], reach: (i: number) => [number, number]): [number, number][] {
  return angles.map((a, i) => {
    const [rx, ry] = reach(i);
    return [Math.cos(a) * rx, Math.sin(a) * ry];
  });
}

/**
 * STAR4: a compass star stretched along the judge line: its side points reach almost to the lane's
 * edges, so its widest line is its time; a near-white heart. A blue key's has short points between
 * them and a gold key's longer ones (eight points), so the key reads without its colour.
 */
function star4Note(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  g.save();
  g.translate(w / 2, h / 2);
  const X = w * 0.49;
  const Y = h * 0.49;
  const minor = mark === 'blue' ? 0.5 : mark === 'gold' ? 0.8 : 0;
  const outline = Math.max(0.8, Math.min(w * 0.012, Y * 0.04));
  if (minor > 0) {
    // the points between: a star of their own under the main one
    const [dx, dy] = [X * 0.62 * minor, Y * 0.98 * minor];
    const tips = around([0.25, 0.75, 1.25, 1.75].map((q) => q * Math.PI), () => [dx * 1.41, dy * 1.41]);
    const waists = around([0.5, 1, 1.5, 2].map((q) => q * Math.PI), () => [dx * 0.3, dy * 0.3]);
    facetedStar(g, tips, waists, outline);
  }
  const tips: [number, number][] = [
    [X, 0],
    [0, Y],
    [-X, 0],
    [0, -Y],
  ];
  const waists = around([0.25, 0.75, 1.25, 1.75].map((q) => q * Math.PI), () => [X * 0.2, Y * 0.44]);
  facetedStar(g, tips, waists, outline);
  // the heart
  const [kx, ky] = [X * 0.1, Y * 0.2];
  polygon(g, [
    [0, -ky],
    [kx, 0],
    [0, ky],
    [-kx, 0],
  ]);
  g.fillStyle = ink(1, 0.8);
  g.fill();
  g.restore();
}

/**
 * STAR5: a five-pointed star as wide as any note, its side points at the note's edges, its top
 * point at the far edge, its middle on the note's. A blue key's star holds a pentagon, a gold key's a dot.
 */
function star5Note(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  g.save();
  g.translate(w / 2, h / 2);
  // the side points lie 18° above the middle: they reach the edges; the top one the far edge
  const Rx = (w * 0.49) / Math.cos(Math.PI / 10);
  const Ry = h * 0.49;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const at = (a: number, k: number): [number, number] => [Math.cos(a) * Rx * k, Math.sin(a) * Ry * k];
  const tips = Array.from({ length: 5 }, (_, i) => at(angle(i), 1));
  const waists = Array.from({ length: 5 }, (_, i) => at(angle(i) + Math.PI / 5, 0.44));
  facetedStar(g, tips, waists, Math.max(0.8, Math.min(Rx, Ry) * 0.035));
  if (mark === 'blue') {
    polygon(
      g,
      Array.from({ length: 5 }, (_, i) => at(angle(i), 0.24)),
    );
    g.lineWidth = Math.min(Rx, Ry) * 0.06;
    g.strokeStyle = tone(0.36);
    g.stroke();
  } else if (mark === 'gold') {
    g.beginPath();
    g.ellipse(0, 0, Rx * 0.1, Ry * 0.1, 0, 0, Math.PI * 2);
    g.fillStyle = tone(0.34);
    g.fill();
  }
  g.restore();
}

export const NOTE_PAINT: Record<NoteStyle, NotePaint> = {
  flat: (g, w, h) => {
    const u = unit(h);
    g.fillStyle = tone(1);
    roundRect(g, 0, 0, w, h, u(5));
    g.fill();
    // light along the far edge
    g.save();
    g.clip();
    g.fillStyle = ink(1, 0.4);
    g.fillRect(0, 0, w, u(4));
    g.restore();
  },
  stem: (g, w, h) => {
    const u = unit(h);
    g.fillStyle = tone(1);
    roundRect(g, 0, 0, w, h, u(5));
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = ink(1, 0.35);
    g.fillRect(0, 0, w, u(4));
    g.fillStyle = tone(0.55);
    g.fillRect(0, h - u(9), w, u(9));
    g.restore();
  },
  chamfer: chamferNote,
  round: roundNote,
  star4: star4Note,
  star5: star5Note,
};

// ---------- long notes: a body repeated along the note, and its two ends ----------

export type LongStyle = 'solid' | 'stem' | 'rail' | 'capsule' | 'ray';
export const LONG_STYLES: LongStyle[] = ['solid', 'stem', 'rail', 'capsule', 'ray'];

/** The long note of each note style's family. */
export const LONG_OF: Record<NoteStyle, LongStyle> = { flat: 'solid', stem: 'stem', chamfer: 'rail', round: 'capsule', star4: 'ray', star5: 'ray' };

/**
 * A long note is its body alone (a head or tail drawn like a tap note reads as one more note):
 * `body` is one tile of it across the lane (canvas top = farther), repeated along the note;
 * `end` closes it at the head and the tail (canvas top = the outer edge). Sizes are px of a body
 * 54 px wide, as in the mockups.
 */
export interface LongPaint {
  body: Paint;
  end: Paint;
  /** Tile length per body width (the texture repeats every `tile` widths along the note). */
  tile: number;
  /** Depth of each end, per body width. */
  endDepth: number;
  /** Share of the lane the body covers. */
  width: number;
}

const across = (w: number) => (n: number) => (n * w) / 54;

/** Side borders `t` px (of a 54 px body) in `fill`, on a body already painted. */
function sides(g: CanvasRenderingContext2D, w: number, h: number, t: number, fill: string): void {
  const a = across(w);
  g.fillStyle = fill;
  g.fillRect(0, 0, a(t), h);
  g.fillRect(w - a(t), 0, a(t), h);
}

/** An end: the body's own fill with a border `t` px along its outer edge and down its sides. */
function squareEnd(fill: string, border: string, t: number, side = t): Paint {
  return (g, w, h) => {
    const a = across(w);
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    g.fillStyle = border;
    g.fillRect(0, 0, w, a(t));
    g.fillRect(0, 0, a(side), h);
    g.fillRect(w - a(side), 0, a(side), h);
  };
}

/** Bands down a body, [from, to, fill] in px of a 54 px body. */
function stripes(g: CanvasRenderingContext2D, w: number, h: number, bands: [number, number, string][]): void {
  const a = across(w);
  for (const [from, to, fill] of bands) {
    g.fillStyle = fill;
    g.fillRect(a(from), 0, a(to - from), h);
  }
}

/** RAIL (CHAMFER's): an octagonal rail: lit bevels down both edges, a darker face, a bright groove in its middle. */
const RAIL: [number, number, string][] = [
  [0, 54, tone(0.3)],
  [2.5, 10, tone(1.3)],
  [10, 44, tone(0.64)],
  [44, 51.5, tone(0.98)],
  [24, 30, tone(0.4)],
  [25.5, 28.5, ink(1, 0.62)],
];

/** CAPSULE (ROUND's): a rod shaded as a cylinder in flat steps, a bright rim inside a dark one, a bright line down its middle. */
const CAPSULE: [number, number, string][] = [
  [0, 54, tone(0.3)],
  [2.5, 51.5, tone(1.38)],
  [5, 49, tone(0.64)],
  [12, 42, tone(0.86)],
  [19, 35, tone(1.08)],
  [25.5, 28.5, ink(1, 0.62)],
];

/** RAY (the stars'): one long star point, split down its middle into a lit and a shaded facet. */
const RAY: [number, number, string][] = [
  [0, 54, tone(0.3)],
  [2.5, 27, tone(1.12)],
  [27, 51.5, tone(0.72)],
];

export const LONG_PAINT: Record<LongStyle, LongPaint> = {
  solid: {
    body: (g, w, h) => {
      g.fillStyle = tone(1, 0.88);
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, ink(1, 0.97));
    },
    end: squareEnd(tone(1, 0.88), ink(1, 0.97), 4),
    tile: 1,
    endDepth: 0.12,
    width: 0.8,
  },
  stem: {
    body: (g, w, h) => {
      g.fillStyle = tone(1, 0.86);
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, ink(1, 1, 0.8));
    },
    end: squareEnd(tone(1, 0.86), ink(1, 1, 0.8), 4),
    tile: 1,
    endDepth: 0.12,
    width: 0.8,
  },
  rail: {
    body: (g, w, h) => stripes(g, w, h, RAIL),
    // the rail's own end: its corners cut as the plate's are, a bright rim along it
    end: (g, w, h) => {
      const a = across(w);
      const c = a(9);
      // the plate's outline (see chamferOutline) at its outer end only, its sides running on past the picture
      const outline = (t: number): [number, number][] => {
        const cut = c + t * Math.tan(Math.PI / 8);
        const st = NOTE_STRETCH;
        return [
          [cut, t * st],
          [w - cut, t * st],
          [w - t, cut * st],
          [w - t, h + 1],
          [t, h + 1],
          [t, cut * st],
        ];
      };
      polygon(g, outline(0));
      g.fillStyle = tone(0.3);
      g.fill();
      polygon(g, outline(a(2.5)));
      g.fillStyle = tone(1.45);
      g.fill();
      g.save();
      polygon(g, outline(a(5)));
      g.clip();
      stripes(g, w, h, RAIL);
      g.restore();
    },
    tile: 1,
    endDepth: (9 * NOTE_STRETCH + 6) / 54,
    width: 0.9,
  },
  capsule: {
    body: (g, w, h) => stripes(g, w, h, CAPSULE),
    // half a coin: the rod's width round at its end (round on the screen), its rim round it
    end: (g, w, h) => {
      const half = (t: number) => {
        g.beginPath();
        g.ellipse(w / 2, h, Math.max(0.1, w / 2 - t), Math.max(0.1, h - t * NOTE_STRETCH), 0, Math.PI, Math.PI * 2);
        g.closePath();
      };
      const a = across(w);
      half(0);
      g.fillStyle = tone(0.3);
      g.fill();
      half(a(2.5));
      g.fillStyle = tone(1.38);
      g.fill();
      g.save();
      half(a(5));
      g.clip();
      stripes(g, w, h, CAPSULE);
      g.restore();
    },
    tile: 1,
    endDepth: 0.5 * NOTE_STRETCH * 0.8,
    width: 0.9,
  },
  ray: {
    // sparkles down its middle, one every tile
    body: (g, w, h) => {
      stripes(g, w, h, RAY);
      const a = across(w);
      g.save();
      g.translate(w / 2, h / 2);
      g.scale(1, NOTE_STRETCH);
      const r = a(13);
      polygon(g, [
        [0, -r],
        [r * 0.22, -r * 0.22],
        [r, 0],
        [r * 0.22, r * 0.22],
        [0, r],
        [-r * 0.22, r * 0.22],
        [-r, 0],
        [-r * 0.22, -r * 0.22],
      ]);
      g.fillStyle = ink(1, 0.85);
      g.fill();
      g.restore();
    },
    // its end narrows to one point, as a star's point does
    end: (g, w, h) => {
      const a = across(w);
      polygon(g, [
        [w / 2, 0],
        [w, h],
        [0, h],
      ]);
      g.fillStyle = tone(0.3);
      g.fill();
      const inner: [number, number][] = [
        [w / 2, a(2.5) * NOTE_STRETCH * 2.2],
        [w - a(2.5), h],
        [a(2.5), h],
      ];
      g.save();
      polygon(g, inner);
      g.clip();
      stripes(g, w, h, RAY);
      g.restore();
    },
    tile: 3,
    endDepth: 0.5 * NOTE_STRETCH,
    width: 0.9,
  },
};

// ---------- side notes laid over half the keys (반쪽 덮기) ----------

/** The parts of a side note laid over the keys, and the flash of its hits and holds. */
export type SidePart = 'tap' | 'body' | 'end' | 'flash';

/** Where the judge line crosses the side flash's picture, from its far edge (share of its depth): its light rises up the track. */
export const SIDE_FLASH_LINE = 0.8;

/**
 * A side tap laid over half the keys, alike in every skin (in its side lane's colour): half
 * see-through, so the key notes drawn over it and the lanes under it show, between bright bands
 * `edge` of its depth deep along its far and near edges (what shows of it past a key note at its
 * time), its ends bright too. Painted for the bar's proportions; canvas top = the far edge.
 */
export function sideTap(edge: number): Paint {
  return (g, w, h) => {
    const band = Math.max(2, Math.round(h * edge));
    const side = Math.max(2, Math.round(w * 0.008));
    g.save();
    roundRect(g, 0, 0, w, h, h * 0.15);
    g.clip();
    g.fillStyle = ink(1, 0, 0.55);
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink(1, 0.3);
    g.fillRect(0, 0, w, band);
    g.fillRect(0, h - band, w, band);
    g.fillStyle = ink(1, 0.2, 0.9);
    g.fillRect(0, 0, side, h);
    g.fillRect(w - side, 0, side, h);
    g.restore();
  };
}

/**
 * The rest of the side notes laid over half the keys (see sideTap): a long note's body and ends,
 * and the flash of a hit. Painted for their proportions; canvas top = the far edge (an end's: its
 * outer edge).
 */
export const SIDE_PICTURES: Record<Exclude<SidePart, 'tap'>, Paint> = {
  // fainter than a tap, bright down its sides
  body: (g, w, h) => {
    const side = Math.max(2, Math.round(w * 0.008));
    g.fillStyle = ink(1, 0, 0.26);
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink(1, 0.2, 0.9);
    g.fillRect(0, 0, side, h);
    g.fillRect(w - side, 0, side, h);
  },
  // a bright band where it starts and where it ends
  end: (g, w, h) => {
    g.fillStyle = ink(1, 0.3);
    g.fillRect(0, 0, w, h);
  },
  // light across the half: a bright bar on the judge line (SIDE_FLASH_LINE down), whitest in its
  // middle, and light rising from it a short way up the track, fading out as it rises (under the
  // line, over the gear, only the bar's own edge); the half's ends fade
  flash: (g, w, h) => {
    const image = g.createImageData(w, h);
    const fade = w * 0.04;
    for (let y = 0; y < h; y++) {
      // from the line, in shares of the depth (up the track is negative)
      const d = (y + 0.5) / h - SIDE_FLASH_LINE;
      const bar = Math.exp(-d * d * 120);
      const rise = d < 0 ? 0.55 * Math.exp(d * 4) : 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = Math.round(255 * 0.7 * bar);
        image.data[i + 3] = Math.round(255 * Math.min(1, bar + rise) * Math.min(1, (x + 0.5) / fade, (w - x - 0.5) / fade));
      }
    }
    g.putImageData(image, 0, 0);
  },
};

// ---------- side notes as an LED panel's dots ----------

/**
 * How the side lanes' notes are drawn: 'bar' as the note style draws them (over the keys: the
 * see-through bars above), 'dots' as an LED panel's dots in rows, the row on its time brightest.
 */
export type SideStyle = 'bar' | 'dots';
export const SIDE_STYLES: SideStyle[] = ['bar', 'dots'];

/** Dots across a side lane (and across each key lane under a side bar laid over the keys). */
export const DOTS_ACROSS = 5;

/**
 * A row of `cols` dots across a picture `w` wide at `y`, round on the screen (NOTE_STRETCH times
 * longer along), `size` of the pitch across, no deeper than `room` (px along).
 */
function dotRow(g: CanvasRenderingContext2D, w: number, cols: number, y: number, fill: string, size = 0.32, room = Infinity): void {
  const p = w / cols;
  const r = Math.min(p * size, room / 2 / NOTE_STRETCH);
  g.fillStyle = fill;
  g.beginPath();
  for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * p;
    g.moveTo(x + r, y);
    g.ellipse(x, y, r, r * NOTE_STRETCH, 0, 0, Math.PI * 2);
  }
  g.fill();
}

/** A side lane's tap as dots: three rows on a faint dark plate, the middle one (its time) bright. */
export const dotsNote: Paint = (g, w, h) => {
  const pitch = Math.min((w / DOTS_ACROSS) * NOTE_STRETCH, h * 0.34);
  g.fillStyle = ink(0, 0, 0.5);
  roundRect(g, 0, 0, w, h, h * 0.12);
  g.fill();
  for (const k of [-1, 0, 1]) dotRow(g, w, DOTS_ACROSS, h / 2 + k * pitch, k === 0 ? ink(1, 0.6) : tone(0.95), 0.32, pitch * 0.9);
};

/** A side lane's long note as dots: rows on a faint dark plate, every fourth brighter, a bright row closing each end. */
export const DOTS_LONG: LongPaint = {
  body: (g, w, h) => {
    g.fillStyle = ink(0, 0, 0.5);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) dotRow(g, w, DOTS_ACROSS, ((i + 0.5) * h) / 4, i === 0 ? tone(1.15) : tone(0.78));
  },
  end: (g, w, h) => {
    g.fillStyle = ink(0, 0, 0.5);
    g.fillRect(0, 0, w, h);
    dotRow(g, w, DOTS_ACROSS, h / 2, ink(1, 0.6), 0.32, h * 0.9);
  },
  tile: (4 * NOTE_STRETCH) / DOTS_ACROSS,
  endDepth: NOTE_STRETCH / DOTS_ACROSS,
  width: 0.9,
};

/**
 * A side tap laid over the keys as dots (see sideTap), `cols` across: a bright row in the band
 * along each edge (what shows past a key note at its time), fainter rows between.
 */
export function sideDotsTap(edge: number, cols: number): Paint {
  return (g, w, h) => {
    const band = Math.max(2, Math.round(h * edge));
    const pitch = (w / cols) * NOTE_STRETCH;
    g.fillStyle = ink(0, 0, 0.3);
    roundRect(g, 0, 0, w, h, h * 0.15);
    g.fill();
    for (const y of [band / 2, h - band / 2]) dotRow(g, w, cols, y, ink(1, 0.45), 0.3, band);
    const inner = h - band;
    const n = Math.max(0, Math.round(inner / pitch) - 1);
    for (let i = 1; i <= n; i++) dotRow(g, w, cols, band / 2 + (inner * i) / (n + 1), ink(1, 0, 0.6), 0.3, inner / (n + 1));
  };
}

/** A side long note's body over the keys as dots: faint rows, as many as fit the picture evenly (it repeats). */
export function sideDotsBody(cols: number): Paint {
  return (g, w, h) => {
    const rows = Math.max(1, Math.round(h / ((w / cols) * NOTE_STRETCH)));
    for (let i = 0; i < rows; i++) dotRow(g, w, cols, ((i + 0.5) * h) / rows, ink(1, 0, 0.42), 0.3, h / rows);
  };
}

/** Its head and end over the keys as dots: one bright row. */
export function sideDotsEnd(cols: number): Paint {
  return (g, w, h) => dotRow(g, w, cols, h / 2, ink(1, 0.45), 0.3, h);
}

// ---------- hit effects: flipbooks drawn here, lying flat on the track at the judge line ----------

export type HitStyle = 'flash' | 'stemflash' | 'star' | 'bomb' | 'flare' | 'hex' | 'shards' | 'bubbles' | 'wave' | 'spark' | 'grid' | 'shutter';
export const HIT_STYLES: HitStyle[] = ['flash', 'stemflash', 'star', 'bomb', 'flare', 'hex', 'shards', 'bubbles', 'wave', 'spark', 'grid', 'shutter'];

export interface EffectSheet {
  texture: THREE.CanvasTexture;
  cols: number;
  rows: number;
  frames: number;
  /** Size of one frame in lane widths (across, along the track). */
  size: [number, number];
  /** Where the judge line crosses a frame, from its far edge (share of its depth). */
  centre: number;
  /** How wide the effect gets while it is still bright (halfway through), in lane widths. */
  reach: number;
}

/**
 * One frame cell's size in px (a lane is 64 px wide in it), its centre, and how wide the effect
 * drawn in it gets halfway through (in px, see drawEffect), per style.
 */
const CELLS: Record<HitStyle, { w: number; h: number; cy: number; reach: number }> = {
  flash: { w: 128, h: 192, cy: 104, reach: 84 },
  stemflash: { w: 128, h: 192, cy: 104, reach: 84 },
  star: { w: 192, h: 128, cy: 64, reach: 104 },
  bomb: { w: 160, h: 160, cy: 80, reach: 83 },
  flare: { w: 384, h: 128, cy: 64, reach: 216 },
  hex: { w: 160, h: 112, cy: 56, reach: 96 },
  shards: { w: 160, h: 112, cy: 56, reach: 74 },
  bubbles: { w: 160, h: 160, cy: 80, reach: 75 },
  // these four play out under the line only, toward the gear: the next notes above it stay clear
  wave: { w: 160, h: 96, cy: 10, reach: 52 },
  spark: { w: 176, h: 136, cy: 12, reach: 52 },
  grid: { w: 96, h: 64, cy: 6, reach: 32 },
  shutter: { w: 128, h: 112, cy: 10, reach: 42 },
};

/** Styles whose rings, rays or frames would rise above the judge line across the next lanes. */
const FADES_ABOVE: readonly HitStyle[] = ['star', 'bomb', 'hex'];
/** Above the judge line they keep to about a lane: px from the hit where they are gone (a lane at HIT_SIZE is 36 px). */
const ABOVE_REACH = 28;

export const EFFECT_FRAMES = 16;

/**
 * The effect `style` as a 4×4 flipbook: frame f shows it at progress f/16 (the mockups' SVG
 * drawn on a canvas; the lane colour is the material's, white is lifted toward white).
 */
export function effectSheet(style: HitStyle): EffectSheet {
  const cell = CELLS[style];
  const cols = 4;
  const rows = 4;
  const texture = paintTexture(cell.w * cols, cell.h * rows, (g) => {
    for (let f = 0; f < EFFECT_FRAMES; f++) {
      g.save();
      g.translate((f % cols) * cell.w + cell.w / 2, Math.floor(f / cols) * cell.h + cell.cy);
      g.beginPath();
      g.rect(-cell.w / 2, -cell.cy, cell.w, cell.h);
      g.clip();
      drawEffect(g, style, f / EFFECT_FRAMES);
      if (FADES_ABOVE.includes(style)) fadeAbove(g, cell, f / EFFECT_FRAMES);
      g.restore();
    }
  });
  return { texture, cols, rows, frames: EFFECT_FRAMES, size: [cell.w / 64, cell.h / 64], centre: cell.cy / cell.h, reach: cell.reach / 64 };
}

/**
 * Above the judge line (up the cell from its centre) the part a player reads the next notes in:
 * there an effect keeps to about a lane around the hit and fades out sooner than below the line.
 */
function fadeAbove(g: CanvasRenderingContext2D, cell: { w: number; cy: number }, p: number): void {
  g.save();
  g.beginPath();
  g.rect(-cell.w / 2, -cell.cy, cell.w, cell.cy);
  g.clip();
  g.globalCompositeOperation = 'destination-in';
  // what stays: all of it near the hit at first, less and less of it as the effect goes on
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, ABOVE_REACH);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(Math.max(0.05, 0.6 * (1 - p)), 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(-cell.w / 2, -cell.cy, cell.w, cell.cy);
  g.restore();
}

/** Offset of `frame` in a cols×rows sheet (texture v runs up; frame 0 is the top-left cell). */
export function sheetOffset(sheet: Pick<EffectSheet, 'cols' | 'rows'>, frame: number): [number, number] {
  const f = Math.floor(frame);
  return [(f % sheet.cols) / sheet.cols, 1 - (Math.floor(f / sheet.cols) + 1) / sheet.rows];
}

function drawEffect(g: CanvasRenderingContext2D, style: HitStyle, p: number): void {
  const s = 64 / 60;
  const a = Math.max(0, 1 - p);
  const colour = (alpha: number) => tone(1, alpha);
  const white = (alpha: number) => ink(1, 1, alpha);
  const line = (x1: number, y1: number, x2: number, y2: number, fill: string, width: number) => {
    g.strokeStyle = fill;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  switch (style) {
    case 'flash':
    case 'stemflash': {
      // a bright bar on the judge line, a line opening toward the gear, a short column of light
      // (no line opening up the track: there it read as a note or a bar line)
      const fill = style === 'stemflash' ? colour : white;
      const fw = 66 * s;
      const fh = (16 - 10 * p) * s;
      const grad = g.createLinearGradient(0, 0, 0, -70 * s);
      grad.addColorStop(0, fill(0.45 * a));
      grad.addColorStop(1, fill(0));
      g.fillStyle = grad;
      g.fillRect(-fw / 2, -70 * s, fw, 70 * s);
      g.fillStyle = fill(a);
      roundRect(g, -fw / 2, -fh / 2, fw, fh, 2 * s);
      g.fill();
      const lw = fw * (1.05 + 0.3 * p);
      const d = (8 + 26 * p) * s;
      line(-lw / 2, d, lw / 2, d, fill(0.8 * a), 3 * s);
      break;
    }
    case 'star': {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const r1 = (10 + 26 * p) * s;
        const r2 = (22 + 52 * p) * s;
        line(Math.cos(ang) * r1, Math.sin(ang) * r1 * 0.6, Math.cos(ang) * r2, Math.sin(ang) * r2 * 0.6, k % 2 ? colour(a) : white(a), 4 * s);
      }
      g.fillStyle = white(a);
      g.beginPath();
      g.ellipse(0, 0, Math.max(0.1, (30 - 18 * p) * s), Math.max(0.1, (12 - 6 * p) * s), 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'bomb': {
      const sz = (18 + 54 * p) * s;
      g.strokeStyle = colour(a);
      g.lineWidth = 4 * s;
      g.strokeRect(-sz / 2, -sz / 2, sz, sz);
      const sz2 = (8 + 30 * p) * s;
      g.fillStyle = white(a * 0.9);
      g.fillRect(-sz2 / 2, -sz2 / 2, sz2, sz2);
      g.fillStyle = colour(a);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const d = (16 + 40 * p) * s;
        const q = 6 * s;
        g.fillRect(dx * d - q / 2, dy * d - q / 2, q, q);
      }
      break;
    }
    case 'flare': {
      // a streak across the lane with a four-point star in the middle
      const hw = (46 + 110 * p) * s;
      line(-hw, 0, hw, 0, colour(a * 0.85), (12 - 8 * p) * s + 1);
      line(-hw * 0.75, 0, hw * 0.75, 0, white(a), (5 - 3 * p) * s + 1);
      const r = (24 + 26 * p) * s;
      const k = (6 - 3 * p) * s;
      g.fillStyle = white(a);
      polygon(g, [[0, -r], [k, 0], [0, r], [-k, 0]]);
      g.fill();
      polygon(g, [[-r * 0.7, 0], [0, -k], [r * 0.7, 0], [0, k]]);
      g.fill();
      break;
    }
    case 'hex': {
      const hexagon = (r: number): [number, number][] =>
        Array.from({ length: 6 }, (_, k) => {
          const ang = (k / 6) * Math.PI * 2 + Math.PI / 6;
          return [Math.cos(ang) * r, Math.sin(ang) * r * 0.62];
        });
      g.lineWidth = 4 * s;
      g.strokeStyle = colour(a);
      polygon(g, hexagon((20 + 46 * p) * s));
      g.stroke();
      g.lineWidth = 3 * s;
      g.strokeStyle = white(a);
      polygon(g, hexagon((10 + 24 * p) * s));
      g.stroke();
      g.fillStyle = white(a);
      g.beginPath();
      g.ellipse(0, 0, Math.max(0.1, (22 - 14 * p) * s), Math.max(0.1, (8 - 5 * p) * s), 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'shards': {
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        const d = (8 + 46 * p) * s;
        const q = (8 - 3 * p) * s;
        g.save();
        g.translate(Math.cos(ang) * d, Math.sin(ang) * d * 0.6);
        g.rotate(Math.PI / 4);
        g.fillStyle = k % 2 ? colour(a) : white(a);
        g.fillRect(-q / 2, -q / 2, q, q);
        g.restore();
      }
      g.strokeStyle = white(a * 0.8);
      g.lineWidth = 2 * s;
      g.beginPath();
      g.ellipse(0, 0, (16 + 30 * p) * s, (8 + 14 * p) * s, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'wave': {
      // rings spreading from the hit under the line, toward the gear, their far edges on the line
      for (let k = 0; k < 3; k++) {
        const q = p - k * 0.12;
        if (q < 0) continue;
        const rx = (12 + 70 * q) * s;
        const ry = rx * 0.42;
        const alpha = Math.max(0, 1 - q * 1.25) * (k === 0 ? 1 : 0.75);
        g.lineWidth = (k === 0 ? 4 : 2.6) * s * (1 - q * 0.5);
        g.strokeStyle = k === 0 ? white(alpha) : colour(alpha);
        g.beginPath();
        g.ellipse(0, ry + 2 * s, rx, ry, 0, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case 'spark': {
      // a flash on the line, and sparks thrown down from it toward the gear in a fan
      const flash = Math.max(0, 1 - p * 3);
      if (flash > 0) {
        g.fillStyle = white(flash);
        roundRect(g, -30 * s, -3 * s, 60 * s, 7 * s, 3 * s);
        g.fill();
      }
      for (let k = 0; k < 14; k++) {
        // the same fan every frame: each spark's angle and speed fixed by its number
        const ang = (((k * 0.618) % 1) - 0.5) * 1.8;
        const speed = 0.55 + 0.45 * ((k * 0.382 + 0.17) % 1);
        const head = (4 + 100 * p * speed) * s;
        const tail = Math.max(0, head - (16 + 30 * (1 - p)) * s * speed);
        line(Math.sin(ang) * tail, Math.cos(ang) * tail, Math.sin(ang) * head, Math.cos(ang) * head, k % 3 === 0 ? white(a) : colour(a), (3 - 1.6 * p) * s);
      }
      break;
    }
    case 'grid': {
      // an LED grid in the lane under the line: all lit white at the hit, its rows going out from the line down
      const [cols, rows] = [4, 3];
      const [cell, gap] = [11.5 * s, 3 * s];
      const width = cols * cell + (cols - 1) * gap;
      for (let r = 0; r < rows; r++) {
        const out = 0.3 + r * 0.2;
        const lit = p < out ? 1 : Math.max(0, 1 - (p - out) * 5);
        if (lit <= 0) continue;
        for (let c = 0; c < cols; c++) {
          const [x, y] = [-width / 2 + c * (cell + gap), 3 * s + r * (cell + gap)];
          g.fillStyle = p < 0.12 ? white(lit) : colour(lit);
          roundRect(g, x, y, cell, cell, 2 * s);
          g.fill();
          g.fillStyle = white(lit * 0.6);
          roundRect(g, x + cell * 0.3, y + cell * 0.3, cell * 0.4, cell * 0.4, s);
          g.fill();
        }
      }
      break;
    }
    case 'shutter': {
      // slats slide in from the lane's sides under the line, meet in a white flash, then drop away
      const close = Math.min(1, p / 0.2);
      const drop = Math.max(0, p - 0.25) * 60 * s;
      const fade = p < 0.25 ? 1 : Math.max(0, 1 - (p - 0.25) / 0.6);
      const half = 32 * s;
      for (let k = 0; k < 3; k++) {
        const y = 3 * s + k * 8 * s + drop * (0.6 + 0.2 * k);
        const reach = half * close;
        g.fillStyle = k === 1 ? white(fade) : colour(fade);
        roundRect(g, -half - 6 * s, y, reach + 5 * s, 5 * s, 1.5 * s);
        g.fill();
        roundRect(g, half - reach + s, y, reach + 5 * s, 5 * s, 1.5 * s);
        g.fill();
      }
      if (p > 0.12 && p < 0.45) {
        const f = Math.max(0, 1 - Math.abs(p - 0.22) / 0.23);
        const r = (8 + 22 * f) * s;
        g.fillStyle = white(f);
        polygon(
          g,
          Array.from({ length: 16 }, (_, i) => {
            const ang = (i / 16) * Math.PI * 2;
            const rr = i % 2 ? r * 0.4 : r;
            return [Math.cos(ang) * rr, 14 * s + Math.sin(ang) * rr * 0.45] as [number, number];
          }),
        );
        g.fill();
      }
      break;
    }
    case 'bubbles': {
      for (const [dx, dy, r] of [[-14, -8, 9], [10, -14, 7], [16, 6, 6], [-6, 10, 5], [0, -2, 11]]) {
        const k = 1 + 1.6 * p;
        g.beginPath();
        g.arc(dx * k * s, dy * k * s, r * (0.6 + p) * s, 0, Math.PI * 2);
        g.fillStyle = colour(0.35 * a);
        g.fill();
        g.strokeStyle = white(a);
        g.lineWidth = 2.5 * s;
        g.stroke();
      }
      break;
    }
  }
}

// ---------- the gear around the lanes ----------

/** Key beam with bright edges (NEON): fades out up the lane (canvas top = the far end). */
export function neonBeamTexture(): THREE.CanvasTexture {
  return paintTexture(64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, tone(1, 0.34));
    grad.addColorStop(1, tone(1, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const edge = g.createLinearGradient(0, h, 0, 0);
    edge.addColorStop(0, tone(1, 0.7));
    edge.addColorStop(1, tone(1, 0));
    g.fillStyle = edge;
    g.fillRect(0, 0, 3, h);
    g.fillRect(w - 3, 0, 3, h);
  });
}

/** erf to 1.5e-7 (Abramowitz & Stegun 7.1.26). */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
}

/**
 * How strong CSS `box-shadow: 0 0 <blur>px` is `d` px from the middle of a bar `size` px thick
 * (0 … 1, across the bar): the bar blurred by a gaussian of σ = blur / 2.
 */
export function shadowAt(d: number, size: number, blur: number): number {
  const s = (blur / 2) * Math.SQRT2;
  return 0.5 * (erf((d + size / 2) / s) - erf((d - size / 2) / s));
}

/** How far a box-shadow of `blur` px reaches out of its bar, in px. */
export const shadowReach = (blur: number) => blur * 1.5;

/** A rail's glow across it (canvas x spans the rail and its reach both sides): its box-shadow at `alpha`. */
export function railGlowTexture(size: number, blur: number, alpha: number): THREE.CanvasTexture {
  const across = size + 2 * shadowReach(blur);
  return paintTexture(128, 4, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      g.fillStyle = ink(1, 0, alpha * shadowAt(((x + 0.5) / w - 0.5) * across, size, blur));
      g.fillRect(x, 0, 1, h);
    }
  });
}

/** The judge line's glow, its box-shadow at `alpha` (the canvas spans the line and the reach around it, 1 px a px). */
export function judgeGlowTexture(width: number, height: number, blur: number, alpha: number, ends = true): THREE.CanvasTexture {
  const reach = shadowReach(blur);
  // without its ends the glow spreads above and below the line only, as wide as the line
  const w = Math.ceil(ends ? width + 2 * reach : width);
  const h = Math.ceil(height + 2 * reach);
  return paintTexture(w, h, (g) => {
    const image = g.createImageData(w, h);
    const down = Array.from({ length: h }, (_, y) => shadowAt(y + 0.5 - h / 2, height, blur));
    for (let x = 0; x < w; x++) {
      const across = ends ? alpha * shadowAt(x + 0.5 - w / 2, width, blur) : alpha;
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        image.data[i] = 255;
        image.data[i + 3] = Math.round(255 * across * down[y]);
      }
    }
    g.putImageData(image, 0, 0);
  });
}

/** A bevelled rail lit on its inner face (canvas left = the outer side). */
export function railBevelTexture(): THREE.CanvasTexture {
  return paintTexture(64, 4, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, tone(0.55));
    grad.addColorStop(0.35, ink(1, 0.45));
    grad.addColorStop(0.6, tone(1));
    grad.addColorStop(1, tone(0.7));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** STREET: faint white stripes across the lanes, slanted (one tile 22 px of the sheets square). */
export function stripesTexture(): THREE.CanvasTexture {
  return paintTexture(64, 64, (g, w, h) => {
    g.fillStyle = ink(1, 1, 0.035 * 2);
    // a -35° band 6 px wide every 22 px, drawn twice across the tile so it repeats seamlessly
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    const step = (22 / 22) * w;
    const band = (6 / 22) * w;
    const slope = Math.tan((35 * Math.PI) / 180);
    for (let x = -2 * w; x < 3 * w; x += step) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + band, h);
      g.lineTo(x + band + h / slope, 0);
      g.lineTo(x + h / slope, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
  });
}

/**
 * JEWEL: the floor in faint flat facets. A quilt of diamonds, each four triangles a shade apart
 * (lit from the upper left); one tile holds a whole period, 45 px of the sheets square.
 */
export function facetsTexture(): THREE.CanvasTexture {
  return paintTexture(128, 128, (g, w, h) => {
    const image = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + y + 1) / w;
        const v = (x - y) / w;
        const fu = u - Math.floor(u) - 0.5;
        const fv = v - Math.floor(v) - 0.5;
        const shade = Math.abs(fu) > Math.abs(fv) ? (fu < 0 ? 0.04 : -0.03) : fv < 0 ? 0.015 : -0.015;
        const i = (y * w + x) * 4;
        // light facets lift to white, dark ones are black (tint picture: red = colour, green = white)
        image.data[i] = image.data[i + 1] = shade > 0 ? 255 : 0;
        image.data[i + 3] = Math.round(Math.abs(shade) * 2.2 * 255);
      }
    }
    g.putImageData(image, 0, 0);
  });
}

/** A plain picture in real colours (walls, the arcade deck): `stops` across, or down with `down`. */
export function gradientTexture(stops: [number, string][], down = false, border?: { colour: string; width: number; side: 'all' | 'top' | 'inner' }): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = down ? 4 : 64;
  canvas.height = down ? 64 : 4;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = down ? g.createLinearGradient(0, 0, 0, canvas.height) : g.createLinearGradient(0, 0, canvas.width, 0);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (border) {
    g.fillStyle = border.colour;
    if (border.side === 'top') g.fillRect(0, 0, canvas.width, border.width);
    else if (border.side === 'inner') g.fillRect(canvas.width - border.width, 0, border.width, canvas.height);
    else {
      g.fillRect(0, 0, border.width, canvas.height);
      g.fillRect(canvas.width - border.width, 0, border.width, canvas.height);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
