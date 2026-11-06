import * as THREE from 'three';

/**
 * The parts' pictures drawn in code, in "tint" form: red is how much of the part's colour shows (0 dark
 * … 1 the colour itself), green how far it is then lifted toward white, alpha the shape. One
 * picture serves every lane colour; tintMaterial puts the colour in.
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
 * FLAT is a plain bar, and so are the materials (MATERIAL_NOTES): the same bar in another finish,
 * each with a long note of its own (LONG_OF). The others are families, each with its own long
 * note: CHAMFER a machined plate with cut corners, ROUND a coin, STAR4 a compass star stretched along
 * the judge line, STAR5 a five-pointed star; each as wide as its lane lets a note be.
 */
export type NoteStyle = 'flat' | 'chrome' | 'hairline' | 'glass' | 'enamel' | 'pearl' | 'carbon' | 'chamfer' | 'round' | 'star4' | 'star5';
/**
 * The bars in a finish of their own (the bar's shape, FLAT's): mirror chrome cut with bevels,
 * brushed hairline metal, clear glass, glossy enamel, satin pearl, woven carbon.
 */
export const MATERIAL_NOTES = ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon'] as const satisfies readonly NoteStyle[];
export const NOTE_STYLES: NoteStyle[] = ['flat', ...MATERIAL_NOTES, 'chamfer', 'round', 'star4', 'star5'];
/** Whether a note style is a bar (FLAT's shape: the materials' too), as deep in every lane. */
export const isBarNote = (style: NoteStyle): boolean => style === 'flat' || (MATERIAL_NOTES as readonly NoteStyle[]).includes(style);

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
export const NOTE_STRETCH = 1.7;

/**
 * How tall the coin and the stars look for their width at the judge line (the bars keep a fixed
 * depth): the coin round, the five-pointed star as drawn, the compass star wide.
 */
const NOTE_SHAPE: Partial<Record<NoteStyle, number>> = { round: 1, star4: 1, star5: 0.95 };

/**
 * How deep a note of `style` is along the track: a bar `base` deep; the coin and the stars as deep
 * as keeps their shape at the judge line for a note `width` wide, where the camera shows the track
 * `flatten` times shorter along than across (no shallower than a bar, nor over three times as deep:
 * the plane camera and very wide lanes flatten them a little). `shape`: a note drawn from art
 * looks this tall for its width (null: it lies in a bar's depth; see styleArt's noteShapeOf).
 */
export function noteDepthOf(style: NoteStyle, base: number, width: number, flatten: number, shape: number | null = NOTE_SHAPE[style] ?? null): number {
  return shape === null ? base : Math.min(base * 3, Math.max(base, width * shape * flatten));
}

/**
 * How deep a lane's notes are, for notes `share` as wide as a key lane's (`depth` deep): the
 * families keep their shape in a wider lane (the scratch) or a narrower one (a side lane), deeper
 * or shallower (no more than three bars deep); the plain bars stay as deep.
 */
