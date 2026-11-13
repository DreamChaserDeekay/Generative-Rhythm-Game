import * as THREE from 'three';
import { context2d, type PaintCanvas, paintCanvas, type PaintTexture } from './paintCanvas';

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

export function paintTexture(w: number, h: number, paint: Paint): PaintTexture {
  const canvas = paintCanvas();
  canvas.width = w;
  canvas.height = h;
  const g = context2d(canvas);
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
 * PRISM (the crystal skin's, 크리스털) is a bar of cut glass (its long note a long prism closed by its end
 * facets, its scratch a long hexagon), SKY (the sky skin's, 하늘) a soft matte bar with round corners (its
 * scratch marked with a pair of wings, its long note a see-through band), FIRE (the Firestarter skin's, 파이어스타터) a bar of gloss lacquer in a chrome lip (its scratch a white double slash, its long note a tube of heated glass cut straight across), FLAT (the default skin's) is a plain bar, and so are the materials (MATERIAL_NOTES): the same bar in another finish,
 * each with a long note of its own (LONG_OF). The others are families, each with its own long
 * note: CHAMFER a machined plate with cut corners, ROUND a coin, STAR4 a compass star stretched along
 * the judge line, STAR5 a five-pointed star; each as wide as its lane lets a note be. GPT, GEMINI, GROK and
 * CLAUDE (the four AI companies' skins) are the company's mark itself, a picture that comes with the build (LOGO_NOTES).
 * AQUA (the aqua mecha skin's, 아쿠아) is a bar as well: a plate of armour with cut corners in a white rim (its long note a light rail with chevrons).
 */
export type NoteStyle = 'prism' | 'sky' | 'fire' | 'gpt' | 'gemini' | 'grok' | 'claude' | 'aqua' | 'steel' | 'noir' | 'wire' | 'astral' | 'flat' | 'chrome' | 'hairline' | 'glass' | 'enamel' | 'pearl' | 'carbon' | 'chamfer' | 'round' | 'star4' | 'star5';
/**
 * The bars in a finish of their own (the bar's shape, FLAT's): mirror chrome cut with bevels,
 * brushed hairline metal, clear glass, glossy enamel, satin pearl, woven carbon.
 */
export const MATERIAL_NOTES = ['chrome', 'hairline', 'glass', 'enamel', 'pearl', 'carbon'] as const satisfies readonly NoteStyle[];
export const NOTE_STYLES: NoteStyle[] = ['flat', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', ...MATERIAL_NOTES, 'chamfer', 'round', 'star4', 'star5'];
/** The skins' notes that are bars (as deep in every lane as FLAT's). */
const SKIN_BARS: readonly NoteStyle[] = ['prism', 'sky', 'fire', 'aqua', 'steel', 'noir', 'wire', 'astral'];
/** Whether a note style is a bar (FLAT's shape: the materials' too), as deep in every lane. */
export const isBarNote = (style: NoteStyle): boolean => style === 'flat' || SKIN_BARS.includes(style) || (MATERIAL_NOTES as readonly NoteStyle[]).includes(style);

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
const NOTE_SHAPE: Partial<Record<NoteStyle, number>> = { round: 1, star4: 1, star5: 0.95, gpt: 1, gemini: 1, grok: 1, claude: 1 };

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


// ---------- PRISM (the crystal skin's notes, 크리스털): bars of cut glass ----------

/**
 * A bar of cut glass seen from above, its corners cut: bevels all round a flat table in the lane's
 * colour, the far and left bevels catching the light, the right one in half shade, and its near edge
 * (the one that meets the judge line: its timing) the brightest thing on it, nearly white.
 */
function prismBar(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  // a corner cut at 45° on the screen (the track is drawn NOTE_STRETCH times longer along)
  const cx = Math.min(u(7) / NOTE_STRETCH, w * 0.12);
  const cy = Math.min(u(7), h * 0.3);
  const outline: [number, number][] = [
    [cx, 0],
    [w - cx, 0],
    [w, cy],
    [w, h - cy],
    [w - cx, h],
    [cx, h],
    [0, h - cy],
    [0, cy],
  ];
  g.save();
  polygon(g, outline);
  g.clip();
  // the glass: its colour deepest in the middle of the table
  const body = g.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, tone(0.9, 0.92));
  body.addColorStop(0.3, tone(0.74, 0.86));
  body.addColorStop(0.75, tone(0.56, 0.84));
  body.addColorStop(1, tone(0.7, 0.9));
  g.fillStyle = body;
  g.fillRect(0, 0, w, h);
  // the far bevel, lit
  const far = h * 0.24;
  const bevel = Math.min(far / NOTE_STRETCH, w * 0.14);
  polygon(g, [
    [0, 0],
    [w, 0],
    [w - bevel, far],
    [bevel, far],
  ]);
  g.fillStyle = ink(1, 0.5);
  g.fill();
  g.fillStyle = ink(1, 0.85);
  g.fillRect(bevel, far - Math.max(1, u(1.2)), w - 2 * bevel, Math.max(1, u(1.2)));
  // the side bevels: the left lit, the right in half shade
  polygon(g, [
    [0, 0],
    [bevel, far],
    [bevel, h * 0.8],
    [0, h],
  ]);
  g.fillStyle = ink(1, 0.36);
  g.fill();
  polygon(g, [
    [w, 0],
    [w - bevel, far],
    [w - bevel, h * 0.8],
    [w, h],
  ]);
  g.fillStyle = tone(0.62);
  g.fill();
  // a glint slanting across the table
  slant(g, w * 0.22, Math.max(2, w * 0.07), h * 0.5, h, ink(1, 0.7, 0.3));
  slant(g, w * 0.33, Math.max(1, w * 0.02), h * 0.5, h, ink(1, 0.7, 0.22));
  // the near edge: a razor of light, a dark line over it so it stands off the table
  const edge = h * 0.2;
  g.fillStyle = tone(0.5);
  g.fillRect(0, h - edge - Math.max(1, u(1.5)), w, Math.max(1, u(1.5)));
  const razor = g.createLinearGradient(0, h - edge, 0, h);
  razor.addColorStop(0, ink(1, 0.7));
  razor.addColorStop(0.5, ink(1, 0.96));
  razor.addColorStop(1, ink(1, 0.82));
  g.fillStyle = razor;
  g.fillRect(0, h - edge, w, edge);
  g.restore();
}

/**
 * PRISM's scratch: a long hexagon, pointed at both ends, cut as a gem is: a table in the middle, the
 * far facets lit and the near ones deep, the point facets between; its near edge a razor of light as
 * the bars' is. Told from a key's bar by its outline alone.
 */
function prismGem(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  // the points as long as they are deep on the screen, no more than a fifth of the note each
  const p = Math.min((h / NOTE_STRETCH) * 0.9, w * 0.2);
  const t = Math.min(p * 0.55, w * 0.1);
  const [ty, by] = [h * 0.26, h * 0.74];
  const hexagon: [number, number][] = [
    [p, 0],
    [w - p, 0],
    [w, h / 2],
    [w - p, h],
    [p, h],
    [0, h / 2],
  ];
  const table: [number, number][] = [
    [p + t, ty],
    [w - p - t, ty],
    [w - p * 0.45, h / 2],
    [w - p - t, by],
    [p + t, by],
    [p * 0.45, h / 2],
  ];
  g.save();
  polygon(g, hexagon);
  g.clip();
  g.fillStyle = tone(0.8);
  g.fillRect(0, 0, w, h);
  // far facets lit, near ones deep
  g.fillStyle = ink(1, 0.42);
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = tone(0.66);
  g.fillRect(0, h / 2, w, h / 2);
  // the point facets: the left pair lit, the right in shade
  polygon(g, [hexagon[5], hexagon[0], table[0], table[5]]);
  g.fillStyle = ink(1, 0.6);
  g.fill();
  polygon(g, [hexagon[5], hexagon[4], table[4], table[5]]);
  g.fillStyle = tone(0.9);
  g.fill();
  polygon(g, [hexagon[2], hexagon[1], table[1], table[2]]);
  g.fillStyle = tone(0.74);
  g.fill();
  polygon(g, [hexagon[2], hexagon[3], table[3], table[2]]);
  g.fillStyle = tone(0.46);
  g.fill();
  // the table, and the ridges round it
  const top = g.createLinearGradient(0, ty, 0, by);
  top.addColorStop(0, ink(1, 0.18));
  top.addColorStop(1, tone(0.9));
  polygon(g, table);
  g.fillStyle = top;
  g.fill();
  g.lineWidth = Math.max(1, u(1.2));
  g.strokeStyle = ink(1, 0.8, 0.9);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(hexagon[i][0], hexagon[i][1]);
    g.lineTo(table[i][0], table[i][1]);
    g.stroke();
  }
  // the razor along its near edge
  const edge = h * 0.16;
  const razor = g.createLinearGradient(0, h - edge, 0, h);
  razor.addColorStop(0, ink(1, 0.6, 0));
  razor.addColorStop(0.4, ink(1, 0.95));
  razor.addColorStop(1, ink(1, 0.85));
  g.fillStyle = razor;
  g.fillRect(0, h - edge, w, edge);
  g.restore();
}

/** PRISM's notes: the gem on the scratch, a bar on a key and in a side lane of its own (side notes laid over the keys are none of a skin's parts: they stay the game's see-through bars). */
const prismNote: NotePaint = (g, w, h, mark) => (mark === 'scratch' ? prismGem(g, w, h) : prismBar(g, w, h));

// ---------- SKY (the sky skin's notes, 하늘): soft matte bars ----------

/** A bar's outline with its corners round on the screen, `r` across (NOTE_STRETCH times that along). */
function softOutline(g: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  const rx = Math.min(r, w / 2);
  const ry = Math.min(r * NOTE_STRETCH, h / 2);
  g.beginPath();
  g.moveTo(rx, 0);
  g.lineTo(w - rx, 0);
  g.ellipse(w - rx, ry, rx, ry, 0, -Math.PI / 2, 0);
  g.lineTo(w, h - ry);
  g.ellipse(w - rx, h - ry, rx, ry, 0, 0, Math.PI / 2);
  g.lineTo(rx, h);
  g.ellipse(rx, h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
  g.lineTo(0, ry);
  g.ellipse(rx, ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  g.closePath();
}

/**
 * SKY's bar: a soft matte bar, its corners round: the lane's colour even and a little pale, lighter
 * over its far half as a pillow's top is, a touch deeper toward its near edge, and a soft line of
 * light along that edge (its timing). Nothing on it glints: no gloss, no hard rim.
 */
function skyBar(g: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(h);
  g.save();
  softOutline(g, w, h, u(7) / NOTE_STRETCH);
  g.clip();
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, ink(1, 0.34));
  face.addColorStop(0.5, ink(1, 0.18));
  face.addColorStop(0.82, ink(1, 0.06));
  face.addColorStop(1, tone(0.9));
  g.fillStyle = face;
  g.fillRect(0, 0, w, h);
  // its ends rounding away: a breath of shade at each
  const ends = g.createLinearGradient(0, 0, w, 0);
  const e = Math.min(0.14, u(9) / w);
  ends.addColorStop(0, ink(1, 0.5, 0.35));
  ends.addColorStop(e, ink(1, 0.5, 0));
  ends.addColorStop(1 - e, tone(0.72, 0));
  ends.addColorStop(1, tone(0.72, 0.4));
  g.fillStyle = ends;
  g.fillRect(0, 0, w, h);
  // the near edge: a soft line of light, not a razor
  const edge = g.createLinearGradient(0, h - u(11), 0, h);
  edge.addColorStop(0, ink(1, 0.8, 0));
  edge.addColorStop(0.55, ink(1, 0.8, 0.9));
  edge.addColorStop(1, ink(1, 0.62, 0.95));
  g.fillStyle = edge;
  g.fillRect(0, h - u(11), w, u(11));
  g.restore();
}

/** One wing of SKY's mark, opening to the right of (0, 0), `r` its half height: the arm along its top, three flight feathers falling from it, each shorter than the last. */
function wing(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.moveTo(r * 0.12, r * 0.62);
  // up the root and out along the arm to the tip
  g.bezierCurveTo(r * 0.02, -r * 0.1, r * 0.55, -r * 0.85, r * 2.25, -r * 0.92);
  // the feathers, tip first
  g.quadraticCurveTo(r * 1.95, -r * 0.5, r * 1.42, -r * 0.34);
  g.quadraticCurveTo(r * 1.7, -r * 0.22, r * 1.78, -r * 0.02);
  g.quadraticCurveTo(r * 1.45, r * 0.12, r * 1.0, r * 0.12);
  g.quadraticCurveTo(r * 1.22, r * 0.28, r * 1.24, r * 0.48);
  g.quadraticCurveTo(r * 0.7, r * 0.72, r * 0.12, r * 0.62);
  g.closePath();
  g.fill();
}

/** SKY's scratch: the bar, and a pair of white wings opening from its middle. Told from a key's bar by the wings alone. */
function skyWings(g: CanvasRenderingContext2D, w: number, h: number): void {
  skyBar(g, w, h);
  // as tall on the screen as most of the bar's depth, no wider than a third of the bar a wing
  const r = Math.min((h / NOTE_STRETCH) * 0.36, w / 7);
  for (const side of [-1, 1]) {
    g.save();
    g.translate(w / 2 + side * r * 0.1, h * 0.5);
    g.scale(side, NOTE_STRETCH);
    // a soft shade under the wing, then the wing
    g.fillStyle = tone(0.62, 0.5);
    g.translate(0, r * 0.12);
    wing(g, r);
    g.translate(0, -r * 0.12);
    g.fillStyle = ink(1, 1);
    wing(g, r);
    g.restore();
  }
}

/** SKY's notes: the wings on the scratch, the bar on a key and in a side lane of its own (side notes laid over the keys are none of a skin's parts). */
const skyNote: NotePaint = (g, w, h, mark) => (mark === 'scratch' ? skyWings(g, w, h) : skyBar(g, w, h));

// ---------- FIRE (the Firestarter skin's notes, 파이어스타터): lacquered bars in a chrome lip ----------

/**
 * FIRE's bar: a bar of gloss lacquer in the lane's colour, square at its corners, one slant of light
 * across it, in a thin chrome frame: a hairline down each end and a lip of polished chrome along its
 * near edge, the brightest thing on it (its timing). The scratch's is told from a key's by a white
 * double slash through its middle.
 */
function fireNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  const lip = Math.max(3, u(10));
  const face = g.createLinearGradient(0, 0, 0, h - lip);
  face.addColorStop(0, ink(1, 0.2));
  face.addColorStop(0.45, tone(1));
  face.addColorStop(1, tone(0.84));
  g.fillStyle = face;
  g.fillRect(0, 0, w, h);
  // one slant of light across the lacquer
  const lean = (h / NOTE_STRETCH) * 0.9;
  polygon(g, [
    [w * 0.1 + lean, 0],
    [w * 0.34 + lean, 0],
    [w * 0.34, h - lip],
    [w * 0.1, h - lip],
  ]);
  g.fillStyle = ink(1, 0.5, 0.5);
  g.fill();
  if (mark === 'scratch') {
    // the double slash, white, through the middle
    const wide = Math.max(3, (h / NOTE_STRETCH) * 0.3);
    for (const at of [-0.75, 0.75]) {
      const x = w / 2 + at * wide * 1.5;
      polygon(g, [
        [x + lean / 2 - wide / 2, 0],
        [x + lean / 2 + wide / 2, 0],
        [x - lean / 2 + wide / 2, h - lip],
        [x - lean / 2 - wide / 2, h - lip],
      ]);
      g.fillStyle = ink(0, 1);
      g.fill();
    }
  }
  // the chrome: a hairline down each end, the lip along the near edge
  const end = Math.max(1.5, u(3));
  g.fillStyle = ink(0, 0.86);
  g.fillRect(0, 0, end, h);
  g.fillStyle = ink(0, 0.62);
  g.fillRect(w - end, 0, end, h);
  g.fillStyle = tone(0.3);
  g.fillRect(0, h - lip - Math.max(1, u(1.4)), w, Math.max(1, u(1.4)));
  const chrome = g.createLinearGradient(0, h - lip, 0, h);
  chrome.addColorStop(0, ink(0, 1));
  chrome.addColorStop(0.45, ink(0, 0.8));
  chrome.addColorStop(0.62, ink(0, 0.56));
  chrome.addColorStop(1, ink(0, 0.96));
  g.fillStyle = chrome;
  g.fillRect(0, h - lip, w, lip);
  g.restore();
}

/**
 * AQUA's plate (the aqua mecha skin's, 아쿠아): a low plate of armour, its four corners cut at 45° on the
 * screen: a white rim round the lane's colour, which is lighter toward its far edge, and a light edge
 * along its near side (its timing). The scratch's is told from a key's by a white chevron pointing
 * down the track.
 */
function aquaNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  const c = Math.min(u(8), w * 0.1);
  polygon(g, chamferOutline(0, 0, w, h, c));
  g.fillStyle = ink(0, 0.95);
  g.fill();
  const t = Math.max(1.5, u(3.4));
  g.save();
  polygon(g, chamferOutline(0, 0, w, h, c, t));
  g.clip();
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, ink(1, 0.3));
  face.addColorStop(0.5, tone(1));
  face.addColorStop(1, tone(0.84));
  g.fillStyle = face;
  g.fillRect(0, 0, w, h);
  const edge = Math.max(2, u(7));
  g.fillStyle = ink(1, 0.72);
  g.fillRect(0, h - t * NOTE_STRETCH - edge, w, edge);
  if (mark === 'scratch') {
    const r = Math.min(w * 0.08, (h / NOTE_STRETCH) * 0.32);
    g.translate(w / 2, h * 0.44);
    g.scale(1, NOTE_STRETCH);
    g.beginPath();
    g.moveTo(-r * 1.5, -r * 0.5);
    g.lineTo(0, r * 0.5);
    g.lineTo(r * 1.5, -r * 0.5);
    g.lineWidth = Math.max(1.5, r * 0.5);
    g.lineJoin = 'miter';
    g.strokeStyle = ink(0, 1);
    g.stroke();
  }
  g.restore();
}

