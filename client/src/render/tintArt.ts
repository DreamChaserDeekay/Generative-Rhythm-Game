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

/** A frame `t` thick just inside a rounded rectangle. */
function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, t: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  g.roundRect(x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0, Math.min(r - t, (w - 2 * t) / 2, (h - 2 * t) / 2)));
  g.fill('evenodd');
}

// ---------- notes, seen from above (canvas top = the far edge) ----------

export type NoteStyle = 'flat' | 'stem' | 'gloss' | 'thin' | 'outline' | 'chip' | 'gem' | 'pill' | 'jewel';

/** Sizes in the mockups are px on a note 51.5 px deep: `u(n)` turns them into px of this picture. */
const unit = (h: number) => (n: number) => (n * h) / 51.5;

export const NOTE_PAINT: Record<NoteStyle, Paint> = {
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
  gloss: (g, w, h) => {
    const u = unit(h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, ink(1, 0.4));
    grad.addColorStop(0.45, tone(1));
    grad.addColorStop(1, tone(0.68));
    g.fillStyle = grad;
    roundRect(g, 0, 0, w, h, u(4));
    g.fill();
    g.fillStyle = tone(0.55);
    frame(g, 0, 0, w, h, u(4), Math.max(1, u(1)));
    // the shine across the middle
    g.fillStyle = ink(1, 0.8, 0.9);
    roundRect(g, w * 0.07, h * 0.42, w * 0.86, u(4), u(2));
    g.fill();
  },
  thin: (g, w, h) => {
    g.fillStyle = tone(1);
    g.fillRect(0, 0, w, h);
    g.fillStyle = ink(1, 0.3);
    g.fillRect(0, 0, w, h * 0.12);
  },
  outline: (g, w, h) => {
    const u = unit(h);
    g.fillStyle = ink(1, 0.97);
    roundRect(g, 0, 0, w, h, u(4));
    g.fill();
    g.fillStyle = tone(1);
    frame(g, 0, 0, w, h, u(4), u(9));
  },
  chip: (g, w, h) => {
    const u = unit(h);
    const x = u(6);
    const y = u(6);
    // the glow: a soft edge of the colour around the chip, inside the picture
    g.save();
    g.shadowColor = ink(1, 0, 0.75);
    g.shadowBlur = u(10);
    g.fillStyle = tone(1);
    roundRect(g, x, y, w - 2 * x, h - 2 * y, u(12));
    g.fill();
    g.restore();
    g.fillStyle = ink(1, 0.95);
    roundRect(g, x + u(5), y + u(5), w - 2 * x - u(10), h - 2 * y - u(10), u(8));
    g.fill();
  },
  gem: (g, w, h) => {
    const u = unit(h);
    g.save();
    g.beginPath();
    g.moveTo(w * 0.1, 0);
    g.lineTo(w * 0.9, 0);
    g.lineTo(w, h / 2);
    g.lineTo(w * 0.9, h);
    g.lineTo(w * 0.1, h);
    g.lineTo(0, h / 2);
    g.closePath();
    g.clip();
    const bands: [number, number, string][] = [
      [0, 0.3, ink(1, 0.75)],
      [0.3, 0.55, ink(1, 0.3)],
      [0.55, 0.82, tone(1)],
      [0.82, 1, tone(0.7)],
    ];
    for (const [a, b, fill] of bands) {
      g.fillStyle = fill;
      g.fillRect(0, a * h, w, (b - a) * h + 1);
    }
    g.fillStyle = ink(1, 0.9);
    g.fillRect(w * 0.12, h * 0.12, w * 0.76, u(4));
    g.restore();
  },
  pill: (g, w, h) => {
    const u = unit(h);
    const x = u(5);
    g.save();
    roundRect(g, x, 0, w - 2 * x, h, h / 2);
    g.clip();
    g.fillStyle = tone(1);
    g.fillRect(0, 0, w, h);
    g.fillStyle = tone(0.72);
    g.fillRect(0, h - u(9), w, u(9));
    g.fillStyle = ink(1, 0.7, 0.9);
    g.beginPath();
    g.ellipse(x + (w - 2 * x) * 0.24, h * 0.31, (w - 2 * x) * 0.1, h * 0.15, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },
  jewel: (g, w, h) => jewelNote(g, w, h, false),
};

/** How far JEWEL's side shows below its note, for a note this deep (the sheets: 12 px under a 51.5 px note). */
export const JEWEL_SIDE = 12 / 51.5;

/**
 * JEWEL's note as the sheets draw it: the cut (4:1, stretched over the note), and below its near
 * edge its side, the cut's bottom rows stretched and at half brightness, 3 % in from each end.
 */
export function jewelNote(g: CanvasRenderingContext2D, w: number, h: number, grooves: boolean): void {
  const top = Math.round(h / (1 + JEWEL_SIDE));
  emeraldCut(g, w, top, grooves);
  // the sheets' side band shows the cut's bottom quarter over 18 px, 12 of them below the note
  g.drawImage(g.canvas, 0, top * (5 / 6), w, top / 6, w * 0.03, top, w * 0.94, h - top);
  const side = g.getImageData(0, top, w, h - top);
  const d = side.data;
  for (let i = 0; i < d.length; i += 4) {
    // brightness(.5) of (colour·k lifted by l toward white), as a tint picture again
    const k = d[i] / 255;
    const l = d[i + 1] / 255;
    d[i] = Math.round((255 * 0.5 * k * (1 - l)) / (1 - 0.5 * l));
    d[i + 1] = Math.round(255 * 0.5 * l);
  }
  g.putImageData(side, 0, top);
}

/** The JEWEL note: an emerald cut seen from above, flat facets lit from above with crisp edges (no veins). */
export function emeraldCut(g: CanvasRenderingContext2D, w: number, h: number, grooves: boolean): void {
  const my = h * 0.03;
  const cx = 0.19 * h;
  const cy = 0.22 * h;
  const outer: [number, number][] = [
    [cx, my],
    [w - cx, my],
    [w, my + cy],
    [w, h - my - cy],
    [w - cx, h - my],
    [cx, h - my],
    [0, h - my - cy],
    [0, my + cy],
  ];
  const steps: [number, number][] = [
    [0, 0],
    [(0.2 * h) / 3, (0.1 * h) / 3],
    [(0.4 * h) / 3, (0.2 * h) / 3],
    [0.2 * h, 0.1 * h],
    [0.2 * h + (0.3 * h) / 2, 0.1 * h + (0.13 * h) / 2],
    [0.5 * h, 0.23 * h],
  ];
  const rings = steps.map(([tx, ty], i) => (i === 0 ? outer : inset(outer, tx, ty)));
  const light = [-0.3, -1].map((v) => v / Math.hypot(0.3, 1));
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    const n = outward(outer, i);
    const lit = n[0] * light[0] + n[1] * light[1];
    for (let k = 0; k < 5; k++) {
      const band = k < 3 ? 0 : 1;
      let b = band === 0 ? 0.78 + 0.4 * lit : 0.93 + 0.2 * lit;
      b += 0.05 * (1 - (band === 0 ? k : k - 3));
      const a = rings[k];
      const z = rings[k + 1];
      g.fillStyle = tone(b);
      polygon(g, [a[i], a[j], z[j], z[i]]);
      g.fill();
    }
  }
  const table = rings[5];
  const t0 = Math.min(...table.map((p) => p[1]));
  const t1 = Math.max(...table.map((p) => p[1]));
  g.save();
  polygon(g, table);
  g.clip();
  const grad = g.createLinearGradient(0, t0, 0, t1);
  grad.addColorStop(0, tone(1.03));
  grad.addColorStop(1, tone(0.91));
  g.fillStyle = grad;
  g.fillRect(0, t0, w, t1 - t0);
  const x0 = Math.min(...table.map((p) => p[0]));
  g.fillStyle = tone(1.6, 70 / 255);
  polygon(g, [
    [x0 + 0.5 * h, t0],
    [x0 + 0.85 * h, t0],
    [x0 + 0.55 * h, t1],
    [x0 + 0.2 * h, t1],
  ]);
  g.fill();
  g.fillStyle = tone(1.6, 45 / 255);
  polygon(g, [
    [x0 + 1.0 * h, t0],
    [x0 + 1.12 * h, t0],
    [x0 + 0.82 * h, t1],
    [x0 + 0.7 * h, t1],
  ]);
  g.fill();
  g.restore();
  if (grooves) {
    // the scratch cue: three thin grooves across the table, darker (no white)
    g.strokeStyle = tone(0.7, 190 / 255);
    g.lineWidth = 0.04 * h;
    for (let k = 0; k < 3; k++) {
      const x = x0 + (1.6 + 0.45 * k) * h;
      g.beginPath();
      g.moveTo(x + 0.25 * h, t0);
      g.lineTo(x - 0.15 * h, t1);
      g.stroke();
    }
  }
  // crisp facet edges: a light tint of the colour, not white
  g.strokeStyle = tone(1.3, 150 / 255);
  g.lineWidth = 0.022 * h;
  g.lineJoin = 'round';
  for (const poly of [rings[3], table]) {
    polygon(g, poly);
    g.stroke();
  }
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(...outer[i]);
    g.lineTo(...rings[3][i]);
    g.lineTo(...table[i]);
    g.stroke();
  }
  g.save();
  polygon(g, outer);
  g.clip();
  g.strokeStyle = tone(1.4, 230 / 255);
  g.lineWidth = 0.06 * h; // half of it falls outside the clip
  polygon(g, outer);
  g.stroke();
  g.restore();
}

