import * as THREE from 'three';
import type { CameraPreset, KeyModeConfig, LaneKind } from '../engine/config';
import type { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import type { StemName } from '../engine/types';
import type { CameraPoseFx } from './cameraFx';
import { cameraPose, computeTrackGeometry, type LaneGeom, type TrackGeometry } from './layout';
import { FEVER_COLORS, STEM_COLORS, type Palette } from './palette';
import { disposeSkinArt, flipbookOffset, type ArtTexture, type MediaEffects, type SkinArt } from './skinArt';
import { DEFAULT_HUD_TYPE, hex, laneColorsFor, type Skin, type SkinStyle } from './skins';
import {
  CAP_PAINT,
  effectSheet,
  JEWEL_SIDE,
  jewelNote,
  facetsTexture,
  gradientTexture,
  judgeGlowTexture,
  lightMaterial,
  LONG_PAINT,
  neonBeamTexture,
  NOTE_PAINT,
  paintTexture,
  railBevelTexture,
  railGlowTexture,
  shadowReach,
  sheetOffset,
  stripesTexture,
  tintMaterial,
  type CapKind,
  type EffectSheet,
  type HitStyle,
  type LongPaint,
} from './tintArt';

const MISSED_COLOR = 0x4a5068;
/** Long notes: a held one is lit like the sheets' `filter: brightness(1.22)`, a broken one dim. */
const HOLD_BRIGHTNESS = { idle: 1, held: 1.22, missed: 1 } as const;
const HOLD_OPACITY = { idle: 1, held: 1, missed: 0.4 } as const;
/** How far the track extends below the judgement line, toward the camera. */
const TRACK_TAIL = 4;
const NOTE_HEIGHT = 0.2;
/** Every skin's notes are this deep on the track (a thin skin's a share of it). */
const NOTE_DEPTH = 0.7;
const SIDE_NOTE_HEIGHT = 0.12;
const BEAM_LENGTH = 10;
const MISSED_VISIBLE_MS = 400;
const EFFECT_MS = 240;
const COVER_Y = 0.05;
/** Textured note walls take the texture this far inside its edge (its very edge is the transparent outline). */
const WALL_INSET = 0.3;
/**
 * Note shading, kept faint (just enough to read the notes as blocks): light from above and a
 * little from the camera's side lights the top fully, the front a little less and the sides least.
 */
const NOTE_LIGHT = new THREE.Vector3(0, 1, 0.45).normalize();
const NOTE_AMBIENT = 0.82;
/** The top darkens this much toward its far edge, the walls toward the track. */
const NOTE_TOP_FALLOFF = 0.05;
const NOTE_WALL_FALLOFF = 0.08;
/** A box note's top catches a little light on its near edge, like a bevel. */
const NOTE_RIM = 0.06;
/** Clip-plane constant that keeps everything (plane effectively disabled). */
const FAR_AWAY = 1e4;
/**
 * Bar lines keep about this thickness on screen (CSS px) all the way up the track (a fixed depth
 * on the track thinned to nothing in the distance), at this opacity of the skin's bar colour.
 */
export const BAR_LINE_PX = 2.5;
const BAR_LINE_OPACITY = 0.7;
/** Track units per px of the approved skin sheets (73.65 px to a unit at the judge line). */
const PX = 1 / 73.65;
/** Hits and holds are drawn this much larger than lane-sized (1.2 times the first sheets). */
const FX_SCALE = 1.2;
const HIT_SIZE = 1.5 * FX_SCALE;
const HOLD_SIZE = 1.1 * FX_SCALE;
/** An effect lying on the track is drawn longer along it until it looks at least this tall for its width. */
const EFFECT_ASPECT = 0.7;
/** The frame of a code effect shown while a long note is held (its early, bright part). */
const HOLD_FRAME = 2;
/** The frame of a flipbook burst that glows under a held long note's sparks (its late, small part). */
const HOLD_BURST_FRAME = 13;
/** Note pictures are drawn this many px deep. */
const NOTE_PICTURE_PX = 96;

export interface FeverFrame {
  active: boolean;
  multiplier: number;
  /** 0..1 of the fever time left. */
  remaining: number;
}

export interface TrackFrame {
  /** Display time (song time + visual offset). */
  timeMs: number;
  scroll: ScrollModel;
  notes: readonly Readonly<SessionNote>[];
  heldNote: (lane: number) => number | null;
  keyDown: (lane: number) => boolean;
  barTimes: readonly number[];
  fever: FeverFrame;
  /** Camera tilt and zoom from the chart's effects (absent = neutral camera). */
  camera?: CameraPoseFx;
}

/** Plane px per track unit of the HUD lying on the track: the approved sheets' px. */
export const HUD_UNIT = 1 / PX;

/**
 * The track as the HUD lies on it. Plane px are HUD_UNIT to a track unit, from the middle of the
 * judge line: x to the right, y toward the camera (up the track is negative).
 */
export interface HudPlane {
  /** Row-major 3×3 homography from plane px (x, y, 1) to screen px (times w). */
  h: number[];
  /** Half the track's width, and how far outside it the gear's rails or walls reach. */
  halfWidth: number;
  sideOut: number;
  /** The deck under the judge line: its top, its caps' depth and how much of it the screen shows. */
  deckTop: number;
  capDepth: number;
  deckRoom: number;
}

export interface CoverLayout {
  sudden: number;
  hidden: number;
  lift: number;
}

export interface TrackRendererOptions {
  mode: KeyModeConfig;
  camera: CameraPreset;
  trackWidth: number;
  trackLength: number;
  palette: Palette;
  reducedFlash: boolean;
  covers: CoverLayout;
  skin: Skin;
  /** Loaded textures of the skin (loadSkinArt); the renderer owns and disposes them. Parts left out are drawn in code. */
  art?: SkinArt | null;
  /** A line across the track at every bar (default on). */
  barLines?: boolean;
}

type NoteKind = 'note' | 'side' | 'scratch';
const NOTE_KIND: Record<LaneKind, NoteKind> = { key: 'note', side: 'side', scratch: 'scratch' };

/** An effect lying on the track: a hit (played once) or the sparks of a held long note. */
interface EffectQuad {
  mesh: THREE.Mesh;
  /** Own copy of the sheet (sharing its image), so each quad shows its own frame. */
  texture: THREE.Texture;
  material: THREE.MeshBasicMaterial;
  start: number;
  lane: number;
}

const barNear = new THREE.Vector3();
const barFar = new THREE.Vector3();

/** Depth on the track floor at `z` that `camera` (matrices up to date) shows BAR_LINE_PX tall on a `cssHeight` canvas. */
export function barLineDepth(camera: THREE.Camera, z: number, cssHeight: number): number {
  const step = 0.1;
  const near = barNear.set(0, 0, z).project(camera);
  const far = barFar.set(0, 0, z - step).project(camera);
  const px = (Math.abs(near.y - far.y) * cssHeight) / 2;
  return px > 1e-6 ? Math.min(2, Math.max(0.02, (step * BAR_LINE_PX) / px)) : 0.05;
}

/** The drawing style of a skin; a user skin of an earlier version gets one from its shape and effect. */
export function styleOf(skin: Skin): SkinStyle {
  if (skin.style) return skin.style;
  const hit = skin.hitEffect === 'none' ? 'none' : skin.hitEffect === 'sprite' ? 'flipbook' : skin.hitEffect === 'ring' ? 'hex' : 'flash';
  return {
    note: skin.noteShape === 'round' ? 'pill' : 'flat',
    long: 'solid',
    cap: 'flat',
    beam: 'fade',
    hit,
    rails: { width: 10 },
    judge: { height: 12, glow: true },
    track: { tint: 0.08 },
    camera: 'SDVX',
    type: DEFAULT_HUD_TYPE,
  };
}

/** Renders the SDVX-style perspective track with Three.js. */
export class TrackRenderer {
  readonly geometry: TrackGeometry;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  /** Colour of each lane (palette, skin overrides and lane layout applied). */
  private readonly laneColors: number[];
  private readonly skin: Skin;
  private readonly style: SkinStyle;
  private readonly reducedFlash: boolean;
  private readonly barLines: boolean;
  private readonly noteGeometry: THREE.BufferGeometry;
  private readonly noteDepth: number;
  private readonly baseQuaternion = new THREE.Quaternion();
  private baseFov = 40;
  private appliedFx = { roll: 0, fovScale: 1 };
  private readonly flatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** Far plane hides what SUDDEN+ covers; near plane hides HIDDEN+ and everything under LIFT. */
  private readonly farClip = new THREE.Plane(new THREE.Vector3(0, 0, 1), FAR_AWAY);
  private readonly nearClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), FAR_AWAY);
  private readonly clipPlanes = [this.farClip, this.nearClip];
  private readonly noteTextures = new Map<NoteKind, THREE.Texture>();
  private readonly noteMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly bodyMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly endMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly capMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly capTextures = new Map<string, THREE.Texture>();
  private readonly notePool: MeshPool;
  private readonly bodyPool: MeshPool;
  private readonly endPool: MeshPool;
  private readonly barPool: MeshPool;
  private readonly long: LongPaint;
  private readonly longBody: THREE.Texture;
  private readonly longEnd: THREE.Texture;
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamLevels: number[] = [];
  /** The stem of each lane's next (or held) note, for the STEM skin's caps and beams. */
  private readonly laneStems: (StemName | undefined)[] = [];
  /** Hit effects lying on the track, reused once they finish. */
  private readonly hits: EffectQuad[] = [];
  /** Per lane, what shows while a long note is held there (with sparks, a late frame of the burst under them). */
  private readonly holds: EffectQuad[] = [];
  private readonly holdCores: EffectQuad[] = [];
  private readonly hitSheet: EffectSheet | null;
  /** Textures of the skin by part; empty when everything is drawn in code. */
  private readonly art: SkinArt['slots'];
  private readonly artSource: SkinArt | null;
  private readonly artEffects: MediaEffects;
  /** Textures made here (pictures, mirrored rails, per-effect copies). */
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly glowTexture = radialTexture();
  private readonly judgeGroup = new THREE.Group();
  private readonly judgeGlowMaterial: THREE.MeshBasicMaterial | null;
  /** Every part of each rail (its glow too): FEVER tints them. */
  private readonly rails: [THREE.MeshBasicMaterial[], THREE.MeshBasicMaterial[]] = [[], []];
  private readonly feverOverlay: THREE.Mesh;
  private readonly suddenCover: THREE.Mesh;
  private readonly suddenEdge: THREE.Mesh;
  private readonly hiddenCover: THREE.Mesh;
  private readonly hiddenEdge: THREE.Mesh;
  private readonly liftCover: THREE.Mesh;
  private readonly deck: THREE.Mesh;
  private readonly caps: THREE.Mesh[] = [];
  private capDepth = 0.5;
  private deckRoom = 1;
  /** Bumped whenever the camera or the gear's layout changes: the HUD lying on the track moves then. */
  private planeVersion = 0;
  /** Effects are this much longer along the track than across it (see EFFECT_ASPECT). */
  private stretch = 1;
  private notes: readonly Readonly<SessionNote>[] = [];
  private judgeZ = 0;
  private firstLive = 0;
  private lastFrameMs = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement, options: TrackRendererOptions) {
    this.geometry = computeTrackGeometry(options.mode, options.trackWidth, options.trackLength);
    this.skin = options.skin;
    this.style = styleOf(options.skin);
    this.artSource = options.art ?? null;
    this.art = { ...options.art?.slots };
    this.artEffects = options.art?.effects ?? { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 };
    this.prepareArt();
    this.laneColors = laneColorsFor(options.skin, options.palette, options.mode);
    // a skin drawn in code lays its note pictures on the track, as the sheets do
    this.noteGeometry = createNoteGeometry(options.skin.style ? 'picture' : options.skin.noteShape);
    this.noteDepth = NOTE_DEPTH * (this.style.noteDepth ?? 1);
    this.reducedFlash = options.reducedFlash;
    this.barLines = options.barLines ?? true;
    this.long = LONG_PAINT[this.style.long];
    this.longBody = this.own(paintTexture(64, Math.round(64 * this.long.tile), this.long.body));
    this.longBody.wrapT = THREE.RepeatWrapping;
    this.longEnd = this.own(paintTexture(64, Math.max(4, Math.round(64 * this.long.endDepth)), this.long.end));
    const hit = this.style.hit;
    // a flipbook skin draws shards in code when its textures are missing
    this.hitSheet = hit === 'none' || (hit === 'flipbook' && this.art.hitBurst) ? null : effectSheet(hit === 'flipbook' ? 'shards' : (hit as HitStyle));
    if (this.hitSheet) this.own(this.hitSheet.texture);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.camera = new THREE.PerspectiveCamera(options.camera.fov, 16 / 9, 0.1, 500);
    this.setCamera(options.camera);

    this.buildTrack();
    this.feverOverlay = this.flat(0xffffff, 0, 1.5, { additive: true });
    this.feverOverlay.scale.set(this.geometry.width, 1, this.geometry.length);
    this.feverOverlay.position.set(0, 0.008, -this.geometry.length / 2);
    this.feverOverlay.visible = false;
    this.judgeGlowMaterial = this.buildJudgementLine();
    this.buildBeams();

    const coverWidth = this.geometry.width + 0.34;
    const coverColor = hex(this.skin.colors.cover);
    const edgeColor = hex(this.skin.colors.coverEdge);
    this.suddenCover = this.flat(coverColor, 0.97, 9);
    this.hiddenCover = this.flat(coverColor, 0.97, 9);
    this.liftCover = this.flat(coverColor, 0.98, 9);
    this.suddenEdge = this.flat(edgeColor, 0.9, 9.2, { fog: false });
    this.hiddenEdge = this.flat(edgeColor, 0.9, 9.2, { fog: false });
    for (const m of [this.suddenCover, this.hiddenCover, this.liftCover, this.suddenEdge, this.hiddenEdge]) m.scale.x = coverWidth;
    this.deck = this.buildDeck();
    this.setCovers(options.covers);

    this.notePool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.noteGeometry, this.noteMaterial(this.laneColors[0], 'note'));
      mesh.renderOrder = 4;
      return mesh;
    });
    this.bodyPool = new MeshPool(this.scene, () => {
      // each body has its own UVs: the picture repeats along the note
      const mesh = new THREE.Mesh(this.flatGeometry.clone(), this.bodyMaterial(this.laneColors[0], 'idle'));
      mesh.renderOrder = 3;
      return mesh;
    });
    this.endPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, this.endMaterial(this.laneColors[0], 'idle'));
      mesh.renderOrder = 3.1;
      return mesh;
    });
    const barMaterial = new THREE.MeshBasicMaterial({
      color: hex(this.skin.colors.bar),
      transparent: true,
      opacity: BAR_LINE_OPACITY,
      depthWrite: false,
      clippingPlanes: this.clipPlanes,
    });
    this.barPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, barMaterial);
      mesh.renderOrder = 2;
      return mesh;
    });
  }

  setCamera(preset: CameraPreset): void {
    const pose = cameraPose(preset);
    this.baseFov = pose.fov;
    this.camera.fov = pose.fov;
    this.camera.position.set(...pose.position);
    this.camera.lookAt(new THREE.Vector3(...pose.target));
    this.baseQuaternion.copy(this.camera.quaternion);
    this.appliedFx = { roll: 0, fovScale: 1 };
    this.camera.updateProjectionMatrix();
    const far = new THREE.Vector3(0, 0, -this.geometry.length).distanceTo(this.camera.position);
    const mid = new THREE.Vector3(0, 0, -this.geometry.length * 0.55).distanceTo(this.camera.position);
    this.scene.fog = new THREE.Fog(hex(this.skin?.colors.fog ?? '#060a1a'), mid, far);
    if (this.deck) this.layoutDeck();
  }

  /** Moves SUDDEN+ / HIDDEN+ / LIFT (all shares, see settings). */
  setCovers(c: CoverLayout): void {
    const L = this.geometry.length;
    this.judgeZ = -c.lift * L;
    const travel = L + this.judgeZ;
    this.judgeGroup.position.z = this.judgeZ;
    this.beams.forEach((beam) => (beam.position.z = this.judgeZ - BEAM_LENGTH / 2));

    const suddenZ = this.judgeZ - travel * (1 - c.sudden);
    const hiddenZ = this.judgeZ - travel * c.hidden;
    this.farClip.constant = c.sudden > 0 ? -suddenZ : FAR_AWAY;
    // Under LIFT nothing passes the judgement line; otherwise missed notes run on toward the camera.
    const nearLimit = c.hidden > 0 ? hiddenZ : c.lift > 0 ? this.judgeZ + this.noteDepth / 2 : FAR_AWAY;
    this.nearClip.constant = nearLimit;

    this.span(this.suddenCover, -L - 0.5, suddenZ, c.sudden > 0);
    this.span(this.suddenEdge, suddenZ - 0.06, suddenZ + 0.06, c.sudden > 0);
    this.span(this.hiddenCover, hiddenZ, this.judgeZ, c.hidden > 0);
    this.span(this.hiddenEdge, hiddenZ - 0.06, hiddenZ + 0.06, c.hidden > 0);
    this.span(this.liftCover, this.judgeZ, TRACK_TAIL, c.lift > 0);
    this.layoutDeck();
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.camera.aspect = this.cssWidth / this.cssHeight;
    this.camera.updateProjectionMatrix();
    this.layoutDeck();
  }

  /** Changes whenever the HUD lying on the track has to move (see hudPlane). */
  get hudVersion(): number {
    return this.planeVersion;
  }

  /** The track plane as the camera shows it now (its tilt and zoom included), for the HUD on it. */
  hudPlane(): HudPlane {
    this.camera.updateMatrixWorld();
    const view = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const W = this.cssWidth / 2;
    const H = this.cssHeight / 2;
    // clip space of one plane px across, one toward the camera, and the origin; then screen px
    const [a, b, c] = [
      [PX, 0, 0, 0],
      [0, 0, PX, 0],
      [0, 0, this.judgeZ, 1],
    ].map(([x, y, z, w]) => {
      const v = new THREE.Vector4(x, y, z, w).applyMatrix4(view);
      return [W * (v.x + v.w), H * (v.w - v.y), v.w];
    });
    const { width } = this.geometry;
    const rails = this.art.rails;
    const railOuter = rails ? 0.08 + (rails.spec.width ?? 0.26) / 2 : this.style.rails.width * PX;
    const wallOuter = this.style.frame === 'gunmetal' ? 50 * PX : this.style.frame === 'street' ? 28 * PX : 0;
    return {
      h: [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]],
      halfWidth: width / 2 / PX,
      sideOut: Math.max(railOuter, wallOuter) / PX,
      deckTop: this.style.judge.height / 2 + 3,
      capDepth: this.capDepth / PX,
      deckRoom: this.deckRoom / PX,
    };
  }

  /** Forget per-run state before replaying a chart. */
  reset(): void {
    this.firstLive = 0;
    this.beamLevels.fill(0);
    for (const h of this.hits) h.mesh.visible = false;
  }

  /** A hit on the judge line of a lane, in `color` (a STEM skin paints it in the note's instrument). */
  hitEffect(lane: number, color: number, perfNow: number, noteIndex?: number): void {
    const hit = this.style.hit;
    if (hit === 'none') return;
    const stem = noteIndex !== undefined ? this.notes[noteIndex]?.src : undefined;
    const tint = hit === 'stemflash' && stem ? STEM_COLORS[stem] : color;
    const burst = hit === 'flipbook' ? this.art.hitBurst : undefined;
    let h = this.hits.find((x) => !x.mesh.visible && x.texture.image === (burst?.texture.image ?? this.hitSheet?.texture.image));
    if (!h) {
      const source = burst?.texture ?? this.hitSheet?.texture;
      if (!source) return;
      h = this.effectQuad(source, burst ? burst.spec.flipbook ?? null : this.hitSheet, 0.8);
      this.hits.push(h);
    }
    h.material.color.setHex(tint);
    h.start = perfNow;
    h.lane = lane;
    h.mesh.visible = true;
    this.drawHit(h, perfNow);
  }

  render(frame: TrackFrame, perfNow: number): void {
    const dt = this.lastFrameMs > 0 ? Math.min(100, perfNow - this.lastFrameMs) : 16;
    this.lastFrameMs = perfNow;
    this.notes = frame.notes;
    this.drawNotes(frame);
    this.drawBars(frame);
    this.drawBeams(frame, dt);
    this.drawCaps(frame);
    this.drawHolds(frame);
    this.drawHits(perfNow);
    this.drawFever(frame);
    this.applyCameraFx(frame.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private applyCameraFx(fx: CameraPoseFx | undefined): void {
    const roll = fx?.roll ?? 0;
    const fovScale = fx?.fovScale ?? 1;
    if (roll === this.appliedFx.roll && fovScale === this.appliedFx.fovScale) return;
    this.appliedFx = { roll, fovScale };
    this.planeVersion++;
    this.camera.quaternion.copy(this.baseQuaternion);
    if (roll !== 0) this.camera.rotateZ(roll);
    this.camera.fov = this.baseFov * fovScale;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: THREE.Material) => m.dispose());
        if (obj instanceof THREE.Mesh && obj.geometry !== this.flatGeometry) obj.geometry.dispose();
      }
    });
    for (const cache of [this.noteMaterials, this.bodyMaterials, this.endMaterials, this.capMaterials]) cache.forEach((m) => m.dispose());
    this.flatGeometry.dispose();
    this.glowTexture.dispose();
    this.ownedTextures.forEach((t) => t.dispose());
    disposeSkinArt(this.artSource);
    this.renderer.dispose();
  }

  private drawNotes(frame: TrackFrame): void {
    const { notes, timeMs, scroll } = frame;
    const L = this.geometry.length;
    const z = (t: number) => scroll.z(t, timeMs);
    while (this.firstLive < notes.length && isGone(notes[this.firstLive], timeMs)) this.firstLive++;

    this.laneStems.fill(undefined);
    this.notePool.begin();
    this.bodyPool.begin();
    this.endPool.begin();
    for (let i = this.firstLive; i < notes.length; i++) {
      const n = notes[i];
      if (scroll.distance(n.t, timeMs) > scroll.travel) break;
      const lane = this.geometry.lanes[n.lane];
      const color = this.noteColor(n);
      const height = lane.kind === 'side' ? SIDE_NOTE_HEIGHT : NOTE_HEIGHT;
      const kind = NOTE_KIND[lane.kind];
      if (n.type === 'tap') {
        if (!n.headDone) {
          this.laneStems[n.lane] ??= n.src;
          this.placeNote(lane.x, lane.width, z(n.t), color, height, kind);
        } else if (n.broken && n.t > timeMs - MISSED_VISIBLE_MS) this.placeNote(lane.x, lane.width, z(n.t), MISSED_COLOR, height, kind);
        continue;
      }
      const held = frame.heldNote(n.lane) === n.index;
      if (n.tailDone && !n.broken) continue;
      if (n.broken && n.endT < timeMs - MISSED_VISIBLE_MS) continue;
      if (!n.broken) this.laneStems[n.lane] ??= n.src;
      const headZ = held ? this.judgeZ : z(n.t);
      const tailZ = Math.max(-L, z(n.endT));
      if (headZ > tailZ) this.placeLong(lane, headZ, tailZ, z(n.endT), n.broken ? MISSED_COLOR : color, n.broken ? 'missed' : held ? 'held' : 'idle');
    }
    this.notePool.end();
    this.bodyPool.end();
    this.endPool.end();
  }

  /** A note's colour: its lane's, or for a STEM skin the colour of the instrument it follows. */
  private noteColor(n: Readonly<SessionNote>): number {
    if (this.style.note === 'stem' && n.src) return STEM_COLORS[n.src];
    return this.laneColors[n.lane];
  }

  private placeNote(x: number, laneWidth: number, z: number, color: number, height: number, kind: NoteKind): void {
    const mesh = this.notePool.next();
    mesh.material = this.noteMaterial(color, kind);
    // JEWEL's picture runs on below the note: its side
    const side = this.style.note === 'jewel' && !this.noteArt(kind) ? this.noteDepth * JEWEL_SIDE : 0;
    mesh.scale.set(laneWidth * 0.9, height, this.noteDepth + side);
    mesh.position.set(x, height / 2, z + side / 2);
  }

  /**
   * A long note is its body alone (a head or tail drawn like a tap note reads as one more note):
   * the body between its two ends, which close it with the style's outline.
   */
  private placeLong(lane: LaneGeom, headZ: number, tailZ: number, realTailZ: number, color: number, state: 'idle' | 'held' | 'missed'): void {
    const art = this.art.longBody;
    const width = lane.width * (art ? 0.8 : this.long.width);
    const end = art ? 0 : Math.min(this.long.endDepth * width, (headZ - tailZ) / 2);
    const body = this.bodyPool.next();
    body.material = this.bodyMaterial(color, state);
    const near = headZ - end;
    const far = tailZ + end;
    body.visible = near > far;
    body.scale.set(width, 1, Math.max(0.001, near - far));
    body.position.set(lane.x, 0.02, (near + far) / 2);
    this.setBodyUv(body, width * (art ? art.spec.tileAspect ?? 2 : this.long.tile), near, far, realTailZ);
    if (end <= 0) return;
    for (const [z, rotate] of [
      [headZ - end / 2, true],
      [tailZ + end / 2, false],
    ] as [number, boolean][]) {
      const cap = this.endPool.next();
      cap.material = this.endMaterial(color, state);
      cap.scale.set(width, 1, end);
      // the picture's top is the end's outer edge: the head's outer edge is toward the camera
      cap.rotation.y = rotate ? Math.PI : 0;
      cap.position.set(lane.x, 0.021, z);
    }
  }

  private noteArt(kind: NoteKind): ArtTexture | undefined {
    return this.art[kind] ?? this.art.note;
  }

  /** The body picture is pinned to the note's real tail, so it travels with the note (also while held). */
  private setBodyUv(mesh: THREE.Mesh, tile: number, nearZ: number, farZ: number, tailZ: number): void {
    const vNear = (nearZ - tailZ) / tile;
    const vFar = (farZ - tailZ) / tile;
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    // PlaneGeometry(1, 1) laid flat: vertices 0 and 1 are its far edge, 2 and 3 its near edge
    uv.setXY(0, 0, vFar);
    uv.setXY(1, 1, vFar);
    uv.setXY(2, 0, vNear);
    uv.setXY(3, 1, vNear);
    uv.needsUpdate = true;
  }

  private drawBars(frame: TrackFrame): void {
    const { scroll, timeMs } = frame;
    this.barPool.begin();
    if (this.barLines) {
      this.camera.updateMatrixWorld();
      for (const t of frame.barTimes) {
        if (t < timeMs - 300) continue;
        if (scroll.distance(t, timeMs) > scroll.travel) break;
        const z = scroll.z(t, timeMs);
        const bar = this.barPool.next();
        bar.scale.set(this.geometry.width, 1, barLineDepth(this.camera, z, this.cssHeight));
        bar.position.set(0, 0.012, z);
      }
    }
    this.barPool.end();
  }

  private drawBeams(frame: TrackFrame, dt: number): void {
    const decay = Math.exp(-dt / 70);
    const peak = this.reducedFlash ? 0.24 : 0.42;
    this.beams.forEach((beam, lane) => {
      const level = frame.keyDown(lane) ? peak : this.beamLevels[lane] * decay;
      this.beamLevels[lane] = level;
      const material = beam.material as THREE.MeshBasicMaterial;
      material.opacity = level;
      beam.visible = level > 0.01;
      if (this.style.beam === 'stem' && beam.visible) {
        const stem = this.laneStems[lane];
        material.color.setHex(stem ? STEM_COLORS[stem] : this.laneColors[lane]);
      }
    });
  }

  /** Key caps: lit while their key is down. */
  private drawCaps(frame: TrackFrame): void {
    this.caps.forEach((cap, lane) => {
      const down = frame.keyDown(lane);
      const stem = this.laneStems[lane];
      const color = this.style.cap === 'stem' && stem ? STEM_COLORS[stem] : this.laneColors[lane];
      cap.material = this.capMaterial(lane, down, color);
    });
  }

  /** While a long note is held, its lane shows the start of the hit effect (or the skin's hold sparks). */
  private drawHolds(frame: TrackFrame): void {
    const sparks = this.style.hit === 'flipbook' ? this.art.hitHold : undefined;
    this.holds.forEach((h, lane) => {
      const held = frame.heldNote(lane) !== null;
      h.mesh.visible = held;
      const core = this.holdCores[lane];
      if (core) core.mesh.visible = held;
      if (!held) return;
      const g = this.geometry.lanes[lane];
      const w = Math.min(g.width, 1.6);
      const dim = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
      const flash = this.reducedFlash ? this.artEffects.reducedFlashScale : 1;
      if (core) {
        const book = this.art.hitBurst?.spec.flipbook;
        if (book) {
          const [u, v] = flipbookOffset(book, HOLD_BURST_FRAME);
          core.texture.offset.set(u, v);
        }
        const size = w * 1.6 * FX_SCALE * flash;
        core.mesh.scale.set(size, 1, size * this.stretch);
        core.mesh.position.set(g.x, 0.029, this.judgeZ);
        core.material.color.setHex(this.laneColors[lane]);
        core.material.opacity = dim;
      }
      if (sparks?.spec.flipbook) {
        const book = sparks.spec.flipbook;
        // each lane starts at another frame, so neighbouring sparks do not move in step
        const n = Math.floor((frame.timeMs / 1000) * book.fps) + lane * 5;
        const [u, v] = flipbookOffset(book, ((n % book.frames) + book.frames) % book.frames);
        h.texture.offset.set(u, v);
        // the sparks rise up the track from the judge line
        const size = w * 2.4 * FX_SCALE * flash;
        const depth = size * this.stretch;
        const anchor = sparks.spec.anchorY ?? 0.15;
        h.mesh.scale.set(size, 1, depth);
        h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (anchor - 0.5));
        h.material.color.setHex(this.laneColors[lane]);
        h.material.opacity = dim;
        return;
      }
      const sheet = this.hitSheet;
      if (!sheet) {
        h.mesh.visible = false;
        return;
      }
      const [u, v] = sheetOffset(sheet, HOLD_FRAME);
      h.texture.offset.set(u, v);
      const pulse = this.reducedFlash ? 1 : 1 + 0.06 * Math.sin(frame.timeMs / 45);
      const across = sheet.size[0] * w * HOLD_SIZE * pulse;
      const depth = sheet.size[1] * w * HOLD_SIZE * pulse * this.stretch;
      h.mesh.scale.set(across, 1, depth);
      h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - sheet.centre));
      const stem = this.laneStems[lane];
      h.material.color.setHex(this.style.hit === 'stemflash' && stem ? STEM_COLORS[stem] : this.laneColors[lane]);
      h.material.opacity = 0.75 * dim;
    });
  }

  private drawHits(perfNow: number): void {
    for (const h of this.hits) if (h.mesh.visible) this.drawHit(h, perfNow);
  }

  /** A hit plays its frames once, lying on the track at the judge line; then its quad is free again. */
  private drawHit(h: EffectQuad, perfNow: number): void {
    const burst = this.style.hit === 'flipbook' ? this.art.hitBurst : undefined;
    const book = burst?.spec.flipbook;
    const frames = book?.frames ?? this.hitSheet?.frames ?? 16;
    const elapsed = perfNow - h.start;
    const frame = book ? (elapsed / 1000) * book.fps : (elapsed / EFFECT_MS) * frames;
    if (frame >= frames) {
      h.mesh.visible = false;
      return;
    }
    const g = this.geometry.lanes[h.lane];
    const w = Math.min(g.width, 1.6);
    const p = frame / frames;
    const dim = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
    if (book) {
      const [u, v] = flipbookOffset(book, frame);
      h.texture.offset.set(u, v);
      const size = w * 2.1 * FX_SCALE * (this.reducedFlash ? this.artEffects.reducedFlashScale : 1);
      h.mesh.scale.set(size, 1, size * this.stretch);
      h.mesh.position.set(g.x, 0.03, this.judgeZ);
      // the sheet fades by itself; its last frames fade out too, so the effect does not cut off
      h.material.opacity = dim * Math.min(1, (1 - p) / 0.3);
      return;
    }
    const sheet = this.hitSheet as EffectSheet;
    const [u, v] = sheetOffset(sheet, frame);
    h.texture.offset.set(u, v);
    const scale = this.reducedFlash ? 0.8 : 1;
    const across = sheet.size[0] * w * HIT_SIZE * scale;
    const depth = sheet.size[1] * w * HIT_SIZE * scale * this.stretch;
    h.mesh.scale.set(across, 1, depth);
    h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - sheet.centre));
    h.material.opacity = dim;
  }

  /**
   * A quad lying on the track that shows one frame of a sheet (its own copy of the texture).
   * `core`: how bright a flipbook's light must be to stay white (see lightMaterial).
   */
  private effectQuad(source: THREE.Texture, book: { cols: number; rows: number } | null, core: number): EffectQuad {
    const texture = this.own(source.clone());
    if (book) texture.repeat.set(1 / book.cols, 1 / book.rows);
    // code sheets are tint pictures; a flipbook texture is light on black
    const params: THREE.MeshBasicMaterialParameters = {
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    };
    const material = source === this.hitSheet?.texture ? tintMaterial(params) : lightMaterial(params, core);
    const mesh = new THREE.Mesh(this.flatGeometry, material);
    mesh.renderOrder = 10;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, texture, material, start: 0, lane: 0 };
  }

  private drawFever(frame: TrackFrame): void {
    const { active, multiplier, remaining } = frame.fever;
    const overlay = this.feverOverlay.material as THREE.MeshBasicMaterial;
    this.feverOverlay.visible = active;
    const tint = FEVER_COLORS[Math.min(5, Math.max(2, multiplier))] ?? FEVER_COLORS[2];
    if (active) {
      overlay.color.setHex(tint);
      const pulse = this.reducedFlash ? 0.5 : 0.5 + 0.5 * Math.sin(frame.timeMs / 110);
      // Fade out over the last fifth of the fever so its end is readable.
      overlay.opacity = (0.06 + 0.07 * pulse) * Math.min(1, remaining * 5);
    }
    for (const m of this.rails[0]) m.color.setHex(active ? tint : hex(this.skin.colors.railLeft));
    for (const m of this.rails[1]) m.color.setHex(active ? tint : hex(this.skin.colors.railRight));
    this.judgeGlowMaterial?.color.setHex(active ? tint : hex(this.skin.colors.judgeGlow));
  }

  private buildTrack(): void {
    const { width, length, lanes } = this.geometry;
    const base = new THREE.PlaneGeometry(width + 0.3, length + TRACK_TAIL, 1, 24).rotateX(-Math.PI / 2);
    base.translate(0, 0, (TRACK_TAIL - length) / 2);
    const pos = base.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    // near to far as the sheets' CSS gradient runs: in sRGB
    const near = new THREE.Color(hex(this.skin.colors.trackNear)).convertLinearToSRGB();
    const far = new THREE.Color(hex(this.skin.colors.trackFar)).convertLinearToSRGB();
    // a floor tile multiplies the track colours; its gain (sRGB, so ^2.2 on these linear colours) keeps their mean
    const floor = this.art.floor;
    const gain = floor ? Math.pow(floor.spec.gain ?? 1, 2.2) : 1;
    for (let i = 0; i < pos.count; i++) {
      const depth = Math.min(1, Math.max(0, -pos.getZ(i) / length));
      c.copy(near).lerp(far, depth).convertSRGBToLinear().multiplyScalar(gain);
      c.toArray(colors, i * 3);
    }
    base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (floor) {
      const tile = floor.spec.tile ?? 2.4;
      floor.texture.repeat.set((width + 0.3) / tile, (length + TRACK_TAIL) / tile);
    }
    const track = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ vertexColors: true, map: floor?.texture ?? null }));
    track.renderOrder = 0;
    this.scene.add(track);

    const strip = (x: number, w: number, color: number, opacity: number, order = 1) => {
      const mesh = this.flat(color, opacity, order);
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      mesh.position.set(x, 0.005, (TRACK_TAIL - length) / 2);
      return mesh.material as THREE.MeshBasicMaterial;
    };
    // the lane colour shows faintly under coloured lanes (white ones stay the track's)
    const t = this.style.track;
    lanes.forEach((lane) => {
      const tint = lane.kind === 'side' ? 0.1 : lane.kind === 'scratch' ? t.scratchTint ?? t.tint : lane.color === 'white' ? 0 : t.tint;
      if (tint > 0) strip(lane.x, lane.width, this.laneColors[lane.index], tint);
    });
    const pattern = (texture: THREE.Texture, tile: number, opacity: number) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(width / tile, (length + TRACK_TAIL) / tile);
      const mesh = new THREE.Mesh(this.flatGeometry, tintMaterial({ map: texture, color: 0xffffff, transparent: true, opacity, depthWrite: false }));
      mesh.scale.set(width, 1, length + TRACK_TAIL);
      mesh.position.set(0, 0.006, (TRACK_TAIL - length) / 2);
      mesh.renderOrder = 1.2;
      this.scene.add(mesh);
    };
    if (t.stripes) pattern(this.own(stripesTexture()), 22 * PX * 2.9, 1);
    if (t.facets) pattern(this.own(facetsTexture()), 45 * PX, 0.55);
    const divider = hex(this.skin.colors.divider);
    for (let i = 1; i < lanes.length; i++) {
      const sideEdge = lanes[i].kind === 'side' || lanes[i - 1].kind === 'side';
      strip(lanes[i].x - lanes[i].width / 2, sideEdge ? 0.05 : 0.025, divider, 0.9);
    }
    // crystal edges: a light line down the left of every lane
    if (t.edges) for (const lane of lanes) strip(lane.x - lane.width / 2 + PX, 2 * PX, 0xd6e2ff, 0.18, 1.1);
    this.buildWalls();
    this.buildRails();
  }

  private buildRails(): void {
    const { width, length } = this.geometry;
    const rails = this.art.rails;
    if (rails) {
      this.rails[0].push(this.railStrip(-width / 2 - 0.08, rails, hex(this.skin.colors.railLeft), false));
      this.rails[1].push(this.railStrip(width / 2 + 0.08, rails, hex(this.skin.colors.railRight), true));
      return;
    }
    const { width: railPx, glow: blur } = this.style.rails;
    const w = railPx * PX;
    const bevel = this.style.rails.bevel ? this.own(railBevelTexture()) : null;
    // the sheets' box-shadow: 0 0 <glow>px at 70 %
    const glow = blur ? this.own(railGlowTexture(railPx, blur, 0.7)) : null;
    for (const [side, colour] of [
      [-1, this.skin.colors.railLeft],
      [1, this.skin.colors.railRight],
    ] as [number, string][]) {
      const x = side * (width / 2 + w / 2);
      if (glow && blur) {
        const g = new THREE.Mesh(this.flatGeometry, tintMaterial({ map: glow, color: hex(colour), transparent: true, depthWrite: false }));
        g.scale.set((railPx + 2 * shadowReach(blur)) * PX, 1, length + TRACK_TAIL);
        g.position.set(x, 0.0055, (TRACK_TAIL - length) / 2);
        g.renderOrder = 0.95;
        this.scene.add(g);
        this.rails[side < 0 ? 0 : 1].push(g.material as THREE.MeshBasicMaterial);
      }
      const mesh = new THREE.Mesh(
        this.flatGeometry,
        bevel
          ? tintMaterial({ map: bevel, color: hex(colour), transparent: true, depthWrite: false })
          : new THREE.MeshBasicMaterial({ color: hex(colour), transparent: true, opacity: 0.95, depthWrite: false }),
      );
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      // a bevel is lit on its inner face: the right rail is the left one mirrored
      if (side > 0 && bevel) mesh.rotation.y = Math.PI;
      mesh.position.set(x, 0.006, (TRACK_TAIL - length) / 2);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.rails[side < 0 ? 0 : 1].push(mesh.material as THREE.MeshBasicMaterial);
    }
  }

  /** Walls outside the rails (ARCADE's gunmetal frame, STREET's dark walls with a yellow edge). */
  private buildWalls(): void {
    const frame = this.style.frame;
    if (!frame) return;
    const { width, length } = this.geometry;
    const [from, to] = frame === 'gunmetal' ? [6, 50] : [6, 28];
    const texture = this.own(
      frame === 'gunmetal'
        ? gradientTexture(
            [
              [0, '#161a22'],
              [0.35, '#2b313d'],
              [0.5, '#4a5263'],
              [0.65, '#2b313d'],
              [1, '#161a22'],
            ],
            false,
            { colour: '#0b0d12', width: 3, side: 'all' },
          )
        : gradientTexture([[0, '#101014'], [1, '#101014']], false, { colour: '#ffd23f', width: Math.round((4 / 22) * 64), side: 'inner' }),
    );
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ map: texture }));
      mesh.scale.set((to - from) * PX, 1, length + TRACK_TAIL);
      // the picture's right edge faces the track on the left wall; the right wall is it mirrored
      if (side > 0) mesh.rotation.y = Math.PI;
      mesh.position.set(side * (width / 2 + ((from + to) / 2) * PX), 0.004, (TRACK_TAIL - length) / 2);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
    }
  }

  /** A rail texture repeating along the track; light on black, so it is added. The right rail is mirrored. */
  private railStrip(x: number, art: ArtTexture, color: number, mirror: boolean): THREE.MeshBasicMaterial {
    const { length } = this.geometry;
    const w = art.spec.width ?? 0.26;
    const map = mirror ? this.own(art.texture.clone()) : art.texture;
    map.repeat.set(mirror ? -1 : 1, (length + TRACK_TAIL) / (w * (art.spec.tileAspect ?? 12)));
    map.offset.x = mirror ? 1 : 0;
    const mesh = this.flat(color, 1, 1, { additive: true });
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map = map;
    mesh.scale.set(w, 1, length + TRACK_TAIL);
    mesh.position.set(x, 0.006, (TRACK_TAIL - length) / 2);
    return material;
  }

  private buildJudgementLine(): THREE.MeshBasicMaterial | null {
    const { width } = this.geometry;
    // Transparent so it sorts after the covers (renderOrder) and stays on top of them. A texture is light on
    // black with its own glow, so it is added.
    const art = this.art.judgeLine;
    const line = new THREE.Mesh(
      this.flatGeometry,
      new THREE.MeshBasicMaterial({
        color: hex(this.skin.colors.judgeLine),
        transparent: true,
        depthWrite: false,
        ...(art && { map: art.texture, blending: THREE.AdditiveBlending }),
      }),
    );
    const j = this.style.judge;
    line.scale.set(width + 12 * PX, 1, art ? (art.spec.depth ?? 0.5) : j.height * PX);
    line.position.set(0, 0.06, 0);
    line.renderOrder = 9.5;
    this.judgeGroup.add(line);
    // a second line under it (toward the camera) or over it
    for (const [colour, dz] of [
      [j.under, 9],
      [j.over, -9],
    ] as [string | undefined, number][]) {
      if (!colour) continue;
      const extra = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ color: hex(colour), transparent: true, depthWrite: false }));
      extra.scale.set(width + 12 * PX, 1, 5 * PX);
      extra.position.set(0, 0.06, dz * PX);
      extra.renderOrder = 9.5;
      this.judgeGroup.add(extra);
    }
    this.scene.add(this.judgeGroup);
    if (!art) {
      if (!j.glow) return null;
      // the sheets' box-shadow: 0 0 16px at 80 %, under the line
      const lineWidth = width / PX + 12;
      const glow = new THREE.Mesh(
        this.flatGeometry,
        tintMaterial({
          map: this.own(judgeGlowTexture(lineWidth, j.height, 16, 0.8)),
          color: hex(this.skin.colors.judgeGlow),
          transparent: true,
          opacity: this.reducedFlash ? 0.6 : 1,
          depthWrite: false,
          fog: false,
        }),
      );
      glow.scale.set((lineWidth + 2 * shadowReach(16)) * PX, 1, (j.height + 2 * shadowReach(16)) * PX);
      glow.position.set(0, 0.058, 0);
      glow.renderOrder = 9.45;
      this.judgeGroup.add(glow);
      return glow.material as THREE.MeshBasicMaterial;
    }
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      color: hex(this.skin.colors.judgeGlow),
      transparent: true,
      opacity: this.reducedFlash ? 0.35 : 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(this.flatGeometry, glowMaterial);
    glow.scale.set(width + 1.2, 1, 1.4);
    glow.position.set(0, 0.065, 0);
    glow.renderOrder = 9.6;
    this.judgeGroup.add(glow);
    return glowMaterial;
  }

  private buildBeams(): void {
    const style = this.style.beam;
    const texture = this.art.keyBeam?.texture ?? this.own(style === 'neon' ? neonBeamTexture() : linearFadeTexture());
    const tinted = !this.art.keyBeam && style === 'neon';
    this.geometry.lanes.forEach((lane) => {
      const params: THREE.MeshBasicMaterialParameters = {
        map: texture,
        color: style === 'white' ? 0xffffff : this.laneColors[lane.index],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      };
      const beam = new THREE.Mesh(this.flatGeometry, tinted ? tintMaterial(params) : new THREE.MeshBasicMaterial(params));
      beam.scale.set(lane.width * 0.96, 1, BEAM_LENGTH);
      beam.position.set(lane.x, 0.04, -BEAM_LENGTH / 2);
      // under the notes, as the sheets draw it: a pressed lane never washes its notes out
      beam.renderOrder = 2.5;
      beam.visible = false;
      this.scene.add(beam);
      this.beams.push(beam);
      this.beamLevels.push(0);
      this.laneStems.push(undefined);
      // what a held long note shows: the skin's hold sparks, or the start of its hit effect
      const hold = this.style.hit === 'flipbook' ? this.art.hitHold : undefined;
      const source = hold?.texture ?? this.hitSheet?.texture;
      if (source) this.holds.push(this.effectQuad(source, hold ? hold.spec.flipbook ?? null : this.hitSheet, 0.7));
      const burst = this.art.hitBurst;
      if (hold?.spec.flipbook && burst?.spec.flipbook) this.holdCores.push(this.effectQuad(burst.texture, burst.spec.flipbook, 0.8));
    });
  }

  /** The deck under the judge line, with a key cap per lane. */
  private buildDeck(): THREE.Mesh {
    const deckColour = this.style.frame === 'gunmetal' ? 0xffffff : hex(this.skin.colors.trackFar);
    const material = new THREE.MeshBasicMaterial({ color: deckColour, fog: false });
    if (this.style.frame === 'gunmetal') {
      material.map = this.own(
        gradientTexture(
          [
            [0, '#2b313d'],
            [0.4, '#161a22'],
            [1, '#161a22'],
          ],
          true,
          { colour: '#6b7385', width: 3, side: 'top' },
        ),
      );
    } else {
      // the track's far colour, 70 % of it in sRGB
      material.color.convertLinearToSRGB().multiplyScalar(0.7).convertSRGBToLinear();
    }
    const deck = new THREE.Mesh(this.flatGeometry, material);
    deck.renderOrder = 9.05;
    this.scene.add(deck);
    for (let i = 0; i < this.geometry.lanes.length; i++) {
      const cap = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial());
      cap.renderOrder = 9.1;
      this.scene.add(cap);
      this.caps.push(cap);
    }
    return deck;
  }

  /** Puts the deck and the caps under the judge line, sized to what the camera shows below it. */
  private layoutDeck(): void {
    if (!this.deck) return;
    const { width, lanes } = this.geometry;
    const top = this.judgeZ + (this.style.judge.height / 2 + 3) * PX;
    const bottom = Math.max(this.screenBottomZ(), top + 0.4);
    this.deck.scale.set(width, 1, bottom - top + 2);
    this.deck.position.set(0, 0.07, top + (bottom - top + 2) / 2);
    const depth = Math.min(44 * PX, Math.max(30 * PX, (bottom - top) * 0.36));
    if (Math.abs(depth - this.capDepth) > 1e-3) {
      // the cap pictures follow the caps' proportions
      this.capDepth = depth;
      this.capTextures.forEach((t) => t.dispose());
      this.capTextures.clear();
      this.capMaterials.forEach((m) => m.dispose());
      this.capMaterials.clear();
    }
    this.deckRoom = bottom - top;
    this.planeVersion++;
    const capTop = top + 8 * PX;
    this.caps.forEach((cap, i) => {
      cap.scale.set(lanes[i].width * 0.86, 1, depth);
      cap.position.set(lanes[i].x, 0.075, capTop + depth / 2);
    });
    // effects lying on the track are drawn longer where the camera flattens it
    this.stretch = Math.min(2.6, Math.max(1, EFFECT_ASPECT / this.trackAspect(this.judgeZ)));
  }

  /** How tall a small square lying on the track at `z` looks for its width on the screen. */
  private trackAspect(z: number): number {
    this.camera.updateMatrixWorld();
    const a = new THREE.Vector3(-0.25, 0, z).project(this.camera);
    const b = new THREE.Vector3(0.25, 0, z).project(this.camera);
    const c = new THREE.Vector3(0, 0, z - 0.25).project(this.camera);
    const d = new THREE.Vector3(0, 0, z + 0.25).project(this.camera);
    const across = Math.abs(b.x - a.x) * this.cssWidth;
    const along = Math.abs(d.y - c.y) * this.cssHeight;
    return across > 1e-6 ? along / across : 1;
  }

  /** Where the bottom edge of the screen meets the track (z), without the chart's camera effects. */
  private screenBottomZ(): number {
    this.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, -1), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? Math.min(hit.z, TRACK_TAIL) : TRACK_TAIL;
  }

  private capMaterial(lane: number, down: boolean, color: number): THREE.MeshBasicMaterial {
    const g = this.geometry.lanes[lane];
    const kind: CapKind = g.kind === 'scratch' ? 'scratch' : g.color === 'white' ? 'white' : 'other';
    const paint = CAP_PAINT[this.style.cap];
    const tint = down ? (paint.neutralDown?.(kind) ? 0xffffff : color) : paint.idleColor ?? color;
    const key = `${kind}:${down}:${tint}:${g.kind}`;
    let m = this.capMaterials.get(key);
    if (!m) {
      const texKey = `${kind}:${down}:${g.kind}`;
      let texture = this.capTextures.get(texKey);
      if (!texture) {
        const h = 88;
        const w = Math.round(Math.min(512, Math.max(32, (h * (g.width * 0.86)) / this.capDepth)));
        texture = paintTexture(w, h, (down ? paint.down : paint.idle)(kind));
        this.capTextures.set(texKey, texture);
      }
      m = tintMaterial({ map: texture, color: tint, transparent: true, depthWrite: false, fog: false }, { base: paint.base });
      this.capMaterials.set(key, m);
    }
    return m;
  }

  /** A flat (XZ) quad added to the scene. */
  private flat(color: number, opacity: number, order: number, o: { additive?: boolean; fog?: boolean } = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.flatGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: o.fog ?? true,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    mesh.renderOrder = order;
    this.scene.add(mesh);
    return mesh;
  }

  /** Stretch a flat cover quad between two z values. */
  private span(mesh: THREE.Mesh, zFrom: number, zTo: number, visible: boolean): void {
    mesh.visible = visible && zTo > zFrom;
    mesh.scale.z = Math.max(0.001, zTo - zFrom);
    mesh.position.set(0, COVER_Y, (zFrom + zTo) / 2);
  }

  /** The note picture of a lane kind, drawn for its notes' proportions. */
  private noteTexture(kind: NoteKind): THREE.Texture {
    let texture = this.noteTextures.get(kind);
    if (!texture) {
      const lane = this.geometry.lanes.find((l) => NOTE_KIND[l.kind] === kind) ?? this.geometry.lanes[0];
      const jewel = this.style.note === 'jewel';
      // JEWEL's cut was drawn 4:1 and stretched over the note (its corners stay small), its side below it; the rest keep the note's proportions
      const h = Math.round(NOTE_PICTURE_PX * (jewel ? 1 + JEWEL_SIDE : 1));
      const w = jewel ? NOTE_PICTURE_PX * 4 : Math.round(Math.min(512, Math.max(32, (h * lane.width * 0.9) / this.noteDepth)));
      const scratch = jewel && kind === 'scratch';
      texture = this.own(paintTexture(w, h, scratch ? (g, pw, ph) => jewelNote(g, pw, ph, true) : NOTE_PAINT[this.style.note]));
      this.noteTextures.set(kind, texture);
    }
    return texture;
  }

  private noteMaterial(color: number, kind: NoteKind): THREE.MeshBasicMaterial {
    const key = `${kind}:${color}`;
    let m = this.noteMaterials.get(key);
    if (!m) {
      const art = this.noteArt(kind);
      // a texture's alpha is the note's outline; a drawn picture's too
      m = art
        ? new THREE.MeshBasicMaterial({ color, vertexColors: true, clippingPlanes: this.clipPlanes, map: art.texture, transparent: true, alphaTest: 0.05 })
        : tintMaterial({ color, vertexColors: true, clippingPlanes: this.clipPlanes, map: this.noteTexture(kind), transparent: true, alphaTest: 0.02 });
      this.noteMaterials.set(key, m);
    }
    return m;
  }

  /** Filtering, wrapping and flipbook frame size, set before the textures are first uploaded. */
  private prepareArt(): void {
    // one mip level per lookup, not two: half the texture reads, which a software renderer (SwiftShader) feels
    for (const a of Object.values(this.art)) a.texture.minFilter = THREE.LinearMipmapNearestFilter;
    const { longBody, rails, floor } = this.art;
    if (longBody) longBody.texture.wrapT = THREE.RepeatWrapping;
    if (rails) rails.texture.wrapT = THREE.RepeatWrapping;
    if (floor) floor.texture.wrapS = floor.texture.wrapT = THREE.RepeatWrapping;
    for (const slot of ['hitBurst', 'hitHold'] as const) {
      const art = this.art[slot];
      if (art?.spec.flipbook) art.texture.repeat.set(1 / art.spec.flipbook.cols, 1 / art.spec.flipbook.rows);
      else delete this.art[slot];
    }
  }

  private own<T extends THREE.Texture>(texture: T): T {
    this.ownedTextures.push(texture);
    return texture;
  }

  private bodyMaterial(color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${color}:${state}`;
    let m = this.bodyMaterials.get(key);
    if (!m) {
      const art = this.art.longBody?.texture;
      const params: THREE.MeshBasicMaterialParameters = {
        color: art ? brightened(color, HOLD_BRIGHTNESS[state]) : color,
        map: art ?? this.longBody,
        transparent: true,
        opacity: HOLD_OPACITY[state],
        depthWrite: false,
        clippingPlanes: this.clipPlanes,
      };
      m = art ? new THREE.MeshBasicMaterial(params) : tintMaterial(params, { gain: HOLD_BRIGHTNESS[state] });
      this.bodyMaterials.set(key, m);
    }
    return m;
  }

  private endMaterial(color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${color}:${state}`;
    let m = this.endMaterials.get(key);
    if (!m) {
      m = tintMaterial(
        { color, map: this.longEnd, transparent: true, opacity: HOLD_OPACITY[state], depthWrite: false, clippingPlanes: this.clipPlanes },
        { gain: HOLD_BRIGHTNESS[state] },
      );
      this.endMaterials.set(key, m);
    }
    return m;
  }
}