/**
 * STEEL's bar (the gunmetal skin's, 스틸): a matte anodised key cap in the lane's colour: a flat top
 * face inside a soft bevel, lighter along its far side and its left, darker along its right and its
 * near side, and a bright line where the face meets the near bevel (its timing). The scratch's is told
 * from a key's by a cross engraved in its middle.
 */
function steelNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  g.save();
  softOutline(g, w, h, u(4) / NOTE_STRETCH);
  g.clip();
  g.fillStyle = tone(0.7);
  g.fillRect(0, 0, w, h);
  const b = Math.max(2, u(5));
  g.fillStyle = ink(1, 0.24);
  g.fillRect(0, 0, w, b * NOTE_STRETCH * 0.8);
  g.fillStyle = tone(0.5);
  g.fillRect(0, h - b * NOTE_STRETCH, w, b * NOTE_STRETCH);
  g.fillStyle = ink(1, 0.12);
  g.fillRect(0, 0, b, h);
  g.fillStyle = tone(0.58);
  g.fillRect(w - b, 0, b, h);
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, tone(1.04));
  face.addColorStop(1, tone(0.92));
  g.fillStyle = face;
  g.fillRect(b, b * NOTE_STRETCH * 0.8, w - 2 * b, h - b * NOTE_STRETCH * 1.8);
  const edge = Math.max(2, u(4));
  g.fillStyle = ink(1, 0.66);
  g.fillRect(b, h - b * NOTE_STRETCH - edge, w - 2 * b, edge);
  if (mark === 'scratch') {
    const r = Math.min(w * 0.06, (h / NOTE_STRETCH) * 0.26);
    g.translate(w / 2, h * 0.44);
    g.scale(1, NOTE_STRETCH);
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.moveTo(-r, 0);
    g.lineTo(r, 0);
    g.moveTo(0, -r);
    g.lineTo(0, r);
    g.lineWidth = Math.max(1.5, r * 0.36);
    g.strokeStyle = tone(0.4);
    g.stroke();
  }
  g.restore();
}

/**
 * NOIR's bar (the black and red skin's, 레드라인): a flat hard-edged block of the lane's colour, no bevel
 * and no gloss, its far right corner clipped off; a thin black line inset along its far edge and a
 * brighter band along its near side (its timing). The scratch's is told from a key's by a white chevron.
 */
function noirNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  const c = Math.min(u(10), w * 0.12);
  g.save();
  polygon(g, [
    [0, 0],
    [w - c, 0],
    [w, c * NOTE_STRETCH],
    [w, h],
    [0, h],
  ]);
  g.clip();
  g.fillStyle = tone(1);
  g.fillRect(0, 0, w, h);
  g.fillStyle = ink(0, 0, 0.9);
  g.fillRect(u(4), u(4) * NOTE_STRETCH, Math.max(1, w - c - u(8)), Math.max(1.5, u(2.4)));
  const edge = Math.max(2, u(9));
  g.fillStyle = ink(1, 0.62);
  g.fillRect(0, h - edge, w, edge);
  if (mark === 'scratch') {
    const r = Math.min(w * 0.08, (h / NOTE_STRETCH) * 0.3);
    g.translate(w / 2, h * 0.46);
    g.scale(1, NOTE_STRETCH);
    g.beginPath();
    g.moveTo(-r * 1.5, -r * 0.5);
    g.lineTo(0, r * 0.5);
    g.lineTo(r * 1.5, -r * 0.5);
    g.lineWidth = Math.max(1.5, r * 0.5);
    g.lineJoin = 'miter';
    g.strokeStyle = ink(0, 1);
    g.stroke();
  }
  g.restore();
}

/**
 * WIRE's bar (the white line skin's, 화이트 라인): a bar drawn in line: its far edge and its two ends a bright
 * line of the lane's colour, the colour dimmer and see-through inside them, and a white line along its
 * near side (its timing). The scratch's is told from a key's by a chevron.
 */
function wireNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = ink(0.66, 0, 0.8);
  g.fillRect(0, 0, w, h);
  const t = Math.max(1.5, u(3.2));
  g.fillStyle = ink(1, 0.3);
  g.fillRect(0, 0, w, t * NOTE_STRETCH);
  g.fillRect(0, 0, t, h);
  g.fillRect(w - t, 0, t, h);
  const edge = Math.max(2, u(7));
  g.fillStyle = ink(0, 1);
  g.fillRect(0, h - edge, w, edge);
  if (mark === 'scratch') {
    const r = Math.min(w * 0.08, (h / NOTE_STRETCH) * 0.28);
    g.translate(w / 2, h * 0.42);
    g.scale(1, NOTE_STRETCH);
    g.beginPath();
    g.moveTo(-r * 1.5, -r * 0.5);
    g.lineTo(0, r * 0.5);
    g.lineTo(r * 1.5, -r * 0.5);
    g.lineWidth = Math.max(1.5, r * 0.44);
    g.lineJoin = 'miter';
    g.strokeStyle = ink(1, 0.7);
    g.stroke();
  }
  g.restore();
}

