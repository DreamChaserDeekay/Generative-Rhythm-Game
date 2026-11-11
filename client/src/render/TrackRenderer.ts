import * as THREE from 'three';
import type { CameraPreset, KeyModeConfig } from '../engine/config';
import type { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import type { CameraPoseFx } from './cameraFx';
import { DECK_PICTURE_STRETCH, deckFromPicture, deckKeys, deckReadouts, GEAR_JUDGE, judgeOf, paintLitKey, type DeckReadouts, type DeckMark, paintBorder, paintFace, type DeckSpec, type KeyKind, paintPressedKey, type DeckKey, type SideLook } from './deckArt';
import {
  cameraPose,
  computeTrackGeometry,
  fogStartZ,
  JUDGE_LINE_Y,
  noteSpan,
  type CameraPose,
  type LaneGeom,
  type NoteSpan,
  type SideNotes,
  type TrackGeometry,
} from './layout';
import { FEVER_COLORS } from './palette';
import { disposeSkinArt, flipbookOffset, type MediaEffects, type SkinArt } from './skinArt';
import { hex, laneColorsFor, type Skin, type SkinStyle } from './skins';
import { beatClock, DECK_PICTURE_PX, GEAR_LIGHTS, GearLightLayer, type BeatClock } from './gearLights';
import { artPartsOf, borderLookOf, gearArtOf, HIT_SLOTS, isArtHit, longPaintOf, notePaintOf, noteShapeOf, noteWidthOf, platePaintOf, sideTapPaintOf, type StyleImages } from './styleArt';
import {
  DOTS_ACROSS,
  DOTS_LONG,
  dotsNote,
  effectSheet,
  gradientTexture,
  judgeGlowTexture,
  lightMaterial,
  laneDepthOf,
  noteDepthOf,
  paintTexture,
  shadowReach,
  sheetOffset,
  SIDE_FLASH_LINE,
  SIDE_PICTURES,
  sideDotsBody,
  sideDotsEnd,
  sideDotsTap,
  tintMaterial,
  type EffectSheet,
  type HitStyle,
  type LongPaint,
  type NoteMark,
  type NotePaint,
  type Paint,
  type SidePart,
} from './tintArt';

const MISSED_COLOR = 0x4a5068;
const WHITE = new THREE.Color(0xffffff);
/** How far toward white a lane's colour goes on an effect sheet in colours of its own (see tinge). */
const PLAIN_WHITE = 0.7;
/** Long notes: a held one is lit like the sheets' `filter: brightness(1.22)`, a broken one dim. */
const HOLD_BRIGHTNESS = { idle: 1, held: 1.22, missed: 1 } as const;
const HOLD_OPACITY = { idle: 1, held: 1, missed: 0.4 } as const;
/**
 * How far the track (and the deck on it) extends below the judgement line, toward the camera: a
 * far, low camera (the plane one) shows a long way down it.
 */
const TRACK_TAIL = 16;
/** A border's picture (a gear frame's tile) is painted BORDER_SCALE canvas px to a plane px. */
const BORDER_SCALE = 4;

/**
 * One of the track's borders in the gear's `look`, `railPx` wide: a tile `tilePx` long repeating down
 * it, mirrored at every other so that a grain runs on without a seam (mipmapped: far up the track it
 * is a px or two); `lit`, as it looks in FEVER.
 */
function borderTexture(look: SideLook, railPx: number, tilePx: number, side: -1 | 1, lit = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(railPx * BORDER_SCALE));
  canvas.height = Math.max(2, Math.round(tilePx * BORDER_SCALE));
  paintBorder(canvas.getContext('2d') as CanvasRenderingContext2D, canvas.width, canvas.height, look, side, BORDER_SCALE, lit);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
const NOTE_HEIGHT = 0.2;
/** A bar note is this deep on the track (the coin and the stars as deep as keeps their shape: fitNoteDepth). */
const NOTE_DEPTH = 0.7;
const SIDE_NOTE_HEIGHT = 0.12;
const BEAM_LENGTH = 10;
const MISSED_VISIBLE_MS = 400;
const EFFECT_MS = 240;
/** A note's picture lies this share of the note's height over the track. */
const PICTURE_LIFT = 0.05;
/**
 * A note drawn as a picture is a solid slab (slabGeometry): this share of its height thick under its
 * picture (a long note's body and ends, scaled 1 high, SLAB_LONG thick), its walls drawn by
 * SLAB_SLICES copies of the picture.
 */
const SLAB_DEPTH = 0.45;
const SLAB_LONG = 0.09;
const SLAB_SLICES = 7;
/**
 * A slab's walls: how bright just under its top edge (catching the light) and at its foot, how much
 * lighter on the side the light comes from (the left) and darker on the other, and the share of a
 * tap's picture, from its near edge, they take (from in front their far part never shows).
 */
const WALL_TOP = 0.74;
const WALL_FOOT = 0.3;
const WALL_LIT = 0.16;
const WALL_CROP = 0.55;
/** Where a key note's picture lies over the track. */
export const NOTE_Y = NOTE_HEIGHT * PICTURE_LIFT;
/**
 * The judge line and its halo lie on the notes, a hair over them so they draw over them: a tap's
 * middle meets the line's at its time, in every camera. The covers lie over the notes; the opaque
 * deck over what runs on under it (notes, bar lines, long notes and their ends) about as far over
 * the line as ever, so its edge keeps its place under the line; its lights on it.
 */
export const LINE_Y = NOTE_Y + 0.001;
const COVER_Y = 0.016;
const DECK_Y = 0.022;
/** The px of a deck key's shade when held down (deckArt.paintPressedKey), across and along. */
const PRESS_KEY_PX = [64, 256] as const;
/** The px of a cut cap's picture when lit (deckArt.paintLitKey: CRYSTAL's), square. */
const LIT_GEM_PX = 192;
/** How fast a deck key held down comes back up once its lane's key is let go (ms to fall to 1/e). */
export const KEY_RISE_MS = 40;

/** How far down a deck key is (1 all the way, 0 up): all the way at once while `held`, coming back up over KEY_RISE_MS once let go. */
export function pressLevel(level: number, held: boolean, dt: number): number {
  return held ? 1 : level * Math.exp(-dt / KEY_RISE_MS);
}
/** How long the band of light running down a picked gear's frames is, a share of the frame (sweepBorders). */
const SWEEP_SHARE = 0.16;
/**
 * The hot spots running along a picked gear's judge line (shimmerJudge): how long each is (world
 * units), how many seconds it takes to cross, which way it runs, how bright its middle gets and
 * where in its run it starts.
 */
const SHINES = [
  { length: 2.4, period: 2.6, dir: 1, peak: 0.75, phase: 0 },
  { length: 1.6, period: 3.7, dir: -1, peak: 0.5, phase: 0.45 },
] as const;
/** Clip-plane constant that keeps everything (plane effectively disabled). */
const FAR_AWAY = 1e4;
/**
 * Bar lines keep about this thickness on screen (CSS px) all the way up the track (a fixed depth
 * on the track thinned to nothing in the distance), at this opacity of the track's bar colour.
 */
export const BAR_LINE_PX = 4;
const BAR_LINE_OPACITY = 0.95;
/** Track units per px of the approved sheets (73.65 px to a unit at the judge line). */
const PX = 1 / 73.65;
/** Hits and holds are drawn this much larger than lane-sized (1.2 times the first sheets). */
const FX_SCALE = 1.2;
const HIT_SIZE = 1.5 * FX_SCALE;
const HOLD_SIZE = 1.1 * FX_SCALE;
/** A flipbook burst, the burst glowing under a held note's sparks, and the sparks: their size in lanes (before FX_SCALE). */
const BURST_SIZE = 2.1;
const CORE_SIZE = 1.6;
const SPARKS_SIZE = 2.4;
/** Small hit effects (설정 → 타격 효과 크기 → 작게) keep within about this many lanes across. */
const SMALL_HIT_LANES = 1.2;
/** Large ones (크게) are drawn this many times the usual size, still cut at the rails. */
const LARGE_HIT = 1.4;
/** The lane colour mixed into the track under coloured lanes (white keys apart), and under side lanes of their own. */
const LANE_TINT = 0.07;
const SIDE_TINT = 0.1;
/** The FEVER tint over the track: steady, faint enough to keep the lane colours. */
const FEVER_TINT = 0.09;
/** An effect lying on the track is drawn longer along it until it looks at least this tall for its width. */
const EFFECT_ASPECT = 0.7;
/** The frame of a code effect shown while a long note is held (its early, bright part). */
const HOLD_FRAME = 2;
/** The frame of a flipbook burst that glows under a held long note's sparks (its late, small part). */
const HOLD_BURST_FRAME = 13;
/**
 * While a long note is held its glow breathes (BREATHE larger and smaller, BREATHE_HZ times a second)
 * and kicks up at each tick of its combo (holdTick: TICK_KICK larger at once, gone over about
 * TICK_FADE_MS), and at most every TICK_GAP_MS a small burst (TICK_SIZE of a hit's, TICK_GAIN as
 * bright) plays on it.
 */
const BREATHE = 0.05;
const BREATHE_HZ = 5;
const TICK_KICK = 0.25;
const TICK_FADE_MS = 90;
const TICK_GAP_MS = 180;
const TICK_SIZE = 0.72;
const TICK_GAIN = 0.55;
/**
 * The light flowing down a held long note into the judge line (drawFlows): how far up the note it
 * reaches, how fast it runs (track units a second), how long one run of its picture is, and its
 * share of the note's width.
 */
const FLOW_REACH = 7;
const FLOW_SPEED = 12;
const FLOW_TILE = 3.2;
const FLOW_WIDTH = 0.8;
/** Rows of a flow's quad along the note: its light fades out toward its far end (vertex alpha). */
const FLOW_ROWS = 8;
/** Note pictures are drawn this many px deep. */
const NOTE_PICTURE_PX = 96;
/** The coin's and the stars' depth moves in steps this deep (track units), see fitNoteDepth. */
const NOTE_DEPTH_STEP = 0.05;
/** A fitted preview keeps the far end of the track no higher than this share of the height. */
export const FIT_TRACK_END_Y = 0.06;
/** Picture px per plane px of the deck under the judge line. */
const DECK_PICTURE = 2;
/**
 * The deck's picture is painted for the room under the judge line in steps of this many plane px,
 * and painted again only once the layout has held for this many frames: painting and uploading it
 * takes a frame, and a box that keeps changing size (the settings' preview beside its help) would
 * take one every time. Until then the picture it has is stretched to the new room.
 */
const DECK_STEP = 16;
const DECK_SETTLE_FRAMES = 20;
/** Round things on the deck are drawn up to this much longer along the track than across it (see deckStretch). */
const MAX_DECK_STRETCH = 3.5;
/** The most the perspective cameras flatten the deck (about 1.3; the plane camera flattens it far more). */
const PERSPECTIVE_STRETCH = 1.3;
/** The deck's stretch is the camera's flattening at the middle of a band this many plane px under the deck's top (see deckStretch). */
const STRETCH_TOP = 8;
/**
 * Side lanes laid over the keys (반쪽 덮기): their notes are bars across this share of their half
 * (the two halves' bars stay apart, and off the rails), lying under the key notes. A side tap
 * reaches SIDE_EDGE past the far and near edges of a key tap at its time, so its bright edges show
 * above and below a chord of key notes over it; their long notes' head and end are bands this deep
 * (track units), within that reach.
 */
const SIDE_SPAN = 0.96;
const SIDE_EDGE = 0.18;
const SIDE_END = 0.16;
const SIDE_Y = 0.009;
/** Their key beam lights the whole half: this share of a key's, so the keys' notes in it stay clear. */
const SIDE_BEAM = 0.25;
/**
 * Their hits and holds: a flash across the half on the judge line, with light rising a short way
 * up it, this deep (track units, before the effects' stretch); 작게 makes it this much shallower
 * and 크게 LARGE_HIT times deeper (as wide as the half still: that is the side lane).
 */
const SIDE_FLASH = 2.0;
const SMALL_SIDE_FLASH = 0.6;
interface DeckLayout {
  /** The room the picture is painted for and all of the deck (track units), and how much longer along the track round things on it are drawn. */
  room: number;
  depth: number;
  stretch: number;
}

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
  /** Where the track ends up it (plane y). */
  far: number;
  /** The readouts the gear's deck houses: their windows, plane px (x from the track's middle, y from the judge line toward the camera); null where it houses none. */
  deck: DeckReadouts | null;
}

/**
 * The homography of the HUD's plane (HUD_UNIT plane px to a track unit, from the middle of the judge
 * line at `lineZ`) as `camera` (its matrices up to date) shows it on a `width`×`height` screen.
 */
export function planeHomography(camera: THREE.Camera, width: number, height: number, lineZ: number): number[] {
  const view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const [W, H] = [width / 2, height / 2];
  // clip space of one plane px across, one toward the camera, and the origin; then screen px
  const [a, b, c] = [
    [PX, 0, 0, 0],
    [0, 0, PX, 0],
    [0, 0, lineZ, 1],
  ].map(([x, y, z, w]) => {
    const v = new THREE.Vector4(x, y, z, w).applyMatrix4(view);
    return [W * (v.x + v.w), H * (v.w - v.y), v.w];
  });
  return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
}