function polygon(g: CanvasRenderingContext2D, points: [number, number][]): void {
  g.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

const cross2 = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];

/** A convex polygon moved inward by tx across and ty up and down (its edges stay parallel). */
function inset(poly: [number, number][], tx: number, ty: number): [number, number][] {
  const sx = ty / tx;
  const p = poly.map(([x, y]) => [x * sx, y]);
  const centre = [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % p.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let nrm = [-d[1], d[0]];
    if ((centre[0] - a[0]) * nrm[0] + (centre[1] - a[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
    return { a: [a[0] + nrm[0] * ty, a[1] + nrm[1] * ty], d };
  });
  return lines.map((l2, i) => {
    const l1 = lines[(i + lines.length - 1) % lines.length];
    const t = cross2([l2.a[0] - l1.a[0], l2.a[1] - l1.a[1]], l2.d) / cross2(l1.d, l2.d);
    return [(l1.a[0] + l1.d[0] * t) / sx, l1.a[1] + l1.d[1] * t] as [number, number];
  });
}

function outward(poly: [number, number][], i: number): [number, number] {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let nrm: [number, number] = [-d[1], d[0]];
  const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
  const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
  if ((cx - a[0]) * nrm[0] + (cy - a[1]) * nrm[1] > 0) nrm = [-nrm[0], -nrm[1]];
  return nrm;
}

// ---------- long notes: a body repeated along the note, and its two ends ----------

export type LongStyle = 'solid' | 'stem' | 'gloss' | 'hollow' | 'striped' | 'neon' | 'glass' | 'pill' | 'jewel';

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
  gloss: {
    body: (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, tone(0.55));
      grad.addColorStop(0.26, tone(1));
      grad.addColorStop(0.5, ink(1, 0.45));
      grad.addColorStop(0.74, tone(1));
      grad.addColorStop(1, tone(0.55));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    end: (g, w, h) => {
      LONG_PAINT.gloss.body(g, w, h);
      g.fillStyle = ink(1, 0.45);
      g.fillRect(0, 0, w, across(w)(4));
    },
    tile: 1,
    endDepth: 0.12,
    width: 0.82,
  },
  hollow: {
    body: (g, w, h) => {
      g.fillStyle = tone(0.64);
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, tone(1));
    },
    end: squareEnd(tone(0.64), tone(1), 4),
    tile: 1,
    endDepth: 0.12,
    width: 0.82,
  },
  striped: {
    body: (g, w, h) => {
      // two bands per tile: 22 px of full colour, 14 px lighter (of a 36 px period)
      g.fillStyle = tone(1, 0.92);
      g.fillRect(0, 0, w, h);
      g.fillStyle = tone(1, 0.64);
      g.clearRect(0, h * (22 / 36), w, h * (14 / 36));
      g.fillRect(0, h * (22 / 36), w, h * (14 / 36));
      sides(g, w, h, 6, tone(1));
    },
    end: squareEnd(tone(1, 0.92), tone(1), 6),
    tile: 36 / 54,
    endDepth: 0.14,
    width: 0.8,
  },
  neon: {
    body: (g, w, h) => {
      g.fillStyle = tone(1, 0.6);
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, ink(1, 0.5));
    },
    end: squareEnd(tone(1, 0.6), ink(1, 0.5), 4),
    tile: 1,
    endDepth: 0.12,
    width: 0.76,
  },
  glass: {
    body: (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, tone(1, 0.8));
      grad.addColorStop(0.5, ink(1, 0.42, 0.9));
      grad.addColorStop(1, tone(1, 0.8));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      sides(g, w, h, 4, ink(1, 0.55));
    },
    end: squareEnd(tone(1, 0.8), ink(1, 0.55), 4),
    tile: 1,
    endDepth: 0.12,
    width: 0.8,
  },
  pill: {
    body: (g, w, h) => {
      const a = across(w);
      g.fillStyle = tone(1, 0.86);
      g.fillRect(0, 0, w, h);
      // dashes down the middle: 10 px on, 12 off
      g.fillStyle = ink(1, 1, 0.85);
      g.fillRect(w / 2 - a(2.5), 0, a(5), h * (10 / 22));
    },
    end: (g, w, h) => {
      // half a disc: the body's width round at its outer edge
      g.fillStyle = tone(1, 0.86);
      g.beginPath();
      g.ellipse(w / 2, h, w / 2, h, 0, Math.PI, Math.PI * 2);
      g.fill();
    },
    tile: 22 / 54,
    endDepth: 0.5,
    width: 0.7,
  },
  jewel: {
    body: (g, w, h) => baguette(g, w, h),
    end: (g, w, h) => {
      baguette(g, w, h);
      g.fillStyle = ink(1, 0.45);
      g.fillRect(0, 0, w, across(w)(4));
    },
    tile: 2,
    endDepth: 0.12,
    width: 0.82,
  },
};