/** `color` scaled by `k` in sRGB (CSS `filter: brightness(k)`). */
function brightened(color: number, k: number): THREE.Color {
  const c = new THREE.Color(color).convertLinearToSRGB();
  return new THREE.Color().setRGB(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k), THREE.SRGBColorSpace);
}

function isGone(n: Readonly<SessionNote>, timeMs: number): boolean {
  return n.headDone && n.tailDone && n.endT < timeMs - MISSED_VISIBLE_MS - 100;
}

/**
 * Unit-sized note shape (scaled per lane). A skin drawn in code lays its note picture on the
 * track, as the sheets draw it ('picture'). The textures and shapes of user skins get a box, a
 * thin plate or a rounded capsule, shaded by vertex colour as a lit block (see NOTE_LIGHT): the
 * top brightens toward its near edge, where a box catches a highlight, and the walls darken toward
 * the track. The note picture (drawn as seen from above) is projected straight down onto it; walls
 * take it a little inside its edge.
 */
function createNoteGeometry(shape: Skin['noteShape'] | 'picture'): THREE.BufferGeometry {
  if (shape === 'picture') {
    // just above the track (the mesh is lifted half its height)
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, -0.45, 0);
    plane.setAttribute('color', new THREE.BufferAttribute(new Float32Array(plane.getAttribute('position').count * 3).fill(1), 3));
    return plane;
  }
  let geometry: THREE.BufferGeometry;
  if (shape === 'round') {
    // capsule lying across the lane, normalised to a 1×1×1 box
    geometry = new THREE.CapsuleGeometry(0.5, 1, 6, 16).rotateZ(Math.PI / 2).scale(0.5, 1, 1);
  } else if (shape === 'flat') {
    // rows along the depth carry the top's shading toward its near edge
    geometry = new THREE.BoxGeometry(1, 0.35, 1, 1, 1, 8).translate(0, -0.325, 0);
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 8);
  }
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const normals = geometry.getAttribute('normal');
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(normals.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    n.fromBufferAttribute(normals, i);
    let shade = NOTE_AMBIENT + (1 - NOTE_AMBIENT) * Math.max(0, n.dot(NOTE_LIGHT));
    if (n.y > 0.5) {
      const near = (pos.getZ(i) - min.z) / (max.z - min.z); // 0 far … 1 near
      shade *= 1 - NOTE_TOP_FALLOFF * (1 - near);
      if (shape !== 'round' && near > 1 - 1e-6) shade += NOTE_RIM;
    } else if (n.y > -0.5) {
      shade *= 1 - NOTE_WALL_FALLOFF * (1 - (pos.getY(i) - min.y) / (max.y - min.y)); // darker where the wall meets the track
    }
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5 + pos.getX(i) * (1 - 2 * WALL_INSET * Math.abs(normals.getX(i)));
    uv[i * 2 + 1] = 0.5 - pos.getZ(i) * (1 - 2 * WALL_INSET * Math.abs(normals.getZ(i)));
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function radialTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Fades from opaque at the judgement line to transparent at the far end (canvas top maps to -z). */
function linearFadeTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Reuses meshes frame to frame; `end()` hides whatever was not used this frame. */
class MeshPool {
  private readonly meshes: THREE.Mesh[] = [];
  private used = 0;
  private readonly scene: THREE.Scene;
  private readonly factory: () => THREE.Mesh;

  constructor(scene: THREE.Scene, factory: () => THREE.Mesh) {
    this.scene = scene;
    this.factory = factory;
  }

  begin(): void {
    this.used = 0;
  }

  next(): THREE.Mesh {
    if (this.used === this.meshes.length) {
      const mesh = this.factory();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    const mesh = this.meshes[this.used++];
    mesh.visible = true;
    return mesh;
  }

  end(): void {
    for (let i = this.used; i < this.meshes.length; i++) this.meshes[i].visible = false;
  }
}
