// The most islands the colour and visibility uniforms hold.
export const MAX_ISLANDS = 32;

// Grouping by island shrinks each island by uShrink and moves it out to its offset.
const PLACE = `
uniform float uSep; uniform float uShrink;
vec2 place(vec2 base, vec2 off){ return mix(base, base * uShrink + off, uSep); }`;

// Clusters and search paths. Vertices glide from old to new places as uMove goes 0 to 1, appear as the replay reaches
// them and fade in when new in a live update.
export const GRAPH_VERTEX = `
in vec2 aFromXY; in float aFromH; in vec2 aToXY; in float aToH; in vec2 aOff;
in float aSlot; in float aSize; in float aShared; in float aReveal; in float aWeight; in float aBorn; in float aFaded;
uniform mat4 uVP; uniform float uMove; uniform float uHeightScale; uniform float uPointScale; uniform float uNodeSize;
uniform vec3 uColour[${MAX_ISLANDS}]; uniform float uAlpha[${MAX_ISLANDS}];
uniform float uBase; uniform float uFogNear; uniform float uFogFar; uniform float uShared;
uniform float uReveal; uniform float uMinWeight; uniform float uNow;
out vec3 vColour; out float vAlpha; out float vRing;
${PLACE}
void main(){
  vec2 q = place(mix(aFromXY, aToXY, uMove), aOff);
  vec4 clip = uVP * vec4(q.x, mix(aFromH, aToH, uMove) * uHeightScale, q.y, 1.0);
  gl_Position = clip;
  int k = int(aSlot + 0.5);
  vColour = uColour[k];
  float depth = max(clip.w, 1e-6);
  float fog = 1.0 - clamp((depth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  float hot = smoothstep(0.24, 0.55, aShared);
  float mute = mix(1.0, mix(0.10, 1.0, hot), uShared);
  float shown = clamp((uReveal * 1.02 - aReveal) / 0.02, 0.0, 1.0) * step(uMinWeight, aWeight) * clamp((uNow - aBorn) / 0.8, 0.0, 1.0);
  // A cluster DenStream faded out, kept for the best it holds, and its search paths show at a third of their strength.
  vAlpha = uBase * uAlpha[k] * mute * (0.30 + 0.70 * fog) * shown * mix(1.0, 0.35, aFaded);
  vRing = hot * uShared;
  // Grown, a cluster's point widens only by its core's growth (the core is 0.31 of the point's radius); shrunk, all of it shrinks.
  float grown = 0.31 * uNodeSize + 0.69 * min(uNodeSize, 1.0);
  gl_PointSize = clamp(uPointScale * aSize * grown / depth, 1.0, 96.0);
}`;

// .rgb gathers density-weighted colour and .a the density; the composite divides one by the other. Adding the colours
// themselves would turn every overlap white, and the overlaps are where the answer is.
const EMIT = `
out vec4 outColour;
void emit(vec3 colour, float density, float mark){
  vec3 c = mix(colour, vec3(1.0), min(mark * 3.0, 1.0));
  float w = max(density, mark);
#ifdef HDR
  outColour = vec4(c * w, w);
#else
  outColour = vec4(c, w);
#endif
}`;

// Each cluster is a small solid core with a faint halo around it. A larger cluster size grows the core; the halo and
// the shared ring keep their width around it.
export const POINT_FRAGMENT = `
precision highp float;
in vec3 vColour; in float vAlpha; in float vRing;
uniform float uNodeSize;
${EMIT}
void main(){
  float grown = 0.31 * uNodeSize + 0.69 * min(uNodeSize, 1.0);
  // The distance from the centre in the unscaled point's radii, less the core's growth, so outside the core the
  // unscaled point's shape repeats.
  float r = length(gl_PointCoord - 0.5) * 2.0 * grown / min(uNodeSize, 1.0) - 0.31 * max(uNodeSize - 1.0, 0.0);
  float a = max(1.0 - smoothstep(0.26, 0.36, r), 0.35 * pow(smoothstep(1.0, 0.3, r), 2.0));
  float ring = smoothstep(0.50, 0.72, r) * smoothstep(1.0, 0.80, r) * vRing;
  emit(vColour, a * vAlpha, ring * vAlpha * 2.2);
}`;

export const LINE_FRAGMENT = `
precision highp float;
in vec3 vColour; in float vAlpha;
${EMIT}
void main(){ emit(vColour, vAlpha, 0.0); }`;