/**
 * ASTRAL's bar (the starry night skin's, 별밤): a smooth bar with cut corners, as its gear's key caps: a
 * pale rim round the lane's colour, lighter toward its far edge, a light edge along its near side (its
 * timing), and a tiny white four-pointed star in its middle. The scratch's has a crescent there.
 */
function astralNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  const c = Math.min(u(7), w * 0.09);
  polygon(g, chamferOutline(0, 0, w, h, c));
  g.fillStyle = ink(1, 0.64);
  g.fill();
  const t = Math.max(1.2, u(2.6));
  g.save();
  polygon(g, chamferOutline(0, 0, w, h, c, t));
  g.clip();
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, ink(1, 0.2));
  face.addColorStop(0.5, tone(0.98));
  face.addColorStop(1, tone(0.8));
  g.fillStyle = face;
  g.fillRect(0, 0, w, h);
  const edge = Math.max(2, u(6));
  g.fillStyle = ink(1, 0.62);
  g.fillRect(0, h - t * NOTE_STRETCH - edge, w, edge);
  g.translate(w / 2, h * 0.45);
  g.scale(1, NOTE_STRETCH);
  const r = Math.min(w * 0.07, (h / NOTE_STRETCH) * 0.3);
  g.beginPath();
  if (mark === 'scratch') {
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.moveTo(r * 0.45 + r * 0.82, -r * 0.1);
    g.arc(r * 0.45, -r * 0.1, r * 0.82, 0, Math.PI * 2, true);
  } else {
    const k = 0.2;
    g.moveTo(0, -r);
    g.lineTo(r * k, -r * k);
    g.lineTo(r, 0);
    g.lineTo(r * k, r * k);
    g.lineTo(0, r);
    g.lineTo(-r * k, r * k);
    g.lineTo(-r, 0);
    g.lineTo(-r * k, -r * k);
    g.closePath();
  }
  g.fillStyle = ink(0, 0.96);
  g.fill('evenodd');
  g.restore();
}

/**
 * FLAT (the default skin's): a plain bar with square corners, the top of a slab (the renderer draws
 * its walls): a gloss over its far half, lit along its left end and shaded along its
 * right, a crisp light edge along its near side (its timing). The scratch's is told from a key's
 * by two slanted notches cut through it.
 */
function flatNote(g: CanvasRenderingContext2D, w: number, h: number, mark: NoteMark): void {
  const u = unit(h);
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  const face = g.createLinearGradient(0, 0, 0, h);
  face.addColorStop(0, tone(1));
  face.addColorStop(0.62, tone(0.96));
  face.addColorStop(1, tone(0.82));
  g.fillStyle = face;
  g.fillRect(0, 0, w, h);
  const gloss = g.createLinearGradient(0, 0, 0, h * 0.55);
  gloss.addColorStop(0, ink(1, 0.62));
  gloss.addColorStop(0.12, ink(1, 0.36));
  gloss.addColorStop(1, ink(1, 0.36, 0));
  g.fillStyle = gloss;
  g.fillRect(0, 0, w, h * 0.55);
  const edge = Math.min(0.2, u(7) / w);
  const across = g.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, ink(1, 0.3, 0.9));
  across.addColorStop(edge, ink(1, 0.3, 0));
  across.addColorStop(1 - edge, tone(0.7, 0));
  across.addColorStop(1, tone(0.7, 0.7));
  g.fillStyle = across;
  g.fillRect(0, 0, w, h);
  // the near edge, crisp
  g.fillStyle = ink(1, 0.7);
  g.fillRect(0, h - Math.max(2, u(5)), w, Math.max(2, u(5)));
  if (mark === 'scratch') {
    // two notches slanting through it, a third and two thirds along
    const lean = (h / NOTE_STRETCH) * 0.8;
    const wide = Math.max(3, (h / NOTE_STRETCH) * 0.32);
    for (const at of [1 / 3, 2 / 3]) {
      const x = w * at;
      polygon(g, [
        [x + lean / 2, 0],
        [x + lean / 2 + wide, 0],
        [x - lean / 2 + wide, h],
        [x - lean / 2, h],
      ]);
      g.fillStyle = tone(0.38);
      g.fill();
      g.fillStyle = ink(1, 0.5);
      g.fillRect(x - lean / 2 + wide, 0, Math.max(1, wide * 0.18), h);
    }
  }
  g.restore();
}

// ---------- the AI companies' notes: the company's mark itself, a picture that comes with the build ----------

/**
 * The notes that are a mark and no bar (the four AI companies' skins): the note is the mark's own
 * outline in its lane's colour, bright, in a thin rim of the colour's deep shade. The mark is not drawn here: it
 * is a picture that comes with the build (public/stage/<skin>/note.png; standees.ts reads it and the
 * renderer hands it over with setNoteEmblem). Without one the note is ROUND's coin.
 */
export const LOGO_NOTES = ['gpt', 'gemini', 'grok', 'claude'] as const satisfies readonly NoteStyle[];
export type LogoNote = (typeof LOGO_NOTES)[number];
export const isLogoNote = (style: NoteStyle): style is LogoNote => (LOGO_NOTES as readonly NoteStyle[]).includes(style);

/** A mark's picture: whatever it shows, only its outline (its alpha) is used. */
export type Emblem = CanvasImageSource & { readonly width: number; readonly height: number };
const EMBLEMS = new Map<LogoNote, Emblem>();

/** Gives a logo note its mark (null: none, the note is a coin again). The notes' pictures are painted again by whoever shows them. */
export function setNoteEmblem(style: LogoNote, picture: Emblem | null): void {
  if (picture) EMBLEMS.set(style, picture);
  else EMBLEMS.delete(style);
}

/** The mark a logo note has now. */
export const noteEmblemOf = (style: LogoNote): Emblem | undefined => EMBLEMS.get(style);

/**
 * Where a mark `aspect` wide for its height lies on a note's picture `w` × `h`, so it keeps its shape on
 * the screen: the picture is the note seen from above, NOTE_STRETCH times deeper than it looks at the
 * judge line; a note as deep as its lane lets it be (noteDepthOf) is filled, a shallower one (a wide
 * lane: the scratch's, a 4K key's) holds the mark in its middle, as tall as the note is deep.
 */