export function laneDepthOf(style: NoteStyle, depth: number, share: number, base: number): number {
  return isBarNote(style) ? depth : Math.min(base * 3, depth * share);
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
export function noteMark(g: CanvasRenderingContext2D, mark: NoteMark, cx: number, cy: number, r: number, colour: string, filled: boolean): void {
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
  // thin between its points: its vertical points as long as the note is deep, its arms as thick as a bar
  const waists = around([0.25, 0.75, 1.25, 1.75].map((q) => q * Math.PI), () => [X * 0.2, Y * 0.27]);
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

// ---------- the bars in a finish of their own (MATERIAL_NOTES): FLAT's outline, another surface ----------

/** The same stream of numbers on every paint, so a note's grain never changes when it is painted again. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Keeps the bar's outline (FLAT's) as the clip for what is drawn next, until restore. */
function barClip(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.save();
  roundRect(g, 0, 0, w, h, unit(h)(5));
  g.clip();
}

/** A band slanting across a picture, from `x` (its far edge) `w` wide, leaning `lean` px over its depth `h`. */
function slant(g: CanvasRenderingContext2D, x: number, w: number, lean: number, h: number, fill: string): void {
  polygon(g, [
    [x, 0],
    [x + w, 0],
    [x + w - lean, h],
    [x - lean, h],
  ]);
  g.fillStyle = fill;
  g.fill();
}

/**
 * CHROME: mirror-polished metal in the lane's colour, cut with bevels all round as a bevelled mirror
 * is: its far and left bevels catching the light, the right one in half shade, the near one dark;
 * the flat mirror between them shows the room it faces, a bright horizon across it, a glint slanting
 * over it.
 */
function chromeNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  barClip(g, w, h);
  const [bx, by] = [Math.min(w * 0.08, u(11)), Math.min(h * 0.24, u(12))];
  const [ix0, iy0, ix1, iy1] = [bx, by, w - bx, h - by];
  const facet = (points: [number, number][], fill: string) => {
    polygon(g, points);
    g.fillStyle = fill;
    g.fill();
  };
  facet(
    [
      [0, 0],
      [w, 0],
      [ix1, iy0],
      [ix0, iy0],
    ],
    ink(1, 0.82),
  );
  facet(
    [
      [0, 0],
      [ix0, iy0],
      [ix0, iy1],
      [0, h],
    ],
    ink(1, 0.5),
  );
  facet(
    [
      [w, 0],
      [w, h],
      [ix1, iy1],
      [ix1, iy0],
    ],
    tone(0.5),
  );
  facet(
    [
      [0, h],
      [ix0, iy1],
      [ix1, iy1],
      [w, h],
    ],
    tone(0.38),
  );
  const mirror = g.createLinearGradient(0, iy0, 0, iy1);
  mirror.addColorStop(0, ink(1, 0.62));
  mirror.addColorStop(0.44, ink(1, 0.3));
  mirror.addColorStop(0.5, tone(0.62));
  mirror.addColorStop(1, ink(1, 0.2));
  g.fillStyle = mirror;
  g.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  g.fillStyle = ink(1, 0.92);
  g.fillRect(ix0, iy0 + (iy1 - iy0) * 0.45, ix1 - ix0, Math.max(1, u(1.4)));
  g.save();
  g.beginPath();
  g.rect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  g.clip();
  slant(g, ix0 + (ix1 - ix0) * 0.2, (ix1 - ix0) * 0.07, (iy1 - iy0) * 0.6, iy1, ink(1, 0.75, 0.35));
  g.restore();
  // the ridges where the bevels meet, from the far corners
  g.strokeStyle = ink(1, 0.95, 0.8);
  g.lineWidth = Math.max(1, u(0.8));
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(ix0, iy0);
  g.moveTo(w, 0);
  g.lineTo(ix1, iy0);
  g.stroke();
  g.restore();
}

/**
 * HAIRLINE: brushed metal anodised in the lane's colour: fine hairlines across it, light and dark, a
 * soft band of light standing across the brushing (where brushed metal shows its light), a bright
 * chamfer along its far edge and a dark one along its near edge.
 */
function hairlineNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  barClip(g, w, h);
  g.fillStyle = tone(0.8);
  g.fillRect(0, 0, w, h);
  const rand = seeded(11);
  const line = Math.max(1, u(0.7));
  for (let y = 0; y < h; y += line) {
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) {
      const [x, len, light, a] = [rand() * w - w * 0.1, w * (0.25 + rand() * 0.7), rand() < 0.5, 0.08 + rand() * 0.18];
      g.fillStyle = light ? ink(1, 0.55, a) : tone(0.5, a);
      g.fillRect(x, y, len, line);
    }
  }
  const sheen = g.createLinearGradient(0, 0, w, 0);
  sheen.addColorStop(0.12, ink(1, 0.5, 0));
  sheen.addColorStop(0.3, ink(1, 0.5, 0.55));
  sheen.addColorStop(0.48, ink(1, 0.5, 0));
  sheen.addColorStop(0.7, ink(1, 0.35, 0));
  sheen.addColorStop(0.8, ink(1, 0.35, 0.3));
  sheen.addColorStop(0.9, ink(1, 0.35, 0));
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink(1, 0.85, 0.9);
  g.fillRect(0, 0, w, Math.max(1, u(2)));
  g.fillStyle = tone(0.4, 0.9);
  g.fillRect(0, h - Math.max(1, u(2.5)), w, Math.max(1, u(2.5)));
  g.restore();
}

/**
 * GLASS: clear glass in the lane's colour, the track showing through it: deeper toward its near
 * edge, a glint slanting across it, a bright rim all round where its edges catch the light and a
 * faint one inside.
 */
function glassNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  barClip(g, w, h);
  const body = g.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, ink(1, 0.25, 0.32));
  body.addColorStop(0.55, ink(0.95, 0.05, 0.4));
  body.addColorStop(1, ink(0.7, 0, 0.55));
  g.fillStyle = body;
  g.fillRect(0, 0, w, h);
  slant(g, w * 0.18, w * 0.1, h * 0.6, h, ink(1, 0.8, 0.35));
  slant(g, w * 0.32, w * 0.025, h * 0.6, h, ink(1, 0.8, 0.22));
  roundRect(g, 0, 0, w, h, u(5));
  g.lineWidth = Math.max(2, u(5));
  g.strokeStyle = ink(1, 0.75, 0.95);
  g.stroke();
  roundRect(g, u(5), u(5), w - u(10), h - u(10), u(3));
  g.lineWidth = Math.max(1, u(1.2));
  g.strokeStyle = ink(1, 0.6, 0.35);
  g.stroke();
  g.restore();
}

/**
 * ENAMEL: deep glossy enamel in the lane's colour, darker toward its near edge and its ends as it
 * rounds over; a crisp reflection of a window across its far third, a thin rim of light along its
 * near edge.
 */
function enamelNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  barClip(g, w, h);
  const body = g.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, tone(1));
  body.addColorStop(0.7, tone(0.82));
  body.addColorStop(1, tone(0.55));
  g.fillStyle = body;
  g.fillRect(0, 0, w, h);
  const ends = g.createLinearGradient(0, 0, w, 0);
  ends.addColorStop(0, tone(0.5, 0.7));
  ends.addColorStop(0.08, tone(0.5, 0));
  ends.addColorStop(0.92, tone(0.5, 0));
  ends.addColorStop(1, tone(0.45, 0.8));
  g.fillStyle = ends;
  g.fillRect(0, 0, w, h);
  const win = { x: u(7), y: u(3.5), w: w - u(14), h: h * 0.34 };
  roundRect(g, win.x, win.y, win.w, win.h, u(4));
  const glare = g.createLinearGradient(0, win.y, 0, win.y + win.h);
  glare.addColorStop(0, ink(1, 0.92, 0.95));
  glare.addColorStop(0.5, ink(1, 0.75, 0.55));
  glare.addColorStop(1, ink(1, 0.6, 0));
  g.fillStyle = glare;
  g.fill();
  g.fillStyle = ink(1, 0.5, 0.55);
  g.fillRect(u(6), h - u(5.5), w - u(12), Math.max(1, u(1.6)));
  g.restore();
}

/**
 * PEARL: a satin pearl glaze, the lane's colour soft and pale: a broad soft sheen over its far half,
 * two pearly glows across it, gently shaded toward its near edge.
 */
function pearlNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  barClip(g, w, h);
  const sheen = g.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, ink(1, 0.7));
  sheen.addColorStop(0.45, ink(1, 0.42));
  sheen.addColorStop(1, ink(0.78, 0.18));
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  for (const [cx, cy, r, lift, a] of [
    [0.26, 0.3, 0.32, 0.95, 0.8],
    [0.68, 0.6, 0.3, 0.85, 0.55],
    [0.9, 0.25, 0.14, 0.9, 0.45],
  ]) {
    g.save();
    g.translate(cx * w, cy * h);
    g.scale(1, (h / w) * 2.4);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, r * w);
    glow.addColorStop(0, ink(1, lift, a));
    glow.addColorStop(1, ink(1, lift, 0));
    g.fillStyle = glow;
    g.fillRect(-r * w, -r * w, 2 * r * w, 2 * r * w);
    g.restore();
  }
  g.restore();
}

/**
 * CARBON: woven carbon fibre under a clear coat, in the lane's colour faintly, the colour itself in a
 * stripe across its middle and at its ends: the twill's tows catching the light in steps, the clear
 * coat's gloss along its far edge.
 */
