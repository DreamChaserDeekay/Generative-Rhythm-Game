import * as THREE from 'three';
import type { CameraPreset, KeyModeConfig, LaneColor } from '../engine/config';
import type { SessionNote } from '../engine/session';
import { cameraPose, computeTrackGeometry, noteZ, type TrackGeometry } from './layout';

const LANE_COLORS: Record<LaneColor, number> = {
  white: 0xeaf6ff,
  blue: 0x4fc3ff,
  gold: 0xffc94f,
  scratch: 0xff5c8a,
};
const MISSED_COLOR = 0x4a5068;
const TRACK_NEAR = new THREE.Color(0x16224a);
const TRACK_FAR = new THREE.Color(0x060a1a);
const FOG_COLOR = 0x060a1a;
const RAIL_LEFT = 0x37e2ff;
const RAIL_RIGHT = 0xff4fd8;
/** How far the track extends below the judgement line, toward the camera. */
const TRACK_TAIL = 4;
const NOTE_HEIGHT = 0.2;
const NOTE_DEPTH = 0.7;
const BEAM_LENGTH = 10;
const MISSED_VISIBLE_MS = 400;
const EFFECT_MS = 240;

export interface TrackFrame {
  /** Display time (song time + visual offset). */
  timeMs: number;
  visibleMs: number;
  notes: readonly Readonly<SessionNote>[];
  heldNote: (lane: number) => number | null;
  keyDown: (lane: number) => boolean;
  barTimes: readonly number[];
}

export interface TrackRendererOptions {
  mode: KeyModeConfig;
  camera: CameraPreset;
  trackWidth: number;
  trackLength: number;
}

