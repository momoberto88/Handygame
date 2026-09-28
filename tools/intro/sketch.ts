import Phaser from 'phaser';

/**
 * Turns the rendered frame into a coloured-pencil drawing: graphite outlines (edge detection with
 * broken, uneven strokes), softened and slightly flattened game colours, paper grain, diagonal
 * pencil strokes in the fills, hatching in the shadows and "boiling" lines that wobble a little
 * 12 times a second like hand-drawn cartoons.
 */
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uRes;
uniform float uSeed;
uniform float uAmount;
varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float L(vec2 uv) { return lum(texture2D(uMainSampler, uv).rgb); }

void main() {
  vec2 uv = outTexCoord;
  vec2 px = 1.0 / uRes;
  vec2 p = uv * uRes;
  // boiling: the whole drawing wobbles by a pixel or two, a new wobble 12 times a second
  vec2 wob = (vec2(noise(p / 70.0 + uSeed * 13.1), noise(p / 70.0 + uSeed * 7.7 + 5.0)) - 0.5) * px * 3.0;
  vec2 q = uv + wob;
  vec3 src = texture2D(uMainSampler, q).rgb;

  // graphite outlines: sobel on brightness, strokes broken up by noise
  vec2 o = px * 1.6;
  float tl = L(q + vec2(-o.x, -o.y)), tc = L(q + vec2(0.0, -o.y)), tr = L(q + vec2(o.x, -o.y));
  float ml = L(q + vec2(-o.x, 0.0)), mr = L(q + vec2(o.x, 0.0));
  float bl = L(q + vec2(-o.x, o.y)), bc = L(q + vec2(0.0, o.y)), br = L(q + vec2(o.x, o.y));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  float edge = length(vec2(gx, gy));
  float broken = 0.55 + 0.9 * noise(p / 6.0 + uSeed * 3.0);
  float line = smoothstep(0.16, 0.55, edge * broken);

  // coloured pencil: a little flatter, a little softer, on warm paper
  vec3 col = src;
  vec3 flatCol = floor(col * 7.0 + 0.5) / 7.0;
  col = mix(col, flatCol, 0.3);
  float l = lum(col);
  col = mix(vec3(l), col, 0.88);
  vec3 paper = vec3(0.98, 0.95, 0.87);
  col = mix(col, col * paper + vec3(0.03, 0.025, 0.0), 0.55);
  // pencil strokes running diagonally through the colour
  float stroke = sin((p.x + p.y) * 0.85 + noise(p / 22.0) * 7.0);
  col *= 0.94 + 0.06 * stroke;
  // hatching in the shadows
  float hatchLine = step(0.62, fract((p.x - p.y) / 8.0 + noise(p / 28.0 + uSeed) * 0.35));
  float shadow = 1.0 - smoothstep(0.12, 0.42, l);
  col = mix(col, col * 0.72, shadow * hatchLine * 0.55);
  // paper grain
  float grain = noise(p / 1.7) * 0.06 + noise(p / 45.0) * 0.05;
  col -= grain * 0.6;
  // outlines in soft graphite
  col = mix(col, vec3(0.17, 0.14, 0.2), line * 0.85);

  gl_FragColor = vec4(mix(src, col, uAmount), 1.0);
}
`;

export class SketchPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  seed = 0;
  amount = 1;

  constructor(game: Phaser.Game) {
    super({ game, name: 'Sketch', fragShader: FRAG });
  }

  onPreRender() {
    this.set2f('uRes', this.renderer.width, this.renderer.height);
    this.set1f('uSeed', this.seed);
    this.set1f('uAmount', this.amount);
  }
}