function carbonNote(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  barClip(g, w, h);
  carbonWeave(g, w, h, Math.max(3, u(4.5)));
  g.fillStyle = tone(1);
  g.fillRect(0, h * 0.4, w, h * 0.2);
  g.fillRect(0, 0, Math.max(2, u(3)), h);
  g.fillRect(w - Math.max(2, u(3)), 0, Math.max(2, u(3)), h);
  g.fillStyle = ink(1, 0.45);
  g.fillRect(0, h * 0.4, w, Math.max(1, u(1)));
  const gloss = g.createLinearGradient(0, 0, 0, h * 0.32);
  gloss.addColorStop(0, ink(1, 0.6, 0.38));
  gloss.addColorStop(1, ink(1, 0.6, 0));
  g.fillStyle = gloss;
  g.fillRect(0, 0, w, h * 0.32);
  g.restore();
}

/** A 2/2 twill of carbon tows `c` px square over the picture: each lit along its own run, across or along, in steps. */
function carbonWeave(g: CanvasRenderingContext2D, w: number, h: number, c: number): void {
  g.fillStyle = tone(0.1);
  g.fillRect(0, 0, w, h);
  for (let j = 0; j * c < h; j++) {
    for (let i = 0; i * c < w; i++) {
      const [x, y] = [i * c, j * c];
      const across = (i + j) % 4 < 2;
      const grad = across ? g.createLinearGradient(0, y, 0, y + c) : g.createLinearGradient(x, 0, x + c, 0);
      grad.addColorStop(0, tone(0.1));
      grad.addColorStop(0.5, across ? ink(0.32, 0.1) : ink(0.24, 0.05));
      grad.addColorStop(1, tone(0.1));
      g.fillStyle = grad;
      g.fillRect(x, y, c, c);
    }
  }
}

export const NOTE_PAINT: Record<NoteStyle, NotePaint> = {
  flat: (g, w, h) => {
    const u = unit(h);
    roundRect(g, 0, 0, w, h, u(5));
    // the top of a slab (the renderer draws its walls): a little deeper toward its near edge, where it
    // rounds over into its wall
    const face = g.createLinearGradient(0, 0, 0, h);
    face.addColorStop(0, tone(1));
    face.addColorStop(0.62, tone(0.96));
    face.addColorStop(1, tone(0.8));
    g.fillStyle = face;
    g.fill();
    g.save();
    g.clip();
    // a gloss over its far half, brightest at the lip of its far edge, where the light catches it
    const gloss = g.createLinearGradient(0, 0, 0, h * 0.55);
    gloss.addColorStop(0, ink(1, 0.62));
    gloss.addColorStop(0.12, ink(1, 0.36));
    gloss.addColorStop(1, ink(1, 0.36, 0));
    g.fillStyle = gloss;
    g.fillRect(0, 0, w, h * 0.55);
    // lit along its left edge, the side the light comes from, and shaded along its right
    const edge = Math.min(0.2, u(7) / w);
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, ink(1, 0.3, 0.9));
    across.addColorStop(edge, ink(1, 0.3, 0));
    across.addColorStop(1 - edge, tone(0.7, 0));
    across.addColorStop(1, tone(0.7, 0.7));
    g.fillStyle = across;
    g.fillRect(0, 0, w, h);
    g.restore();
  },
  chrome: chromeNote,
  hairline: hairlineNote,
  glass: glassNote,
  enamel: enamelNote,
  pearl: pearlNote,
  carbon: carbonNote,
  chamfer: chamferNote,
  round: roundNote,
  star4: star4Note,
  star5: star5Note,
};

// ---------- long notes: a body repeated along the note, and its two ends ----------

export type LongStyle = 'solid' | 'chrome' | 'hairline' | 'glass' | 'enamel' | 'pearl' | 'carbon' | 'rail' | 'capsule' | 'ray';
export const LONG_STYLES: LongStyle[] = ['solid', ...MATERIAL_NOTES, 'rail', 'capsule', 'ray'];

/** The long note of each note style's family (each material its own). */
export const LONG_OF: Record<NoteStyle, LongStyle> = {
  flat: 'solid',
  chrome: 'chrome',
  hairline: 'hairline',
  glass: 'glass',
  enamel: 'enamel',
  pearl: 'pearl',
  carbon: 'carbon',
  chamfer: 'rail',
  round: 'capsule',
  star4: 'ray',
  star5: 'ray',
};

/**
 * A long note is its body alone (a head or tail drawn like a tap note reads as one more note):
 * `body` is one tile of it across the lane (canvas top = farther), repeated along the note;
 * `end` closes it at the head and the tail (canvas top = the outer edge). Sizes are px of a body
 * 54 px wide, as in the mockups.
 */