// Migrations as screen-space ribbons along a cubic curve from cluster to cluster.
// Grouped, each is an even, smooth-edged line in an arc leaning right of its travel, fading from source to destination colour.
export const ARC_VERTEX = `
// WebGL guarantees only 16 attributes, so values are packed together.
// aStep is (t, ribbon side, source slot, destination slot), aShow (reveal, visible, born) and aFlow (traffic 0 to 1, phase).
// aEnds is the source and destination cluster, and aFan the link's place among its island pair's links (busiest 0 to rarest 1) and that pair's link count.
in vec3 aAFrom; in vec3 aATo; in vec2 aAOff;
in vec3 aBFrom; in vec3 aBTo; in vec2 aBOff;
in vec4 aStep; in vec3 aShow; in vec2 aFlow; in vec2 aEnds; in vec2 aFan;
uniform mat4 uVP; uniform float uMove; uniform float uHeightScale; uniform vec3 uMigration;
uniform vec3 uColour[${MAX_ISLANDS}]; uniform float uFocus[${MAX_ISLANDS}];
uniform float uBase; uniform float uAspect; uniform float uHalfWidth; uniform float uLift;
uniform float uArch;
// Grouped, links of the hovered and selected clusters (-1 for none) light up with an arrowhead, and the rest step back to uRest.
// uPx is one device pixel in clip space.
uniform float uHot; uniform float uPinned; uniform float uRest; uniform float uPx;
uniform float uReveal; uniform float uNow;
out vec3 vColour; out float vAlpha; out float vT; out float vLen; out vec2 vFlow; out float vHot;
// vSide (from the line's middle) and vTip (before the arrowhead's tip) are screen pixels, sent times w and divided back by vW.
// Interpolated as is, perspective correction would bend them on long, deep segments and break the line up.
out float vSide; out float vTip; out float vLine; out float vW;
${PLACE}
vec3 curve(float t, vec3 p0, vec3 c0, vec3 c1, vec3 p1){
  float u = 1.0 - t;
  return u * u * u * p0 + 3.0 * u * u * t * c0 + 3.0 * u * t * t * c1 + t * t * t * p1;
}
bool touches(float node){ return node >= 0.0 && (abs(aEnds.x - node) < 0.5 || abs(aEnds.y - node) < 0.5); }
void main(){
  float aT = aStep.x;
  int s = int(aStep.z + 0.5), e = int(aStep.w + 0.5);
  vec3 a = mix(aAFrom, aATo, uMove), b = mix(aBFrom, aBTo, uMove);
  vec2 qa = place(a.xy, aAOff), qb = place(b.xy, aBOff);
  vec3 p0 = vec3(qa.x, a.z * uHeightScale, qa.y);
  vec3 p1 = vec3(qb.x, b.z * uHeightScale, qb.y);

  vec3 mid = (p0 + p1) * 0.5;
  vec2 ground = p1.xz - p0.xz;
  vec2 dir = length(ground) > 0.02 ? normalize(vec2(-ground.y, ground.x)) : normalize(mid.xz + vec2(1e-4));
  if (dot(dir, mid.xz) < 0.0) dir = -dir;
  vec2 right = length(ground) > 0.02 ? normalize(vec2(ground.y, -ground.x)) : vec2(0.0);
  float len = max(distance(p0, p1), 0.05);
  // Ungrouped, a curve bowed to one side.
  // Grouped, an island pair's links are nested arcs in one plane, busiest lowest, opening wider the more links the pair has.
  // Each is a quadratic written as a cubic, whose control points sit 2/3 of the way to the quadratic's.
  vec3 bow = mid + vec3(dir.x, 0.0, dir.y) * 0.26 * len;
  // A quadratic curve peaks at half its control point's offset, hence the 2.0.
  float arch = (0.16 + 0.50 * len) * (0.5 + 0.5 * uHeightScale) * uArch;
  vec3 lean = vec3(0.0, cos(0.75), 0.0) + vec3(right.x, 0.0, right.y) * sin(0.75);
  float reach = mix(0.4, 1.0 + 0.8 * clamp((aFan.y - 1.0) / 30.0, 0.0, 1.0), aFan.x);
  vec3 top = mid + lean * 2.0 * arch * reach;
  vec3 control = mix(bow, top, uLift);
  vec3 c0 = mix(p0, control, 2.0 / 3.0), c1 = mix(p1, control, 2.0 / 3.0);

  float hot = (touches(uHot) || touches(uPinned) ? 1.0 : 0.0) * uLift;
  vec4 k0 = uVP * vec4(curve(aT, p0, c0, c1, p1), 1.0);
  // The direction here comes from a step ahead, or a step back at the destination, where a step ahead is the point itself.
  float back = aT > 0.96 ? -1.0 : 1.0;
  vec4 k1 = uVP * vec4(curve(aT + 0.04 * back, p0, c0, c1, p1), 1.0);
  vec2 d = (k1.xy / k1.w - k0.xy / k0.w) * back;
  d = length(d) < 1e-6 ? vec2(1.0, 0.0) : normalize(d * vec2(uAspect, 1.0));
  vec2 normal = vec2(-d.y, d.x) / vec2(uAspect, 1.0);
  float halfWidth = uHalfWidth * mix(1.0, mix(1.7, 0.3, aT), uLift);
  vSide = 0.0; vTip = 0.0; vLine = 0.0; vW = k0.w;
  // Clean lines once the islands are mostly apart.
  if (uLift > 0.5) {
    // In pixels: the line's half width, and the ribbon's, wide enough for a lit link's arrowhead and a pixel of soft edge.
    float base = uHalfWidth / uPx;
    vLine = base * (hot > 0.5 ? 1.3 : 0.8);
    float ribbon = (hot > 0.5 ? base * 4.0 : vLine) + 1.0;
    halfWidth = ribbon * uPx;
    vSide = aStep.y * ribbon * k0.w;
    // The arrowhead's tip sits just past the middle, so heads never pile up on a cluster.
    vec4 tip = uVP * vec4(curve(0.55, p0, c0, c1, p1), 1.0);
    float toTip = tip.w > 0.0 ? length((k0.xy / k0.w - tip.xy / tip.w) * vec2(uAspect, 1.0)) / uPx : 1e5;
    vTip = (aT <= 0.55 ? toTip : -toTip) * k0.w;
  }
  gl_Position = vec4(k0.xy + normal * aStep.y * halfWidth * k0.w, k0.z, k0.w);

  vColour = mix(uMigration, mix(uColour[s], uColour[e], aT), uLift);
  vT = aT;
  // Roughly the curve's length; a raised arch is longer than the straight line under it.
  vLen = len * (1.0 + 0.6 * uLift);
  vFlow = aFlow;
  vHot = hot;
  float shown = clamp((uReveal * 1.02 - aShow.x) / 0.02, 0.0, 1.0) * clamp((uNow - aShow.z) / 0.8, 0.0, 1.0);
  // Busier links show stronger, so the main routes stand out and one-off migrations recede.
  float traffic = 0.6 + 0.4 * aFlow.x;
  // Unlit links show at 0.4.
  float strength = mix(mix(1.0, 0.4, uLift) * mix(1.0, uRest, uLift), 1.0 / max(uBase, 0.05), hot);
  vAlpha = uBase * traffic * aShow.y * strength * max(uFocus[s], uFocus[e]) * (0.7 + 0.3 * sin(3.14159 * aT)) * shown;
}`;

