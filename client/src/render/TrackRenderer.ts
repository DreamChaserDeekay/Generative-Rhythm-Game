import * as THREE from 'three';
import type { CameraPreset, KeyModeConfig, LaneKind } from '../engine/config';
import type { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import type { CameraPoseFx } from './cameraFx';
import { cameraPose, computeTrackGeometry, type TrackGeometry } from './layout';
import { FEVER_COLORS, type Palette } from './palette';
import { disposeSkinArt, flipbookOffset, type ArtTexture, type MediaEffects, type SkinArt } from './skinArt';
import { hex, laneColorsFor, type Skin } from './skins';

const MISSED_COLOR = 0x4a5068;
/**
 * Long note bodies: lighter than the lane colour and mostly opaque so they read on a dark track
 * before they are pressed (dark lane colours such as blue vanished at 40% opacity), brighter while
 * held, dim once broken.
 */
const HOLD_BODY = {
  idle: { lighten: 0.35, opacity: 0.92 },
  held: { lighten: 0.6, opacity: 1 },
  missed: { lighten: 0, opacity: 0.4 },
} as const;
const HOLD_BODY_WIDTH = 0.8;
/** How far the track extends below the judgement line, toward the camera. */
const TRACK_TAIL = 4;
const NOTE_HEIGHT = 0.2;
/** Every skin's notes are this deep on the track, textured ones too (a picture's proportions made them half as tall on screen). */
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
}

type NoteKind = 'note' | 'side' | 'scratch';
const NOTE_KIND: Record<LaneKind, NoteKind> = { key: 'note', side: 'side', scratch: 'scratch' };