export interface LongPaint {
  body: Paint;
  end: Paint;
  /** Its body and ends while held, where they differ (a picture drawn from art: light flows inside it). */
  held?: { body: Paint; end: Paint };
  /** How wide its pictures are painted (px; default 64). */
  px?: number;
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
      // a rounded bar lit from the left: a gloss down its left third, deeper toward its right
      const shade = g.createLinearGradient(0, 0, w, 0);
      shade.addColorStop(0, tone(1.12, 0.92));
      shade.addColorStop(0.3, tone(1.06, 0.9));
      shade.addColorStop(0.55, tone(1, 0.88));
      shade.addColorStop(1, tone(0.78, 0.9));
      g.fillStyle = shade;
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, ink(1, 0.97));
    },
    end: squareEnd(tone(1, 0.88), ink(1, 0.97), 4),
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
  ...materialLongs(),
};

/** A material's long note: its body down the note, closed at each end by `rim` across its outer edge `t` px (of a 54 px body) deep. */
function materialLong(body: Paint, rim: string, t: number): LongPaint {
  return {
    body,
    end: (g, w, h) => {
      body(g, w, h);
      g.fillStyle = rim;
      g.fillRect(0, 0, w, across(w)(t));
    },
    tile: 1,
    endDepth: 0.12,
    width: 0.82,
  };
}

/** The materials' long notes: their finish down a bar as wide as FLAT's (canvas top = farther, across = the lane). */
function materialLongs(): Record<(typeof MATERIAL_NOTES)[number], LongPaint> {
  return {
    // bevels down both edges, the left lit, the right in half shade; the mirror between, a bright line down it
    chrome: materialLong(
      (g, w, h) => {
        const a = across(w);
        g.fillStyle = tone(0.3);
        g.fillRect(0, 0, w, h);
        g.fillStyle = ink(1, 0.6);
        g.fillRect(a(2), 0, a(8), h);
        g.fillStyle = tone(0.5);
        g.fillRect(w - a(10), 0, a(8), h);
        const mirror = g.createLinearGradient(a(10), 0, w - a(10), 0);
        mirror.addColorStop(0, ink(1, 0.42));
        mirror.addColorStop(0.42, ink(1, 0.14));
        mirror.addColorStop(0.47, ink(1, 0.9));
        mirror.addColorStop(0.53, tone(0.38));
        mirror.addColorStop(1, tone(0.76));
        g.fillStyle = mirror;
        g.fillRect(a(10), 0, w - a(20), h);
      },
      ink(1, 0.85),
      5,
    ),
    // hairlines down its length, the light across them a band down its left third
    hairline: materialLong(
      (g, w, h) => {
        g.fillStyle = tone(0.8);
        g.fillRect(0, 0, w, h);
        const rand = seeded(23);
        for (let x = 0; x < w; x += 1) {
          const [light, a] = [rand() < 0.5, 0.06 + rand() * 0.2];
          g.fillStyle = light ? ink(1, 0.55, a) : tone(0.5, a);
          g.fillRect(x, 0, 1, h);
        }
        const sheen = g.createLinearGradient(0, 0, w, 0);
        sheen.addColorStop(0.1, ink(1, 0.5, 0));
        sheen.addColorStop(0.28, ink(1, 0.5, 0.5));
        sheen.addColorStop(0.46, ink(1, 0.5, 0));
        sheen.addColorStop(0.85, tone(0.5, 0));
        sheen.addColorStop(1, tone(0.5, 0.6));
        g.fillStyle = sheen;
        g.fillRect(0, 0, w, h);
      },
      ink(1, 0.85, 0.9),
      4,
    ),
    // the track showing through it, bright down its edges where they catch the light
    glass: materialLong(
      (g, w, h) => {
        const a = across(w);
        g.fillStyle = ink(0.95, 0.1, 0.36);
        g.fillRect(0, 0, w, h);
        g.fillStyle = ink(1, 0.75, 0.9);
        g.fillRect(0, 0, a(3.5), h);
        g.fillRect(w - a(3.5), 0, a(3.5), h);
        g.fillStyle = ink(1, 0.6, 0.3);
        g.fillRect(a(7), 0, a(1.5), h);
        g.fillRect(w - a(8.5), 0, a(1.5), h);
        g.fillStyle = ink(1, 0.8, 0.22);
        g.fillRect(a(15), 0, a(5), h);
      },
      ink(1, 0.8, 0.95),
      4,
    ),
    // a glossy rod: deep colour, a crisp highlight down its left third, darker toward its right
    enamel: materialLong(
      (g, w, h) => {
        const rod = g.createLinearGradient(0, 0, w, 0);
        rod.addColorStop(0, tone(0.55));
        rod.addColorStop(0.12, tone(0.95));
        rod.addColorStop(0.2, ink(1, 0.88));
        rod.addColorStop(0.3, ink(1, 0.7));
        rod.addColorStop(0.34, tone(1));
        rod.addColorStop(0.75, tone(0.82));
        rod.addColorStop(1, tone(0.45));
        g.fillStyle = rod;
        g.fillRect(0, 0, w, h);
      },
      ink(1, 0.7),
      4,
    ),
    // satin: pale, a soft sheen down its left half
    pearl: materialLong(
      (g, w, h) => {
        const satin = g.createLinearGradient(0, 0, w, 0);
        satin.addColorStop(0, ink(0.9, 0.32));
        satin.addColorStop(0.3, ink(1, 0.8));
        satin.addColorStop(0.6, ink(1, 0.5));
        satin.addColorStop(1, ink(0.88, 0.28));
        g.fillStyle = satin;
        g.fillRect(0, 0, w, h);
      },
      ink(1, 0.85),
      4,
    ),
    // the weave down its length (eight tows across a tile), the lane's colour down its edges and its middle
    carbon: materialLong(
      (g, w, h) => {
        const a = across(w);
        carbonWeave(g, w, h, w / 8);
        g.fillStyle = tone(1);
        g.fillRect(0, 0, a(5), h);
        g.fillRect(w - a(5), 0, a(5), h);
        g.fillRect(w / 2 - a(1.5), 0, a(3), h);
        const gloss = g.createLinearGradient(0, 0, w, 0);
        gloss.addColorStop(0.1, ink(1, 0.6, 0));
        gloss.addColorStop(0.25, ink(1, 0.6, 0.3));
        gloss.addColorStop(0.4, ink(1, 0.6, 0));
        g.fillStyle = gloss;
        g.fillRect(0, 0, w, h);
      },
      tone(1.3),
      4,
    ),
  };
}