// At uFlow 1, comets run source to destination over a faint line, spaced by distance, denser on busier links and out
// of step between links. At 0 the line is drawn whole.
export const ARC_FRAGMENT = `
precision highp float;
in vec3 vColour; in float vAlpha; in float vT; in float vLen; in vec2 vFlow; in float vHot;
in float vSide; in float vTip; in float vLine; in float vW;
uniform float uFlow; uniform float uNow; uniform float uLift; uniform float uHalfWidth; uniform float uPx;
${EMIT}
void main(){
  float a = min(vAlpha, 1.0);
  vec3 colour = mix(vColour, vec3(1.0), 0.35 * vHot);
  if (uLift > 0.5) {
    float halfWidth = vLine;
    if (vHot > 0.5) {
      // A lit link carries a solid arrowhead midway, pointing the way it goes, sized in pixels.
      float base = uHalfWidth / uPx;
      float head = vTip / vW;
      float headLength = base * 11.0;
      if (head >= 0.0 && head < headLength) {
        halfWidth = max(vLine, base * 4.0 * head / headLength);
        a = max(a, 0.9);
      }
    }
    a *= clamp(halfWidth - abs(vSide / vW) + 0.5, 0.0, 1.0);
  }
  if (uFlow > 0.0) {
    float spacing = mix(0.28, 0.11, vFlow.x);
    float f = fract((vT * vLen - uNow * 0.22) / spacing + vFlow.y);
    float comet = smoothstep(0.15, 0.9, f) * (1.0 - smoothstep(0.93, 1.0, f));
    colour = mix(colour, vec3(1.0), comet * comet * comet * 0.55 * uFlow);
    a *= mix(1.0, 0.28 + 0.72 * comet, uFlow);
  }
  emit(colour, a, 0.0);
}`;

export const FULLSCREEN_VERTEX = `
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Mean colour from the density buffer, saturated by uSaturation, and brightness rising with density up to a limit.
export const TONE_FRAGMENT = `
precision highp float;
uniform sampler2D uDensity; uniform float uExposure; uniform float uSaturation;
in vec2 vUV; out vec4 outColour;
void main(){
  vec4 a = texture(uDensity, vUV);
  vec3 colour = a.a > 1e-6 ? a.rgb / a.a : vec3(0.0);
  float l = dot(colour, vec3(0.299, 0.587, 0.114));
  colour = clamp(vec3(l) + (colour - vec3(l)) * uSaturation, 0.0, 1.0);
  outColour = vec4(colour * (1.0 - exp(-uExposure * a.a)), 1.0);
}`;