/** The JEWEL long note: a long step-cut gem, clean bands along its length and nothing across it. */
function baguette(g: CanvasRenderingContext2D, w: number, h: number): void {
  const bands: [number, number, string][] = [
    [0, 0.03, 'rim'],
    [0.03, 0.13, 'outer'],
    [0.13, 0.26, 'step'],
    [0.26, 0.74, 'table'],
    [0.74, 0.87, 'step'],
    [0.87, 0.97, 'outer'],
    [0.97, 1, 'rim'],
  ];
  const light = -0.3 / Math.hypot(0.3, 1);
  for (const [a, b, kind] of bands) {
    const lit = (a < 0.5 ? -1 : 1) * light;
    if (kind === 'table') {
      const grad = g.createLinearGradient(a * w, 0, b * w, 0);
      grad.addColorStop(0, tone(0.94));
      grad.addColorStop(0.5, tone(1.04));
      grad.addColorStop(1, tone(0.94));
      g.fillStyle = grad;
    } else {
      g.fillStyle = tone(kind === 'rim' ? 1.4 : kind === 'outer' ? 0.8 + 0.34 * lit : 0.92 + 0.18 * lit);
    }
    g.fillRect(a * w, 0, (b - a) * w + 1, h);
  }
  g.fillStyle = tone(1.6, 60 / 255);
  g.fillRect(0.33 * w, 0, 0.06 * w, h);
  g.fillStyle = tone(1.3, 140 / 255);
  for (const x of [0.03, 0.13, 0.26, 0.74, 0.87, 0.97]) g.fillRect(x * w - 0.006 * w, 0, Math.max(1, 0.012 * w), h);
}

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

// ---------- hit effects: flipbooks drawn here, lying flat on the track at the judge line ----------

export type HitStyle = 'flash' | 'stemflash' | 'star' | 'bomb' | 'flare' | 'hex' | 'shards' | 'bubbles';

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
