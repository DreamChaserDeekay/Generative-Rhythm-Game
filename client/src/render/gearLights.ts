import * as THREE from 'three';
import type { DeckMark, GearStyle } from './deckArt';
import { context2d, paintCanvas, type PaintTexture } from './paintCanvas';

/**
 * The gears' lights that move with the music: glows laid over a gear's deck where its parts light (a
 * light strip, the light under a row of keys, an emblem, a brass inlay and its medallion), each lit by
 * a pattern of the bar and the beat (beatClock). The deck is painted once; these are a few quads over
 * it, added to it, whose opacity is set each frame, so they cost next to nothing in the play.
 *
 * Each light is placed where the deck's picture shows its part (the deck picture's px:
 * DECK_PICTURE_PX across, its rows as many: scripts/assets/build_gears.py) and, on a deck drawn in
 * code (the plane camera's, and every skin's), on the box its plate marked for the part (deckArt.ts:
 * DeckSpec.marks): under a skin's row of keys that is its panel's picture, which marks its own parts
 * (deckArt.ts: PANEL_MARKS).
 */

/** How many px across the decks' pictures are (build_gears.py's deck_flat). */
export const DECK_PICTURE_PX = 2048;

/** Where the music is: bars from the chart's bar lines (whole numbers at a bar's start), beats four to a bar; and whether FEVER is on. */
export interface BeatClock {
  bar: number;
  beat: number;
  /** Seconds, for what runs on its own time (the judge line's shimmer). */
  seconds: number;
  fever: boolean;
}

/** A bar's length where the chart gives none (a preview, before the first bar): 120 BPM in 4/4. */
const DEFAULT_BAR_MS = 2000;

/** The bar and beat at `timeMs` from the bars' start times (sorted), carried on at the nearest bar's length before the first and after the last. */
export function beatClock(timeMs: number, barTimes: readonly number[], fever = false): BeatClock {
  const seconds = timeMs / 1000;
  const n = barTimes.length;
  const clock = (bar: number): BeatClock => ({ bar, beat: bar * 4, seconds, fever });
  if (n === 0) return clock(timeMs / DEFAULT_BAR_MS);
  const length = (i: number) => (n > 1 ? barTimes[Math.min(n - 1, i + 1)] - barTimes[Math.min(n - 2, i)] : DEFAULT_BAR_MS) || DEFAULT_BAR_MS;
  if (timeMs < barTimes[0]) return clock((timeMs - barTimes[0]) / length(0));
  // the last bar start at or before the time
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barTimes[mid] <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return clock(lo + (timeMs - barTimes[lo]) / length(lo));
}

const frac = (x: number) => x - Math.floor(x);

/** A flash fading over the beats since it lit. */
const fade = (since: number, decay: number) => Math.exp(-since * decay);

/** A slow swell and ebb over `period` beats, 0..1. */
const swell = (beat: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * beat) / period);

/** What a light looks like: a soft glow, an even wash with soft edges, or a four-pointed glint. */
export type LightShape = 'glow' | 'wash' | 'glint';

export interface GearLight {
  shape: LightShape;
  /** Its middle and size, deck picture px. */
  x: number;
  y: number;
  w: number;
  h: number;
  colour: number;
  /** How bright, 0..1, at `c`; `calm` under 번쩍임 줄이기 (no flashes, nothing sudden). */
  level: (c: BeatClock, calm: boolean) => number;
  /** Where it is at `c`, for one that moves (a light along a strip); deck picture px. */
  at?: (c: BeatClock) => readonly [number, number];
  /**
   * On a deck drawn in code: the mark of the part it lights, its quad that box grown `grow` times
   * (across, along). Without a mark it is not lit there.
   */
  mark?: string;
  grow?: number | readonly [number, number];
}

export interface GearLightSet {
  lights: GearLight[];
}

const CYAN = 0x39d4ff;