export function emblemBox(w: number, h: number, aspect: number): { x: number; y: number; w: number; h: number } {
  // the room across for a mark as tall as the note looks: all of the note where that is (about) the note's width
  const looks = h / NOTE_STRETCH;
  const room = looks >= w * 0.9 ? w : looks;
  const a = Math.max(0.2, Math.min(5, aspect));
  const [bw, bh] = a >= 1 ? [room, h / a] : [room * a, h];
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

/** `picture`'s outline filled with `fill`, on a canvas of its own `w` × `h`. */
function outlineOf(picture: Emblem, w: number, h: number, fill: (g: CanvasRenderingContext2D) => string | CanvasGradient): PaintCanvas {
  const canvas = paintCanvas();
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const g = context2d(canvas);
  g.imageSmoothingQuality = 'high';
  g.drawImage(picture, 0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = fill(g);
  g.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function logoNote(style: LogoNote): NotePaint {
  return (g, w, h, mark) => {
    const picture = EMBLEMS.get(style);
    if (!picture) {
      roundNote(g, w, h, mark);
      return;
    }
    // the rim's room left round the mark
    const rim = Math.max(1, Math.min(w, h / NOTE_STRETCH) * 0.022);
    const box = emblemBox(w - 2 * rim, h - 2 * rim * NOTE_STRETCH, picture.width / picture.height);
    const [x, y] = [box.x + rim, box.y + rim * NOTE_STRETCH];
    // a thin rim in the colour's deep shade, the outline spread round itself (as wide along the track as across on the
    // screen): the mark's own lines stay crisp over a lit key or another note
    const shade = outlineOf(picture, box.w, box.h, () => tone(0.3));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.drawImage(shade, x + Math.cos(a) * rim, y + Math.sin(a) * rim * NOTE_STRETCH, box.w, box.h);
    }
    // the mark in the lane's colour, all of it bright: lifted toward white at its far side, the colour itself at its near side
    const body = outlineOf(picture, box.w, box.h, (c) => {
      const down = c.createLinearGradient(0, 0, 0, c.canvas.height);
      down.addColorStop(0, ink(1, 0.42));
      down.addColorStop(0.55, ink(1, 0.12));
      down.addColorStop(1, tone(1));
      return down;
    });
    g.drawImage(body, x, y, box.w, box.h);
  };
}

export const NOTE_PAINT: Record<NoteStyle, NotePaint> = {
  prism: prismNote,
  sky: skyNote,
  fire: fireNote,
  gpt: logoNote('gpt'),
  gemini: logoNote('gemini'),
  grok: logoNote('grok'),
  claude: logoNote('claude'),
  aqua: aquaNote,
  steel: steelNote,
  noir: noirNote,
  wire: wireNote,
  astral: astralNote,
  flat: flatNote,
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

export type LongStyle = 'prism' | 'sky' | 'fire' | 'gpt' | 'gemini' | 'grok' | 'claude' | 'aqua' | 'steel' | 'noir' | 'wire' | 'solid' | 'chrome' | 'hairline' | 'glass' | 'enamel' | 'pearl' | 'carbon' | 'rail' | 'capsule' | 'ray';
export const LONG_STYLES: LongStyle[] = ['prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'solid', ...MATERIAL_NOTES, 'rail', 'capsule', 'ray'];

/** The long note of each note style's family (each material its own). */
export const LONG_OF: Record<NoteStyle, LongStyle> = {
  prism: 'prism',
  sky: 'sky',
  fire: 'fire',
  // the marks' long notes are each company's own: typing dots, sparkles on a band of light, a slash between two lines, a stitched paper ribbon
  gpt: 'gpt',
  gemini: 'gemini',
  grok: 'grok',
  claude: 'claude',
  aqua: 'aqua',
  steel: 'steel',
  noir: 'noir',
  wire: 'wire',
  astral: 'sky',
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
 * A long note is its body alone (a head or tail drawn like a tap note reads as one more note: the
 * rule for every style):
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
  /** It lies flat on the track, with no walls under it (a see-through band has no thickness to show; the others are slabs). */
  flat?: boolean;
}

const across = (w: number) => (n: number) => (n * w) / 54;

/** Side borders `t` px (of a 54 px body) in `fill`, on a body already painted. */
function sides(g: CanvasRenderingContext2D, w: number, h: number, t: number, fill: string): void {
  const a = across(w);
  g.fillStyle = fill;
  g.fillRect(0, 0, a(t), h);
  g.fillRect(w - a(t), 0, a(t), h);
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


/**
 * PRISM's long note across (px of a 54 px body, [from, to, fill]): a long triangular prism of glass
 * seen from above, as wide as its bar: a facet either side of the ridge down its middle, the left
 * one catching the light and the right one in shade, a rim of light down each edge; `lit` (held)
 * the glass a little brighter from inside, still glass (a wide lane's is a large thing on the screen:
 * white from edge to edge, it would hide the notes coming down beside it).
 */
const prismFacets = (lit: boolean): [number, number, string][] => [
  [0, 54, tone(0.35, 0.95)],
  [2, 6, ink(1, lit ? 0.85 : 0.7)],
  [6, 26, lit ? ink(1, 0.32, 0.92) : ink(1, 0.22, 0.9)],
  [28, 48, lit ? tone(0.88, 0.9) : tone(0.7, 0.88)],
  [48, 52, lit ? ink(1, 0.4) : tone(1.1)],
];

/** PRISM's long note: its two facets, their glass deeper toward the ridge, and the ridge a line of light (held: white in a narrow glow). */
function prismLong(lit: boolean): Paint {
  return (g, w, h) => {
    const a = across(w);
    stripes(g, w, h, prismFacets(lit));
    // each facet a little deeper toward the ridge, as glass is where it is thick
    for (const [from, to] of [[6, 26], [48, 28]]) {
      const deep = g.createLinearGradient(a(from), 0, a(to), 0);
      deep.addColorStop(0, tone(0.4, 0));
      deep.addColorStop(1, tone(0.4, lit ? 0.2 : 0.3));
      g.fillStyle = deep;
      g.fillRect(a(Math.min(from, to)), 0, a(Math.abs(to - from)), h);
    }
    if (lit) {
      const glow = g.createLinearGradient(a(20), 0, a(34), 0);
      glow.addColorStop(0, ink(1, 1, 0));
      glow.addColorStop(0.5, ink(1, 1, 0.6));
      glow.addColorStop(1, ink(1, 1, 0));
      g.fillStyle = glow;
      g.fillRect(a(20), 0, a(14), h);
    }
    g.fillStyle = ink(1, lit ? 1 : 0.85);
    g.fillRect(a(lit ? 25.5 : 26), 0, a(lit ? 3 : 2), h);
  };
}

/**
 * PRISM's end: the prism's own end face, a third facet falling from the ridge to the outer edge
 * (canvas top) between the two side facets, its edges lines of light: the prism closed as a cut
 * crystal is, not by a bar (a bar there reads as one more note).
 */
function prismEnd(lit: boolean): Paint {
  const body = prismLong(lit);
  return (g, w, h) => {
    const a = across(w);
    body(g, w, h);
    // the end facet: from the outer edge's corners in to where the ridge stops
    const face: [number, number][] = [
      [a(2), 0],
      [w - a(2), 0],
      [w / 2, h * 0.86],
    ];
    polygon(g, face);
    g.fillStyle = lit ? ink(1, 0.75) : ink(1, 0.42, 0.95);
    g.fill();
    g.lineWidth = Math.max(1, a(1.6));
    g.lineJoin = 'round';
    g.strokeStyle = ink(1, lit ? 1 : 0.85);
    g.stroke();
    g.fillStyle = ink(1, lit ? 1 : 0.9);
    g.fillRect(0, 0, w, Math.max(2, a(2.4)));
  };
}

/**
 * SKY's long note: a see-through band of the lane's colour, even and matte (the lane's sky shows
 * through it), a thin pale edge down each side and a soft white line down its middle; `lit` (held),
 * the band brighter and the middle line white in a glow.
 */
function skyLong(lit: boolean): Paint {
  return (g, w, h) => {
    const a = across(w);
    // held, less of the lane shows through it: the key's beam behind it would wash it out
    g.fillStyle = lit ? ink(0.9, 0.04, 0.8) : ink(0.96, 0.08, 0.5);
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 2.5, ink(1, lit ? 0.85 : 0.7, lit ? 0.95 : 0.85));
    const half = lit ? 9 : 7;
    const glow = g.createLinearGradient(a(27 - half), 0, a(27 + half), 0);
    glow.addColorStop(0, ink(1, 1, 0));
    glow.addColorStop(0.5, ink(1, 1, lit ? 0.55 : 0.42));
    glow.addColorStop(1, ink(1, 1, 0));
    g.fillStyle = glow;
    g.fillRect(a(27 - half), 0, a(2 * half), h);
    g.fillStyle = ink(1, 1, lit ? 1 : 0.78);
    g.fillRect(a(lit ? 25.5 : 26), 0, a(lit ? 3 : 2), h);
  };
}

/**
 * FIRE's long note: a tube of heated glass in the lane's colour, darker toward its two sides as a
 * round thing is, a white-hot wire down its middle; `lit` (held), it burns brighter and the wire is
 * wider in a glow. Its ends are cut straight across (LONG_PAINT).
 */
function fireLong(lit: boolean): Paint {
  return (g, w, h) => {
    const a = across(w);
    const k = lit ? 1.14 : 1;
    const round = g.createLinearGradient(0, 0, w, 0);
    round.addColorStop(0, tone(0.5 * k));
    round.addColorStop(0.14, tone(0.86 * k));
    round.addColorStop(0.36, tone(1.1 * k));
    round.addColorStop(0.64, tone(1.04 * k));
    round.addColorStop(0.86, tone(0.8 * k));
    round.addColorStop(1, tone(0.46 * k));
    g.fillStyle = round;
    g.fillRect(0, 0, w, h);
    const half = lit ? 10 : 6;
    const glow = g.createLinearGradient(a(27 - half), 0, a(27 + half), 0);
    glow.addColorStop(0, ink(1, 1, 0));
    glow.addColorStop(0.5, ink(1, 1, lit ? 0.7 : 0.45));
    glow.addColorStop(1, ink(1, 1, 0));
    g.fillStyle = glow;
    g.fillRect(a(27 - half), 0, a(2 * half), h);
    g.fillStyle = ink(1, 1);
    g.fillRect(a(lit ? 25 : 26), 0, a(lit ? 4 : 2), h);
  };
}

/**
 * AQUA's long note: a light rail in the lane's colour, a darker see-through body between two bright
 * edges, and (`marked`: the body, not its ends) a chevron a tile down its middle, pointing at the judge
 * line; `lit` (held), the body and the chevrons brighter. Its ends are cut straight across (LONG_PAINT).
 */
function aquaLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    g.fillStyle = lit ? ink(0.88, 0.06, 0.88) : ink(0.6, 0, 0.74);
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 5, ink(1, lit ? 0.9 : 0.7));
    if (!marked) return;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1, NOTE_STRETCH);
    const r = a(9);
    g.beginPath();
    g.moveTo(-r, -r * 0.5);
    g.lineTo(0, r * 0.5);
    g.lineTo(r, -r * 0.5);
    g.lineWidth = a(3.4);
    g.lineJoin = 'miter';
    g.strokeStyle = ink(1, lit ? 1 : 0.66, lit ? 1 : 0.92);
    g.stroke();
    g.restore();
  };
}

/**
 * STEEL's long note: a band of matte metal in the lane's colour, a thin bright edge down each side and a
 * dark groove down its middle; `lit` (held), the groove full of light.
 */
function steelLong(lit: boolean): Paint {
  return (g, w, h) => {
    stripes(g, w, h, [
      [0, 54, tone(lit ? 0.86 : 0.74)],
      [2.5, 9, tone(lit ? 1.08 : 0.96)],
      [45, 51.5, tone(lit ? 0.7 : 0.6)],
      [0, 2.5, ink(1, 0.62)],
      [51.5, 54, ink(1, 0.4)],
      [22, 32, tone(0.3)],
      [24, 30, lit ? ink(1, 0.92) : tone(0.42)],
    ]);
  };
}

/**
 * NOIR's long note: a flat band of the lane's colour at lower brightness between two bright edge lines,
 * and (`marked`: the body, not its ends) a small square a tile down its middle; `lit` (held), the band
 * and the squares brighter. Its ends are cut straight across (LONG_PAINT).
 */
function noirLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    g.fillStyle = lit ? ink(0.9, 0.05, 0.9) : ink(0.55, 0, 0.82);
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 3, ink(1, lit ? 0.85 : 0.6));
    if (!marked) return;
    const d = a(3.6);
    g.fillStyle = ink(1, lit ? 0.95 : 0.6);
    g.fillRect(w / 2 - d / 2, h / 2 - (d * NOTE_STRETCH) / 2, d, d * NOTE_STRETCH);
  };
}

/**
 * WIRE's long note: two thin parallel lines of the lane's colour, the colour faint and see-through
 * between them; `lit` (held), the lines white-bright and the fill stronger.
 */
function wireLong(lit: boolean): Paint {
  return (g, w, h) => {
    g.fillStyle = lit ? ink(0.82, 0.05, 0.68) : ink(0.5, 0, 0.42);
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 2.6, ink(1, lit ? 0.9 : 0.45));
  };
}

/**
 * GPT's long note: a message being written, drawn out: a soft band of the lane's colour, lighter down its
 * middle, a pale rim down each side, and (`marked`: the body, not its ends) three dots in a row a tile, as
 * someone typing; `lit` (held), brighter, the dots white. Its ends are cut straight across (LONG_PAINT).
 */
function typingLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    const k = lit ? 1.16 : 1;
    const soft = g.createLinearGradient(0, 0, w, 0);
    soft.addColorStop(0, tone(0.56 * k));
    soft.addColorStop(0.5, tone(0.86 * k));
    soft.addColorStop(1, tone(0.56 * k));
    g.fillStyle = soft;
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 3, ink(1, lit ? 0.85 : 0.6));
    if (!marked) return;
    g.fillStyle = ink(1, lit ? 1 : 0.82);
    for (const x of [-10.5, 0, 10.5]) {
      g.beginPath();
      g.ellipse(w / 2 + a(x), h / 2, a(3), a(3) * NOTE_STRETCH, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
}

/**
 * GEMINI's long note: a band of light in the lane's colour, see-through, brightest down its middle between two
 * thin edges, and (`marked`) a four-pointed sparkle a tile on its middle, a small one after it off to one side;
 * `lit` (held), brighter, the sparkles white. Its ends are cut straight across (LONG_PAINT).
 */
function sparkleLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    g.fillStyle = lit ? ink(0.9, 0.05, 0.62) : ink(0.72, 0, 0.44);
    g.fillRect(0, 0, w, h);
    const beam = g.createLinearGradient(a(9), 0, a(45), 0);
    beam.addColorStop(0, ink(1, 0.3, 0));
    beam.addColorStop(0.5, ink(1, lit ? 0.55 : 0.35, lit ? 0.7 : 0.5));
    beam.addColorStop(1, ink(1, 0.3, 0));
    g.fillStyle = beam;
    g.fillRect(a(9), 0, a(36), h);
    sides(g, w, h, 2.5, ink(1, lit ? 0.9 : 0.62, lit ? 0.95 : 0.85));
    if (!marked) return;
    // as tall on the screen as it is wide: drawn NOTE_STRETCH times longer along the note
    const star = (x: number, y: number, r: number, fill: string) => {
      g.save();
      g.translate(x, y);
      g.scale(1, NOTE_STRETCH);
      sparkleAt(g, 0, 0, r);
      g.fillStyle = fill;
      g.fill();
      g.restore();
    };
    star(w / 2, h * 0.34, a(11.5), ink(1, lit ? 1 : 0.88));
    star(w / 2 + a(11), h * 0.8, a(5), ink(1, lit ? 0.95 : 0.7, 0.92));
  };
}

/**
 * GROK's long note: black between two thin lines of the lane's colour, and (`marked`) one slash a tile across
 * its middle, a stroke of its mark; `lit` (held), the lines and the slash white-bright. Its ends are cut straight
 * across (LONG_PAINT).
 */
function slashLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    g.fillStyle = lit ? tone(0.3, 0.92) : tone(0.12, 0.9);
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 3, ink(1, lit ? 0.92 : 0.4));
    if (!marked) return;
    // leaning to the right, as tall on the screen as it is wide
    const r = a(8.5);
    g.beginPath();
    g.moveTo(w / 2 - r, h / 2 + r * NOTE_STRETCH);
    g.lineTo(w / 2 + r, h / 2 - r * NOTE_STRETCH);
    g.lineWidth = a(3.4);
    g.lineCap = 'butt';
    g.strokeStyle = ink(1, lit ? 1 : 0.55);
    g.stroke();
  };
}

/**
 * CLAUDE's long note: a ribbon of paper in the lane's colour, matte, lit from its left, a hem folded down each
 * side (a dark line just inside each edge) and (`marked`) a seam stitched down its middle, one stitch a tile;
 * `lit` (held), lighter, the stitches white. Its ends are cut straight across (LONG_PAINT).
 */
function ribbonLong(lit: boolean, marked = true): Paint {
  return (g, w, h) => {
    const a = across(w);
    const k = lit ? 1.14 : 1;
    stripes(g, w, h, [
      [0, 54, tone(0.86 * k)],
      [0, 5.5, tone(1.06 * k)],
      [48.5, 54, tone(0.7 * k)],
      [5.5, 7, tone(0.46)],
      [47, 48.5, tone(0.46)],
    ]);
    if (!marked) return;
    g.fillStyle = ink(1, lit ? 1 : 0.74);
    g.fillRect(a(25.3), h * 0.18, a(3.4), h * 0.64);
  };
}

/** SOLID's body (the default skin's long note): the lane's colour, a gloss down its left third, deeper toward its right; `lit` (held), brighter, a line of light down its middle in a glow. */
function solidLong(lit: boolean): Paint {
  return (g, w, h) => {
    const a = across(w);
    const shade = g.createLinearGradient(0, 0, w, 0);
    const k = lit ? 1.12 : 1;
    shade.addColorStop(0, tone(1.12 * k, 0.92));
    shade.addColorStop(0.3, tone(1.06 * k, 0.9));
    shade.addColorStop(0.55, tone(k, 0.88));
    shade.addColorStop(1, tone(0.78 * k, 0.9));
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    sides(g, w, h, 4, ink(1, 0.97));
    if (!lit) return;
    const glow = g.createLinearGradient(a(19), 0, a(35), 0);
    glow.addColorStop(0, ink(1, 1, 0));
    glow.addColorStop(0.5, ink(1, 1, 0.5));
    glow.addColorStop(1, ink(1, 1, 0));
    g.fillStyle = glow;
    g.fillRect(a(19), 0, a(16), h);
    g.fillStyle = ink(1, 1);
    g.fillRect(a(25.5), 0, a(3), h);
  };
}

/** A square end: the body itself, a rim in `border` along its outer edge (canvas top) as down its sides, `t` px of a 54 px body. */
function squareEnd(body: Paint, border: string, t = 4): Paint {
  return (g, w, h) => {
    body(g, w, h);
    g.fillStyle = border;
    g.fillRect(0, 0, w, across(w)(t));
  };
}