export interface CoverLayout {
  sudden: number;
  hidden: number;
  lift: number;
}

/** How large hit and hold effects are drawn: larger than usual, the usual size, small (about a lane), or none. */
export type HitEffectSize = 'large' | 'normal' | 'small' | 'off';

export interface TrackRendererOptions {
  mode: KeyModeConfig;
  camera: CameraPreset;
  trackWidth: number;
  trackLength: number;
  reducedFlash: boolean;
  covers: CoverLayout;
  skin: Skin;
  /** The parts' pictures and the hit's flipbooks (loadSkinArt); the renderer owns and disposes them. Parts left out are drawn in code. */
  art?: SkinArt | null;
  /** A line across the track at every bar (default on). */
  barLines?: boolean;
  /** Key beams' length as a share of BEAM_LENGTH (default 1, 0 = none). */
  keyBeamLength?: number;
  /** Hit and hold effects larger than the usual size, at it (default), about a lane wide, or none. */
  hitEffectSize?: HitEffectSize;
  /** Side notes in lanes of their own at the edges (default), or as bars over half the key lanes (DJMAX's side tracks). */
  sideNotes?: SideNotes;
  /** Every lane's colour (the settings' note colours); without it, the track's (laneColorsFor). */
  laneColors?: readonly number[];
  /**
   * A preview's framing: the field of view is set so the judge line spans this share of the
   * canvas width, whatever its shape (play keeps the camera preset's own). Either way the view
   * is moved up or down until the judge line sits at JUDGE_LINE_Y of the height.
   */
  fitWidth?: number;
}

/** What a lane's notes are drawn as: the scratch's, a side lane's, or a key's by its colour (the families mark it). */
function noteKindOf(lane: Pick<LaneGeom, 'kind' | 'color'>): NoteMark {
  if (lane.kind !== 'key') return lane.kind;
  return lane.color === 'blue' || lane.color === 'gold' ? lane.color : 'white';
}

/** An effect lying on the track: a hit (played once) or the sparks of a held long note. */
interface EffectQuad {
  mesh: THREE.Mesh;
  /** Own copy of the sheet (sharing its image), so each quad shows its own frame. */
  texture: THREE.Texture;
  material: THREE.MeshBasicMaterial;
  start: number;
  lane: number;
  /** A burst's size and brightness, shares of a hit's (a held note's tick plays a smaller, fainter one). */
  size: number;
  gain: number;
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

/**
 * The plane preset's camera. Its rays are parallel, so the rails stay parallel on the screen and
 * the notes keep one speed all the way down the track. It takes a field of view and an aspect as
 * the perspective cameras do (the framing, a chart's zoom, a preview's fit and a resize set them
 * alike, then updateProjectionMatrix) and shows as much as a perspective camera with that field
 * of view would `depth` away, at its target.
 */
export class PlaneCamera extends THREE.OrthographicCamera {
  private lens: { fov: number; aspect: number; depth: number };

  /** Without arguments (as clone() makes one) a whole view too, until copy() gives it the source's. */
  constructor(fov = 50, aspect = 1, depth = 1) {
    super();
    this.lens = { fov, aspect, depth };
    this.size();
    this.updateProjectionMatrix();
  }

  get depth(): number {
    return this.lens.depth;
  }

  get fov(): number {
    return this.lens.fov;
  }

  set fov(fov: number) {
    this.lens.fov = fov;
    this.size();
  }

  get aspect(): number {
    return this.lens.aspect;
  }

  set aspect(aspect: number) {
    this.lens.aspect = aspect;
    this.size();
  }

  copy(source: PlaneCamera, recursive?: boolean): this {
    super.copy(source, recursive);
    this.lens = { ...source.lens };
    return this;
  }

  /**
   * The view's box for the field of view and aspect: set with them rather than in
   * updateProjectionMatrix, which OrthographicCamera's constructor calls before this one's fields exist.
   */
  private size(): void {
    const half = this.lens.depth * Math.tan(THREE.MathUtils.degToRad(this.lens.fov) / 2);
    this.top = half;
    this.bottom = -half;
    this.right = half * this.lens.aspect;
    this.left = -this.right;
  }
}

/** A preset's camera: the plane preset's looks along parallel rays, the others from an eye. */
export type TrackCamera = THREE.PerspectiveCamera | PlaneCamera;

/** A camera in `pose` for a screen of `aspect`, its world matrices and projection up to date. */
export function poseCamera(pose: CameraPose, aspect: number): TrackCamera {
  const position = new THREE.Vector3(...pose.position);
  const target = new THREE.Vector3(...pose.target);
  const camera = pose.orthographic ? new PlaneCamera(pose.fov, aspect, position.distanceTo(target)) : new THREE.PerspectiveCamera(pose.fov, aspect);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * A preview's field of view for `camera` (in its preset's pose, its world matrices up to date): the
 * judge line spans `fitWidth` of the width, and the whole track lies above it down from
 * FIT_TRACK_END_Y of the height, whichever needs the wider view.
 */
export function fitFov(camera: TrackCamera, track: Pick<TrackGeometry, 'width' | 'length'>, fitWidth: number): number {
  const half = track.width / 2;
  // a point of the track as the field of view measures it: up and across the view per unit away
  // from the eye, or per unit of the plane camera's depth (its rays are parallel)
  const view = (x: number, z: number) => {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = camera instanceof PlaneCamera ? camera.depth : -v.z;
    return new THREE.Vector2(v.x / depth, v.y / depth);
  };
  const [a, b] = [view(-half, 0), view(half, 0)];
  const spread = b.x - a.x;
  // the whole track in the box as well: a high camera's far end would otherwise leave it at the
  // top, and the notes would seem to start halfway down
  const [line, end] = [view(0, 0), view(0, -track.length)];
  const rise = end.y - line.y;
  const tanHalf = Math.max(spread / (2 * fitWidth * camera.aspect), rise / (2 * (JUDGE_LINE_Y - FIT_TRACK_END_Y)));
  return THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf));
}

const frameLine = new THREE.Vector3();
const frameAxis = new THREE.Vector3();

/** Height on the screen (0 top … 1 bottom) where `camera` shows the middle of the track at `z`. */
function lineScreenY(camera: THREE.Camera, z: number): number {
  return (1 - frameLine.set(0, 0, z).project(camera).y) / 2;
}

/**
 * A camera's framing before a chart's zoom and roll (see baseFrame): how far the view moves (a
 * share of the height) to put the (unlifted) judge line at JUDGE_LINE_Y, and the height on the
 * screen where the judge line, LIFT included, then lies.
 */
export interface CameraFrame {
  shift: number;
  lineY: number;
}

/**
 * The framing of `camera` (its world matrices up to date, in its preset's pose) at `fov`, with the
 * judge line at `lineZ` (LIFT raises it). It changes only with the camera, the screen and LIFT,
 * so the renderer keeps it while a chart's zoom and roll move the view frame by frame.
 */
export function baseFrame(camera: TrackCamera, fov: number, lineZ = 0): CameraFrame {
  camera.fov = fov;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const shift = lineScreenY(camera, 0) - JUDGE_LINE_Y;
  return { shift, lineY: lineScreenY(camera, lineZ) - shift };
}

/**
 * Frames `camera` (its world matrices up to date, in its preset's pose) for a `width`×`height`
 * screen: the view moves up or down, the perspective unchanged, until the (unlifted) judge line
 * sits at JUDGE_LINE_Y of the height at `fov` (`base`). A chart's zoom (`fovScale`) and roll then
 * turn the track about the middle of the judge line at `lineZ`, which stays where it is.
 */
export function frameCamera(
  camera: TrackCamera,
  fov: number,
  fovScale: number,
  roll: number,
  width: number,
  height: number,
  lineZ = 0,
  base: CameraFrame = baseFrame(camera, fov, lineZ),
): void {
  // zoomed in, the picture grows about the middle of the view: it moves again so that the line is
  // where it was (a narrower field of view scales every height from the middle by the same factor)
  const grow = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.tan(THREE.MathUtils.degToRad(fov * fovScale) / 2);
  const zoomed = (1 - grow * (1 - 2 * (base.lineY + base.shift))) / 2;
  camera.fov = fov * fovScale;
  camera.setViewOffset(width, height, 0, (zoomed - base.lineY) * height, width, height);
  camera.updateProjectionMatrix();
  if (roll === 0) return;
  if (camera instanceof PlaneCamera) {
    // parallel rays have no eye to turn about: the camera circles the line's middle about its own
    // direction, which keeps that point where it is and turns the picture about it
    const pivot = frameLine.set(0, 0, lineZ);
    const axis = camera.getWorldDirection(frameAxis).negate();
    camera.position.sub(pivot).applyAxisAngle(axis, roll).add(pivot);
    camera.rotateOnWorldAxis(axis, roll);
  } else {
    // about the ray from the camera through the line's middle: that point stays put on the screen
    const axis = frameLine.set(0, 0, lineZ).applyMatrix4(camera.matrixWorldInverse).normalize().negate();
    camera.rotateOnAxis(axis, roll);
  }
  camera.updateMatrixWorld();
}

/**
 * How much longer along the track than across it round things on the deck are drawn (DeckSpec.stretch),
 * so they look round where the camera flattens the track: `flatten(band)`, the camera's flattening at
 * the middle of a band `band` plane px deep (about a third of the `room` the screen shows, 40 to 72
 * px) STRETCH_TOP under the deck's top, in twentieths, from 1 up to MAX_DECK_STRETCH.
 */
export function deckStretch(room: number, flatten: (band: number) => number): number {
  const band = Math.min(72, Math.max(40, Math.round(room * 0.36)));
  return Math.round(Math.min(MAX_DECK_STRETCH, Math.max(1, flatten(band))) * 20) / 20;
}

/**
 * Where notes let through the judge line are cut (z): `offset` under the line, where LIFT's cover
 * starts; the line lowered toward the gear (판정선 위치 under 0) cuts them at the gear, which stays
 * where it is (`offset` under the unlifted line, at z 0).
 */
export function notesEndZ(judgeZ: number, offset: number): number {
  return Math.min(judgeZ, 0) + offset;
}

/** What a lane over the deck is: the scratch, a white key or another (PIANO's keys and cheek blocks follow them). */
function keyKind(lane: LaneGeom): KeyKind {
  return lane.kind === 'scratch' ? 'scratch' : lane.color === 'white' ? 'white' : 'other';
}