/** STANDARD: the light strip along the deck's front edge breathing on the beat (in FEVER it stays lit). */
function standardLights(): GearLightSet {
  const strip = { x0: 614, x1: 1434, y: 440 };
  return {
    lights: [
      {
        shape: 'wash',
        x: (strip.x0 + strip.x1) / 2,
        y: strip.y,
        w: strip.x1 - strip.x0 + 24,
        h: 36,
        colour: CYAN,
        level: (c, calm) => (c.fever ? 0.7 : calm ? 0.3 + 0.15 * swell(c.bar, 1) : 0.2 + 0.4 * fade(frac(c.beat), 3)),
        mark: 'strip',
        grow: [1.04, 1],
      },
    ],
  };
}

/**
 * PIANO: a glint running along the brass inlay once a bar, the inlay glowing warm in FEVER, the
 * treble clef medallion catching the light on the bar's first beat; no light on the keys, which lie
 * under the lanes and go down while their lane's key is held instead (deckArt.deckKeys).
 */
function pianoLights(): GearLightSet {
  // the inlay along the deck's top edge (the glint runs between the walls, its quad clear of them)
  const inlay = { y: 12, h: 24 };
  const run = { x0: 75, x1: 2048 - 75 };
  const medallion = { x: 184, y: 248, w: 224, h: 278 };
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: inlay.y,
        w: 2048,
        h: inlay.h,
        colour: 0xffc46a,
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.45 : 0.35 + 0.45 * fade(frac(c.beat), 3)),
        mark: 'inlay',
        grow: [1, 6],
      },
      {
        shape: 'glow',
        x: 1024,
        y: inlay.y,
        w: 150,
        h: inlay.h,
        colour: 0xfff0cc,
        level: (c, calm) => (calm ? 0 : 0.85 * Math.sin(Math.PI * frac(c.bar)) ** 2),
        at: (c) => [run.x0 + (run.x1 - run.x0) * frac(c.bar), inlay.y],
      },
      {
        shape: 'glow',
        x: medallion.x,
        y: medallion.y,
        w: medallion.w * 1.3,
        h: medallion.h * 1.3,
        colour: 0xffd27a,
        level: (c, calm) => (calm ? 0.1 + 0.12 * swell(c.beat, 4) : 0.06 + 0.3 * fade(frac(c.beat), 3)),
        mark: 'medallion',
        grow: 1.3,
      },
      {
        shape: 'glint',
        x: medallion.x - medallion.w * 0.18,
        y: medallion.y - medallion.h * 0.2,
        w: 120,
        h: 120,
        colour: 0xfff4d6,
        level: (c, calm) => (calm || frac(c.bar) >= 0.25 ? 0 : Math.sin(Math.PI * frac(c.bar) * 4) ** 2),
        mark: 'medallion',
        grow: 0.55,
      },
    ],
  };
}

/**
 * CRYSTAL: nothing glints on it, and no light moves over its pale facets (the notes are the brightest
 * things on the screen). Its three sapphire plates take a soft light from inside: the faintest breath
 * once a bar, and in FEVER a swell on each beat.
 */
function prismLights(): GearLightSet {
  const plate = (name: string, x: number, y: number, w: number, h: number): GearLight => ({
    shape: 'wash',
    x,
    y,
    w,
    h,
    colour: 0x8fc8ff,
    level: (c, calm) => (c.fever ? (calm ? 0.2 : 0.1 + 0.3 * fade(frac(c.beat), 3)) : calm ? 0 : 0.1 * Math.sin(Math.PI * frac(c.bar)) ** 2),
    mark: `plate.${name}`,
    grow: [0.96, 0.8],
  });
  return { lights: [plate('score', 1024, 240, 1000, 110), plate('speed', 330, 400, 400, 100), plate('rate', 1718, 400, 400, 100)] };
}

/**
 * SKY: nothing glints. Its feather takes a soft white light on the beat (a slow breath under 번쩍임
 * 줄이기), and in FEVER the sky itself brightens a little with each beat, as when a cloud lets the sun by.
 */
function skyLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'glow',
        x: 1024,
        y: 150,
        w: 150,
        h: 150,
        colour: 0xffffff,
        // a breath of light behind the feather on the beat: it is white on a bright sky, and a strong glow would blur it
        level: (c, calm) => (calm ? 0.1 + 0.12 * swell(c.beat, 4) : 0.05 + 0.3 * fade(frac(c.beat), 3)),
        mark: 'feather',
        grow: 1.3,
      },
      {
        shape: 'wash',
        x: 1024,
        y: 330,
        w: 2048,
        h: 420,
        colour: 0xcfeaff,
        // a bright deck: the light it gets is soft, or it would wash out to white
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.1 : 0.05 + 0.12 * fade(frac(c.beat), 3)),
        mark: 'sky',
        grow: 1,
      },
    ],
  };
}

/**
 * FIRE: the light under its key caps flares with each beat (a slow breath under 번쩍임 줄이기), and in
 * FEVER the lacquer itself glows a little hotter on the beat.
 */
function fireLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour: 0xff6a2a,
        level: (c, calm) => (calm ? 0.16 + 0.12 * swell(c.beat, 4) : 0.08 + 0.5 * fade(frac(c.beat), 3)),
        mark: 'caps',
        grow: [1, 1.6],
      },
      {
        shape: 'wash',
        x: 1024,
        y: 330,
        w: 2048,
        h: 420,
        colour: 0xff5a3a,
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.12 : 0.06 + 0.16 * fade(frac(c.beat), 3)),
        mark: 'lacquer',
        grow: 1,
      },
    ],
  };
}

/**
 * The AI companies' gears (GPT, GEMINI, GROK, CLAUDE): what lies under their keys (GPT's seam, GEMINI's
 * light, GROK's hairline, CLAUDE's band: each plate's 'glow') takes a light of the gear's own on the beat,
 * stronger in FEVER; a slow breath under 번쩍임 줄이기.
 */
function brandLights(colour: number): () => GearLightSet {
  return () => ({
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour,
        level: (c, calm) => (calm ? 0.1 + 0.1 * swell(c.beat, 4) : 0.05 + (c.fever ? 0.5 : 0.34) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.4],
      },
    ],
  });
}

/**
 * AQUA: the white collar under its keys takes an aqua light on the beat and the mark's ring glows with
 * it, both stronger in FEVER; a slow breath under 번쩍임 줄이기.
 */
function aquaLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour: 0x7ff3f6,
        level: (c, calm) => (calm ? 0.1 + 0.1 * swell(c.beat, 4) : 0.05 + (c.fever ? 0.5 : 0.34) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.6],
      },
      {
        shape: 'glow',
        x: 1024,
        y: 400,
        w: 220,
        h: 220,
        colour: 0x9ff6f8,
        level: (c, calm) => (calm ? 0.12 + 0.12 * swell(c.beat, 4) : 0.06 + (c.fever ? 0.46 : 0.3) * fade(frac(c.beat), 3)),
        mark: 'emblem',
        grow: 1.6,
      },
    ],
  };
}

/**
 * STEEL: the slot under its keys glows blue from inside on the beat, stronger in FEVER, when the light at
 * the near panel's right end comes up too; a slow breath under 번쩍임 줄이기.
 */
function steelLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 540,
        h: 40,
        colour: 0x58aaf0,
        level: (c, calm) => (calm ? 0.12 + 0.1 * swell(c.beat, 4) : 0.06 + (c.fever ? 0.55 : 0.36) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.4],
      },
      {
        shape: 'glow',
        x: 1880,
        y: 420,
        w: 300,
        h: 200,
        colour: 0x2f7fc0,
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.14 : 0.08 + 0.2 * fade(frac(c.beat), 3)),
        mark: 'side',
        grow: 1,
      },
    ],
  };
}

/**
 * NOIR: the red hairline under its slots flares on the beat, and in FEVER the two rows of teeth on its board
 * glow with it, the left one and the right one (its panel's picture has both: deckArt.PANEL_MARKS; its plate
 * drawn in code has a cluster of dots at its far left only); a slow breath under 번쩍임 줄이기.
 */
function noirLights(): GearLightSet {
  const teeth = (x: number, mark: string): GearLight => ({
    shape: 'glow',
    x,
    y: 260,
    w: 340,
    h: 200,
    colour: 0xff1a2b,
    level: (c, calm) => (!c.fever ? 0 : calm ? 0.16 : 0.08 + 0.3 * fade(frac(c.beat), 3)),
    mark,
    grow: 1.2,
  });
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour: 0xff3a48,
        level: (c, calm) => (calm ? 0.12 + 0.1 * swell(c.beat, 4) : 0.06 + (c.fever ? 0.56 : 0.38) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.5],
      },
      teeth(200, 'dots'),
      teeth(1848, 'dots.1'),
    ],
  };
}