interface BurstSprite {
  sprite: THREE.Sprite;
  /** Own copy of the sheet (sharing its image), so each sprite shows its own frame. */
  texture: THREE.Texture;
  start: number;
  lane: number;
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
  private readonly reducedFlash: boolean;
  private readonly noteGeometry: THREE.BufferGeometry;
  private readonly baseQuaternion = new THREE.Quaternion();
  private baseFov = 40;
  private appliedFx = { roll: 0, fovScale: 1 };
  private readonly flatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** Far plane hides what SUDDEN+ covers; near plane hides HIDDEN+ and everything under LIFT. */
  private readonly farClip = new THREE.Plane(new THREE.Vector3(0, 0, 1), FAR_AWAY);
  private readonly nearClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), FAR_AWAY);
  private readonly clipPlanes = [this.farClip, this.nearClip];
  private readonly noteMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly bodyMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly notePool: MeshPool;
  private readonly bodyPool: MeshPool;
  private readonly barPool: MeshPool;
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamLevels: number[] = [];
  private readonly holdGlows: THREE.Sprite[] = [];
  private readonly effects: { sprite: THREE.Sprite; start: number; lane: number }[] = [];
  /** Textures of the skin by part; empty when everything is drawn in code. */
  private readonly art: SkinArt['slots'];
  private readonly artSource: SkinArt | null;
  private readonly artEffects: MediaEffects;
  /** Flipbook hit effects ('sprite' skins), reused once they finish. */
  private readonly bursts: BurstSprite[] = [];
  /** Copies of skin textures made here (mirrored rail, per-sprite flipbook frames). */
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly glowTexture = radialTexture();
  private readonly holdTexture = holdBodyTexture();
  private readonly ringTexture = ringTexture();
  private readonly judgeGroup = new THREE.Group();
  private readonly judgeGlowMaterial: THREE.MeshBasicMaterial;
  private readonly rails: THREE.MeshBasicMaterial[] = [];
  private readonly feverOverlay: THREE.Mesh;
  private readonly suddenCover: THREE.Mesh;
  private readonly suddenEdge: THREE.Mesh;
  private readonly hiddenCover: THREE.Mesh;
  private readonly hiddenEdge: THREE.Mesh;
  private readonly liftCover: THREE.Mesh;
  private judgeZ = 0;
  private firstLive = 0;
  private lastFrameMs = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement, options: TrackRendererOptions) {
    this.geometry = computeTrackGeometry(options.mode, options.trackWidth, options.trackLength);
    this.skin = options.skin;
    this.artSource = options.art ?? null;
    this.art = { ...options.art?.slots };
    this.artEffects = options.art?.effects ?? { reducedFlashOpacity: 0.45, reducedFlashScale: 0.8 };
    this.prepareArt();
    this.laneColors = laneColorsFor(options.skin, options.palette, options.mode);
    this.noteGeometry = createNoteGeometry(options.skin.noteShape, Boolean(this.art.note || this.art.side || this.art.scratch));
    this.reducedFlash = options.reducedFlash;
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
    this.setCovers(options.covers);

    this.notePool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.noteGeometry, this.noteMaterial(this.laneColors[0], 'note'));
      mesh.renderOrder = 4;
      return mesh;
    });
    this.bodyPool = new MeshPool(this.scene, () => {
      // a textured body has its own UVs: the texture repeats along the note
      const geometry = this.art.longBody ? this.flatGeometry.clone() : this.flatGeometry;
      const mesh = new THREE.Mesh(geometry, this.bodyMaterial(this.laneColors[0], 'idle'));
      mesh.renderOrder = 3;
      return mesh;
    });
    const barMaterial = new THREE.MeshBasicMaterial({
      color: hex(this.skin.colors.bar),
      transparent: true,
      opacity: 0.35,
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
  }

  /** Moves SUDDEN+ / HIDDEN+ / LIFT (all shares, see settings). */
  setCovers(c: CoverLayout): void {
    const L = this.geometry.length;
    this.judgeZ = -c.lift * L;
    const travel = L + this.judgeZ;
    this.judgeGroup.position.z = this.judgeZ;
    this.beams.forEach((beam) => (beam.position.z = this.judgeZ - BEAM_LENGTH / 2));
    this.holdGlows.forEach((g) => (g.position.z = this.judgeZ));

    const suddenZ = this.judgeZ - travel * (1 - c.sudden);
    const hiddenZ = this.judgeZ - travel * c.hidden;
    this.farClip.constant = c.sudden > 0 ? -suddenZ : FAR_AWAY;
    // Under LIFT nothing passes the judgement line; otherwise missed notes run on toward the camera.
    const nearLimit = c.hidden > 0 ? hiddenZ : c.lift > 0 ? this.judgeZ + NOTE_DEPTH / 2 : FAR_AWAY;
    this.nearClip.constant = nearLimit;

    this.span(this.suddenCover, -L - 0.5, suddenZ, c.sudden > 0);
    this.span(this.suddenEdge, suddenZ - 0.06, suddenZ + 0.06, c.sudden > 0);
    this.span(this.hiddenCover, hiddenZ, this.judgeZ, c.hidden > 0);
    this.span(this.hiddenEdge, hiddenZ - 0.06, hiddenZ + 0.06, c.hidden > 0);
    this.span(this.liftCover, this.judgeZ, TRACK_TAIL, c.lift > 0);
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.camera.aspect = this.cssWidth / this.cssHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Camera roll applied by the last frame (radians, positive turns the track clockwise). */
  get roll(): number {
    return this.appliedFx.roll;
  }

  /** CSS pixel position of a world point (with the camera effects of the last frame). */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.cssWidth, y: ((1 - v.y) / 2) * this.cssHeight };
  }

  /** Forget per-run state before replaying a chart. */
  reset(): void {
    this.firstLive = 0;
    this.beamLevels.fill(0);
    for (const e of this.effects) {
      this.scene.remove(e.sprite);
      e.sprite.material.dispose();
    }
    this.effects.length = 0;
    for (const b of this.bursts) b.sprite.visible = false;
  }

  /** Burst at the judgement line of a lane. */
  hitEffect(lane: number, color: number, perfNow: number): void {
    if (this.skin.hitEffect === 'none') return;
    const burst = this.skin.hitEffect === 'sprite' ? this.art.hitBurst : undefined;
    if (burst) {
      this.spawnBurst(burst, lane, color, perfNow);
      return;
    }
    const material = new THREE.SpriteMaterial({
      map: this.skin.hitEffect === 'ring' ? this.ringTexture : this.glowTexture,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    const g = this.geometry.lanes[lane];
    sprite.position.set(g.x, 0.25, this.judgeZ);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.effects.push({ sprite, start: perfNow, lane });
  }

  render(frame: TrackFrame, perfNow: number): void {
    const dt = this.lastFrameMs > 0 ? Math.min(100, perfNow - this.lastFrameMs) : 16;
    this.lastFrameMs = perfNow;
    this.drawNotes(frame);
    this.drawBars(frame);
    this.drawBeams(frame, dt);
    this.drawEffects(perfNow);
    this.drawFever(frame);
    this.applyCameraFx(frame.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private applyCameraFx(fx: CameraPoseFx | undefined): void {
    const roll = fx?.roll ?? 0;
    const fovScale = fx?.fovScale ?? 1;
    if (roll === this.appliedFx.roll && fovScale === this.appliedFx.fovScale) return;
    this.appliedFx = { roll, fovScale };
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
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      }
    });
    this.glowTexture.dispose();
    this.holdTexture.dispose();
    this.ringTexture.dispose();
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
    for (let i = this.firstLive; i < notes.length; i++) {
      const n = notes[i];
      if (scroll.distance(n.t, timeMs) > scroll.travel) break;
      const lane = this.geometry.lanes[n.lane];
      const color = this.laneColors[n.lane];
      const height = lane.kind === 'side' ? SIDE_NOTE_HEIGHT : NOTE_HEIGHT;
      const kind = NOTE_KIND[lane.kind];
      if (n.type === 'tap') {
        if (!n.headDone) this.placeNote(lane.x, lane.width, z(n.t), color, height, kind);
        else if (n.broken && n.t > timeMs - MISSED_VISIBLE_MS) this.placeNote(lane.x, lane.width, z(n.t), MISSED_COLOR, height, kind);
        continue;
      }
      const held = frame.heldNote(n.lane) === n.index;
      if (n.tailDone && !n.broken) continue;
      if (n.broken && n.endT < timeMs - MISSED_VISIBLE_MS) continue;
      const headZ = held ? this.judgeZ : z(n.t);
      const tailZ = Math.max(-L, z(n.endT));
      const state = n.broken ? 'missed' : held ? 'held' : 'idle';
      const bodyColor = n.broken ? MISSED_COLOR : color;
      // Only the body: its near edge is the press and its far edge the release. Note-shaped caps
      // on the ends read as extra tap notes.
      if (headZ > tailZ) {
        const body = this.bodyPool.next();
        body.material = this.bodyMaterial(bodyColor, state);
        body.scale.set(lane.width * HOLD_BODY_WIDTH, 1, headZ - tailZ);
        body.position.set(lane.x, 0.02, (headZ + tailZ) / 2);
        if (this.art.longBody) this.setBodyUv(body, this.art.longBody, lane.width * HOLD_BODY_WIDTH, headZ, tailZ, z(n.endT));
      }
    }
    this.notePool.end();
    this.bodyPool.end();
    this.updateHoldGlows(frame);
  }

  private placeNote(x: number, laneWidth: number, z: number, color: number, height: number, kind: NoteKind): void {
    const mesh = this.notePool.next();
    mesh.material = this.noteMaterial(color, kind);
    mesh.scale.set(laneWidth * 0.9, height, NOTE_DEPTH);
    mesh.position.set(x, height / 2, z);
  }

  private noteArt(kind: NoteKind): ArtTexture | undefined {
    return this.art[kind] ?? this.art.note;
  }

  /** The body texture is pinned to the note's real tail, so it travels with the note (also while held). */
  private setBodyUv(mesh: THREE.Mesh, art: ArtTexture, width: number, nearZ: number, farZ: number, tailZ: number): void {
    const tile = width * (art.spec.tileAspect ?? 2);
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
    for (const t of frame.barTimes) {
      if (t < timeMs - 300) continue;
      if (scroll.distance(t, timeMs) > scroll.travel) break;
      const bar = this.barPool.next();
      bar.scale.set(this.geometry.width, 1, 0.05);
      bar.position.set(0, 0.012, scroll.z(t, timeMs));
    }
    this.barPool.end();
  }

  private drawBeams(frame: TrackFrame, dt: number): void {
    const decay = Math.exp(-dt / 70);
    const peak = this.reducedFlash ? 0.24 : 0.42;
    this.beams.forEach((beam, lane) => {
      const level = frame.keyDown(lane) ? peak : this.beamLevels[lane] * decay;
      this.beamLevels[lane] = level;
      (beam.material as THREE.MeshBasicMaterial).opacity = level;
      beam.visible = level > 0.01;
    });
  }

  private updateHoldGlows(frame: TrackFrame): void {
    const hold = this.art.hitHold;
    this.holdGlows.forEach((glow, lane) => {
      const held = frame.heldNote(lane) !== null;
      glow.visible = held;
      if (held && hold?.spec.flipbook) {
        const book = hold.spec.flipbook;
        // each lane starts at another frame, so neighbouring sparks do not move in step
        const n = Math.floor((frame.timeMs / 1000) * book.fps) + lane * 5;
        const [u, v] = flipbookOffset(book, ((n % book.frames) + book.frames) % book.frames);
        glow.material.map?.offset.set(u, v);
        const w = Math.min(this.geometry.lanes[lane].width, 1.6);
        const s = w * (hold.spec.scale ?? 1.5) * (this.reducedFlash ? this.artEffects.reducedFlashScale : 1);
        glow.scale.set(s, s, 1);
        glow.material.opacity = this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1;
      } else if (held) {
        const pulse = this.reducedFlash ? 1 : 1 + 0.12 * Math.sin(frame.timeMs / 45);
        const w = this.geometry.lanes[lane].width;
        glow.scale.set(Math.min(w, 1.6) * 1.3 * pulse, Math.min(w, 1.6) * 1.3 * pulse, 1);
      }
    });
  }

  private drawEffects(perfNow: number): void {
    const strength = this.reducedFlash ? 0.45 : 1;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const p = (perfNow - e.start) / EFFECT_MS;
      if (p >= 1) {
        this.scene.remove(e.sprite);
        e.sprite.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      const w = this.geometry.lanes[e.lane].width;
      const s = Math.min(w, 1.6) * (0.9 + (this.reducedFlash ? 0.4 : 1.0) * p);
      e.sprite.scale.set(s * 1.25, s, 1);
      e.sprite.material.opacity = strength * (1 - p) * (1 - p);
    }
    const burst = this.art.hitBurst;
    if (burst) for (const b of this.bursts) if (b.sprite.visible) this.drawBurst(b, burst, perfNow);
  }

  private spawnBurst(burst: ArtTexture, lane: number, color: number, perfNow: number): void {
    let b = this.bursts.find((x) => !x.sprite.visible);
    if (!b) {
      const texture = this.ownTexture(burst.texture.clone());
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }),
      );
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      b = { sprite, texture, start: 0, lane: 0 };
      this.bursts.push(b);
    }
    b.sprite.material.color.setHex(color);
    b.start = perfNow;
    b.lane = lane;
    b.sprite.position.set(this.geometry.lanes[lane].x, 0.25, this.judgeZ);
    b.sprite.visible = true;
    this.drawBurst(b, burst, perfNow);
  }

  /** A flipbook burst plays its frames once; then the sprite is free again. */
  private drawBurst(b: BurstSprite, burst: ArtTexture, perfNow: number): void {
    const book = burst.spec.flipbook;
    const frame = book ? ((perfNow - b.start) / 1000) * book.fps : Infinity;
    if (!book || frame >= book.frames) {
      b.sprite.visible = false;
      return;
    }
    const [u, v] = flipbookOffset(book, frame);
    b.texture.offset.set(u, v);
    const w = Math.min(this.geometry.lanes[b.lane].width, 1.6);
    const s = w * (burst.spec.scale ?? 1.7) * (this.reducedFlash ? this.artEffects.reducedFlashScale : 1);
    b.sprite.scale.set(s, s, 1);
    // the sheet fades by itself; its last frames fade out too, so the sprite does not cut off
    const p = frame / book.frames;
    b.sprite.material.opacity = (this.reducedFlash ? this.artEffects.reducedFlashOpacity : 1) * Math.min(1, (1 - p) / 0.3);
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
    this.rails[0]?.color.setHex(active ? tint : hex(this.skin.colors.railLeft));
    this.rails[1]?.color.setHex(active ? tint : hex(this.skin.colors.railRight));
    this.judgeGlowMaterial.color.setHex(active ? tint : hex(this.skin.colors.judgeGlow));
  }

  private buildTrack(): void {
    const { width, length, lanes } = this.geometry;
    const base = new THREE.PlaneGeometry(width + 0.3, length + TRACK_TAIL, 1, 24).rotateX(-Math.PI / 2);
    base.translate(0, 0, (TRACK_TAIL - length) / 2);
    const pos = base.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const near = new THREE.Color(hex(this.skin.colors.trackNear));
    const far = new THREE.Color(hex(this.skin.colors.trackFar));
    // a floor tile multiplies the track colours; its gain (sRGB, so ^2.2 on these linear colours) keeps their mean
    const floor = this.art.floor;
    const gain = floor ? Math.pow(floor.spec.gain ?? 1, 2.2) : 1;
    for (let i = 0; i < pos.count; i++) {
      const depth = Math.min(1, Math.max(0, -pos.getZ(i) / length));
      c.copy(near).lerp(far, depth).multiplyScalar(gain);
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

    const strip = (x: number, w: number, color: number, opacity: number) => {
      const mesh = this.flat(color, opacity, 1);
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      mesh.position.set(x, 0.005, (TRACK_TAIL - length) / 2);
      return mesh.material as THREE.MeshBasicMaterial;
    };
    lanes.forEach((lane) => {
      if (lane.color === 'blue' && this.skin.laneLayout === 'mode') strip(lane.x, lane.width, this.laneColors[lane.index], 0.08);
      if (lane.kind === 'scratch') strip(lane.x, lane.width, 0x5a1438, 0.35);
      if (lane.kind === 'side') strip(lane.x, lane.width, this.laneColors[lane.index], 0.1);
    });
    const divider = hex(this.skin.colors.divider);
    for (let i = 1; i < lanes.length; i++) {
      const sideEdge = lanes[i].kind === 'side' || lanes[i - 1].kind === 'side';
      strip(lanes[i].x - lanes[i].width / 2, sideEdge ? 0.05 : 0.025, divider, 0.9);
    }
    const rails = this.art.rails;
    if (rails) {
      this.rails.push(
        this.railStrip(-width / 2 - 0.08, rails, hex(this.skin.colors.railLeft), false),
        this.railStrip(width / 2 + 0.08, rails, hex(this.skin.colors.railRight), true),
      );
    } else {
      this.rails.push(
        strip(-width / 2 - 0.08, 0.14, hex(this.skin.colors.railLeft), 0.95),
        strip(width / 2 + 0.08, 0.14, hex(this.skin.colors.railRight), 0.95),
      );
    }
  }

  /** A rail texture repeating along the track; light on black, so it is added. The right rail is mirrored. */
  private railStrip(x: number, art: ArtTexture, color: number, mirror: boolean): THREE.MeshBasicMaterial {
    const { length } = this.geometry;
    const w = art.spec.width ?? 0.26;
    const map = mirror ? this.ownTexture(art.texture.clone()) : art.texture;
    map.repeat.set(mirror ? -1 : 1, (length + TRACK_TAIL) / (w * (art.spec.tileAspect ?? 12)));
    map.offset.x = mirror ? 1 : 0;
    const mesh = this.flat(color, 1, 1, { additive: true });
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map = map;
    mesh.scale.set(w, 1, length + TRACK_TAIL);
    mesh.position.set(x, 0.006, (TRACK_TAIL - length) / 2);
    return material;
  }

  private buildJudgementLine(): THREE.MeshBasicMaterial {
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
    line.scale.set(width + 0.3, 1, art ? (art.spec.depth ?? 0.5) : 0.16);
    line.position.set(0, 0.06, 0);
    line.renderOrder = 9.5;
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
    this.judgeGroup.add(line, glow);
    this.scene.add(this.judgeGroup);
    return glowMaterial;
  }

  private buildBeams(): void {
    const texture = this.art.keyBeam?.texture ?? linearFadeTexture();
    const hold = this.art.hitHold;
    this.geometry.lanes.forEach((lane) => {
      const beam = new THREE.Mesh(
        this.flatGeometry,
        new THREE.MeshBasicMaterial({
          map: texture,
          color: this.laneColors[lane.index],
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      beam.scale.set(lane.width * 0.96, 1, BEAM_LENGTH);
      beam.position.set(lane.x, 0.04, -BEAM_LENGTH / 2);
      beam.renderOrder = 6;
      beam.visible = false;
      this.scene.add(beam);
      this.beams.push(beam);
      this.beamLevels.push(0);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          // hold sparks: each lane has its own copy of the sheet, to show its own frame
          map: hold ? this.ownTexture(hold.texture.clone()) : this.glowTexture,
          color: this.laneColors[lane.index],
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      );
      // sparks rise from the judgement line; the round glow sits on it
      if (hold) glow.center.set(0.5, hold.spec.anchorY ?? 0);
      glow.position.set(lane.x, hold ? 0.02 : 0.3, 0);
      glow.renderOrder = 10;
      glow.visible = false;
      this.scene.add(glow);
      this.holdGlows.push(glow);
    });
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

  private noteMaterial(color: number, kind: NoteKind): THREE.MeshBasicMaterial {
    const art = this.noteArt(kind);
    const key = art ? `${kind}:${color}` : String(color);
    let m = this.noteMaterials.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, vertexColors: true, clippingPlanes: this.clipPlanes });
      if (art) {
        // the texture's alpha is the note's outline
        m.map = art.texture;
        m.transparent = true;
        m.alphaTest = 0.05;
      }
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

  private ownTexture(texture: THREE.Texture): THREE.Texture {
    this.ownedTextures.push(texture);
    return texture;
  }

  private bodyMaterial(color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${color}:${state}`;
    let m = this.bodyMaterials.get(key);
    if (!m) {
      const { lighten, opacity } = HOLD_BODY[state];
      m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), lighten),
        map: this.art.longBody?.texture ?? this.holdTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        clippingPlanes: this.clipPlanes,
      });
      this.bodyMaterials.set(key, m);
    }
    return m;
  }
}

function isGone(n: Readonly<SessionNote>, timeMs: number): boolean {
  return n.headDone && n.tailDone && n.endT < timeMs - MISSED_VISIBLE_MS - 100;
}

/**
 * Unit-sized note shape (scaled per lane): a box, a thin plate or a rounded capsule, shaded by
 * vertex colour as a lit block (see NOTE_LIGHT): the top brightens toward its near edge, where a
 * box catches a highlight, and the walls darken toward the track. With `topUv` a note texture
 * (drawn as seen from above) is projected straight down onto it; walls take it a little inside
 * its edge.
 */
function createNoteGeometry(shape: Skin['noteShape'], topUv: boolean): THREE.BufferGeometry {
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
  if (topUv) {
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = 0.5 + pos.getX(i) * (1 - 2 * WALL_INSET * Math.abs(normals.getX(i)));
      uv[i * 2 + 1] = 0.5 - pos.getZ(i) * (1 - 2 * WALL_INSET * Math.abs(normals.getZ(i)));
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return geometry;
}

function ringTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
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

/** Across a long note body: bright opaque edges and a slightly see-through middle. */
function holdBodyTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(230,230,230,0.85)');
  g.addColorStop(0.8, 'rgba(230,230,230,0.85)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 4);
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