/** Renders the SDVX-style track with Three.js. */
export class TrackRenderer {
  readonly geometry: TrackGeometry;
  /** The parts drawn from art (render/styleArt.ts), e.g. "notes long side gear hit"; empty when all are drawn in code. */
  readonly artParts: string;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  /** Made afresh for each preset (setCamera): the plane one is of another kind. */
  private camera!: TrackCamera;
  private pose!: CameraPose;
  /** The screen's width over its height (16:9 until the first resize). */
  private aspect = 16 / 9;
  /** Colour of each lane: the note colours picked, or the track's (laneColorsFor). */
  private laneColors: number[];
  /** Under the coloured lanes, their colour on the floor: recoloured with the lanes (setLaneColors). */
  private readonly floorTints: { lane: number; material: THREE.MeshBasicMaterial }[] = [];
  /** Materials of colours no lane has any more: let go after the next frame (see setLaneColors). */
  private readonly staleMaterials: THREE.Material[] = [];
  private readonly skin: Skin;
  private readonly style: SkinStyle;
  /** The hit effect picked, or none when the settings turn them off. */
  private readonly hit: HitStyle | 'none';
  /** How much each effect is drawn: 1, LARGE_HIT for large ones, or less to keep a small one within SMALL_HIT_LANES. */
  private readonly fxFit: { hit: number; hold: number; burst: number; core: number; sparks: number };
  private readonly reducedFlash: boolean;
  private readonly barLines: boolean;
  private readonly fitWidth: number | null;
  private readonly noteGeometry: THREE.BufferGeometry;
  /** A plain bar's depth, and the notes' as drawn: the coin's and the stars' keep their shape at the judge line (see fitNoteDepth). */
  private readonly barDepth: number;
  private noteDepth: number;
  /** Each lane's notes' depth: a key lane's noteDepth; the scratch's and a side lane's as keeps the families' shape (see laneDepthOf). */
  private laneDepths: number[];
  /** A side tap laid over the keys: deeper than a key tap (see SIDE_EDGE). */
  private sideNoteDepth: number;
  /** Half the deepest note's depth: a note is in view once its time is this far past the track's far end. */
  private noteReach: number;
  private readonly basePosition = new THREE.Vector3();
  private readonly baseQuaternion = new THREE.Quaternion();
  private baseFov = 40;
  private readonly appliedFx = { roll: 0, fovScale: 1 };
  /** The view's framing before the chart's zoom and roll (see baseFrame): made again when the camera, the screen or LIFT changes. */
  private frame: CameraFrame | null = null;
  private readonly flatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** A long note's body and ends as slabs (scaled 1 high: SLAB_LONG thick under the top). */
  private readonly longSlab = slabGeometry(0, SLAB_LONG, 0);
  /** Far plane hides what SUDDEN+ covers; near plane hides HIDDEN+ and everything under LIFT. */
  private readonly farClip = new THREE.Plane(new THREE.Vector3(0, 0, 1), FAR_AWAY);
  private readonly nearClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), FAR_AWAY);
  private readonly clipPlanes = [this.farClip, this.nearClip];
  private readonly noteTextures = new Map<NoteMark, THREE.Texture>();
  private readonly noteMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly bodyMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly endMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly notePool: MeshPool;
  private readonly bodyPool: MeshPool;
  private readonly endPool: MeshPool;
  private readonly barPool: MeshPool;
  /** Side notes laid over the keys (see placeSideTap): taps and long notes' ends, and long notes' bodies. */
  private readonly sidePool: MeshPool;
  private readonly sideBodyPool: MeshPool;
  private readonly sideMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly sideTextures = new Map<SidePart, THREE.Texture>();
  /** Hits of the side lanes laid over the keys (see sideFlash), reused once they finish, and how deep they are drawn. */
  private readonly flashes: EffectQuad[] = [];
  private readonly flashDepth: number;
  private readonly long: LongPaint;
  private readonly longBody: THREE.Texture;
  private readonly longEnd: THREE.Texture;
  /** The long note's pictures while held, where its style has its own (drawn from art). */
  private readonly longHeld: { body: THREE.Texture; end: THREE.Texture } | null = null;
  /** The pictures the style's parts draw from (styleArt.ts), and the paints made with them. */
  private readonly images: StyleImages;
  private readonly notePaint: NotePaint;
  private readonly platePaint: (g: CanvasRenderingContext2D, s: DeckSpec) => void;
  /** The track's borders: the gear's frame, as wide as it is. */
  private readonly borderLook: SideLook;
  /** The hit effect plays its flipbooks (drawn from art). */
  private readonly flipbook: boolean;
  /** Side notes drawn as an LED panel's dots (SideStyle 'dots'), and their long notes' pictures in lanes of their own. */
  private readonly sideDots: boolean;
  private dotsLong: { body: THREE.Texture; end: THREE.Texture } | null = null;
  private readonly beams: THREE.Mesh[] = [];
  private beamLength: number;
  private readonly beamLevels: number[] = [];
  /** Hit effects lying on the track, reused once they finish. */
  private readonly hits: EffectQuad[] = [];
  /** Per lane, what shows while a long note is held there (with sparks, a late frame of the burst under them). */
  private readonly holds: EffectQuad[] = [];
  private readonly holdCores: EffectQuad[] = [];
  /** A side lane laid over the keys: the band of light across its half while one of its long notes is held. */
  private readonly bands: (EffectQuad | null)[] = [];
  /** When each lane's held long note last ticked, and last played a tick's burst (holdTick). */
  private readonly tickAt: number[] = [];
  private readonly tickBurstAt: number[] = [];
  /** The light flowing down each lane's held long note (drawFlows), and where that note's body ends up the track. */
  private readonly flows: THREE.Mesh[] = [];
  private readonly heldFar: (number | null)[] = [];
  private flowTexture: THREE.Texture | null = null;
  private readonly hitSheet: EffectSheet | null;
  /** The hit's flipbooks; empty when it is drawn in code. */
  private readonly art: SkinArt['slots'];
  private readonly artSource: SkinArt | null;
  private readonly artEffects: MediaEffects;
  /** Textures made here (pictures, mirrored rails, per-effect copies). */
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly glowTexture = radialTexture();
  private readonly judgeGroup = new THREE.Group();
  /**
   * How many times longer along the track the judge line and its glow are drawn, so they look as
   * thick in every camera (the plane camera flattens the track: see layoutDeck). The lanes between
   * the line and the gear are a stretch of the track like any other, so 판정선 위치 −20 %
   * (GEAR_JUDGE.gap) puts the line on the gear in every camera.
   */
  private judgeFit = 1;
  /** Where HIDDEN+ cuts the notes off (z), or null while it is off: the deck does (see setCovers). */
  private hiddenCut: number | null = null;
  /** The judge line's glow, and its material. */
  private readonly judgeGlow: THREE.Mesh;
  private readonly judgeGlowMaterial: THREE.MeshBasicMaterial;
  /** A gear's frame looks otherwise in FEVER: each border's material with its picture at rest and lit. */
  private readonly borderMaps: [THREE.MeshBasicMaterial, THREE.Texture, THREE.Texture][] = [];
  /**
   * A picked gear's frame lit as it is in FEVER over a band that runs down the track from its far
   * end to the gear on every bar: the band's texture (an alpha map) and the axis it runs along on
   * its face (v: the frame's top, far end at 1; u: a wall's inner face, the far end at 1 or, flip, at 0).
   */
  private readonly sweeps: { band: THREE.Texture; axis: 'u' | 'v'; flip: boolean }[] = [];
  /** The gear's lights over its deck (gearLights.ts), and where its deck's top is (z). */
  private readonly gearLights: GearLightLayer;
  /** The gear's keys that go down with their lanes (PIANO's): a shade over each, shown while its lane's key is held. */
  private pressKeys: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; texture: THREE.CanvasTexture; lane: number; level: number }[] = [];
  private deckTopZ = 0;
  /** A hot spot running along the judge line, and its glow's own opacity (the shimmer is about it). */
  private readonly judgeShines: THREE.Mesh[] = [];
  private judgeGlowBase = 1;
  /** The glow's depth on the track, which wavers (shimmerJudge). */
  private judgeGlowDepth = 0;
  private readonly feverOverlay: THREE.Mesh;
  /** The FEVER colour the frames and the judge line's glow have now (null: none). */
  private feverShown: number | null = null;
  private readonly suddenCover: THREE.Mesh;
  private readonly suddenEdge: THREE.Mesh;
  private readonly hiddenCover: THREE.Mesh;
  private readonly hiddenEdge: THREE.Mesh;
  private readonly liftCover: THREE.Mesh;
  private readonly deck: THREE.Mesh;
  /** What the deck's picture is painted for, and a layout waiting to be painted (at the next frame). */
  private deckPainted = '';
  private deckPending: DeckLayout | null = null;
  private deckWait = 0;
  /** Bumped whenever the camera or the gear's layout changes: the HUD lying on the track moves then. */
  private planeVersion = 0;
  /** Effects are this much longer along the track than across it (see EFFECT_ASPECT). */
  private stretch = 1;
  /** Where the note being placed lies (see noteSpan), kept to spare an object per note and frame. */
  private readonly extent: NoteSpan = { near: 0, far: 0 };
  private judgeZ = 0;
  /** The deck's readout windows as it was last laid out (deck px), null where it houses none. */
  private readouts: DeckReadouts | null = null;
  private firstLive = 0;
  private lastFrameMs = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement, options: TrackRendererOptions) {
    this.geometry = computeTrackGeometry(options.mode, options.trackWidth, options.trackLength, options.sideNotes);
    this.skin = options.skin;
    this.style = options.skin.style;
    this.hit = options.hitEffectSize === 'off' ? 'none' : this.style.hit;
    this.artSource = options.art ?? null;
    this.art = { ...options.art?.slots };
    this.artEffects = options.art?.effects ?? { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 };
    this.prepareArt();
    this.images = options.art?.images ?? {};
    this.notePaint = notePaintOf(this.style.note, this.images);
    this.platePaint = platePaintOf(this.style, this.images);
    this.borderLook = borderLookOf(this.style, this.images);
    this.laneColors = options.laneColors?.length === options.mode.lanes.length ? [...options.laneColors] : laneColorsFor(options.skin, options.mode);
    // the notes' pictures laid on the track as slabs, their tops just above it (a mesh is lifted half its height)
    this.noteGeometry = slabGeometry(PICTURE_LIFT - 0.5, SLAB_DEPTH, WALL_CROP);
    this.barDepth = NOTE_DEPTH;
    this.noteDepth = this.barDepth;
    this.laneDepths = this.lanesDeep(this.barDepth);
    this.sideNoteDepth = this.noteDepth + 2 * SIDE_EDGE;
    this.noteReach = this.deepestNote() / 2;
    this.reducedFlash = options.reducedFlash;
    this.barLines = options.barLines ?? true;
    this.fitWidth = options.fitWidth ?? null;
    this.beamLength = BEAM_LENGTH * (options.keyBeamLength ?? 1);
    this.long = longPaintOf(this.style.note, this.images);
    const px = this.long.px ?? 64;
    const longPictures = (body: Paint, end: Paint) => {
      const b = this.own(paintTexture(px, Math.round(px * this.long.tile), body));
      b.wrapT = THREE.RepeatWrapping;
      return { body: b, end: this.own(paintTexture(px, Math.max(4, Math.round(px * this.long.endDepth)), end)) };
    };
    ({ body: this.longBody, end: this.longEnd } = longPictures(this.long.body, this.long.end));
    if (this.long.held) this.longHeld = longPictures(this.long.held.body, this.long.held.end);
    this.sideDots = this.style.side === 'dots';
    const hit = this.hit;
    // a hit drawn from art draws its code stand-in while its flipbooks are missing
    this.flipbook = isArtHit(hit) && Boolean(this.art.hitBurst);
    this.artParts = [...artPartsOf(this.style, this.images), ...(this.flipbook ? ['hit'] : [])].join(' ');
    this.hitSheet = hit === 'none' || this.flipbook ? null : effectSheet(hit);
    if (this.hitSheet) this.own(this.hitSheet.texture);
    const fit = (lanes: number) => (options.hitEffectSize === 'small' ? Math.min(1, SMALL_HIT_LANES / lanes) : options.hitEffectSize === 'large' ? LARGE_HIT : 1);
    const reach = this.hitSheet?.reach ?? 1;
    this.fxFit = {
      hit: fit(reach * HIT_SIZE),
      hold: fit(reach * HOLD_SIZE),
      burst: fit(BURST_SIZE * FX_SCALE),
      core: fit(CORE_SIZE * FX_SCALE),
      sparks: fit(SPARKS_SIZE * FX_SCALE),
    };
    this.flashDepth = SIDE_FLASH * (options.hitEffectSize === 'small' ? SMALL_SIDE_FLASH : options.hitEffectSize === 'large' ? LARGE_HIT : 1);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.setCamera(options.camera);

    this.buildTrack();
    this.feverOverlay = this.flat(0xffffff, 0, 1.5, { additive: true });
    this.feverOverlay.scale.set(this.geometry.width, 1, this.geometry.length);
    this.feverOverlay.position.set(0, 0.008, -this.geometry.length / 2);
    this.feverOverlay.visible = false;
    this.judgeGlow = this.buildJudgementLine();
    this.judgeGlowMaterial = this.judgeGlow.material as THREE.MeshBasicMaterial;
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
    this.gearLights = new GearLightLayer(GEAR_LIGHTS[this.style.deck](), this.flatGeometry, this.reducedFlash, gearArtOf(this.style.deck, this.images).glow);
    this.scene.add(this.gearLights.group);
    this.buildJudgeShine();
    this.setCovers(options.covers);

    this.notePool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.noteGeometry, this.noteMaterial(this.laneColors[0], 'white'));
      mesh.renderOrder = 4;
      return mesh;
    });
    this.bodyPool = new MeshPool(this.scene, () => {
      // each body has its own UVs: the picture repeats along the note
      const mesh = new THREE.Mesh(this.longSlab.clone(), this.bodyMaterial(this.laneColors[0], 'idle'));
      mesh.renderOrder = 3;
      return mesh;
    });
    this.endPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.longSlab, this.endMaterial(this.laneColors[0], 'idle'));
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
    // side notes over the keys lie under the key notes and long notes, over the bar lines; the key
    // beams are added over them
    this.sideBodyPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry.clone(), this.sideMaterial('body', this.laneColors[0], 'idle'));
      mesh.renderOrder = 2.2;
      return mesh;
    });
    this.sidePool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, this.sideMaterial('tap', this.laneColors[0], 'idle'));
      mesh.renderOrder = 2.3;
      return mesh;
    });
  }

  setCamera(preset: CameraPreset): void {
    this.pose = cameraPose(preset);
    const camera = poseCamera(this.pose, this.aspect);
    this.camera = camera;
    this.baseFov = this.pose.fov;
    this.basePosition.copy(camera.position);
    this.baseQuaternion.copy(camera.quaternion);
    this.appliedFx.roll = 0;
    this.appliedFx.fovScale = 1;
    this.frame = null;
    const far = new THREE.Vector3(0, 0, -this.geometry.length).distanceTo(camera.position);
    const mid = new THREE.Vector3(0, 0, fogStartZ(preset, this.geometry.length)).distanceTo(camera.position);
    // depth resolution where the track is (its layers lie a few hundredths apart, the judge line a
    // thousandth over the notes): a perspective camera's falls off past its near plane, which at 0.1
    // would leave them fighting; the plane camera's is even, so it spans just the track and what
    // stands on it (a roll moves that camera across its view, never nearer)
    if (camera instanceof PlaneCamera) {
      const depth = (z: number) => -new THREE.Vector3(0, 0, z).applyMatrix4(camera.matrixWorldInverse).z;
      camera.near = depth(TRACK_TAIL + 3) - 10;
      camera.far = depth(-this.geometry.length) + 10;
    } else {
      camera.near = Math.max(0.1, camera.position.length() / 4);
      camera.far = Math.max(500, far * 1.5);
    }
    this.frameView();
    this.scene.fog = new THREE.Fog(hex(this.skin?.colors.fog ?? '#060a1a'), mid, far);
    if (this.deck) this.layoutDeck();
  }

  /** Key beams' length as a share of the usual one (0 = none). */
  setKeyBeamLength(share: number): void {
    this.beamLength = BEAM_LENGTH * share;
    this.placeBeams();
  }

  /** Key beams rise from the judge line (LIFT moves it) as far as their length. */
  private placeBeams(): void {
    for (const beam of this.beams) {
      beam.scale.z = Math.max(this.beamLength, 1e-3);
      beam.position.z = this.judgeZ - this.beamLength / 2;
    }
  }

  /** Moves SUDDEN+ / HIDDEN+ / LIFT (all shares, see settings). */
  setCovers(c: CoverLayout): void {
    const L = this.geometry.length;
    this.judgeZ = -c.lift * L;
    const travel = L + this.judgeZ;
    this.judgeGroup.position.z = this.judgeZ;
    this.placeBeams();

    const suddenZ = this.judgeZ - travel * (1 - c.sudden);
    const hiddenZ = this.judgeZ - travel * c.hidden;
    // notes come into view at the track's far end (they take no fog), cut there rather than popping up
    this.farClip.constant = c.sudden > 0 ? -suddenZ : L;
    // Missed notes run on past the judgement line (under LIFT, under its cover) as far as the deck,
    // which hides them: cut where it starts (under LIFT, where LIFT's cover starts: see layoutDeck)
    this.hiddenCut = c.hidden > 0 ? hiddenZ : null;

    this.span(this.suddenCover, -L - 0.5, suddenZ, c.sudden > 0);
    this.span(this.suddenEdge, suddenZ - 0.06, suddenZ + 0.06, c.sudden > 0);
    this.span(this.hiddenCover, hiddenZ, this.judgeZ, c.hidden > 0);
    this.span(this.hiddenEdge, hiddenZ - 0.06, hiddenZ + 0.06, c.hidden > 0);
    // a chart's zoom and roll turn about the (lifted) judge line
    this.frame = null;
    if (this.appliedFx.roll !== 0 || this.appliedFx.fovScale !== 1) this.frameView();
    this.layoutDeck();
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.aspect = this.cssWidth / this.cssHeight;
    this.camera.aspect = this.aspect;
    this.frame = null;
    this.frameView();
    this.layoutDeck();
  }

  /**
   * Moves the view up or down, the perspective unchanged, until the (unlifted) judge line sits at
   * JUDGE_LINE_Y of the height, leaving the gear room under it; the chart's zoom and roll turn
   * about the judge line (see frameCamera). The framing without them is kept until the camera, the
   * screen or LIFT changes, so a zoom pulse only moves the view from it.
   */
  private frameView(): void {
    // the plane camera's roll moves it as well as turning it (see frameCamera)
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    this.camera.updateMatrixWorld();
    if (!this.frame) this.frame = this.unzoomedFrame();
    const { fovScale, roll } = this.appliedFx;
    frameCamera(this.camera, this.baseFov, fovScale, roll, this.cssWidth, this.cssHeight, this.judgeZ, this.frame);
  }

  /**
   * The view's framing without the chart's zoom and roll. A preview (`fitWidth`) first sets the
   * field of view that makes the judge line span that share of the width with the whole track above it.
   */
  private unzoomedFrame(): CameraFrame {
    if (this.fitWidth !== null) this.baseFov = fitFov(this.camera, this.geometry, this.fitWidth);
    return baseFrame(this.camera, this.baseFov, this.judgeZ);
  }

  /** Changes whenever the HUD lying on the track has to move (see hudPlane). */
  get hudVersion(): number {
    return this.planeVersion;
  }

  /** The track plane as the camera shows it now (its tilt and zoom included), for the HUD on it. */
  hudPlane(): HudPlane {
    this.camera.updateMatrixWorld();
    return this.planeAs(this.camera);
  }

  /**
   * The track plane as the camera would show it in the chart's pose `fx`, whatever its tilt and zoom
   * are now: for what the HUD keeps clear of all through the play (see CameraFx.peak).
   */
  hudPlaneAt(fx: CameraPoseFx): HudPlane {
    if (!this.frame) this.frameView();
    const camera = poseCamera(this.pose, this.aspect);
    frameCamera(camera, this.baseFov, fx.fovScale, fx.roll, this.cssWidth, this.cssHeight, this.judgeZ, this.frame!);
    return this.planeAs(camera);
  }

  /** How wide the track's borders are (plane px): the gear's frame as wide as it is. */
  private get railPx(): number {
    return this.borderLook.width;
  }

  /** The deck's readout windows on the HUD's plane (see HudPlane.deck). */
  private deckWindows(): DeckReadouts | null {
    const r = this.readouts;
    if (!r) return null;
    const left = -this.geometry.width / 2 / PX;
    const top = (this.deckTopZ - this.judgeZ) / PX;
    const move = (b: { x: number; y: number; w: number; h: number }) => ({ x: left + b.x, y: top + b.y, w: b.w, h: b.h });
    return { speed: move(r.speed), score: move(r.score), rate: move(r.rate) };
  }

  private planeAs(camera: TrackCamera): HudPlane {
    const { width, length } = this.geometry;
    const railOuter = this.railPx * PX;
    // the gear's frame stands up: seen from the camera its top reaches further out over the plane
    // than its foot (a camera from far straight on, the plane one, sees no more of it)
    const lift = this.wallLift;
    const eye = camera instanceof THREE.PerspectiveCamera ? camera.position.y : 0;
    const lean = lift > 0 && eye > lift ? ((width / 2 + railOuter) * lift) / (eye - lift) : 0;
    return {
      h: planeHomography(camera, this.cssWidth, this.cssHeight, this.judgeZ),
      halfWidth: width / 2 / PX,
      sideOut: (railOuter + lean) / PX,
      far: (-length - this.judgeZ) / PX,
      deck: this.deckWindows(),
    };
  }

  /** Forget per-run state before replaying a chart. */
  reset(): void {
    this.firstLive = 0;
    this.beamLevels.fill(0);
    for (const h of this.hits) h.mesh.visible = false;
    for (const f of this.flashes) f.mesh.visible = false;
  }

  /** A hit on the judge line of a lane, in `color`. */
  hitEffect(lane: number, color: number, perfNow: number): void {
    if (this.hit === 'none') return;
    // a side lane laid over the keys: the band of light across its half, and a burst as wide as the half in the middle of it
    if (this.geometry.lanes[lane].over) this.sideFlash(lane, color, perfNow);
    this.burst(lane, color, perfNow);
  }

  /**
   * A tick of a held long note's combo: its glow kicks up (drawHolds) and, no more often than
   * TICK_GAP_MS, a smaller, fainter burst plays on it (none under 번쩍임 줄이기).
   */
  holdTick(lane: number, perfNow: number): void {
    if (this.hit === 'none' || lane < 0 || lane >= this.tickAt.length) return;
    this.tickAt[lane] = perfNow;
    if (this.reducedFlash || perfNow - this.tickBurstAt[lane] < TICK_GAP_MS) return;
    this.tickBurstAt[lane] = perfNow;
    this.burst(lane, this.laneColors[lane], perfNow, TICK_SIZE, TICK_GAIN);
  }

  /**
   * An effect's colour: the lane's, or, on a sheet in colours of its own (EffectSheet.plain: PRISM's
   * spectrum), white tinged with it, so the sheet's colours show.
   */
  private tinge(material: THREE.MeshBasicMaterial, color: number): void {
    material.color.setHex(color);
    if (this.hitSheet?.plain && material.map?.image === this.hitSheet.texture.image) material.color.lerp(WHITE, PLAIN_WHITE);
  }

  /** A burst on the judge line of a lane, `size` and `gain` shares of a hit's (in the middle of a side lane's half). */
  private burst(lane: number, color: number, perfNow: number, size = 1, gain = 1): void {
    const burst = this.flipbook ? this.art.hitBurst : undefined;
    let h = this.hits.find((x) => !x.mesh.visible && x.texture.image === (burst?.texture.image ?? this.hitSheet?.texture.image));
    if (!h) {
      const source = burst?.texture ?? this.hitSheet?.texture;
      if (!source) return;
      h = this.effectQuad(source, burst ? burst.spec.flipbook ?? null : this.hitSheet, 0.8);
      this.hits.push(h);
    }
    this.tinge(h.material, color);
    h.start = perfNow;
    h.lane = lane;
    h.size = size;
    h.gain = gain;
    h.mesh.visible = true;
    this.drawHit(h, perfNow);
  }

  render(frame: TrackFrame, perfNow: number): void {
    const dt = this.lastFrameMs > 0 ? Math.min(100, perfNow - this.lastFrameMs) : 16;
    this.lastFrameMs = perfNow;
    if (this.deckPending && (!this.deckPictured || ++this.deckWait >= DECK_SETTLE_FRAMES)) this.paintDeckPicture(this.deckPending);
    this.drawNotes(frame);
    this.drawFlows(frame);
    this.drawBars(frame);
    this.drawBeams(frame, dt);
    this.drawPressKeys(frame, dt);
    this.drawHolds(frame, perfNow);
    this.drawHits(perfNow);
    this.drawFever(frame);
    const clock = beatClock(frame.timeMs, frame.barTimes, frame.fever.active);
    this.gearLights.update(clock);
    this.sweepBorders(clock);
    this.shimmerJudge(clock);
    this.applyCameraFx(frame.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.staleMaterials.length > 0) {
      for (const m of this.staleMaterials) m.dispose();
      this.staleMaterials.length = 0;
    }
  }

  /**
   * Every lane's colour, on a running renderer (a colour being picked in the settings): the notes and
   * long notes take it from the next frame, the floor and the key beams at once.
   */
  setLaneColors(colors: readonly number[]): void {
    if (colors.length !== this.laneColors.length || colors.every((c, i) => c === this.laneColors[i])) return;
    this.laneColors = [...colors];
    for (const { lane, material } of this.floorTints) material.color.setHex(this.laneColors[lane]);
    this.beams.forEach((beam, lane) => (beam.material as THREE.MeshBasicMaterial).color.setHex(this.laneColors[lane]));
    // the cached materials are made again in the new colours; the old ones go once a frame has
    // drawn with the new (their shaders stay compiled in between)
    for (const cache of [this.noteMaterials, this.bodyMaterials, this.endMaterials, this.sideMaterials]) {
      cache.forEach((m) => this.staleMaterials.push(m));
      cache.clear();
    }
  }

  private applyCameraFx(fx: CameraPoseFx | undefined): void {
    const roll = fx?.roll ?? 0;
    const fovScale = fx?.fovScale ?? 1;
    if (roll === this.appliedFx.roll && fovScale === this.appliedFx.fovScale) return;
    this.appliedFx.roll = roll;
    this.appliedFx.fovScale = fovScale;
    this.planeVersion++;
    // the view is framed again (from the kept framing): the zoomed or rolled track keeps the judge line where it is
    this.frameView();
  }

  dispose(): void {
    this.gearLights.dispose();
    this.layPressKeys([], [], 0);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: THREE.Material) => m.dispose());
        if (obj instanceof THREE.Mesh && obj.geometry !== this.flatGeometry) obj.geometry.dispose();
      }
    });
    for (const cache of [this.noteMaterials, this.bodyMaterials, this.endMaterials, this.sideMaterials]) cache.forEach((m) => m.dispose());
    for (const m of this.staleMaterials) m.dispose();
    (this.deck.material as THREE.MeshBasicMaterial).map?.dispose();
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

    this.notePool.begin();
    this.bodyPool.begin();
    this.endPool.begin();
    this.sidePool.begin();
    this.sideBodyPool.begin();
    this.heldFar.fill(null);
    for (let i = this.firstLive; i < notes.length; i++) {
      const n = notes[i];
      // in view once its near edge passes the far end (the far clip cuts the rest)
      if (scroll.distance(n.t, timeMs) > scroll.travel + this.noteReach) break;
      const lane = this.geometry.lanes[n.lane];
      const color = this.laneColors[n.lane];
      const height = lane.kind === 'side' ? SIDE_NOTE_HEIGHT : NOTE_HEIGHT;
      const kind = noteKindOf(lane);
      if (n.type === 'tap') {
        if (!n.headDone) {
          if (lane.over) this.placeSideTap(lane, z(n.t), color);
          else this.placeNote(lane.x, lane.width, z(n.t), this.laneDepths[n.lane], color, height, kind);
        } else if (n.broken && n.t > timeMs - MISSED_VISIBLE_MS) {
          if (lane.over) this.placeSideTap(lane, z(n.t), MISSED_COLOR);
          else this.placeNote(lane.x, lane.width, z(n.t), this.laneDepths[n.lane], MISSED_COLOR, height, kind);
        }
        continue;
      }
      const held = frame.heldNote(n.lane) === n.index;
      if (n.tailDone && !n.broken) continue;
      if (n.broken && n.endT < timeMs - MISSED_VISIBLE_MS) continue;
      // from the near edge of a tap at its start to the far edge of a tap at its end (a side tap's
      // over the keys)
      const span = noteSpan(z(n.t), lane.over ? this.sideNoteDepth : this.laneDepths[n.lane], z(n.endT), held ? this.judgeZ : null, this.extent);
      const tailZ = Math.max(-L, span.far);
      if (span.near <= tailZ) continue;
      const state = n.broken ? 'missed' : held ? 'held' : 'idle';
      if (lane.over) this.placeSideLong(lane, span.near, tailZ, span.far, n.broken ? MISSED_COLOR : color, state);
      else this.placeLong(lane, span.near, tailZ, span.far, n.broken ? MISSED_COLOR : color, state);
    }
    this.notePool.end();
    this.bodyPool.end();
    this.endPool.end();
    this.sidePool.end();
    this.sideBodyPool.end();
  }

  /** A tap note centred on `z`: where noteSpan puts a long note's ends, so a chord lines up. */
  private placeNote(x: number, laneWidth: number, z: number, depth: number, color: number, height: number, kind: NoteMark): void {
    const mesh = this.notePool.next();
    mesh.material = this.noteMaterial(color, kind);
    const { near, far } = noteSpan(z, depth, z, null, this.extent);
    mesh.scale.set(laneWidth * noteWidthOf(this.style.note), height, near - far);
    mesh.position.set(x, height / 2, (near + far) / 2);
  }

  /**
   * A long note is its body alone (a head or tail drawn like a tap note reads as one more note):
   * the body between its two ends (see noteSpan), which close it with the style's outline. While
   * its real tail is still beyond the track's far end (`realTailZ` past `tailZ`) the body is open
   * there: the far clip cuts it, as no outline must show an end that is not there.
   */
  private placeLong(lane: LaneGeom, headZ: number, tailZ: number, realTailZ: number, color: number, state: 'idle' | 'held' | 'missed'): void {
    if (state === 'held') this.heldFar[lane.index] = tailZ;
    // a side lane's long note of dots (SideStyle 'dots') is the side style's, not the note style's
    const dots = this.sideDots && lane.kind === 'side';
    const paint = dots ? DOTS_LONG : this.long;
    const width = lane.width * paint.width;
    const open = realTailZ < tailZ;
    const end = Math.min(paint.endDepth * width, (headZ - tailZ) / (open ? 1 : 2));
    const body = this.bodyPool.next();
    body.material = this.bodyMaterial(color, state, dots);
    const near = headZ - end;
    const far = open ? tailZ : tailZ + end;
    body.visible = near > far;
    body.scale.set(width, 1, Math.max(0.001, near - far));
    body.position.set(lane.x, 0.02, (near + far) / 2);
    this.setBodyUv(body, width * paint.tile, near, far, realTailZ);
    if (end <= 0) return;
    this.placeLongEnd(lane.x, width, headZ - end / 2, end, color, state, true, dots);
    if (!open) this.placeLongEnd(lane.x, width, tailZ + end / 2, end, color, state, false, dots);
  }

  /** One end of a long note, `end` deep at `z`; the picture's top is its outer edge (`head`: toward the camera). */
  private placeLongEnd(x: number, width: number, z: number, end: number, color: number, state: 'idle' | 'held' | 'missed', head: boolean, dots: boolean): void {
    const cap = this.endPool.next();
    cap.material = this.endMaterial(color, state, dots);
    cap.scale.set(width, 1, end);
    cap.rotation.y = head ? Math.PI : 0;
    cap.position.set(x, 0.021, z);
  }

  /**
   * A side note laid over the keys (반쪽 덮기): a see-through bar across its half, under the key
   * notes, centred on its time as a tap is (see noteSpan) and bright along both edges, which reach
   * past a key tap at its time (SIDE_EDGE): its time reads whatever key notes lie over it.
   */
  private placeSideTap(lane: LaneGeom, z: number, color: number): void {
    const bar = this.sidePool.next();
    bar.material = this.sideMaterial('tap', color, 'idle');
    const { near, far } = noteSpan(z, this.sideNoteDepth, z, null, this.extent);
    bar.scale.set(lane.width * SIDE_SPAN, 1, near - far);
    bar.rotation.y = 0;
    bar.position.set(lane.x, SIDE_Y, (near + far) / 2);
  }

  /**
   * A side long note laid over the keys: a fainter body across its half between two bright bands at
   * its head and end, from the near edge of a side tap at its start to the far edge of one at its end
   * (so key notes on its head or end leave the bands showing), open at the far end while its real
   * tail is beyond it, as placeLong's.
   */
  private placeSideLong(lane: LaneGeom, headZ: number, tailZ: number, realTailZ: number, color: number, state: 'idle' | 'held' | 'missed'): void {
    const width = lane.width * SIDE_SPAN;
    const open = realTailZ < tailZ;
    const end = Math.min(SIDE_END, (headZ - tailZ) / (open ? 1 : 2));
    const body = this.sideBodyPool.next();
    body.material = this.sideMaterial('body', color, state);
    const near = headZ - end;
    const far = open ? tailZ : tailZ + end;
    body.visible = near > far;
    body.scale.set(width, 1, Math.max(0.001, near - far));
    body.position.set(lane.x, SIDE_Y, (near + far) / 2);
    this.setBodyUv(body, width, near, far, realTailZ);
    this.placeSideEnd(lane.x, width, headZ - end / 2, end, color, state, true);
    if (!open) this.placeSideEnd(lane.x, width, tailZ + end / 2, end, color, state, false);
  }

  /** A side long note's head or end band, `end` deep at `z` (as placeLongEnd). */
  private placeSideEnd(x: number, width: number, z: number, end: number, color: number, state: 'idle' | 'held' | 'missed', head: boolean): void {
    const cap = this.sidePool.next();
    cap.material = this.sideMaterial('end', color, state);
    cap.scale.set(width, 1, end);
    cap.rotation.y = head ? Math.PI : 0;
    cap.position.set(x, SIDE_Y, z);
  }

  /** A part of the side notes laid over the keys, in `color` (cached per colour and state). */
  private sideMaterial(part: Exclude<SidePart, 'flash'>, color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${part}:${color}:${state}`;
    let m = this.sideMaterials.get(key);
    if (!m) {
      m = tintMaterial(
        { color, map: this.sideTexture(part), transparent: true, opacity: HOLD_OPACITY[state], depthWrite: false, clippingPlanes: this.clipPlanes, fog: false },
        { gain: HOLD_BRIGHTNESS[state] },
      );
      this.sideMaterials.set(key, m);
    }
    return m;
  }

  /**
   * A side note's picture, painted for the bar's proportions over a half of this track (square px);
   * a long note's body is alike all along it, so a few rows repeat.
   */
  private sideTexture(part: SidePart): THREE.Texture {
    let texture = this.sideTextures.get(part);
    if (!texture) {
      const across = (this.geometry.width / 2) * SIDE_SPAN;
      const w = 512;
      // dots repeat along a body as across it (square px): a picture as deep as the half is wide
      const dots = this.sideDots && part !== 'flash';
      const h = part === 'body' ? (dots ? w : 8) : Math.max(8, Math.round((w * { tap: this.sideNoteDepth, end: SIDE_END, flash: SIDE_FLASH }[part]) / across));
      const key = this.geometry.lanes.find((l) => l.kind === 'key');
      const cols = Math.max(8, Math.round((across / (key?.width ?? 1)) * DOTS_ACROSS));
      const paint = dots
        ? { tap: sideDotsTap(SIDE_EDGE / this.sideNoteDepth, cols), body: sideDotsBody(cols), end: sideDotsEnd(cols) }[part as Exclude<SidePart, 'flash'>]
        : part === 'tap'
          ? sideTapPaintOf(this.style.note, this.images, SIDE_EDGE / this.sideNoteDepth)
          : SIDE_PICTURES[part];
      texture = this.own(paintTexture(w, h, paint));
      if (part === 'body') texture.wrapT = THREE.RepeatWrapping;
      this.sideTextures.set(part, texture);
    }
    return texture;
  }

  /** The body picture is pinned to the note's real tail, so it travels with the note (also while held). */
  private setBodyUv(mesh: THREE.Mesh, tile: number, nearZ: number, farZ: number, tailZ: number): void {
    const vNear = (nearZ - tailZ) / tile;
    const vFar = (farZ - tailZ) / tile;
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    // PlaneGeometry(1, 1) laid flat, and each layer of a slab: vertices 0 and 1 are its far edge, 2 and 3 its near edge
    for (let q = 0; q < uv.count; q += 4) {
      uv.setXY(q, 0, vFar);
      uv.setXY(q + 1, 1, vFar);
      uv.setXY(q + 2, 0, vNear);
      uv.setXY(q + 3, 1, vNear);
    }
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
      const level = frame.keyDown(lane) ? (this.geometry.lanes[lane].over ? peak * SIDE_BEAM : peak) : this.beamLevels[lane] * decay;
      this.beamLevels[lane] = level;
      const material = beam.material as THREE.MeshBasicMaterial;
      material.opacity = level;
      beam.visible = level > 0.01 && this.beamLength > 0;
    });
  }

  /**
   * Lays a shade over each of the deck's keys that go down with their lanes (`keys`, plane px; `laneOf`
   * the track's lane of each of the deck's lanes), painted once (deckArt.paintPressedKey); none clears
   * them.
   */
  private layPressKeys(keys: readonly DeckKey[], laneOf: readonly number[], width: number): void {
    for (const k of this.pressKeys) {
      k.mesh.removeFromParent();
      k.material.dispose();
      k.texture.dispose();
    }
    this.pressKeys = keys.map((key) => {
      const canvas = document.createElement('canvas');
      canvas.width = PRESS_KEY_PX[0];
      canvas.height = PRESS_KEY_PX[1];
      const share = { left: key.notch.left / key.box.w, right: key.notch.right / key.box.w, depth: key.notch.depth / key.box.h };
      const g = canvas.getContext('2d') as CanvasRenderingContext2D;
      if (key.lit) {
        // a cap is about as deep as it is wide: its picture square (a cut one finer: its ridges are hairlines)
        if (key.gem) canvas.width = LIT_GEM_PX;
        canvas.height = canvas.width;
        paintLitKey(g, canvas.width, canvas.height, key);
      } else paintPressedKey(g, canvas.width, canvas.height, share);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
      const mesh = new THREE.Mesh(this.flatGeometry, material);
      // over the deck, under its lights
      mesh.renderOrder = 9.055;
      mesh.visible = false;
      mesh.scale.set(key.box.w * PX, 1, key.box.h * PX);
      mesh.position.set(-width / 2 + (key.box.x + key.box.w / 2) * PX, DECK_Y + 0.0004, this.deckTopZ + (key.box.y + key.box.h / 2) * PX);
      this.scene.add(mesh);
      return { mesh, material, texture, lane: laneOf[key.lane], level: 0 };
    });
  }

  /** The deck's keys go down at once while their lane's key is held and come back up over a few frames (pressLevel). */
  private drawPressKeys(frame: TrackFrame, dt: number): void {
    for (const k of this.pressKeys) {
      k.level = pressLevel(k.level, frame.keyDown(k.lane), dt);
      k.material.opacity = k.level;
      k.mesh.visible = k.level > 0.01;
    }
  }

  /**
   * While a long note is held, its lane shows the hit's hold flipbook over a glow (or the start of its
   * hit effect), breathing and kicking up at each tick of its combo (holdTick); a side lane laid over
   * the keys shows them as large as its half, over a band of light across it.
   */
  private drawHolds(frame: TrackFrame, perfNow: number): void {
    const sparks = this.flipbook ? this.art.hitHold : undefined;
    this.holds.forEach((h, lane) => {
      const held = frame.heldNote(lane) !== null;
      const g = this.geometry.lanes[lane];
      const band = this.bands[lane];
      const core = this.holdCores[lane];
      h.mesh.visible = held;
      if (band) band.mesh.visible = held;
      if (core) core.mesh.visible = held;
      if (!held) return;
      const w = Math.min(g.width, 1.6);
      const dim = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
      const flash = this.reducedFlash ? this.artEffects.reducedFlashScale : 1;
      const kick = this.reducedFlash ? 0 : Math.exp(-(perfNow - this.tickAt[lane]) / TICK_FADE_MS);
      const swell = (this.reducedFlash ? 1 : 1 + BREATHE * Math.sin(2 * Math.PI * BREATHE_HZ * (frame.timeMs / 1000) + lane)) * (1 + TICK_KICK * kick);
      if (band) {
        // its hit's flash across the half, shallower and steady (see sideFlash), in its own colour
        const pulse = this.reducedFlash ? 1 : 1 + 0.06 * Math.sin(frame.timeMs / 45);
        const depth = this.flashDepth * 0.7 * pulse * (1 + 0.2 * kick) * this.stretch;
        band.mesh.scale.set(g.width * SIDE_SPAN, 1, depth);
        band.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - SIDE_FLASH_LINE));
        band.material.color.setHex(this.laneColors[lane]);
        band.material.opacity = (0.4 + 0.3 * kick) * dim;
      }
      if (core) {
        const book = this.art.hitBurst?.spec.flipbook;
        if (book) {
          const [u, v] = flipbookOffset(book, HOLD_BURST_FRAME);
          core.texture.offset.set(u, v);
        }
        const size = w * CORE_SIZE * FX_SCALE * flash * this.fxFit.core * (this.art.hitBurst?.spec.span ?? 1) * swell;
        core.mesh.scale.set(size, 1, size * this.stretch);
        core.mesh.position.set(g.x, 0.029, this.judgeZ + size * this.stretch * ((this.art.hitBurst?.spec.anchorY ?? 0.5) - 0.5));
        core.material.color.setHex(this.laneColors[lane]);
        core.material.opacity = dim * (0.85 + 0.15 * kick);
      }
      if (sparks?.spec.flipbook) {
        const book = sparks.spec.flipbook;
        // each lane starts at another frame, so neighbouring sparks do not move in step
        const n = Math.floor((frame.timeMs / 1000) * book.fps) + lane * 5;
        const [u, v] = flipbookOffset(book, ((n % book.frames) + book.frames) % book.frames);
        h.texture.offset.set(u, v);
        // the sparks play about the judge line (where the sheet says it crosses them)
        const size = w * SPARKS_SIZE * FX_SCALE * flash * this.fxFit.sparks * (sparks.spec.span ?? 1) * (1 + 0.5 * TICK_KICK * kick);
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
      const pulse = (this.reducedFlash ? 1 : 1 + 0.06 * Math.sin(frame.timeMs / 45)) * this.fxFit.hold;
      const across = sheet.size[0] * w * HOLD_SIZE * pulse;
      const depth = sheet.size[1] * w * HOLD_SIZE * pulse * this.stretch;
      h.mesh.scale.set(across, 1, depth);
      h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - sheet.centre));
      this.tinge(h.material, this.laneColors[lane]);
      h.material.opacity = 0.75 * dim;
    });
  }

  /**
   * The light flowing down each held long note into the judge line: from the line up the note's body
   * (FLOW_REACH at most, fading out up it), running toward the line faster than the notes scroll.
   */
  private drawFlows(frame: TrackFrame): void {
    this.flows.forEach((mesh, lane) => {
      const far = this.heldFar[lane];
      const g = this.geometry.lanes[lane];
      const near = this.judgeZ;
      const top = far === null ? near : Math.max(far, near - FLOW_REACH);
      mesh.visible = near - top > 0.05;
      if (!mesh.visible) return;
      mesh.scale.set(g.width * this.long.width * FLOW_WIDTH, 1, near - top);
      mesh.position.set(g.x, 0.023, (near + top) / 2);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.setHex(this.laneColors[lane]);
      material.opacity = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
      // the picture runs along the track toward the line: v follows the world's z, shifted with time
      const run = (FLOW_SPEED * frame.timeMs) / 1000;
      const pos = mesh.geometry.getAttribute('position');
      const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (top + (pos.getZ(i) + 0.5) * (near - top) - run) / FLOW_TILE);
      uv.needsUpdate = true;
    });
  }

  /** A held long note's flowing light (drawFlows): light on black, fading out toward its far end. */
  private flowQuad(): THREE.Mesh {
    this.flowTexture ??= this.own(flowTexture());
    const geometry = new THREE.PlaneGeometry(1, 1, 1, FLOW_ROWS).rotateX(-Math.PI / 2);
    const pos = geometry.getAttribute('position');
    const colors = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      // 1 at the line, none at the far end
      const near = pos.getZ(i) + 0.5;
      colors.set([1, 1, 1, near * near * (3 - 2 * near)], i * 4);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    const material = lightMaterial({ map: this.flowTexture, transparent: true, depthWrite: false, depthTest: false, vertexColors: true, clippingPlanes: this.clipPlanes, fog: false }, 0.9);
    const mesh = new THREE.Mesh(geometry, material);
    // over the long notes and their ends, under the taps
    mesh.renderOrder = 3.2;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  private drawHits(perfNow: number): void {
    for (const h of this.hits) if (h.mesh.visible) this.drawHit(h, perfNow);
    for (const f of this.flashes) if (f.mesh.visible) this.drawSideFlash(f, perfNow);
  }

  /**
   * A hit of a side lane laid over the keys: a flash across its half on the judge line, with light
   * rising a short way up it, that fades out as a hit effect does (the hit's own effect is a lane's
   * size). It is added under the keys' own effects, which show over it in a chord.
   */
  private sideFlash(lane: number, color: number, perfNow: number): void {
    let f = this.flashes.find((x) => !x.mesh.visible);
    if (!f) {
      f = this.flashQuad();
      this.flashes.push(f);
    }
    f.material.color.setHex(color);
    f.start = perfNow;
    f.lane = lane;
    f.mesh.visible = true;
    this.drawSideFlash(f, perfNow);
  }

  private drawSideFlash(f: EffectQuad, perfNow: number): void {
    const p = (perfNow - f.start) / EFFECT_MS;
    if (p >= 1) {
      f.mesh.visible = false;
      return;
    }
    const g = this.geometry.lanes[f.lane];
    const dim = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
    // its light rises a little further up the track as it fades
    const depth = this.flashDepth * (1 + 0.3 * p) * this.stretch;
    f.mesh.scale.set(g.width * SIDE_SPAN, 1, depth);
    f.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - SIDE_FLASH_LINE));
    f.material.opacity = dim * (1 - p);
  }

  /** The flash lying across a half at the judge line (a side lane's hit or hold over the keys): one picture for all, no frames. */
  private flashQuad(): EffectQuad {
    const texture = this.sideTexture('flash');
    const material = tintMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.flatGeometry, material);
    mesh.renderOrder = 9.9;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, texture, material, start: 0, lane: 0, size: 1, gain: 1 };
  }

  /** A hit plays its frames once, lying on the track at the judge line; then its quad is free again. */
  private drawHit(h: EffectQuad, perfNow: number): void {
    const burst = this.flipbook ? this.art.hitBurst : undefined;
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
      // a frame has room round the effect (its span): the effect itself is BURST_SIZE lanes
      const size = w * BURST_SIZE * FX_SCALE * (this.reducedFlash ? this.artEffects.reducedFlashScale : 1) * this.fxFit.burst * (burst?.spec.span ?? 1) * h.size;
      const depth = size * this.stretch;
      h.mesh.scale.set(size, 1, depth);
      // the judge line crosses the sheet at its anchor (the middle unless it says)
      h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * ((burst?.spec.anchorY ?? 0.5) - 0.5));
      // the sheet fades by itself; its last frames fade out too, so the effect does not cut off
      h.material.opacity = dim * h.gain * Math.min(1, (1 - p) / 0.3);
      return;
    }
    const sheet = this.hitSheet as EffectSheet;
    const [u, v] = sheetOffset(sheet, frame);
    h.texture.offset.set(u, v);
    const scale = (this.reducedFlash ? 0.8 : 1) * this.fxFit.hit * h.size;
    const across = sheet.size[0] * w * HIT_SIZE * scale;
    const depth = sheet.size[1] * w * HIT_SIZE * scale * this.stretch;
    h.mesh.scale.set(across, 1, depth);
    h.mesh.position.set(g.x, 0.03, this.judgeZ + depth * (0.5 - sheet.centre));
    h.material.opacity = dim * h.gain;
  }

  /**
   * A quad lying on the track that shows one frame of a sheet (its own copy of the texture). Nothing
   * cuts it: a wide effect on an outer lane reaches past the rails, and the whole of it shows.
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
    const material = source !== this.hitSheet?.texture ? lightMaterial(params, core) : this.hitSheet.plain ? new THREE.MeshBasicMaterial(params) : tintMaterial(params);
    const mesh = new THREE.Mesh(this.flatGeometry, material);
    mesh.renderOrder = 10;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, texture, material, start: 0, lane: 0, size: 1, gain: 1 };
  }

  private drawFever(frame: TrackFrame): void {
    const { active, multiplier, remaining } = frame.fever;
    const overlay = this.feverOverlay.material as THREE.MeshBasicMaterial;
    this.feverOverlay.visible = active;
    const tint = FEVER_COLORS[Math.min(5, Math.max(2, multiplier))] ?? FEVER_COLORS[2];
    if (active) {
      overlay.color.setHex(tint);
      // steady (a pulse of its own, off the beat, only distracts); it fades out over the last
      // fifth of the fever so its end is readable
      overlay.opacity = FEVER_TINT * Math.min(1, remaining * 5);
    }
    const shown = active ? tint : null;
    if (shown === this.feverShown) return;
    this.feverShown = shown;
    for (const [m, idle, lit] of this.borderMaps) m.map = shown === null ? idle : lit;
    this.judgeGlowMaterial.color.setHex(shown ?? hex(judgeOf(this.style.deck).glow));
  }

  /** A frame's look in FEVER (`lit`) shown through a band along `axis` that sweepBorders moves (SWEEP_SHARE of the frame long). */
  private sweepMaterial(lit: THREE.Texture, axis: 'u' | 'v', flip: boolean): THREE.MeshBasicMaterial {
    const band = this.own(bandTexture(axis));
    if (axis === 'v') band.repeat.set(1, 1 / SWEEP_SHARE);
    else band.repeat.set(1 / SWEEP_SHARE, 1);
    this.sweeps.push({ band, axis, flip });
    return new THREE.MeshBasicMaterial({ map: lit, alphaMap: band, transparent: true, opacity: this.reducedFlash ? 0.45 : 0.9, depthWrite: false });
  }

  /**
   * The frames' sweep: once a bar (every other bar under 번쩍임 줄이기, and dimmer: sweepMaterial)
   * the band runs from the track's far end down to the gear, starting and ending past them.
   */
  private sweepBorders(c: BeatClock): void {
    if (this.sweeps.length === 0) return;
    const p = this.reducedFlash ? (c.bar / 2) - Math.floor(c.bar / 2) : c.bar - Math.floor(c.bar);
    // the band's middle, 1 at the far end: from a band past it to a band past the near end
    const at = 1 + SWEEP_SHARE - p * (1 + 2 * SWEEP_SHARE);
    for (const s of this.sweeps) {
      const c0 = s.flip ? 1 - at : at;
      if (s.axis === 'v') s.band.offset.set(0, 0.5 - c0 * s.band.repeat.y);
      else s.band.offset.set(0.5 - c0 * s.band.repeat.x, 0);
    }
  }

  /** The judge line's hot spots: glows running along it, each its own way (shimmerJudge). */
  private buildJudgeShine(): void {
    this.judgeGlowBase = this.judgeGlowMaterial.opacity;
    this.judgeGlowDepth = this.judgeGlow.scale.z;
    for (const s of SHINES) {
      const shine = new THREE.Mesh(
        this.flatGeometry,
        new THREE.MeshBasicMaterial({ map: this.glowTexture, color: this.judgeGlowMaterial.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      shine.scale.set(s.length, 1, (GEAR_JUDGE.height + 2 * shadowReach(GEAR_JUDGE.blur)) * PX * 0.85);
      shine.position.set(0, LINE_Y + 0.0002, 0);
      shine.renderOrder = 9.53;
      this.judgeGroup.add(shine);
      this.judgeShines.push(shine);
    }
  }

  /**
   * The judge line as a laser: its glow flickering and its breadth wavering (slowly and less under
   * 번쩍임 줄이기), and hot spots running along it both ways; its line as it is.
   */
  private shimmerJudge(c: BeatClock): void {
    const glow = this.judgeGlowMaterial;
    const t = c.seconds;
    const calm = this.reducedFlash;
    const wave = (hz: number, phase = 0) => Math.sin(2 * Math.PI * hz * t + phase);
    const flicker = calm ? 0.05 * wave(0.5) : 0.13 * wave(7.3) + 0.09 * wave(11.9, 1.3) + 0.08 * wave(2.7, 0.4);
    glow.opacity = this.judgeGlowBase * (0.86 + flicker);
    this.judgeGlow.scale.z = this.judgeGlowDepth * (1 + (calm ? 0.03 * wave(0.5) : 0.1 * wave(1.9) + 0.05 * wave(5.3, 0.7)));
    SHINES.forEach((s, i) => {
      const shine = this.judgeShines[i];
      const at = t / s.period + s.phase;
      const run = at - Math.floor(at);
      // within the line: its glow never spills past the line's ends
      shine.position.x = s.dir * (run - 0.5) * (this.geometry.width - s.length * 0.7);
      const material = shine.material as THREE.MeshBasicMaterial;
      material.color.copy(glow.color);
      material.opacity = (calm ? 0.2 * s.peak : s.peak) * Math.sin(Math.PI * run);
    });
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
    for (let i = 0; i < pos.count; i++) {
      const depth = Math.min(1, Math.max(0, -pos.getZ(i) / length));
      c.copy(near).lerp(far, depth).convertSRGBToLinear();
      c.toArray(colors, i * 3);
    }
    base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const track = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ vertexColors: true }));
    track.renderOrder = 0;
    this.scene.add(track);

    const strip = (x: number, w: number, color: number, opacity: number, order = 1) => {
      const mesh = this.flat(color, opacity, order);
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      mesh.position.set(x, 0.005, (TRACK_TAIL - length) / 2);
      return mesh.material as THREE.MeshBasicMaterial;
    };
    // the lane colour shows faintly under coloured lanes (white ones stay the track's); side lanes
    // laid over the keys have no floor of their own
    const floorLanes = lanes.filter((lane) => !lane.over);
    floorLanes.forEach((lane) => {
      const tint = lane.kind === 'side' ? SIDE_TINT : lane.kind === 'key' && lane.color === 'white' ? 0 : LANE_TINT;
      if (tint > 0) this.floorTints.push({ lane: lane.index, material: strip(lane.x, lane.width, this.laneColors[lane.index], tint) });
    });
    const divider = hex(this.skin.colors.divider);
    for (let i = 1; i < floorLanes.length; i++) {
      const sideEdge = floorLanes[i].kind === 'side' || floorLanes[i - 1].kind === 'side';
      strip(floorLanes[i].x - floorLanes[i].width / 2, sideEdge ? 0.05 : 0.025, divider, 0.9);
    }
    this.buildRails();
  }

  /**
   * The track's borders, its two edges from the far end past the gear: the gear's frame
   * (styleArt.borderLookOf), as wide as it is, a picture repeating down them that changes in FEVER
   * (its lights lit) and a band of that light running down it on every bar (sweepBorders), standing
   * as a wall beside the lanes (buildWall).
   */
  private buildRails(): void {
    const { width, length } = this.geometry;
    const look = this.borderLook;
    const railPx = this.railPx;
    const tile = look.tile;
    const w = railPx * PX;
    // the frame stands as a wall beside the lanes, its top this high
    const lift = this.wallLift;
    for (const side of [-1, 1] as const) {
      const x = side * (width / 2 + w / 2);
      const z = (TRACK_TAIL - length) / 2;
      const repeat = (length + TRACK_TAIL) / (tile * PX);
      const map = this.own(borderTexture(look, railPx, tile, side));
      map.repeat.set(1, repeat);
      const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(this.flatGeometry, material);
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      mesh.position.set(x, 0.006 + lift, z);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      const lit = this.own(borderTexture(look, railPx, tile, side, true));
      lit.repeat.set(1, repeat);
      this.borderMaps.push([material, map, lit]);
      const sweep = new THREE.Mesh(this.flatGeometry, this.sweepMaterial(lit, 'v', false));
      sweep.scale.copy(mesh.scale);
      sweep.position.set(x, mesh.position.y + 0.0003, z);
      sweep.renderOrder = 1.01;
      this.scene.add(sweep);
      if (lift > 0) this.buildWall(look, side, lift, tile, z);
    }
  }

  /** How high the gear's frame stands beside the lanes (world units). */
  private get wallLift(): number {
    return this.borderLook.height * PX;
  }

  /**
   * The gear's frame on `side` standing `lift` high: its inner face down to the track at the
   * lanes' edge (paintFace: the left one turned from the light, the right one toward it), with a
   * look of its own in FEVER, and the shade the wall throws on the lanes, the light coming from the
   * top-left: the left one's across them, a dark line at the right one's foot. All of it drawn
   * under the notes and bar lines (renderOrder), the deck painting its own shade (deckArt.wallShade).
   */
  private buildWall(look: SideLook, side: -1 | 1, lift: number, tile: number, z: number): void {
    const { width, length } = this.geometry;
    const along = length + TRACK_TAIL;
    const faceTexture = (lit: boolean): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(tile * BORDER_SCALE));
      canvas.height = Math.max(2, Math.round((lift / PX) * BORDER_SCALE));
      paintFace(canvas.getContext('2d') as CanvasRenderingContext2D, canvas.width, canvas.height, look, side, BORDER_SCALE, lit);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.MirroredRepeatWrapping;
      texture.anisotropy = 8;
      texture.repeat.set(along / (tile * PX), 1);
      return this.own(texture);
    };
    const map = faceTexture(false);
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
    // a plane turned to face the lanes: its width runs along the track, its height up the wall
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    face.scale.set(along, lift, 1);
    face.position.set((side * width) / 2, lift / 2, z);
    face.renderOrder = 0.98;
    this.scene.add(face);
    const lit = faceTexture(true);
    this.borderMaps.push([material, map, lit]);
    // the face's u runs to the far end on the left wall, to the near end on the right one
    const sweep = new THREE.Mesh(face.geometry, this.sweepMaterial(lit, 'u', side > 0));
    sweep.rotation.copy(face.rotation);
    sweep.scale.copy(face.scale);
    sweep.position.set(face.position.x - side * 0.0003, face.position.y, face.position.z);
    sweep.renderOrder = 0.985;
    this.scene.add(sweep);
    const reach = side < 0 ? lift * 1.4 : lift * 0.35;
    const shade = this.own(gradientTexture(side < 0 ? [[0, 'rgba(0,0,0,0.42)'], [1, 'rgba(0,0,0,0)']] : [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]));
    const strip = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false }));
    strip.scale.set(reach, 1, along);
    strip.position.set(side * (width / 2 - reach / 2), 0.0062, z);
    strip.renderOrder = 1.25;
    this.scene.add(strip);
  }

  /** How far under the middle of the judge line the deck starts (plane px): 3 px under the line (judgeFit times, as the line is), then the gap where the lanes run on (GEAR_JUDGE.gap). */
  private get deckOffset(): number {
    return (GEAR_JUDGE.height / 2 + 3) * this.judgeFit + GEAR_JUDGE.gap;
  }

  /**
   * The judge line, thick and red with a light core down its middle (GEAR_JUDGE), and its glow above
   * and below it, all of it showing in the gap over the deck. Transparent so it sorts after the
   * covers (renderOrder) and stays on top of them.
   */
  private buildJudgementLine(): THREE.Mesh {
    const { width } = this.geometry;
    const j = judgeOf(this.style.deck);
    const line = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ color: hex(j.line), transparent: true, depthWrite: false }));
    // between the rails: it never runs over the gear's edges
    line.scale.set(width, 1, j.height * PX);
    line.position.set(0, LINE_Y, 0);
    line.renderOrder = 9.5;
    this.judgeGroup.add(line);
    // a light core down the line's middle: it reads as lit, not painted
    const core = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ color: hex(j.core), transparent: true, depthWrite: false }));
    core.scale.set(width, 1, j.height * 0.28 * PX);
    core.position.set(0, LINE_Y, 0);
    core.renderOrder = 9.52;
    this.judgeGroup.add(core);
    this.scene.add(this.judgeGroup);
    // the sheets' box-shadow (0 0 <blur>px at 80 %) above and below the line
    const glow = new THREE.Mesh(
      this.flatGeometry,
      tintMaterial({
        map: this.own(judgeGlowTexture(width / PX, j.height, j.blur, 0.8)),
        color: hex(j.glow),
        transparent: true,
        opacity: this.reducedFlash ? 0.6 : 1,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.scale.set(width, 1, (j.height + 2 * shadowReach(j.blur)) * PX);
    glow.position.set(0, LINE_Y, 0);
    glow.renderOrder = 9.45;
    this.judgeGroup.add(glow);
    return glow;
  }

  private buildBeams(): void {
    const texture = this.own(linearFadeTexture());
    this.geometry.lanes.forEach((lane) => {
      const beam = new THREE.Mesh(
        this.flatGeometry,
        new THREE.MeshBasicMaterial({ map: texture, color: this.laneColors[lane.index], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      beam.scale.set(lane.width * 0.96, 1, Math.max(this.beamLength, 1e-3));
      beam.position.set(lane.x, 0.04, this.judgeZ - this.beamLength / 2);
      // under the notes, as the sheets draw it: a pressed lane never washes its notes out
      beam.renderOrder = 2.5;
      beam.visible = false;
      this.scene.add(beam);
      this.beams.push(beam);
      this.beamLevels.push(0);
      // what a held long note shows: the hit's hold flipbook over a glow, or the start of its hit
      // effect (a side lane over the keys: as large as its half, over a band across it), and the
      // light flowing down the note into the line
      const hold = this.flipbook ? this.art.hitHold : undefined;
      const source = hold?.texture ?? this.hitSheet?.texture;
      if (source) this.holds.push(this.effectQuad(source, hold ? hold.spec.flipbook ?? null : this.hitSheet, 0.7));
      this.bands.push(source && lane.over ? this.flashQuad() : null);
      const burst = this.art.hitBurst;
      if (hold?.spec.flipbook && burst?.spec.flipbook) this.holdCores.push(this.effectQuad(burst.texture, burst.spec.flipbook, 0.8));
      this.tickAt.push(-Infinity);
      this.tickBurstAt.push(-Infinity);
      this.heldFar.push(null);
      if (source && !lane.over) this.flows[lane.index] = this.flowQuad();
    });
  }

  /**
   * The deck under the judge line, its picture painted in layoutDeck. It is drawn after what runs under it (renderOrder) and over it whatever the depth buffer holds:
   * the track's long strips reach behind the camera, and their depth near it can come out nearer
   * than the deck's, a few hundredths over them. Its own depth hides the judge line's halo under it.
   * Its picture is opaque, so it is written as it is, with no blending.
   */
  private buildDeck(): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ fog: false, transparent: true, blending: THREE.NoBlending, depthFunc: THREE.AlwaysDepth });
    const deck = new THREE.Mesh(this.flatGeometry, material);
    deck.renderOrder = 9.05;
    this.scene.add(deck);
    return deck;
  }

  /**
   * Puts the deck under the judge line, as deep as the camera shows (and more, for a tilted camera).
   * It stays where it is (the unlifted line at z 0): LIFT raises the line away from it and covers the
   * lanes between them, as SUDDEN+ covers the far end. Its picture is painted for that room in a later
   * frame (see DECK_SETTLE_FRAMES).
   */
  private layoutDeck(): void {
    if (!this.deck) return;
    this.fitNoteDepth();
    const { width } = this.geometry;
    // the judge line and the gap under it as deep on the screen in every camera: drawn longer along
    // the track where the camera flattens it, as round things on the deck are (deckStretch)
    this.judgeFit = Math.max(1, Math.round((0.85 / this.trackAspect(this.judgeZ) / PERSPECTIVE_STRETCH) * 20) / 20);
    this.judgeGroup.scale.z = this.judgeFit;
    const top = this.deckOffset * PX;
    this.nearClip.constant = this.hiddenCut ?? notesEndZ(this.judgeZ, this.deckOffset * PX);
    // LIFT's cover over the lanes from the gap under the raised line down to the gear
    this.span(this.liftCover, this.judgeZ + this.deckOffset * PX, top, this.judgeZ < 0);
    const shown = Math.max(this.screenBottomZ(), top + 0.4) - top;
    const room = Math.max(DECK_STEP, Math.floor(shown / PX / DECK_STEP) * DECK_STEP) * PX;
    const depth = room + 2 + DECK_STEP * PX;
    this.deck.scale.set(width, 1, depth);
    this.deck.position.set(0, DECK_Y, top + depth / 2);
    this.deckTopZ = top;
    this.planeVersion++;
    // round things on the deck look round, drawn longer along the track where the camera flattens it
    const stretch = deckStretch(Math.round(room / PX), (band) => 0.85 / this.trackAspect(top + STRETCH_TOP * PX + (band * PX) / 2));
    this.readouts = deckReadouts(this.style.deck, { width: width / PX, room: room / PX, stretch });
    const painted = `${Math.round(room / PX)}|${stretch}`;
    if (painted !== this.deckPainted) {
      this.deckPainted = painted;
      this.deckPending = { room, depth, stretch };
      this.deckWait = 0;
    }
    // effects lying on the track are drawn longer where the camera flattens it
    this.stretch = Math.min(2.6, Math.max(1, EFFECT_ASPECT / this.trackAspect(this.judgeZ)));
  }

  /**
   * The coin and the stars as deep as keeps their shape at the judge line for this camera and screen
   * (see noteDepthOf), in steps, so a window being resized paints their pictures again only now and
   * then: a new depth drops the pictures made for the old one.
   */
  private fitNoteDepth(): void {
    const depth = noteDepthOf(this.style.note, this.barDepth, this.keyLane.width * noteWidthOf(this.style.note), 1 / this.trackAspect(this.judgeZ), noteShapeOf(this.style.note, this.images));
    const stepped = Math.round(depth / NOTE_DEPTH_STEP) * NOTE_DEPTH_STEP;
    if (Math.abs(stepped - this.noteDepth) < 1e-9) return;
    this.noteDepth = stepped;
    this.laneDepths = this.lanesDeep(stepped);
    this.sideNoteDepth = stepped + 2 * SIDE_EDGE;
    this.noteReach = this.deepestNote() / 2;
    for (const [textures, materials] of [
      [this.noteTextures, this.noteMaterials],
      [this.sideTextures, this.sideMaterials],
    ] as [Map<unknown, THREE.Texture>, Map<string, THREE.Material>][]) {
      textures.forEach((t) => {
        t.dispose();
        const at = this.ownedTextures.indexOf(t);
        if (at >= 0) this.ownedTextures.splice(at, 1);
      });
      textures.clear();
      materials.forEach((m) => m.dispose());
      materials.clear();
    }
  }

  /** A key lane: the notes of the others are drawn after its. */
  private get keyLane(): LaneGeom {
    return this.geometry.lanes.find((l) => l.kind === 'key') ?? this.geometry.lanes[0];
  }

  /** Each lane's notes' depth for key notes `depth` deep (see laneDepthOf). */
  private lanesDeep(depth: number): number[] {
    return this.geometry.lanes.map((l) => laneDepthOf(this.style.note, depth, l.width / this.keyLane.width, this.barDepth));
  }

  /** The deepest note on the track: a note is in view once its time is half this past the track's far end. */
  private deepestNote(): number {
    return Math.max(...this.geometry.lanes.map((l, i) => (l.over ? this.sideNoteDepth : this.laneDepths[i])));
  }

  /** Whether the deck has a picture yet (the first is painted at once). */
  private get deckPictured(): boolean {
    return Boolean((this.deck.material as THREE.MeshBasicMaterial).map);
  }

  /** The deck's picture: the gear's plate for `room` of it on the screen. */
  private paintDeckPicture(d: DeckLayout): void {
    this.deckPending = null;
    const { width, lanes } = this.geometry;
    const canvas = document.createElement('canvas');
    const scale = Math.min(DECK_PICTURE, 2048 / (width / PX), 2048 / (d.depth / PX));
    canvas.width = Math.round((width / PX) * scale);
    canvas.height = Math.round((d.depth / PX) * scale);
    // opaque to its last px (the deck is drawn without blending, see buildDeck)
    const g = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    g.scale(scale, scale);
    const left = (l: LaneGeom) => (l.x - l.width / 2 + width / 2) / PX;
    // where a gear's plate drawn in code puts the parts its lights shine on
    const marks: DeckMark[] = [];
    const spec: DeckSpec = {
      width: width / PX,
      room: d.room / PX,
      depth: d.depth / PX,
      stretch: d.stretch,
      lanes: lanes.filter((l) => !l.over).map((l) => ({ left: left(l), width: l.width / PX, kind: keyKind(l), ...(l.kind === 'side' ? { side: true } : {}) })),
      sides: lanes.filter((l) => l.over).map((l) => ({ left: left(l), width: l.width / PX })),
      marks,
    };
    this.platePaint(g, spec);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // seen from close by, never much smaller than painted: no mipmaps to make on every upload; but
    // a camera that flattens the track (the plane one) shows it many times shorter along it, where
    // its thin lines would come and go without them
    const flattened = d.stretch > PERSPECTIVE_STRETCH;
    texture.generateMipmaps = flattened;
    texture.minFilter = flattened ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.anisotropy = 4;
    const material = this.deck.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
    // over the deck's picture, as it is laid on the deck (deckArt.deckPicture), or over what its plate drew in code
    const pictured = deckFromPicture(this.style.deck, spec, gearArtOf(this.style.deck, this.images));
    this.layPressKeys(
      deckKeys(this.style.deck, spec, pictured),
      lanes.filter((l) => !l.over).map((l) => l.index),
      width,
    );
    // the gear's lights where its picture shows the parts, or on the parts its plate drawn in code marked (plane px)
    const across = width / DECK_PICTURE_PX;
    if (pictured) this.gearLights.place({ left: -width / 2, top: this.deckTopZ, across, along: (across * d.stretch) / DECK_PICTURE_STRETCH, y: DECK_Y }, null);
    else this.gearLights.place({ left: -width / 2, top: this.deckTopZ, across: PX, along: PX, y: DECK_Y }, marks);
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
  private noteTexture(kind: NoteMark): THREE.Texture {
    let texture = this.noteTextures.get(kind);
    if (!texture) {
      const lane = this.geometry.lanes.find((l) => noteKindOf(l) === kind) ?? this.geometry.lanes[0];
      const h = NOTE_PICTURE_PX;
      const w = Math.round(Math.min(512, Math.max(32, (h * lane.width * noteWidthOf(this.style.note)) / this.laneDepths[lane.index])));
      const paint = this.notePaint;
      texture = this.own(paintTexture(w, h, kind === 'side' && this.sideDots ? dotsNote : (g, pw, ph) => paint(g, pw, ph, kind)));
      this.noteTextures.set(kind, texture);
    }
    return texture;
  }

  private noteMaterial(color: number, kind: NoteMark): THREE.MeshBasicMaterial {
    const key = `${kind}:${color}`;
    let m = this.noteMaterials.get(key);
    if (!m) {
      // the picture's alpha is the note's outline; no fog: a note reads at full strength from the
      // moment it comes into view (the floor keeps it); a slab's walls reach under the track
      // (slabGeometry): nothing that lies on it hides them
      m = tintMaterial({ color, vertexColors: true, clippingPlanes: this.clipPlanes, transparent: true, depthTest: false, fog: false, map: this.noteTexture(kind), alphaTest: 0.02 });
      this.noteMaterials.set(key, m);
    }
    return m;
  }

  /** Filtering and frame size of the hit's flipbooks, set before they are first uploaded (a texture without frames is left out). */
  private prepareArt(): void {
    for (const slot of HIT_SLOTS) {
      const art = this.art[slot];
      if (!art) continue;
      // one mip level per lookup, not two: half the texture reads, which a software renderer (SwiftShader) feels
      art.texture.minFilter = THREE.LinearMipmapNearestFilter;
      if (art.spec.flipbook) art.texture.repeat.set(1 / art.spec.flipbook.cols, 1 / art.spec.flipbook.rows);
      else delete this.art[slot];
    }
  }

  private own<T extends THREE.Texture>(texture: T): T {
    this.ownedTextures.push(texture);
    return texture;
  }

  private bodyMaterial(color: number, state: 'idle' | 'held' | 'missed', dots = false): THREE.MeshBasicMaterial {
    const key = `${dots ? 'dots:' : ''}${color}:${state}`;
    let m = this.bodyMaterials.get(key);
    if (!m) {
      const params: THREE.MeshBasicMaterialParameters = {
        color,
        map: dots ? this.dotsLongTextures().body : state === 'held' && this.longHeld ? this.longHeld.body : this.longBody,
        transparent: true,
        opacity: HOLD_OPACITY[state],
        depthWrite: false,
        // its walls reach under the track (slabGeometry): nothing that lies on it hides them
        depthTest: false,
        vertexColors: true,
        clippingPlanes: this.clipPlanes,
        fog: false,
      };
      m = tintMaterial(params, { gain: HOLD_BRIGHTNESS[state] });
      this.bodyMaterials.set(key, m);
    }
    return m;
  }

  private endMaterial(color: number, state: 'idle' | 'held' | 'missed', dots = false): THREE.MeshBasicMaterial {
    const key = `${dots ? 'dots:' : ''}${color}:${state}`;
    let m = this.endMaterials.get(key);
    if (!m) {
      const map = dots ? this.dotsLongTextures().end : state === 'held' && this.longHeld ? this.longHeld.end : this.longEnd;
      m = tintMaterial(
        { color, map, transparent: true, opacity: HOLD_OPACITY[state], depthWrite: false, depthTest: false, vertexColors: true, clippingPlanes: this.clipPlanes, fog: false },
        { gain: HOLD_BRIGHTNESS[state] },
      );
      this.endMaterials.set(key, m);
    }
    return m;
  }

  /** The pictures of a side lane's long note of dots, painted at its first. */
  private dotsLongTextures(): { body: THREE.Texture; end: THREE.Texture } {
    if (!this.dotsLong) {
      const body = this.own(paintTexture(64, Math.round(64 * DOTS_LONG.tile), DOTS_LONG.body));
      body.wrapT = THREE.RepeatWrapping;
      this.dotsLong = { body, end: this.own(paintTexture(64, Math.max(4, Math.round(64 * DOTS_LONG.endDepth)), DOTS_LONG.end)) };
    }
    return this.dotsLong;
  }
}

function isGone(n: Readonly<SessionNote>, timeMs: number): boolean {
  return n.headDone && n.tailDone && n.endT < timeMs - MISSED_VISIBLE_MS - 100;
}

/**
 * A note's picture as a solid slab, `depth` thick under its top at `top` (a 1 × 1 picture laid flat,
 * as flatGeometry): the picture on top and SLAB_SLICES copies of it under it, each lower and darker
 * (vertex colours), down to its foot. From above and in front the copies show past the top's near
 * edge and sides as the slab's walls, shaded as they turn from the light (lighter on the left, the
 * side the light comes from), and the top hides the rest. The layers are drawn foot first (index
 * order) with no depth test: a slab reaches under the track, whose floor must not hide its walls, and
 * the notes are see-through, so they are drawn far to near and a nearer slab covers a farther one.
 * `crop`: the share of the picture, from its near edge, a wall layer takes (0: all of it); the rest
 * of a layer would only ever lie under the top.
 */
export function slabGeometry(top: number, depth: number, crop: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const layer = (y: number, share: number, shade: number, lit: number) => {
    const first = positions.length / 3;
    const zFar = 0.5 - share;
    // as PlaneGeometry(1, 1) laid flat: far left, far right, near left, near right
    for (const [x, z, u, v] of [
      [-0.5, zFar, 0, share],
      [0.5, zFar, 1, share],
      [-0.5, 0.5, 0, 0],
      [0.5, 0.5, 1, 0],
    ]) {
      positions.push(x, y, z);
      uvs.push(u, v);
      const c = Math.min(1, shade * (1 - 2 * x * lit));
      colors.push(c, c, c);
    }
    index.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
  };
  for (let i = SLAB_SLICES; i >= 1; i--) {
    const shade = WALL_TOP + ((WALL_FOOT - WALL_TOP) * (i - 1)) / Math.max(1, SLAB_SLICES - 1);
    layer(top - (depth * i) / SLAB_SLICES, crop > 0 ? crop : 1, shade, WALL_LIT);
  }
  layer(top, 1, 1, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A soft band of light across a gear frame's sweep: grey levels (an alpha map reads the green), dark
 * at both ends so the texture's clamped edge shows nothing, along v (a frame's top) or u (a wall's face).
 */
function bandTexture(axis: 'u' | 'v'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = axis === 'u' ? 256 : 4;
  canvas.height = axis === 'u' ? 4 : 256;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = axis === 'u' ? ctx.createLinearGradient(0, 0, 256, 0) : ctx.createLinearGradient(0, 0, 0, 256);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const v = Math.round(255 * Math.exp(-(((t - 0.5) / 0.2) ** 2)) * Math.min(1, Math.min(t, 1 - t) * 12));
    g.addColorStop(t, `rgb(${v},${v},${v})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The light flowing down a held long note (drawFlows): streaks running toward the judge line, each
 * brightest at its head (toward the line) with a long tail fading behind it, bright down the middle
 * of the note and soft to its sides, repeating along it (light on black, white: the material
 * colours it). Canvas top is v = 1, the far end of a run: a streak's head lies below its tail.
 */
function flowTexture(): THREE.Texture {
  const [w, h] = [32, 256];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(w, h);
  // each streak's head (share of a run, from its near end), its tail's length and its brightness
  const streaks = [
    [0.12, 0.3, 0.75],
    [0.45, 0.2, 0.5],
    [0.74, 0.34, 0.65],
  ];
  for (let y = 0; y < h; y++) {
    // v from the near end of a run (the bottom of the canvas)
    const v = 1 - (y + 0.5) / h;
    let along = 0.1;
    for (const [head, tail, bright] of streaks) {
      // ahead of the head (toward the line) it ends quickly; behind it, it fades out slowly
      let d = v - head;
      d -= Math.round(d);
      along += bright * (d >= 0 ? Math.exp(-((d / 0.04) ** 2)) : Math.exp(d / tail));
    }
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5;
      const across = Math.exp(-((u / 0.15) ** 2)) + 0.25 * Math.exp(-((u / 0.32) ** 2));
      const level = Math.round(255 * Math.min(1, across * Math.min(1, along)));
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = level;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