// ---------- side notes laid over half the keys (반쪽 덮기) ----------

/** The parts of a side note laid over the keys, and the flash of its hits and holds. */
export type SidePart = 'tap' | 'body' | 'end' | 'flash';

/** Where the judge line crosses the side flash's picture, from its far edge (share of its depth): its light rises up the track. */
export const SIDE_FLASH_LINE = 0.8;

/**
 * A side tap laid over half the keys, alike for every note style (in its side lane's colour): half
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
  // light across the half: a white-hot core on the judge line (SIDE_FLASH_LINE down) in a bright bar,
  // and rays of light rising from it a short way up the track, brighter and longer in some places
  // than others, fading out as they rise; under the line, over the gear, a short glow; the half's
  // ends fade
  flash: (g, w, h) => {
    const image = g.createImageData(w, h);
    const fade = w * 0.04;
    // the rays across the half (shares of its width) and how bright each is: the same every time
    const peaks = [0.05, 0.13, 0.22, 0.31, 0.4, 0.49, 0.57, 0.66, 0.74, 0.83, 0.9, 0.96];
    const heights = [0.7, 1, 0.55, 0.9, 0.6, 1, 0.75, 0.95, 0.5, 0.85, 1, 0.6];
    const rays = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      let r = 0;
      peaks.forEach((p, i) => (r = Math.max(r, heights[i] * Math.exp(-(((u - p) / 0.024) ** 2)))));
      rays[x] = 0.35 + 0.65 * r;
    }
    for (let y = 0; y < h; y++) {
      // from the line, in shares of the depth (up the track is negative)
      const d = (y + 0.5) / h - SIDE_FLASH_LINE;
      const bar = Math.exp(-d * d * 120);
      const core = Math.exp(-d * d * 1400);
      const below = d > 0 ? 0.3 * Math.exp(-d * 18) : 0;
      for (let x = 0; x < w; x++) {
        // a brighter ray reaches further up
        const rise = d < 0 ? 0.62 * rays[x] * Math.exp(d * (2.6 + 2.4 * (1 - rays[x]))) : 0;
        const i = (y * w + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = Math.round(255 * Math.min(1, 0.55 * bar + 0.45 * core + 0.3 * rise));
        image.data[i + 3] = Math.round(255 * Math.min(1, bar + rise + below) * Math.min(1, (x + 0.5) / fade, (w - x - 0.5) / fade));
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

/**
 * Every hit a player picks is drawn from art (flipbooks, see styleArt.ts): FLASH, FLARE, BUBBLES and
 * GRID, and the sets' MECHA, CLUB, CRYSTAL, NEON and PIANO. Until they load, or when they cannot,
 * they are drawn here: the four as themselves, a set's as FLASH.
 */
