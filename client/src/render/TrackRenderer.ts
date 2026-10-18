import * as THREE from 'three';
import type { CameraPreset, KeyModeConfig } from '../engine/config';
import type { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import type { CameraPoseFx } from './cameraFx';
import { cameraPose, computeTrackGeometry, type TrackGeometry } from './layout';
import { FEVER_COLORS, type Palette } from './palette';
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
const NOTE_DEPTH = 0.7;
const SIDE_NOTE_HEIGHT = 0.12;
const BEAM_LENGTH = 10;
const MISSED_VISIBLE_MS = 400;
const EFFECT_MS = 240;
const COVER_Y = 0.05;
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
  private readonly noteMaterials = new Map<number, THREE.MeshBasicMaterial>();
  private readonly bodyMaterials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly notePool: MeshPool;
  private readonly bodyPool: MeshPool;
  private readonly barPool: MeshPool;
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamLevels: number[] = [];
  private readonly holdGlows: THREE.Sprite[] = [];
  private readonly effects: { sprite: THREE.Sprite; start: number; lane: number }[] = [];
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
    this.laneColors = laneColorsFor(options.skin, options.palette, options.mode);
    this.noteGeometry = createNoteGeometry(options.skin.noteShape);
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
      const mesh = new THREE.Mesh(this.noteGeometry, this.noteMaterial(this.laneColors[0]));
      mesh.renderOrder = 4;
      return mesh;
    });
    this.bodyPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, this.bodyMaterial(this.laneColors[0], 'idle'));
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
  }

  /** Burst at the judgement line of a lane. */
  hitEffect(lane: number, color: number, perfNow: number): void {
    if (this.skin.hitEffect === 'none') return;
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
      if (n.type === 'tap') {
        if (!n.headDone) this.placeNote(lane.x, lane.width, z(n.t), color, height);
        else if (n.broken && n.t > timeMs - MISSED_VISIBLE_MS) this.placeNote(lane.x, lane.width, z(n.t), MISSED_COLOR, height);
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
      }
    }
    this.notePool.end();
    this.bodyPool.end();
    this.updateHoldGlows(frame);
  }

  private placeNote(x: number, laneWidth: number, z: number, color: number, height: number): void {
    const mesh = this.notePool.next();
    mesh.material = this.noteMaterial(color);
    mesh.scale.set(laneWidth * 0.9, height, NOTE_DEPTH);
    mesh.position.set(x, height / 2, z);
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
    this.holdGlows.forEach((glow, lane) => {
      const held = frame.heldNote(lane) !== null;
      glow.visible = held;
      if (held) {
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
    for (let i = 0; i < pos.count; i++) {
      const depth = Math.min(1, Math.max(0, -pos.getZ(i) / length));
      c.copy(near).lerp(far, depth);
      c.toArray(colors, i * 3);
    }
    base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const track = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ vertexColors: true }));
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
    this.rails.push(
      strip(-width / 2 - 0.08, 0.14, hex(this.skin.colors.railLeft), 0.95),
      strip(width / 2 + 0.08, 0.14, hex(this.skin.colors.railRight), 0.95),
    );
  }

  private buildJudgementLine(): THREE.MeshBasicMaterial {
    const { width } = this.geometry;
    // Transparent so it sorts after the covers (renderOrder) and stays on top of them.
    const line = new THREE.Mesh(
      this.flatGeometry,
      new THREE.MeshBasicMaterial({ color: hex(this.skin.colors.judgeLine), transparent: true, depthWrite: false }),
    );
    line.scale.set(width + 0.3, 1, 0.16);
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
    const texture = linearFadeTexture();
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
          map: this.glowTexture,
          color: this.laneColors[lane.index],
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      );
      glow.position.set(lane.x, 0.3, 0);
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

  private noteMaterial(color: number): THREE.MeshBasicMaterial {
    let m = this.noteMaterials.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, vertexColors: true, clippingPlanes: this.clipPlanes });
      this.noteMaterials.set(color, m);
    }
    return m;
  }

  private bodyMaterial(color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${color}:${state}`;
    let m = this.bodyMaterials.get(key);
    if (!m) {
      const { lighten, opacity } = HOLD_BODY[state];
      m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), lighten),
        map: this.holdTexture,
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
 * vertex colour (bright top, darker front and sides).
 */
function createNoteGeometry(shape: Skin['noteShape']): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  if (shape === 'round') {
    // capsule lying across the lane, normalised to a 1×1×1 box
    geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 10).rotateZ(Math.PI / 2).scale(0.5, 1, 1);
  } else if (shape === 'flat') {
    geometry = new THREE.BoxGeometry(1, 0.35, 1).translate(0, -0.325, 0);
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1);
  }
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    const shade = ny > 0.5 ? 1 : nz > 0.5 ? 0.7 : 0.5;
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