/**
 * WIRE: the hairline under its trays brightens on the beat and the mark's ring glows with it; in FEVER the
 * light rising from the deck's near edge comes up too; a slow breath under 번쩍임 줄이기.
 */
function wireLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour: 0xffffff,
        level: (c, calm) => (calm ? 0.1 + 0.1 * swell(c.beat, 4) : 0.05 + (c.fever ? 0.5 : 0.34) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.4],
      },
      {
        shape: 'glow',
        x: 1024,
        y: 400,
        w: 220,
        h: 220,
        colour: 0xffffff,
        level: (c, calm) => (calm ? 0.1 + 0.1 * swell(c.beat, 4) : 0.05 + (c.fever ? 0.4 : 0.26) * fade(frac(c.beat), 3)),
        mark: 'emblem',
        grow: 1.6,
      },
      {
        shape: 'glow',
        x: 1024,
        y: 440,
        w: 1200,
        h: 200,
        colour: 0xdfe8ff,
        level: (c, calm) => (!c.fever ? 0 : calm ? 0.14 : 0.08 + 0.2 * fade(frac(c.beat), 3)),
        mark: 'rise',
        grow: 1,
      },
    ],
  };
}

/**
 * ASTRAL: the star between its readouts shines on the beat and the hairline under its keys takes a gold
 * light with it, both stronger in FEVER; a slow breath under 번쩍임 줄이기.
 */
function astralLights(): GearLightSet {
  return {
    lights: [
      {
        shape: 'wash',
        x: 1024,
        y: 110,
        w: 2048,
        h: 40,
        colour: 0xf6d98a,
        level: (c, calm) => (calm ? 0.1 + 0.1 * swell(c.beat, 4) : 0.05 + (c.fever ? 0.5 : 0.3) * fade(frac(c.beat), 3)),
        mark: 'glow',
        grow: [1, 1.4],
      },
      {
        shape: 'glint',
        x: 1024,
        y: 400,
        w: 260,
        h: 260,
        colour: 0xffffff,
        level: (c, calm) => (calm ? 0.14 + 0.14 * swell(c.beat, 4) : 0.08 + (c.fever ? 0.6 : 0.4) * fade(frac(c.beat), 3)),
        mark: 'emblem',
        grow: 2.2,
      },
    ],
  };
}

/** Each gear's lights. */
export const GEAR_LIGHTS: Record<GearStyle, () => GearLightSet> = {
  prism: prismLights,
  sky: skyLights,
  fire: fireLights,
  gpt: brandLights(0x9dffe0),
  gemini: brandLights(0xc4b0ff),
  grok: brandLights(0xffffff),
  claude: brandLights(0xffc4a8),
  aqua: aquaLights,
  steel: steelLights,
  noir: noirLights,
  wire: wireLights,
  astral: astralLights,
  standard: standardLights,
  piano: pianoLights,
};