export const LONG_PAINT: Record<LongStyle, LongPaint> = {
  // a long triangular prism of glass as wide as its bar, the ridge of light down its middle (held:
  // white-hot, the glass bright from inside), each end closed by the prism's own end facet
  prism: {
    body: prismLong(false),
    end: prismEnd(false),
    held: { body: prismLong(true), end: prismEnd(true) },
    tile: 1,
    endDepth: 0.5 * NOTE_STRETCH * 0.55,
    width: 0.86,
  },
  // the sky skin's: a see-through band, a soft white line down its middle (held: brighter, the line
  // in a glow), each end the band itself, square, a thin white edge along it
  sky: {
    body: skyLong(false),
    end: squareEnd(skyLong(false), ink(1, 0.9, 0.95), 3),
    held: { body: skyLong(true), end: squareEnd(skyLong(true), ink(1, 1), 3) },
    tile: 1,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // the Firestarter skin's: a tube of heated glass, a white-hot wire down its middle (held: brighter,
  // the wire in a glow), each end the tube itself cut straight across, a bright rim along the cut
  fire: {
    body: fireLong(false),
    end: squareEnd(fireLong(false), ink(1, 0.92), 3),
    held: { body: fireLong(true), end: squareEnd(fireLong(true), ink(1, 1), 3) },
    tile: 1,
    endDepth: 0.2,
    width: 0.8,
  },
  // GPT's: a soft band, three typing dots in a row a tile (held: brighter, the dots white), each end cut straight across
  gpt: {
    body: typingLong(false),
    end: squareEnd(typingLong(false, false), ink(1, 0.85), 3),
    held: { body: typingLong(true), end: squareEnd(typingLong(true, false), ink(1, 1), 3) },
    px: 128,
    tile: 1.3,
    endDepth: 0.2,
    width: 0.8,
  },
  // Gemini's: a see-through band of light, a four-pointed sparkle and a small one a tile (held: brighter), each end
  // cut straight across; flat, with no walls
  gemini: {
    body: sparkleLong(false),
    end: squareEnd(sparkleLong(false, false), ink(1, 0.9, 0.95), 3),
    held: { body: sparkleLong(true), end: squareEnd(sparkleLong(true, false), ink(1, 1), 3) },
    px: 128,
    tile: 1.7,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // Grok's: black between two thin lines, a slash a tile (held: white-bright), each end cut straight across; flat, with no walls
  grok: {
    body: slashLong(false),
    end: squareEnd(slashLong(false, false), ink(1, 0.85), 3),
    held: { body: slashLong(true), end: squareEnd(slashLong(true, false), ink(1, 1), 3) },
    px: 128,
    tile: 0.9,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // Claude's: a paper ribbon with a hem down each side, a seam stitched down its middle (held: lighter, the stitches
  // white), each end cut straight across
  claude: {
    body: ribbonLong(false),
    end: squareEnd(ribbonLong(false, false), ink(1, 0.85), 3),
    held: { body: ribbonLong(true), end: squareEnd(ribbonLong(true, false), ink(1, 1), 3) },
    px: 128,
    tile: 0.5,
    endDepth: 0.2,
    width: 0.8,
  },
  // the aqua mecha skin's: a light rail, a chevron a tile down its middle (held: brighter), each end the
  // rail itself cut straight across, a bright rim along the cut; see-through, so it lies flat
  aqua: {
    body: aquaLong(false),
    end: squareEnd(aquaLong(false, false), ink(1, 0.9), 3),
    held: { body: aquaLong(true), end: squareEnd(aquaLong(true, false), ink(1, 1), 3) },
    tile: 0.9,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // the gunmetal skin's: matte metal with a groove down its middle (held: the groove lit), each end cut straight across
  steel: {
    body: steelLong(false),
    end: squareEnd(steelLong(false), ink(1, 0.8), 3),
    held: { body: steelLong(true), end: squareEnd(steelLong(true), ink(1, 1), 3) },
    tile: 1,
    endDepth: 0.2,
    width: 0.8,
  },
  // the black and red skin's: a flat band between two bright lines, small squares down its middle (held:
  // brighter), each end cut straight across; flat, with no walls
  noir: {
    body: noirLong(false),
    end: squareEnd(noirLong(false, false), ink(1, 0.85), 3),
    held: { body: noirLong(true), end: squareEnd(noirLong(true, false), ink(1, 1), 3) },
    tile: 0.45,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // the white line skin's: two thin lines, faint between them (held: brighter), each end cut straight across; flat, with no walls
  wire: {
    body: wireLong(false),
    end: squareEnd(wireLong(false), ink(1, 0.9), 2.6),
    held: { body: wireLong(true), end: squareEnd(wireLong(true), ink(1, 1), 2.6) },
    tile: 1,
    endDepth: 0.2,
    width: 0.8,
    flat: true,
  },
  // the default skin's: a bar lit from the left, a rim of light down each side; held, bright from
  // inside with a line of light down its middle; each end the bar itself, square, a rim along it
  solid: {
    body: solidLong(false),
    end: squareEnd(solidLong(false), ink(1, 0.97)),
    held: { body: solidLong(true), end: squareEnd(solidLong(true), ink(1, 1)) },
    tile: 1,
    endDepth: 0.2,
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
export type HitStyle = 'prism' | 'sky' | 'fire' | 'gpt' | 'gemini' | 'grok' | 'claude' | 'aqua' | 'steel' | 'noir' | 'wire' | 'astral' | 'flash' | 'flare' | 'bubbles' | 'grid' | 'mecha' | 'club' | 'crystal' | 'neon' | 'piano';
export const HIT_STYLES: HitStyle[] = ['flash', 'prism', 'sky', 'fire', 'gpt', 'gemini', 'grok', 'claude', 'aqua', 'steel', 'noir', 'wire', 'astral', 'flare', 'bubbles', 'grid', 'mecha', 'club', 'crystal', 'neon', 'piano'];
/** The hits drawn in code. */
type DrawnHit = 'prism' | 'sky' | 'fire' | 'gpt' | 'gemini' | 'grok' | 'claude' | 'aqua' | 'steel' | 'noir' | 'wire' | 'astral' | 'flash' | 'flare' | 'bubbles' | 'grid';
const DRAWN_AS: Record<HitStyle, DrawnHit> = {
  prism: 'prism',
  sky: 'sky',
  fire: 'fire',
  gpt: 'gpt',
  gemini: 'gemini',
  grok: 'grok',
  claude: 'claude',
  aqua: 'aqua',
  steel: 'steel',
  noir: 'noir',
  wire: 'wire',
  astral: 'astral',
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
  texture: PaintTexture;
  cols: number;
  rows: number;
  frames: number;
  /** Size of one frame in lane widths (across, along the track). */
  size: [number, number];
  /** Where the judge line crosses a frame, from its far edge (share of its depth). */
  centre: number;
  /** How wide the effect gets while it is still bright (halfway through), in lane widths. */
  reach: number;
  /**
   * Its picture is light in colours of its own on nothing (PRISM's spectrum, SKY's white puff), not a
   * tint picture: it is added as it is, the lane's colour only tingeing it.
   */
  plain?: boolean;
}

/**
 * One frame cell's size in px (a lane is 64 px wide in it), its centre, and how wide the effect
 * drawn in it gets halfway through (in px, see drawEffect), per style.
 */
const CELLS: Record<DrawnHit, { w: number; h: number; cy: number; reach: number }> = {
  // along the judge line and a little toward the gear: nothing of it rises up the track over the next notes
  prism: { w: 128, h: 64, cy: 26, reach: 44 },
  // a ring of cloud lying on the line and a few feathers off it: low, as PRISM's
  sky: { w: 128, h: 64, cy: 30, reach: 42 },
  // a flash on the line and thin sparks off it, most of them up the track a little way: thin enough that the next notes read through them
  fire: { w: 224, h: 160, cy: 116, reach: 64 },
  // the AI companies': small and close over the line (typing dots and a ring; sparkles; an X that glints and bursts; a burst of short strokes)
  gpt: { w: 128, h: 96, cy: 62, reach: 40 },
  gemini: { w: 128, h: 112, cy: 78, reach: 40 },
  grok: { w: 144, h: 112, cy: 76, reach: 46 },
  claude: { w: 192, h: 128, cy: 96, reach: 56 },
  // the aqua mecha skin's: a hexagon lying on the line and short dashes along it
  aqua: { w: 160, h: 80, cy: 44, reach: 40 },
  // the gunmetal skin's: a plus and a square lying on the line
  steel: { w: 128, h: 96, cy: 54, reach: 40 },
  // the black and red skin's: two blocks on the line and small squares off it, up the track a little way
  noir: { w: 160, h: 112, cy: 82, reach: 50 },
  // the white line skin's: a ring lying on the line, ticks round it and a dot at each side
  wire: { w: 160, h: 96, cy: 52, reach: 46 },
  // the starry night skin's: a ring on the line, a long star over it and tiny stars up the track a little way
  astral: { w: 160, h: 128, cy: 92, reach: 48 },
  flash: { w: 160, h: 96, cy: 48, reach: 84 },
  flare: { w: 384, h: 128, cy: 64, reach: 216 },
  bubbles: { w: 160, h: 160, cy: 80, reach: 75 },
  // played out under the line only, toward the gear: the next notes above it stay clear
  grid: { w: 96, h: 64, cy: 6, reach: 32 },
};

export const EFFECT_FRAMES = 16;
/** Where GROK's X stops being whole and flies apart (its hit's progress, 0..1). */
const X_BURSTS = 0.34;

/**
 * The skins' hits, each drawn by a painter of its own at a progress 0..1: light in colours of their own
 * on nothing (EffectSheet.plain). The others are the sheets' (drawEffect).
 */
const SKIN_HITS: Partial<Record<DrawnHit, (g: CanvasRenderingContext2D, p: number) => void>> = {
  prism: drawSpectrum,
  sky: drawPuff,
  fire: drawSparks,
  gpt: drawTyping,
  gemini: drawSparkles,
  grok: drawXBurst,
  claude: drawRays,
  aqua: drawLockOn,
  steel: drawPlus,
  noir: drawGlitch,
  wire: drawRingTicks,
  astral: drawStarlight,
};
/** The hits drawn as the sheets drew them (tint pictures). */
type SheetHit = 'flash' | 'flare' | 'bubbles' | 'grid';

/**
 * The effect `style` as a 4×4 flipbook: frame f shows it at progress f/16 (the mockups' SVG
 * drawn on a canvas; the lane colour is the material's, white is lifted toward white).
 */
export function effectSheet(hit: HitStyle): EffectSheet {
  const style = DRAWN_AS[hit];
  const cell = CELLS[style];
  const cols = 4;
  const rows = 4;
  const own = SKIN_HITS[style];
  const plain = own !== undefined;
  // PRISM's shards, SKY's feathers and FIRE's sparks have hard edges: painted twice as fine, or they show their px on a wide lane
  const fine = plain ? 2 : 1;
  const texture = (plain ? colourTexture : paintTexture)(cell.w * cols * fine, cell.h * rows * fine, (g) => {
    g.scale(fine, fine);
    for (let f = 0; f < EFFECT_FRAMES; f++) {
      g.save();
      g.translate((f % cols) * cell.w + cell.w / 2, Math.floor(f / cols) * cell.h + cell.cy);
      g.beginPath();
      g.rect(-cell.w / 2, -cell.cy, cell.w, cell.h);
      g.clip();
      if (own) own(g, f / EFFECT_FRAMES);
      else drawEffect(g, style as SheetHit, f / EFFECT_FRAMES);
      g.restore();
    }
  });
  return { texture, cols, rows, frames: EFFECT_FRAMES, size: [cell.w / 64, cell.h / 64], centre: cell.cy / cell.h, reach: cell.reach / 64, plain };
}

/** A picture in colours of its own (sRGB) on nothing, for light that is added as it is (EffectSheet.plain). */
function colourTexture(w: number, h: number, paint: Paint): PaintTexture {
  const canvas = paintCanvas();
  canvas.width = w;
  canvas.height = h;
  paint(context2d(canvas), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** White light split by a crystal into pastels, rose to violet. */
const SPECTRUM = ['#ff9dbb', '#ffc59c', '#fff0a8', '#a9f0c6', '#a6e4ff', '#aabeff', '#d1aeff'] as const;

/**
 * PRISM's hit (the crystal skin's) at progress `p`, about the judge line's crossing of the lane: a
 * white flash on the line at once, a four-pointed star (its brightest is its first frame), then the
 * light split: a few flat shards in pastels flying out both ways along the line, some a little toward
 * the gear and some a little up the track (no further than the star's own point: the next notes stay
 * clear), and a hairline of the pastels opening along the line; all gone by its end.
 */
function drawSpectrum(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const a = Math.max(0, 1 - p);
  const rgba = (hex: string, alpha: number) => {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, alpha))})`;
  };
  // the hairline of the spectrum along the line, opening outward
  const reach = (18 + 22 * Math.sqrt(p)) * s;
  const line = g.createLinearGradient(-reach, 0, reach, 0);
  line.addColorStop(0, rgba(SPECTRUM[6], 0));
  SPECTRUM.forEach((c, i) => line.addColorStop(0.12 + (0.76 * i) / (SPECTRUM.length - 1), rgba(c, 0.85 * a)));
  line.addColorStop(1, rgba(SPECTRUM[0], 0));
  g.fillStyle = line;
  g.fillRect(-reach, -1.5 * s, 2 * reach, 3 * s);
  // the shards: each a thin sliver flying out along its own line, its colour by where it points
  const shards: [number, number, number][] = [
    // angle from the line (degrees, positive toward the gear), length, colour
    [-4, 12, 0], [9, 14, 4], [-19, 9, 2], [24, 9, 6], [-11, 11, 5],
  ];
  for (const side of [-1, 1]) {
    shards.forEach(([deg, len, c], i) => {
      const angle = (deg * Math.PI) / 180;
      const from = (8 + 15 * Math.sqrt(p) * (0.7 + 0.08 * i)) * s;
      const l = len * s * (0.5 + 0.9 * a);
      const [dx, dy] = [side * Math.cos(angle), Math.sin(angle)];
      const [x0, y0] = [dx * from, dy * from];
      const [x1, y1] = [dx * (from + l), dy * (from + l)];
      const half = (2.4 - 1.3 * p) * s;
      polygon(g, [
        [x0, y0],
        [(x0 + x1) / 2 - dy * half, (y0 + y1) / 2 + dx * half * side],
        [x1, y1],
        [(x0 + x1) / 2 + dy * half, (y0 + y1) / 2 - dx * half * side],
      ]);
      g.fillStyle = rgba(SPECTRUM[side < 0 ? c : SPECTRUM.length - 1 - c], Math.min(1, 2.2 * a));
      g.fill();
    });
  }
  // the flash: a white bar across the lane on the line, its glow, a hot diamond in its middle
  // (the hit is drawn 1.8 lanes to a lane: the bar and the star stay inside their own lane, so a
  // chord's flashes stand side by side and do not run into one bar of white)
  const fw = 24 * s;
  const fh = (7 - 5 * p) * s;
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 16 * s);
  glow.addColorStop(0, `rgba(255,255,255,${0.4 * a * a})`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.scale(1.4, 0.6);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, 16 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = `rgba(255,255,255,${a})`;
  roundRect(g, -fw / 2, -fh / 2, fw, fh, 2 * s);
  g.fill();
  // the star: long points along the line, short ones across it, drawn in as it fades
  const r = (8.5 - 3.5 * p) * s;
  const waist = r * 0.24;
  const up = r * (1.15 - 0.9 * p);
  polygon(g, [
    [-r * 1.7, 0],
    [-waist, -waist * 0.5],
    [0, -up],
    [waist, -waist * 0.5],
    [r * 1.7, 0],
    [waist, waist * 0.5],
    [0, up * 0.8],
    [-waist, waist * 0.5],
  ]);
  g.fillStyle = `rgba(255,255,255,${Math.min(1, 1.4 * a)})`;
  g.fill();
}

/**
 * SKY's hit (the sky skin's) at progress `p`, about the judge line's crossing of the lane: a soft
 * white burst on the line at once, a ring of cloud opening round it (its puffs side by side, a
 * scalloped ring; flat on the track: wide along the line, shallow across it) and thinning to nothing,
 * and three small feathers drifting off it, turning as they go. White, a breath of sky blue at the
 * puffs' edges; no wider than its lane until it has nearly gone (a chord's rings stand side by side),
 * no further up the track than the ring itself (the next notes stay clear); all gone by its end.
 */
function drawPuff(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const a = Math.max(0, 1 - p);
  const out = Math.sqrt(p);
  const soft = (x: number, y: number, r: number, alpha: number) => {
    if (r <= 0 || alpha <= 0) return;
    const puff = g.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, `rgba(255,255,255,${Math.min(1, alpha)})`);
    puff.addColorStop(0.68, `rgba(246,251,255,${Math.min(1, alpha * 0.95)})`);
    puff.addColorStop(1, 'rgba(170,214,250,0)');
    g.fillStyle = puff;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // the burst in the middle: a soft light in its first frames, gone by a third of the effect (the
  // ring is a ring from the start: the lane shows through its middle)
  const burst = Math.max(0, 1 - 3 * p);
  g.save();
  g.scale(1.5, 0.62);
  soft(0, 0, 8 * s, 0.3 * burst);
  g.restore();
  // the ring of cloud, opening: about a lane wide and half as deep on the screen (the hit is drawn 1.8
  // lanes to a lane), its band of puffs side by side, each a little off the round, the same every
  // time; the lane shows through its middle from the first frame
  const [rx, ry] = [(12.5 + 5 * out) * s, (6.6 + 2.6 * out) * s];
  const puffs = 14;
  for (let i = 0; i < puffs; i++) {
    const at = ((i + 0.3 * Math.sin(i * 2.4)) / puffs) * Math.PI * 2;
    const size = (4.1 - 0.9 * p) * (0.86 + 0.28 * Math.abs(Math.sin(i * 1.7 + 0.6))) * s;
    soft(Math.cos(at) * rx, Math.sin(at) * ry, size, Math.min(1, 1.6 * a));
  }
  // the feathers: slim white vanes flying out, turning
  const feathers: [number, number, number, number][] = [
    // the angle it leaves at (degrees from the line, negative up the track), how far it goes, its length, its turn
    [-150, 15, 7.5, -0.9],
    [-28, 17, 8.5, 0.8],
    [30, 13, 6.5, 1.1],
  ];
  for (const [deg, far, len, turn] of feathers) {
    const angle = (deg * Math.PI) / 180;
    const d = (18 + far * out) * s;
    g.save();
    g.translate(Math.cos(angle) * d, Math.sin(angle) * d * 0.55);
    g.rotate(angle + Math.PI / 2 + turn * p);
    const l = len * s * (0.75 + 0.25 * a);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, 1.7 * a)})`;
    g.beginPath();
    g.moveTo(0, -l);
    g.bezierCurveTo(l * 0.4, -l * 0.5, l * 0.32, l * 0.35, l * 0.04, l * 0.75);
    g.bezierCurveTo(-l * 0.24, l * 0.3, -l * 0.26, -l * 0.5, 0, -l);
    g.fill();
    g.restore();
  }
}

/**
 * FIRE's hit (the Firestarter skin's) at progress `p`, about the judge line's crossing of the lane:
 * the strike of a lighter. A white-hot flash on the line at once, wide along it and gone in a third
 * of the effect, and thin sharp sparks flying off it, most of them up the track and outward: each a
 * streak white-hot at its head, orange behind and red at its tail, shortening as it flies and gone
 * before the effect ends. No ring, no smoke; nothing of it is wide enough to hide a note.
 */
function drawSparks(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  // the flash: white-hot on the line, wide along it, an orange light round it
  const flash = Math.max(0, 1 - 2.2 * p);
  if (flash > 0) {
    g.save();
    g.scale(2.1, 0.62);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 24 * s);
    core.addColorStop(0, `rgba(255,255,255,${flash})`);
    core.addColorStop(0.22, `rgba(255,246,224,${flash})`);
    core.addColorStop(0.45, `rgba(255,170,80,${0.75 * flash})`);
    core.addColorStop(0.72, `rgba(255,80,32,${0.34 * flash})`);
    core.addColorStop(1, 'rgba(232,17,45,0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 24 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // the sparks: the angle it leaves at (degrees from the line, negative up the track), how far it flies, its length, how late it dies (share of the effect)
  const sparks: [number, number, number, number][] = [
    [-166, 56, 40, 0.62],
    [-142, 84, 58, 0.78],
    [-116, 66, 46, 0.66],
    [-96, 100, 66, 0.84],
    [-70, 78, 52, 0.72],
    [-48, 98, 64, 0.82],
    [-26, 70, 48, 0.68],
    [-10, 54, 38, 0.6],
  ];
  for (const [deg, far, len, dies] of sparks) {
    const life = Math.max(0, 1 - p / dies);
    if (life <= 0) continue;
    const angle = (deg * Math.PI) / 180;
    // the track is seen from above its near end: what flies up it is drawn shorter than what flies along the line
    const [dx, dy] = [Math.cos(angle), Math.sin(angle) * 0.86];
    const head = (10 + far * out) * s;
    const tail = Math.max(4 * s, head - len * s * (0.35 + 0.65 * life));
    const [x0, y0, x1, y1] = [dx * tail, dy * tail, dx * head, dy * head];
    const streak = g.createLinearGradient(x0, y0, x1, y1);
    streak.addColorStop(0, 'rgba(232,17,45,0)');
    streak.addColorStop(0.3, `rgba(255,70,40,${0.9 * Math.min(1, 1.8 * life)})`);
    streak.addColorStop(0.62, `rgba(255,190,110,${Math.min(1, 2 * life)})`);
    streak.addColorStop(1, `rgba(255,252,240,${Math.min(1, 2.4 * life)})`);
    // a thin ray, a point at each end, its widest a third of the way back from its head
    const wide = (1.5 + 0.8 * life) * s;
    const [nx, ny] = [(-dy * wide) / 2, (dx * wide) / 2];
    const [mx, my] = [x0 + (x1 - x0) * 0.68, y0 + (y1 - y0) * 0.68];
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(mx + nx, my + ny);
    g.lineTo(x1, y1);
    g.lineTo(mx - nx, my - ny);
    g.closePath();
    g.fillStyle = streak;
    g.fill();
  }
}

/**
 * GPT's hit at progress `p`: someone typing. Three white dots in a row over the hit, each popping up a
 * moment after the one before and all gone together, and one thin ring of its green opening on the line.
 */
function drawTyping(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.2;
  g.save();
  g.scale(1, 0.6);
  g.beginPath();
  g.arc(0, 0, (10 + 26 * out) * s, 0, Math.PI * 2);
  g.lineWidth = (2.6 - 1.6 * p) * s;
  g.strokeStyle = `rgba(120,240,205,${0.95 * fade})`;
  g.stroke();
  g.restore();
  for (let i = 0; i < 3; i++) {
    // each a little later than the one before: it grows past its size and settles
    const t = Math.min(1, Math.max(0, (p - i * 0.09) / 0.26));
    if (t <= 0) continue;
    const pop = t < 0.7 ? (t / 0.7) * 1.25 : 1.25 - ((t - 0.7) / 0.3) * 0.25;
    g.beginPath();
    g.arc((i - 1) * 13 * s, (-20 - 6 * out) * s, 4.2 * s * pop, 0, Math.PI * 2);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, fade * 1.5)})`;
    g.fill();
  }
}

/** A four-pointed sparkle about (x, y), `r` to its points, its sides curving in. */
function sparkleAt(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.08, y - r * 0.08, x + r, y);
  g.quadraticCurveTo(x + r * 0.08, y + r * 0.08, x, y + r);
  g.quadraticCurveTo(x - r * 0.08, y + r * 0.08, x - r, y);
  g.quadraticCurveTo(x - r * 0.08, y - r * 0.08, x, y - r);
  g.closePath();
}

/**
 * GEMINI's hit at progress `p`: a soft round light on the line and a few four-pointed sparkles popping
 * round the hit, white touched with its blue, violet and pink, each growing and fading in its turn.
 */
function drawSparkles(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const fade = Math.max(0, 1 - p);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 30 * s);
  glow.addColorStop(0, `rgba(255,255,255,${0.9 * fade ** 1.6})`);
  glow.addColorStop(0.35, `rgba(155,160,255,${0.5 * fade ** 1.6})`);
  glow.addColorStop(1, 'rgba(155,114,203,0)');
  g.save();
  g.scale(1.5, 0.62);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, 30 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // where it pops (px from the hit, up the track negative), its size, when it starts, its colour
  const stars: [number, number, number, number, string][] = [
    [-18, -22, 13, 0, '255,255,255'],
    [17, -30, 10, 0.1, '170,200,255'],
    [26, -9, 7, 0.2, '255,180,200'],
    [-27, -7, 6, 0.16, '205,180,255'],
    [1, -42, 8, 0.26, '255,255,255'],
  ];
  for (const [x, y, r, from, rgb] of stars) {
    const t = (p - from) / (1 - from);
    if (t <= 0 || t >= 1) continue;
    const size = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - 0.35 * t);
    sparkleAt(g, x * s * (0.8 + 0.3 * t), y * s * (0.8 + 0.3 * t), r * s * size);
    g.fillStyle = `rgba(${rgb},${Math.min(1, (1 - t) * 1.8)})`;
    g.fill();
  }
}

/**
 * GROK's hit at progress `p`: an X that pops, glints and bursts. Two strokes crossing at a slant over the hit, one
 * heavy and one thin, land larger than they stay over a short white flash; a four-pointed glint opens and closes
 * on the heavy stroke's far tip; then the X flies apart, its four arms out along their own lines and small
 * sparkles between them, while one thin ring opens on the line. All white.
 */
function drawXBurst(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.1;
  // the flash it lands on
  const flash = Math.max(0, 1 - p / 0.24);
  if (flash > 0) {
    g.save();
    g.scale(1.5, 0.62);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 28 * s);
    core.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
    core.addColorStop(0.45, `rgba(255,255,255,${0.35 * flash})`);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 28 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // the ring on the line
  g.save();
  g.scale(1, 0.62);
  g.beginPath();
  g.arc(0, 0, (10 + 36 * out) * s, 0, Math.PI * 2);
  g.lineWidth = (2.2 - 1.4 * p) * s;
  g.strokeStyle = `rgba(255,255,255,${0.85 * fade})`;
  g.stroke();
  g.restore();
  // the X, a little up the track from the line: larger than it stays as it lands, whole for a moment, then apart
  const cy = -14 * s;
  const pop = p < 0.1 ? 0.5 + (p / 0.1) * 0.8 : p < 0.24 ? 1.3 - ((p - 0.1) / 0.14) * 0.3 : 1;
  const apart = Math.max(0, (p - X_BURSTS) / (1 - X_BURSTS));
  const fly = 1 - (1 - apart) ** 2.4;
  const arm = 19 * s * pop;
  const alpha = Math.max(0, 1 - apart) ** 1.2;
  g.lineCap = 'butt';
  // each arm's way out from the middle and its stroke: the heavy stroke runs from the upper left to the lower right
  const arms: [number, number, boolean][] = [
    [-1, -1, true],
    [1, 1, true],
    [1, -1, false],
    [-1, 1, false],
  ];
  for (const [dx, dy, heavy] of arms) {
    // the track is seen from above its near end: what runs up it is drawn a little shorter than what runs along the line
    const [ux, uy] = [dx * Math.SQRT1_2, dy * Math.SQRT1_2 * 0.9];
    const from = apart > 0 ? (2 + 24 * fly) * s : 0;
    const to = from + arm * (1 - 0.5 * apart);
    g.beginPath();
    g.moveTo(ux * from, cy + uy * from);
    g.lineTo(ux * to, cy + uy * to);
    g.lineWidth = (heavy ? 7 : 2.6) * s * pop * (1 - 0.45 * apart);
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.stroke();
  }
  // the glint on the heavy stroke's upper tip, open and shut between the landing and the burst
  const glint = Math.sin(Math.min(1, Math.max(0, (p - 0.08) / 0.36)) * Math.PI);
  if (glint > 0.01) {
    const tip = arm * Math.SQRT1_2 * 0.92;
    sparkleAt(g, -tip, cy - tip * 0.9, 15 * s * glint);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, glint * 1.5)})`;
    g.fill();
  }
  if (apart <= 0) return;
  // the sparkles thrown out between the arms: the angle each flies at (degrees from the line, negative up the track), how far, its size
  const sparks: [number, number, number][] = [
    [-90, 30, 6.5],
    [-8, 38, 5.5],
    [-172, 38, 5.5],
    [-124, 42, 3.6],
    [-56, 42, 3.6],
    [84, 12, 3.2],
  ];
  for (const [deg, far, r] of sparks) {
    const angle = (deg * Math.PI) / 180;
    const d = (8 + far * fly) * s;
    const size = Math.sin(Math.min(1, apart * 1.6) * Math.PI * 0.5) * (1 - 0.45 * apart);
    sparkleAt(g, Math.cos(angle) * d, cy + Math.sin(angle) * d * 0.86, r * s * size);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, (1 - apart) * 1.9)})`;
    g.fill();
  }
}

/**
 * CLAUDE's hit at progress `p`: a burst drawn by hand, a dozen short strokes of uneven length flying
 * out from the hit as rays, cream at their near ends and terracotta at their tips. No ring, no glow.
 */
function drawRays(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 2.4;
  const fade = Math.max(0, 1 - p) ** 0.9;
  // the angle a stroke flies at (degrees from the line, negative up the track), how far, how long, how thick
  const rays: [number, number, number, number][] = [
    [-172, 30, 15, 2.6],
    [-150, 40, 22, 3.2],
    [-128, 33, 14, 2.4],
    [-108, 46, 26, 3.4],
    [-90, 36, 16, 2.8],
    [-70, 48, 24, 3.4],
    [-50, 34, 15, 2.4],
    [-30, 42, 21, 3.2],
    [-8, 30, 14, 2.6],
    [18, 22, 10, 2.2],
    [162, 22, 10, 2.2],
  ];
  g.lineCap = 'round';
  for (const [deg, far, len, thick] of rays) {
    const a = (deg * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a) * 0.86];
    const head = (12 + far * out) * s;
    const tail = Math.max(7 * s, head - len * s * (0.5 + 0.5 * fade));
    const stroke = g.createLinearGradient(dx * tail, dy * tail, dx * head, dy * head);
    stroke.addColorStop(0, `rgba(255,246,236,${Math.min(1, fade * 1.5)})`);
    stroke.addColorStop(0.55, `rgba(255,200,170,${Math.min(1, fade * 1.5)})`);
    stroke.addColorStop(1, `rgba(217,119,87,${Math.min(1, fade * 1.5)})`);
    g.beginPath();
    g.moveTo(dx * tail, dy * tail);
    g.lineTo(dx * head, dy * head);
    g.lineWidth = thick * s * (0.6 + 0.4 * fade);
    g.strokeStyle = stroke;
    g.stroke();
  }
}

/**
 * AQUA's hit at progress `p`: a lock-on marker. A hexagon of aqua light snaps open round the hit, white
 * at first, a thinner one inside it a moment later, and four short pink dashes fly out along the line,
 * two each way. No sparks, no smoke.
 */
function drawLockOn(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.1;
  const flash = Math.max(0, 1 - 2.6 * p);
  if (flash > 0) {
    g.save();
    g.scale(1.7, 0.6);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 22 * s);
    core.addColorStop(0, `rgba(255,255,255,${0.95 * flash})`);
    core.addColorStop(0.4, `rgba(120,240,246,${0.6 * flash})`);
    core.addColorStop(1, 'rgba(34,224,230,0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 22 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // a hexagon with a point to the left and one to the right, as flat as the track is seen
  const hexagon = (r: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const [x, y] = [Math.cos(a) * r, Math.sin(a) * r * 0.62];
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  };
  g.lineJoin = 'miter';
  hexagon((12 + 21 * out) * s);
  g.lineWidth = (3.2 - 1.9 * p) * s;
  g.strokeStyle = `rgba(${p < 0.2 ? '235,255,255' : '70,232,238'},${Math.min(1, fade * 1.5)})`;
  g.stroke();
  const later = Math.max(0, p - 0.12) / 0.88;
  if (later > 0) {
    hexagon((7 + 16 * (1 - (1 - later) ** 3)) * s);
    g.lineWidth = 1.4 * s;
    g.strokeStyle = `rgba(150,244,248,${0.6 * (1 - later)})`;
    g.stroke();
  }
  // the dashes: the angle each flies at (degrees from the line, negative up the track) and how far
  g.lineCap = 'butt';
  for (const [deg, far] of [
    [-22, 48],
    [22, 40],
    [-158, 48],
    [158, 40],
  ]) {
    const a = (deg * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a) * 0.8];
    const head = (20 + far * 0.8 * out) * s;
    const tail = head - 14 * s * (0.4 + 0.6 * fade);
    g.beginPath();
    g.moveTo(dx * tail, dy * tail);
    g.lineTo(dx * head, dy * head);
    g.lineWidth = (3 - 1.4 * p) * s;
    g.strokeStyle = `rgba(255,63,147,${Math.min(1, fade * 1.6)})`;
    g.stroke();
  }
}

/**
 * STEEL's hit at progress `p`: a plus of light, four short rays at right angles from the hit, white with
 * steel-blue ends, and one thin square outline opening round it. Short; no sparks.
 */
function drawPlus(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.2;
  const flash = Math.max(0, 1 - 3 * p);
  if (flash > 0) {
    g.save();
    g.scale(1.4, 0.62);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 16 * s);
    core.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
    core.addColorStop(1, 'rgba(88,170,240,0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, 16 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // the square, as flat as the track is seen
  const r = (10 + 20 * out) * s;
  g.beginPath();
  g.rect(-r, -r * 0.62, 2 * r, 2 * r * 0.62);
  g.lineWidth = (2.2 - 1.2 * p) * s;
  g.strokeStyle = `rgba(120,184,240,${0.9 * fade})`;
  g.stroke();
  const [from, to] = [(3 + 10 * out) * s, (10 + 26 * out) * s];
  g.lineCap = 'butt';
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const k = dy === 0 ? 1 : 0.7;
    const ray = g.createLinearGradient(dx * from, dy * from * k, dx * to, dy * to * k);
    ray.addColorStop(0, `rgba(255,255,255,${Math.min(1, fade * 1.6)})`);
    ray.addColorStop(1, `rgba(88,170,240,${0.25 * fade})`);
    g.beginPath();
    g.moveTo(dx * from, dy * from * k);
    g.lineTo(dx * to, dy * to * k);
    g.lineWidth = (3.2 - 1.6 * p) * s;
    g.strokeStyle = ray;
    g.stroke();
  }
}

/**
 * NOIR's hit at progress `p`: a glitch. Two blocks, a red one and a white one, flash over the hit a
 * little apart and jump sideways in steps, small squares scatter up the track and a red line runs out
 * along the judge line. Over in a moment; no ring, no sparks.
 */
function drawGlitch(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 2.4;
  const fade = Math.max(0, 1 - p);
  g.fillStyle = `rgba(255,26,43,${0.8 * fade ** 2})`;
  g.fillRect(-(30 + 20 * out) * s, -0.8 * s, (60 + 40 * out) * s, 1.6 * s);
  if (p < 0.62) {
    // it does not ease: it jumps, a step an eighth of the effect long
    const jump = [0, 5, -4, 3, -2, 4, 0, 0][Math.floor(p * 8)] * s;
    const [wide, tall] = [(34 - 22 * p) * s, (9 - 4 * p) * s];
    g.fillStyle = `rgba(255,26,43,${Math.min(1, fade * 1.5)})`;
    g.fillRect(-wide / 2 + jump + 5 * s, -tall / 2 - 3 * s, wide, tall);
    g.fillStyle = `rgba(255,255,255,${Math.min(1, fade * 1.6)})`;
    g.fillRect(-wide / 2 - jump, -tall / 2 + 2 * s, wide * 0.86, tall * 0.8);
  }
  // the squares: the angle each flies at (degrees from the line, negative up the track), how far, its size, its colour
  for (const [deg, far, size, rgb] of [
    [-150, 44, 5, '255,26,43'],
    [-95, 52, 4, '255,255,255'],
    [-35, 46, 5, '255,26,43'],
    [-170, 30, 3, '255,255,255'],
    [-20, 30, 3, '255,255,255'],
  ] as const) {
    const a = (deg * Math.PI) / 180;
    const d = (10 + far * out) * s;
    const z = size * s * (0.6 + 0.4 * fade);
    g.fillStyle = `rgba(${rgb},${Math.min(1, fade * 1.5)})`;
    g.fillRect(Math.cos(a) * d - z / 2, Math.sin(a) * 0.86 * d - z / 2, z, z);
  }
}

/**
 * WIRE's hit at progress `p`: line and nothing else. One thin white ring opens on the line, four short
 * ticks round it, and a small dot at each side of it along the line. No colour, no glow.
 */
function drawRingTicks(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.1;
  const r = (11 + 25 * out) * s;
  g.save();
  g.scale(1, 0.62);
  g.strokeStyle = `rgba(255,255,255,${0.95 * fade})`;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.lineWidth = (1.9 - 0.9 * p) * s;
  g.stroke();
  g.lineCap = 'butt';
  g.lineWidth = 1.6 * s;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    g.beginPath();
    g.moveTo(c * (r + 4 * s), sn * (r + 4 * s));
    g.lineTo(c * (r + 11 * s), sn * (r + 11 * s));
    g.stroke();
  }
  g.restore();
  for (const dx of [-1, 1]) {
    g.beginPath();
    g.arc(dx * (r + 15 * s), 0, 1.8 * s, 0, Math.PI * 2);
    g.fillStyle = `rgba(255,255,255,${fade})`;
    g.fill();
  }
}

/**
 * ASTRAL's hit at progress `p`: starlight. A four-pointed star of white light with long thin points
 * opens on the hit and fades, one thin ring of moon blue opens on the line, and three tiny gold stars
 * drift away up the track. No sparks.
 */
function drawStarlight(g: CanvasRenderingContext2D, p: number): void {
  const s = 64 / 60;
  const out = 1 - (1 - p) ** 3;
  const fade = Math.max(0, 1 - p) ** 1.1;
  g.save();
  g.scale(1, 0.62);
  g.beginPath();
  g.arc(0, 0, (10 + 24 * out) * s, 0, Math.PI * 2);
  g.lineWidth = (1.8 - 0.9 * p) * s;
  g.strokeStyle = `rgba(169,200,255,${0.9 * fade})`;
  g.stroke();
  g.restore();
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 20 * s);
  halo.addColorStop(0, `rgba(255,255,255,${0.7 * fade ** 2})`);
  halo.addColorStop(1, 'rgba(169,200,255,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, 20 * s, 0, Math.PI * 2);
  g.fill();
  // the star: full size in the effect's first fifth, then thinning; its upright points the longer, the near one the shortest
  const r = (13 + 22 * Math.min(1, p / 0.18)) * s * (1 - 0.3 * p);
  g.beginPath();
  g.moveTo(0, -r * 0.8);
  g.quadraticCurveTo(r * 0.06, -r * 0.06, r * 1.1, 0);
  g.quadraticCurveTo(r * 0.06, r * 0.06, 0, r * 0.5);
  g.quadraticCurveTo(-r * 0.06, r * 0.06, -r * 1.1, 0);
  g.quadraticCurveTo(-r * 0.06, -r * 0.06, 0, -r * 0.8);
  g.closePath();
  g.fillStyle = `rgba(255,255,255,${Math.min(1, fade * 1.5)})`;
  g.fill();
  // where each tiny star is (px from the hit, up the track negative), its size and when it starts
  for (const [x, y, size, from] of [
    [-24, -22, 5, 0.05],
    [22, -30, 4, 0.14],
    [32, -8, 3.4, 0.22],
  ]) {
    const t = (p - from) / (1 - from);
    if (t <= 0 || t >= 1) continue;
    sparkleAt(g, x * s * (0.8 + 0.5 * t), y * s * (0.8 + 0.5 * t), size * s * Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.5) * (1 - 0.4 * t));
    g.fillStyle = `rgba(242,193,78,${Math.min(1, (1 - t) * 1.8)})`;
    g.fill();
  }
}

/** Offset of `frame` in a cols×rows sheet (texture v runs up; frame 0 is the top-left cell). */
export function sheetOffset(sheet: Pick<EffectSheet, 'cols' | 'rows'>, frame: number): [number, number] {
  const f = Math.floor(frame);
  return [(f % sheet.cols) / sheet.cols, 1 - (Math.floor(f / sheet.cols) + 1) / sheet.rows];
}

function drawEffect(g: CanvasRenderingContext2D, style: SheetHit, p: number): void {
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
      // the default skin's: a flat bar of light across the lane on the judge line, brightest at once,
      // and one thin ring opening about it; nothing rises up the track over the next notes
      const fw = (46 + 10 * p) * s;
      const fh = (9 - 6 * p) * s;
      const glow = g.createLinearGradient(-fw, 0, fw, 0);
      glow.addColorStop(0, colour(0));
      glow.addColorStop(0.5, colour(0.55 * a));
      glow.addColorStop(1, colour(0));
      g.fillStyle = glow;
      g.fillRect(-fw, -fh, 2 * fw, 2 * fh);
      g.fillStyle = white(a);
      roundRect(g, -fw / 2, -fh / 2, fw, fh, 2 * s);
      g.fill();
      const r = (7 + 9 * Math.sqrt(p)) * s;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.lineWidth = (2.6 - 1.6 * p) * s;
      g.strokeStyle = p < 0.2 ? white(a) : colour(a);
      g.stroke();
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
export function judgeGlowTexture(width: number, height: number, blur: number, alpha: number): PaintTexture {
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
export function gradientTexture(stops: [number, string][]): PaintTexture {
  const canvas = paintCanvas();
  canvas.width = 64;
  canvas.height = 4;
  const g = context2d(canvas);
  const grad = g.createLinearGradient(0, 0, canvas.width, 0);
  for (const [at, colour] of stops) grad.addColorStop(at, colour);
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