/** Renders the SDVX-style perspective track with Three.js. */
export class TrackRenderer {
  readonly geometry: TrackGeometry;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly noteGeometry = createNoteGeometry();
  private readonly flatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
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
  private firstLive = 0;
  private lastFrameMs = 0;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement, options: TrackRendererOptions) {
    this.geometry = computeTrackGeometry(options.mode, options.trackWidth, options.trackLength);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(options.camera.fov, 16 / 9, 0.1, 500);
    this.setCamera(options.camera);

    this.buildTrack();
    this.buildJudgementLine();
    this.buildBeams();

    this.notePool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.noteGeometry, this.noteMaterial(LANE_COLORS.white));
      mesh.renderOrder = 4;
      return mesh;
    });
    this.bodyPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, this.bodyMaterial(LANE_COLORS.white, 'idle'));
      mesh.renderOrder = 3;
      return mesh;
    });
    const barMaterial = new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.barPool = new MeshPool(this.scene, () => {
      const mesh = new THREE.Mesh(this.flatGeometry, barMaterial);
      mesh.renderOrder = 2;
      return mesh;
    });
  }

  setCamera(preset: CameraPreset): void {
    const pose = cameraPose(preset);
    this.camera.fov = pose.fov;
    this.camera.position.set(...pose.position);
    this.camera.lookAt(new THREE.Vector3(...pose.target));
    this.camera.updateProjectionMatrix();
    const far = new THREE.Vector3(0, 0, -this.geometry.length).distanceTo(this.camera.position);
    const mid = new THREE.Vector3(0, 0, -this.geometry.length * 0.55).distanceTo(this.camera.position);
    this.scene.fog = new THREE.Fog(FOG_COLOR, mid, far);
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.camera.aspect = this.cssWidth / this.cssHeight;
    this.camera.updateProjectionMatrix();
  }

  /** CSS pixel position of a world point. */
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
    const material = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    const g = this.geometry.lanes[lane];
    sprite.position.set(g.x, 0.25, 0);
    sprite.renderOrder = 8;
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
    this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
  }

  private drawNotes(frame: TrackFrame): void {
    const { notes, timeMs, visibleMs } = frame;
    const L = this.geometry.length;
    const z = (t: number) => noteZ(t, timeMs, visibleMs, L);
    while (this.firstLive < notes.length && isGone(notes[this.firstLive], timeMs)) this.firstLive++;

    this.notePool.begin();
    this.bodyPool.begin();
    for (let i = this.firstLive; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > timeMs + visibleMs) break;
      const lane = this.geometry.lanes[n.lane];
      const color = LANE_COLORS[lane.color];
      if (n.type === 'tap') {
        if (!n.headDone) this.placeNote(lane.x, lane.width, z(n.t), color);
        else if (n.broken && n.t > timeMs - MISSED_VISIBLE_MS) this.placeNote(lane.x, lane.width, z(n.t), MISSED_COLOR);
        continue;
      }
      const held = frame.heldNote(n.lane) === n.index;
      if (n.tailDone && !n.broken) continue;
      if (n.broken && n.endT < timeMs - MISSED_VISIBLE_MS) continue;
      const headZ = held ? 0 : z(n.t);
      const tailZ = Math.max(-L, z(n.endT));
      const state = n.broken ? 'missed' : held ? 'held' : 'idle';
      const bodyColor = n.broken ? MISSED_COLOR : color;
      if (headZ > tailZ) {
        const body = this.bodyPool.next();
        body.material = this.bodyMaterial(bodyColor, state);
        body.scale.set(lane.width * 0.72, 1, headZ - tailZ);
        body.position.set(lane.x, 0.02, (headZ + tailZ) / 2);
      }
      if (!n.headDone || held || n.broken) this.placeNote(lane.x, lane.width, headZ, bodyColor);
      if (tailZ > -L) this.placeNote(lane.x, lane.width * 0.8, tailZ, bodyColor, 0.6);
    }
    this.notePool.end();
    this.bodyPool.end();
    this.updateHoldGlows(frame);
  }

  private placeNote(x: number, laneWidth: number, z: number, color: number, depthScale = 1): void {
    const mesh = this.notePool.next();
    mesh.material = this.noteMaterial(color);
    mesh.scale.set(laneWidth * 0.9, NOTE_HEIGHT, NOTE_DEPTH * depthScale);
    mesh.position.set(x, NOTE_HEIGHT / 2, z);
  }

  private drawBars(frame: TrackFrame): void {
    const L = this.geometry.length;
    this.barPool.begin();
    for (const t of frame.barTimes) {
      if (t < frame.timeMs - 300) continue;
      if (t > frame.timeMs + frame.visibleMs) break;
      const bar = this.barPool.next();
      bar.scale.set(this.geometry.width, 1, 0.05);
      bar.position.set(0, 0.012, noteZ(t, frame.timeMs, frame.visibleMs, L));
    }
    this.barPool.end();
  }

  private drawBeams(frame: TrackFrame, dt: number): void {
    const decay = Math.exp(-dt / 70);
    this.beams.forEach((beam, lane) => {
      const level = frame.keyDown(lane) ? 0.6 : this.beamLevels[lane] * decay;
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
        const pulse = 1 + 0.12 * Math.sin(frame.timeMs / 45);
        const w = this.geometry.lanes[lane].width;
        glow.scale.set(w * 1.6 * pulse, w * 1.6 * pulse, 1);
      }
    });
  }

  private drawEffects(perfNow: number): void {
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
      const s = Math.min(w, 1.6) * (0.9 + 1.0 * p);
      e.sprite.scale.set(s * 1.25, s, 1);
      e.sprite.material.opacity = (1 - p) * (1 - p);
    }
  }

  private buildTrack(): void {
    const { width, length, lanes } = this.geometry;
    const base = new THREE.PlaneGeometry(width + 0.3, length + TRACK_TAIL, 1, 24).rotateX(-Math.PI / 2);
    base.translate(0, 0, (TRACK_TAIL - length) / 2);
    const pos = base.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const depth = Math.min(1, Math.max(0, -pos.getZ(i) / length));
      c.copy(TRACK_NEAR).lerp(TRACK_FAR, depth);
      c.toArray(colors, i * 3);
    }
    base.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const track = new THREE.Mesh(base, new THREE.MeshBasicMaterial({ vertexColors: true }));
    track.renderOrder = 0;
    this.scene.add(track);

    const strip = (x: number, w: number, color: number, opacity: number, order: number) => {
      const mesh = new THREE.Mesh(
        this.flatGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      mesh.scale.set(w, 1, length + TRACK_TAIL);
      mesh.position.set(x, 0.005 * order, (TRACK_TAIL - length) / 2);
      mesh.renderOrder = order;
      this.scene.add(mesh);
    };
    lanes.forEach((lane) => {
      if (lane.color === 'blue') strip(lane.x, lane.width, 0x1b3d7a, 0.35, 1);
      if (lane.kind === 'scratch') strip(lane.x, lane.width, 0x5a1438, 0.35, 1);
    });
    for (let i = 1; i < lanes.length; i++) strip(lanes[i].x - lanes[i].width / 2, 0.025, 0x3a4c86, 0.9, 1);
    strip(-width / 2 - 0.08, 0.14, RAIL_LEFT, 0.95, 1);
    strip(width / 2 + 0.08, 0.14, RAIL_RIGHT, 0.95, 1);
  }

  private buildJudgementLine(): void {
    const { width } = this.geometry;
    const line = new THREE.Mesh(this.flatGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
    line.scale.set(width + 0.3, 1, 0.16);
    line.position.set(0, 0.03, 0);
    line.renderOrder = 5;
    this.scene.add(line);

    const glow = new THREE.Mesh(
      this.flatGeometry,
      new THREE.MeshBasicMaterial({
        map: this.glowTexture,
        color: 0x5fe7ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.scale.set(width + 1.2, 1, 1.4);
    glow.position.set(0, 0.035, 0);
    glow.renderOrder = 5;
    this.scene.add(glow);
  }

  private buildBeams(): void {
    const texture = linearFadeTexture();
    this.geometry.lanes.forEach((lane) => {
      const beam = new THREE.Mesh(
        this.flatGeometry,
        new THREE.MeshBasicMaterial({
          map: texture,
          color: LANE_COLORS[lane.color],
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
          color: LANE_COLORS[lane.color],
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        }),
      );
      glow.position.set(lane.x, 0.3, 0);
      glow.renderOrder = 7;
      glow.visible = false;
      this.scene.add(glow);
      this.holdGlows.push(glow);
    });
  }

  private noteMaterial(color: number): THREE.MeshBasicMaterial {
    let m = this.noteMaterials.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, vertexColors: true });
      this.noteMaterials.set(color, m);
    }
    return m;
  }

  private bodyMaterial(color: number, state: 'idle' | 'held' | 'missed'): THREE.MeshBasicMaterial {
    const key = `${color}:${state}`;
    let m = this.bodyMaterials.get(key);
    if (!m) {
      const opacity = state === 'held' ? 0.85 : state === 'missed' ? 0.3 : 0.5;
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      this.bodyMaterials.set(key, m);
    }
    return m;
  }
}

function isGone(n: Readonly<SessionNote>, timeMs: number): boolean {
  return n.headDone && n.tailDone && n.endT < timeMs - MISSED_VISIBLE_MS - 100;
}

/** Unit box whose faces are shaded by vertex color (bright top, darker front and sides). */
function createNoteGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
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