/** How strongly a light's shape shows at (x, y), -1..1 across its quad (y toward the camera). */
function shapeAlpha(shape: LightShape, x: number, y: number): number {
  const r = Math.hypot(x, y);
  let a = 0;
  if (shape === 'glow') a = Math.exp(-r * r * 4.5);
  else if (shape === 'wash') a = (1 - smooth(0.45, 1, Math.abs(x))) * (1 - smooth(0.45, 1, Math.abs(y)));
  else a = Math.exp(-r * r * 30) + 0.55 * (Math.exp(-Math.abs(x) * 22) * Math.exp(-Math.abs(y) * 4) + Math.exp(-Math.abs(y) * 22) * Math.exp(-Math.abs(x) * 4));
  // nothing at the quad's edges
  return Math.max(0, Math.min(1, a * (1 - smooth(0.82, 1, Math.max(Math.abs(x), Math.abs(y))))));
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A box on the deck (plane px or deck picture px). */
interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How many px across and along a light's picture is. */
const LIGHT_PX = 128;

/** A light's picture: white, its alpha its shape's at each px of its quad, made once. */
function lightTexture(shape: LightShape): PaintTexture {
  const canvas = paintCanvas();
  canvas.width = LIGHT_PX;
  canvas.height = LIGHT_PX;
  const g = context2d(canvas);
  const img = g.createImageData(LIGHT_PX, LIGHT_PX);
  for (let py = 0; py < LIGHT_PX; py++) {
    for (let px = 0; px < LIGHT_PX; px++) {
      const o = (py * LIGHT_PX + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(shapeAlpha(shape, ((px + 0.5) / LIGHT_PX) * 2 - 1, ((py + 0.5) / LIGHT_PX) * 2 - 1) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Where the deck is: world x of its left edge, z of its top, world units per px across and along the track (deck picture px, or plane px on a deck drawn in code), its height. */
export interface DeckPlacement {
  left: number;
  top: number;
  across: number;
  along: number;
  y: number;
}

interface LightMesh {
  light: GearLight;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Whether it is laid on this deck (its part is there). */
  on: boolean;
}

/**
 * A gear's lights over its deck: built once; laid where the deck's picture shows its parts, or on the
 * parts its plate drawn in code marked (`place`); lit for the clock each frame (`update`).
 */
export class GearLightLayer {
  readonly group = new THREE.Group();
  private readonly lights: LightMesh[] = [];
  private placement: DeckPlacement | null = null;
  private readonly calm: boolean;
  private readonly owned: { dispose(): void }[] = [];

  constructor(set: GearLightSet, geometry: THREE.BufferGeometry, calm: boolean) {
    this.calm = calm;
    for (const light of set.lights) {
      const map = lightTexture(light.shape);
      const material = new THREE.MeshBasicMaterial({ map, color: light.colour, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 9.07;
      mesh.visible = false;
      this.group.add(mesh);
      this.lights.push({ light, mesh, material, on: false });
      this.owned.push(map, material);
    }
    this.group.visible = false;
  }

  /**
   * Lays the lights over the deck at `p`: where its picture shows the parts (`marks` null), or on the
   * boxes its plate drawn in code marked (each light its part's; one whose part is not there stays
   * dark); null hides them.
   */
  place(p: DeckPlacement | null, marks: readonly DeckMark[] | null): void {
    this.placement = p;
    this.group.visible = p !== null;
    if (!p) return;
    for (const l of this.lights) {
      const { light } = l;
      l.on = false;
      if (marks === null) this.put(l.mesh, { x: light.x - light.w / 2, y: light.y - light.h / 2, w: light.w, h: light.h });
      else {
        const m = light.mark ? marks.find((b) => b.name === light.mark) : undefined;
        if (!m) continue;
        const [gx, gy] = typeof light.grow === 'number' ? [light.grow, light.grow] : (light.grow ?? [1, 1]);
        this.put(l.mesh, { x: m.x + (m.w * (1 - gx)) / 2, y: m.y + (m.h * (1 - gy)) / 2, w: m.w * gx, h: m.h * gy });
      }
      l.on = true;
    }
  }

  private put(mesh: THREE.Mesh, q: Quad): void {
    const p = this.placement as DeckPlacement;
    mesh.scale.set(q.w * p.across, 1, q.h * p.along);
    mesh.position.set(p.left + (q.x + q.w / 2) * p.across, p.y + 0.0008, p.top + (q.y + q.h / 2) * p.along);
  }

  /** Lights them for `c`. */
  update(c: BeatClock): void {
    if (!this.placement) return;
    for (const l of this.lights) {
      const { light, mesh, material } = l;
      material.opacity = l.on ? Math.max(0, Math.min(1, light.level(c, this.calm))) : 0;
      mesh.visible = material.opacity > 0.003;
      // one that moves, over the deck's picture
      if (light.at && mesh.visible) {
        const [x, y] = light.at(c);
        this.put(mesh, { x: x - light.w / 2, y: y - light.h / 2, w: light.w, h: light.h });
      }
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
  }
}