export type HitStyle = 'flash' | 'flare' | 'bubbles' | 'grid' | 'mecha' | 'club' | 'crystal' | 'neon' | 'piano';
export const HIT_STYLES: HitStyle[] = ['flash', 'flare', 'bubbles', 'grid', 'mecha', 'club', 'crystal', 'neon', 'piano'];
/** The hits drawn in code. */
type DrawnHit = 'flash' | 'flare' | 'bubbles' | 'grid';
const DRAWN_AS: Record<HitStyle, DrawnHit> = {
  flash: 'flash',
  flare: 'flare',
  bubbles: 'bubbles',
  grid: 'grid',
  mecha: 'flash',
  club: 'flash',
  crystal: 'flash',
  neon: 'flash',
  piano: 'flash',
};

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
const CELLS: Record<DrawnHit, { w: number; h: number; cy: number; reach: number }> = {
  flash: { w: 128, h: 192, cy: 104, reach: 84 },
  flare: { w: 384, h: 128, cy: 64, reach: 216 },
  bubbles: { w: 160, h: 160, cy: 80, reach: 75 },
  // played out under the line only, toward the gear: the next notes above it stay clear
  grid: { w: 96, h: 64, cy: 6, reach: 32 },
};

export const EFFECT_FRAMES = 16;

/**
 * The effect `style` as a 4×4 flipbook: frame f shows it at progress f/16 (the mockups' SVG
 * drawn on a canvas; the lane colour is the material's, white is lifted toward white).
 */
export function effectSheet(hit: HitStyle): EffectSheet {
  const style = DRAWN_AS[hit];
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
      g.restore();
    }
  });
  return { texture, cols, rows, frames: EFFECT_FRAMES, size: [cell.w / 64, cell.h / 64], centre: cell.cy / cell.h, reach: cell.reach / 64 };
}

/** Offset of `frame` in a cols×rows sheet (texture v runs up; frame 0 is the top-left cell). */
export function sheetOffset(sheet: Pick<EffectSheet, 'cols' | 'rows'>, frame: number): [number, number] {
  const f = Math.floor(frame);
  return [(f % sheet.cols) / sheet.cols, 1 - (Math.floor(f / sheet.cols) + 1) / sheet.rows];
}

function drawEffect(g: CanvasRenderingContext2D, style: DrawnHit, p: number): void {
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
    case 'flash': {
      // a bright bar on the judge line, a line opening toward the gear, a short column of light
      // (no line opening up the track: there it read as a note or a bar line)
      const fill = white;
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

/**
 * The judge line's glow, its box-shadow at `alpha` spreading above and below the line, as wide as the
 * line (the canvas spans the line and the reach above and below it, 1 px a px).
 */
export function judgeGlowTexture(width: number, height: number, blur: number, alpha: number): THREE.CanvasTexture {
  const reach = shadowReach(blur);
  const w = Math.ceil(width);
  const h = Math.ceil(height + 2 * reach);
  return paintTexture(w, h, (g) => {
    const image = g.createImageData(w, h);
    const down = Array.from({ length: h }, (_, y) => shadowAt(y + 0.5 - h / 2, height, blur));
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        image.data[i] = 255;
        image.data[i + 3] = Math.round(255 * alpha * down[y]);
      }
    }
    g.putImageData(image, 0, 0);
  });
}

/** A plain picture in real colours (a wall's shade on the lanes): `stops` across it. */
export function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, canvas.width, 0);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
