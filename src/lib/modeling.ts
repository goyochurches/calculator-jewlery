import * as THREE from 'three'
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'
import { toCreasedNormals, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Rhino-style general modeling core (first slice): draw a curve on a
// construction plane, then turn it into a solid with Extrude or Revolve.
// Each ModelObject keeps its own profile + operation parameters, so it stays
// editable (drag a point, change the height) and the solid is rebuilt from
// them — same parametric approach as the rest of this page, and undoable
// through the parameter history.

export type ProfileKind = 'polyline' | 'spline' | 'rectangle' | 'circle'
export type ModelPlane = 'front' | 'top' | 'right'
export type ModelOp = 'extrude' | 'revolve' | 'sweep' | 'loft'
/** 'add' = part of the ring's metal; 'subtract' = a cutter removed from it;
 *  'intersect' = keep only where the object overlaps. */
export type ModelMode = 'add' | 'subtract' | 'intersect'

export interface Point2 { x: number; y: number }

export interface ModelProfile {
  kind: ProfileKind
  /** polyline/spline: the control points. rectangle: two opposite corners.
   *  circle: the center and one point on the circle. All in mm, in the
   *  construction plane's own 2D coordinates. */
  points: Point2[]
}

export interface ModelObject {
  id: string
  name: string
  op: ModelOp
  profile: ModelProfile
  plane: ModelPlane
  /** World position of the plane's origin, mm. */
  offsetMm: { x: number; y: number; z: number }
  /** Extrude distance along the plane normal, mm (ignored by revolve). */
  heightMm: number
  /** Defaults to 'add'. */
  mode?: ModelMode
  /** For subtract / intersect: id of ONE 'add' object to apply to instead of
   *  the whole design (ring + every added solid). */
  targetId?: string
  /** Rotation about the object's own origin (its offset point), degrees. */
  rotationDeg?: { x: number; y: number; z: number }
  /** Uniform scale about the object's own origin. */
  scale?: number
  /** Adds a mirrored COPY across the world plane through the origin whose
   *  normal is this axis (Rhino Mirror). */
  mirror?: 'x' | 'y' | 'z'
  /** Repeats the object: linear = `count` copies `step` mm apart; polar =
   *  `count` copies around a world axis through the origin, spread over
   *  `totalDeg` (360 = a full ring of evenly spaced copies). */
  array?: { kind: 'linear'; count: number; step: { x: number; y: number; z: number } }
    | { kind: 'polar'; count: number; axis: 'x' | 'y' | 'z'; totalDeg: number }
  /** Sweep only: the smooth rail curve the profile travels along, drawn on
   *  its own construction plane (points in that plane's 2D mm coordinates).
   *  `closed` makes it a loop (a ring/torus-like sweep). */
  rail?: { points: Point2[]; plane: ModelPlane; closed: boolean }
  /** Loft only: the second section, at `heightMm` along the plane normal
   *  from `profile` (the base). Sections are matched by arc length. */
  topProfile?: ModelProfile
  /** Loft only: rotates the top section about its centre (degrees). */
  twistDeg?: number
  /** Matrix's Taper and Twist (the two remaining tools of its Transform
   *  group), along the object's own `axis`: across that axis the solid is
   *  scaled from 1× at its start to `endScale` at its end, and rotated
   *  about it by `twistDeg` over the same span. Applied to the object
   *  itself, so a Mirror/Array copies the deformed shape. */
  deform?: { axis: 'x' | 'y' | 'z'; endScale: number; twistDeg: number }
  /** Matrix's Flow along Curve, with the ring rail as the target curve:
   *  the solid is built FLAT (x = distance along the band, y = across its
   *  width, z = height above its surface) and then wrapped around the
   *  finger. `angleDeg` slides it around the band (0 = under the head,
   *  +X). Left undefined the object stays where it was placed. */
  flow?: { angleDeg: number }
}

const CIRCLE_SEGMENTS = 48

/** Arc a single triangle may span once the object is wrapped, radians —
 *  anything longer is subdivided first so the wrap follows the band's own
 *  curve instead of cutting across it as a straight chord. */
const FLOW_SEGMENT_RAD = 0.06
/** Safety cap on the subdivision below (each pass quadruples the count). */
const FLOW_MAX_TRIANGLES = 200_000

/** Samples a profile into the closed polygon (or, for a polyline/spline that
 *  hasn't got enough points yet, whatever there is) the solid is built from. */
export function sampleProfile(profile: ModelProfile): THREE.Vector2[] {
  const p = profile.points
  switch (profile.kind) {
    case 'rectangle': {
      if (p.length < 2) return []
      const [a, b] = p
      return [new THREE.Vector2(a.x, a.y), new THREE.Vector2(b.x, a.y), new THREE.Vector2(b.x, b.y), new THREE.Vector2(a.x, b.y)]
    }
    case 'circle': {
      if (p.length < 2) return []
      const r = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y)
      if (r < 1e-6) return []
      return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2
        return new THREE.Vector2(p[0].x + r * Math.cos(t), p[0].y + r * Math.sin(t))
      })
    }
    case 'spline': {
      if (p.length < 3) return p.map(q => new THREE.Vector2(q.x, q.y))
      const curve = new THREE.CatmullRomCurve3(p.map(q => new THREE.Vector3(q.x, q.y, 0)), true, 'centripetal')
      return curve.getPoints(p.length * 12).slice(0, -1).map(q => new THREE.Vector2(q.x, q.y))
    }
    default:
      return p.map(q => new THREE.Vector2(q.x, q.y))
  }
}

const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** True if any two non-adjacent edges of the closed polygon cross. */
export function polygonSelfIntersects(pts: THREE.Vector2[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue
      const c = pts[j], d = pts[(j + 1) % n]
      const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
    }
  }
  return false
}

const signedArea = (pts: THREE.Vector2[]) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y }
  return a / 2
}

/** Drops consecutive duplicates (and a repeated closing point). */
function clean(pts: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  for (const p of pts) if (!out.length || out[out.length - 1].distanceTo(p) > 1e-6) out.push(p)
  if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 1e-6) out.pop()
  return out
}

/** Validation message for a profile as a CLOSED solid outline, or null. */
export function profileError(profile: ModelProfile, op: ModelOp): string | null {
  const pts = clean(sampleProfile(profile))
  if (pts.length < 3) return 'Needs at least 3 points (or a rectangle/circle) to form a closed shape.'
  if (Math.abs(signedArea(pts)) < 1e-6) return 'The shape has no area.'
  if (polygonSelfIntersects(pts)) return 'The outline crosses itself.'
  if (op === 'revolve' && pts.some(p => p.x < -1e-9)) return 'For Revolve the whole profile must be on the right of the vertical axis (x ≥ 0).'
  return null
}

/** Maps a 2D point on a construction plane to world space (same mapping
 *  orientToPlane applies to geometry: front XY, top XZ, right ZY). */
function planePoint(plane: ModelPlane, p: Point2): THREE.Vector3 {
  if (plane === 'top') return new THREE.Vector3(p.x, 0, -p.y)
  if (plane === 'right') return new THREE.Vector3(0, p.y, -p.x)
  return new THREE.Vector3(p.x, p.y, 0)
}

const SWEEP_MAX_RINGS = 400
const LOFT_SAMPLES = 128

/** Scales a profile about its own centre (used for a loft's default top). */
export function scaleProfile(profile: ModelProfile, k: number): ModelProfile {
  const pts = profile.points
  if (pts.length === 0) return profile
  let c: Point2
  if (profile.kind === 'circle') c = pts[0]
  else if (profile.kind === 'rectangle') c = { x: (pts[0].x + (pts[1]?.x ?? pts[0].x)) / 2, y: (pts[0].y + (pts[1]?.y ?? pts[0].y)) / 2 }
  else c = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }
  const sc = (p: Point2) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })
  return { ...profile, points: profile.kind === 'circle' ? [pts[0], sc(pts[1] ?? pts[0])] : pts.map(sc) }
}

/** Resamples a closed polygon to `n` points evenly by arc length, starting
 *  at its point of largest x (so two sections start at matching sides) and
 *  wound counter-clockwise, so rings of two sections correspond. */
function resampleClosed(pts: THREE.Vector2[], n: number, twistRad = 0): THREE.Vector2[] {
  let poly = pts.map(p => p.clone())
  const centroid = poly.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(poly.length)
  if (twistRad) poly = poly.map(p => p.clone().sub(centroid).rotateAround(new THREE.Vector2(), twistRad).add(centroid))
  if (signedArea(poly) < 0) poly.reverse()
  // Start at the vertex with the largest angle-0 extent (rightmost, then lowest).
  let start = 0
  for (let i = 1; i < poly.length; i++) if (poly[i].x > poly[start].x + 1e-9 || (Math.abs(poly[i].x - poly[start].x) <= 1e-9 && poly[i].y < poly[start].y)) start = i
  poly = [...poly.slice(start), ...poly.slice(0, start)]
  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < poly.length; i++) { const l = poly[i].distanceTo(poly[(i + 1) % poly.length]); lengths.push(l); total += l }
  const out: THREE.Vector2[] = []
  let edge = 0, acc = 0
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total
    while (edge < poly.length - 1 && acc + lengths[edge] < target) { acc += lengths[edge]; edge++ }
    const t = lengths[edge] > 0 ? (target - acc) / lengths[edge] : 0
    out.push(poly[edge].clone().lerp(poly[(edge + 1) % poly.length], t))
  }
  return out
}

/** Loft between a base and a top section (Rhino Loft with 2 sections):
 *  straight ruled surface between arc-length-matched rings, flat caps. */
function buildLoftGeometry(base: THREE.Vector2[], top: THREE.Vector2[], height: number, twistDeg: number): THREE.BufferGeometry {
  const a = resampleClosed(base, LOFT_SAMPLES), b = resampleClosed(top, LOFT_SAMPLES, (twistDeg * Math.PI) / 180)
  const n = LOFT_SAMPLES
  const positions: number[] = []
  for (const q of a) positions.push(q.x, q.y, 0)
  for (const q of b) positions.push(q.x, q.y, height)
  const sides: number[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    sides.push(i, j, n + j, i, n + j, n + i)
  }
  // Caps: triangulate each section; try both windings against the sides.
  const capA = THREE.ShapeUtils.triangulateShape(a.map(q => q.clone()), [])
  const capB = THREE.ShapeUtils.triangulateShape(b.map(q => q.clone()), [])
  const capsX: number[] = [], capsY: number[] = []
  for (const [x, y, z] of capA) { capsX.push(x, z, y); capsY.push(x, y, z) }
  for (const [x, y, z] of capB) { capsX.push(n + x, n + y, n + z); capsY.push(n + x, n + z, n + y) }
  const signedVolume = (idx: number[]) => {
    const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3()
    let v = 0
    for (let k = 0; k < idx.length; k += 3) {
      p.fromArray(positions, idx[k] * 3); q.fromArray(positions, idx[k + 1] * 3); r.fromArray(positions, idx[k + 2] * 3)
      v += p.dot(q.clone().cross(r)) / 6
    }
    return v
  }
  const withX = [...sides, ...capsX], withY = [...sides, ...capsY]
  let indices = Math.abs(signedVolume(withX)) >= Math.abs(signedVolume(withY)) ? withX : withY
  if (signedVolume(indices) < 0) {
    indices = indices.slice()
    for (let k = 0; k < indices.length; k += 3) { const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/** Validation for a sweep's rail (and its fit with the profile), or null. */
export function railError(obj: ModelObject): string | null {
  const rail = obj.rail
  if (!rail || rail.points.length < 2) return 'The rail needs at least 2 points.'
  if (rail.closed && rail.points.length < 3) return 'A closed rail needs at least 3 points.'
  const pts = clean(sampleProfile(obj.profile))
  if (pts.length < 3) return null // profile error reported separately
  const centroid = pts.reduce((a, q) => a.add(q), new THREE.Vector2()).divideScalar(pts.length)
  const reach = Math.max(...pts.map(q => q.distanceTo(centroid)))
  const curve = railCurve(rail)
  // Tightest bend radius along the rail vs the profile's reach: if the
  // profile is bigger than the bend radius the swept solid folds onto itself.
  const n = 200
  let minRadius = Infinity
  const probes = rail.closed ? n : n - 1
  for (let i = 0; i < probes; i++) {
    const t0 = curve.getTangentAt((i / n) % 1), t1 = curve.getTangentAt(((i + 1) / n) % 1)
    const ds = curve.getLength() / n
    const angle = Math.acos(Math.min(1, Math.max(-1, t0.dot(t1))))
    if (angle > 1e-6) minRadius = Math.min(minRadius, ds / angle)
  }
  if (minRadius < reach * 1.05) return `The profile (reach ${reach.toFixed(1)} mm) is too big for the rail's tightest bend (radius ${minRadius.toFixed(1)} mm) — make the profile smaller or the rail gentler.`
  return null
}

/** The rail as a smooth 2D polyline (in its own plane's coordinates) for
 *  drawing it in the sketch canvas. */
export function sampleRail2D(rail: NonNullable<ModelObject['rail']>): Point2[] {
  if (rail.points.length < 2) return rail.points
  const c = new THREE.CatmullRomCurve3(rail.points.map(p => new THREE.Vector3(p.x, p.y, 0)), rail.closed, 'centripetal')
  return c.getPoints(Math.max(40, rail.points.length * 24)).map(q => ({ x: q.x, y: q.y }))
}

function railCurve(rail: NonNullable<ModelObject['rail']>): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(rail.points.map(p => planePoint(rail.plane, p)), rail.closed, 'centripetal')
}

/** Sweep 1 Rail: the profile (centred on its own centroid, kept
 *  perpendicular to the rail with parallel-transport frames) travels along
 *  the rail; open rails get flat end caps. Winding is fixed up by checking
 *  the signed volume so faces always point outward. */
function buildSweepGeometry(profilePts: THREE.Vector2[], rail: NonNullable<ModelObject['rail']>): THREE.BufferGeometry {
  const curve = railCurve(rail)
  const closed = rail.closed
  const segments = Math.min(SWEEP_MAX_RINGS, Math.max(64, rail.points.length * 32))
  const ringCount = closed ? segments : segments + 1
  const frames = curve.computeFrenetFrames(segments, closed)
  const centroid = profilePts.reduce((a, q) => a.add(q), new THREE.Vector2()).divideScalar(profilePts.length)
  const local = profilePts.map(q => q.clone().sub(centroid))
  const m = local.length
  const positions: number[] = []
  for (let i = 0; i < ringCount; i++) {
    const c = curve.getPointAt(i / segments)
    const nrm = frames.normals[i], bin = frames.binormals[i]
    for (const q of local) positions.push(c.x + nrm.x * q.x + bin.x * q.y, c.y + nrm.y * q.x + bin.y * q.y, c.z + nrm.z * q.x + bin.z * q.y)
  }
  const indices: number[] = []
  const lastRing = closed ? ringCount : ringCount - 1
  for (let i = 0; i < lastRing; i++) {
    const i2 = (i + 1) % ringCount
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m
      const a = i * m + j, b = i2 * m + j, c = i2 * m + j2, d = i * m + j2
      indices.push(a, b, c, a, c, d)
    }
  }
  const signedVolume = (idxArr: number[]) => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    let vol = 0
    for (let k = 0; k < idxArr.length; k += 3) {
      a.fromArray(positions, idxArr[k] * 3); b.fromArray(positions, idxArr[k + 1] * 3); c.fromArray(positions, idxArr[k + 2] * 3)
      vol += a.dot(b.clone().cross(c)) / 6
    }
    return vol
  }
  let finalIndices = indices
  if (!closed) {
    const tris = THREE.ShapeUtils.triangulateShape(local.map(q => q.clone()), [])
    const endBase = (ringCount - 1) * m
    // Start and end caps face opposite ways; which of the two overall
    // windings matches the side faces depends on the profile's winding vs.
    // the frames' handedness, so build both and keep the consistent one
    // (the consistent one encloses the larger |volume|; a mismatched cap
    // subtracts its contribution instead of adding it).
    const capsA: number[] = [], capsB: number[] = []
    for (const [ta, tb, tc] of tris) {
      capsA.push(ta, tc, tb, endBase + ta, endBase + tb, endBase + tc)
      capsB.push(ta, tb, tc, endBase + ta, endBase + tc, endBase + tb)
    }
    const withA = [...indices, ...capsA], withB = [...indices, ...capsB]
    finalIndices = Math.abs(signedVolume(withA)) >= Math.abs(signedVolume(withB)) ? withA : withB
  }
  // Make every face point outward: flip the whole index buffer if needed.
  if (signedVolume(finalIndices) < 0) {
    finalIndices = finalIndices.slice()
    for (let k = 0; k < finalIndices.length; k += 3) { const t = finalIndices[k + 1]; finalIndices[k + 1] = finalIndices[k + 2]; finalIndices[k + 2] = t }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(finalIndices)
  return geometry
}

/** Rotates a geometry built in the XY sketch plane (normal +Z) onto the
 *  chosen construction plane: front = XY, top = XZ (normal +Y), right = ZY
 *  (normal +X). */
const MAX_ARRAY_COPIES = 200

/** Twist arc a single triangle may span, radians — same chord argument as
 *  `FLOW_SEGMENT_RAD`, and the taper reuses it as "1/20th of the span". */
const DEFORM_SEGMENT_RAD = 0.06

/** Fallback band radius when none is passed (a plain US 7 shank) — every
 *  real caller passes the live one. */
export const DEFAULT_BAND_RADIUS_MM = 9
/** How close to the finger's axis a flowed solid may reach, mm. */
const MIN_FLOW_RADIUS_MM = 0.5

/** Reverses triangle winding on a non-indexed geometry (position + normal),
 *  needed after a reflection turns the mesh inside out. */
function flipTriangles(g: THREE.BufferGeometry): void {
  for (const key of Object.keys(g.attributes)) {
    const attr = g.attributes[key], n = attr.itemSize, arr = attr.array as Float32Array
    for (let i = 0; i < arr.length; i += n * 3) {
      for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t }
    }
    attr.needsUpdate = true
  }
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const

/** Places copies of `g` (already positioned) per the object's transform
 *  settings: rotate/scale about its origin, optional mirrored copy, then the
 *  array. Copies that touch or overlap are unioned into one solid so the
 *  result stays a valid closed mesh for the boolean passes. */
function applyObjectTransforms(g: THREE.BufferGeometry, obj: ModelObject): THREE.BufferGeometry {
  let base = obj.deform ? applyDeform(g, obj.deform) : g
  const rot = obj.rotationDeg, sc = obj.scale ?? 1
  if ((rot && (rot.x || rot.y || rot.z)) || sc !== 1) {
    const o = obj.offsetMm
    const m = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(rot?.x ?? 0), THREE.MathUtils.degToRad(rot?.y ?? 0), THREE.MathUtils.degToRad(rot?.z ?? 0))))
      .multiply(new THREE.Matrix4().makeScale(sc, sc, sc))
      .multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z))
    base = base.clone().applyMatrix4(m)
  }
  const copies: THREE.BufferGeometry[] = [base]
  if (obj.mirror) {
    const flip = [1, 1, 1]; flip[AXIS_INDEX[obj.mirror]] = -1
    const mirrored = base.clone().applyMatrix4(new THREE.Matrix4().makeScale(flip[0], flip[1], flip[2]))
    flipTriangles(mirrored)
    copies.push(mirrored)
  }
  const arr = obj.array
  let instances = copies
  if (arr && arr.count > 1) {
    const count = Math.min(Math.floor(arr.count), Math.floor(MAX_ARRAY_COPIES / copies.length))
    instances = []
    for (const c of copies) {
      for (let k = 0; k < count; k++) {
        if (k === 0) { instances.push(c); continue }
        const m = new THREE.Matrix4()
        if (arr.kind === 'linear') m.makeTranslation(arr.step.x * k, arr.step.y * k, arr.step.z * k)
        else {
          const step = arr.totalDeg >= 360 - 1e-6 ? arr.totalDeg / count : arr.totalDeg / (count - 1)
          const a = THREE.MathUtils.degToRad(step * k)
          if (arr.axis === 'x') m.makeRotationX(a); else if (arr.axis === 'y') m.makeRotationY(a); else m.makeRotationZ(a)
        }
        instances.push(c.clone().applyMatrix4(m))
      }
    }
  }
  if (instances.length === 1) return instances[0]
  return combineInstances(instances)
}

/** Unions copies whose bounding boxes touch (via CSG); merges the rest as
 *  separate islands. */
function combineInstances(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const box = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!.clone() }
  let islands = geoms.map(g => ({ g, b: box(g) }))
  const evaluator = new Evaluator()
  evaluator.attributes = ['position', 'normal']
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        if (!islands[i].b.intersectsBox(islands[j].b)) continue
        const A = new Brush(islands[i].g), B = new Brush(islands[j].g)
        A.updateMatrixWorld(true); B.updateMatrixWorld(true)
        const u = evaluator.evaluate(A, B, ADDITION).geometry
        islands = islands.filter((_, k) => k !== i && k !== j)
        islands.push({ g: u, b: box(u) })
        merged = true
        break outer
      }
    }
  }
  const parts = islands.map(x => (x.g.index ? x.g.toNonIndexed() : x.g))
  for (const p of parts) for (const key of Object.keys(p.attributes)) if (key !== 'position' && key !== 'normal') p.deleteAttribute(key)
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
}

/** Splits triangles until no EDGE spans more than `maxDelta` along the
 *  given axis, so a deformation that varies along that axis (the wrap
 *  below, Taper, Twist) follows its real curve instead of cutting across
 *  it as a straight chord.
 *
 *  Red-green refinement: an edge is split at the midpoint of the SAME two
 *  endpoint positions whichever of the two triangles sharing it is being
 *  looked at, and the decision to split depends only on those endpoints —
 *  so both sides always agree and this cannot open a T-junction crack. The
 *  mesh stays exactly as watertight as it came in, which the boolean
 *  passes depend on. Only the edges that actually need it are split (a flat
 *  10 × 3 × 1 mm slab wrapped on a US-7 shank: ~2k triangles, where
 *  splitting every triangle into four regardless would reach ~12k for the
 *  same arc).
 *
 *  Only position and normal are carried over — the boolean passes and the
 *  viewer's materials use nothing else either. */
function subdivideAlongAxis(g: THREE.BufferGeometry, axis: 0 | 1 | 2, maxDelta: number): THREE.BufferGeometry {
  const geom = g.index ? g.toNonIndexed() : g.clone()
  for (const key of Object.keys(geom.attributes)) if (key !== 'position' && key !== 'normal') geom.deleteAttribute(key)
  const keys = Object.keys(geom.attributes)
  const sizes = keys.map(k => geom.attributes[k].itemSize)
  const stride = sizes.reduce((a, b) => a + b, 0)
  const axisOffset = sizes.slice(0, keys.indexOf('position')).reduce((a, b) => a + b, 0) + axis
  const count = geom.attributes.position.count

  // One packed vertex per entry; every 3 entries are a triangle.
  let verts: number[][] = []
  for (let i = 0; i < count; i++) {
    const v: number[] = []
    keys.forEach((k, a) => { const attr = geom.attributes[k]; for (let c = 0; c < sizes[a]; c++) v.push(attr.getComponent(i, c)) })
    verts.push(v)
  }
  const mid = (u: number[], v: number[]) => u.map((x, i) => (x + v[i]) / 2)
  const tooLong = (u: number[], v: number[]) => Math.abs(u[axisOffset] - v[axisOffset]) > maxDelta

  for (;;) {
    const next: number[][] = []
    let split = false
    for (let t = 0; t < verts.length; t += 3) {
      const a = verts[t], b = verts[t + 1], c = verts[t + 2]
      const ab = tooLong(a, b), bc = tooLong(b, c), ca = tooLong(c, a)
      if (!ab && !bc && !ca) { next.push(a, b, c); continue }
      split = true
      const m0 = ab ? mid(a, b) : null, m1 = bc ? mid(b, c) : null, m2 = ca ? mid(c, a) : null
      if (m0 && m1 && m2) next.push(a, m0, m2, m0, b, m1, m2, m1, c, m0, m1, m2)
      else if (m0 && m1) next.push(a, m0, m1, m0, b, m1, a, m1, c)
      else if (m1 && m2) next.push(b, m1, m2, m1, c, m2, b, m2, a)
      else if (m0 && m2) next.push(c, m2, m0, m2, a, m0, c, m0, b)
      else if (m0) next.push(a, m0, c, m0, b, c)
      else if (m1) next.push(b, m1, a, m1, c, a)
      else next.push(c, m2!, b, m2!, a, b)
    }
    if (!split || next.length / 3 > FLOW_MAX_TRIANGLES) break
    verts = next
  }

  const out = new THREE.BufferGeometry()
  const flat = new Float32Array(verts.length * stride)
  verts.forEach((v, i) => flat.set(v, i * stride))
  let offset = 0
  keys.forEach((k, a) => {
    const values = new Float32Array(verts.length * sizes[a])
    for (let i = 0; i < verts.length; i++) for (let c = 0; c < sizes[a]; c++) values[i * sizes[a] + c] = flat[i * stride + offset + c]
    out.setAttribute(k, new THREE.BufferAttribute(values, sizes[a]))
    offset += sizes[a]
  })
  return out
}

/** Matrix's Taper + Twist, along the object's own `axis` and measured over
 *  its own bounding box: at a fraction t of the way along the axis the
 *  cross-section is scaled by f(t) = 1 + (endScale − 1)·t and rotated about
 *  the axis by twistDeg·t, both about the axis line through the bounding
 *  box's centre.
 *
 *  Same two guarantees the wrap below documents, for the same reasons:
 *  1. Continuous, and applied after subdividing so the deformed mesh
 *     follows the real taper/twist — a closed mesh stays closed.
 *  2. The local Jacobian's determinant is f(t)², so as long as f stays
 *     positive (the UI keeps endScale ≥ 0.05) the winding, and with it the
 *     signed volume's sign, is preserved — no inside-out solid.
 *  Normals get the exact inverse-transpose of that Jacobian rather than
 *  being recomputed, so the solid's crisp creases survive (the twist's own
 *  shear term matters here: ignoring it visibly mis-shades a twisted
 *  solid's end faces).
 *
 *  Measured on a throwaway script, same as the wrap below: a 4 × 10 × 4 mm
 *  box tapered to 0.5× stays watertight and lands on 93.333 mm³ — the
 *  analytic ∫ of its own tapering section, to 0.000%. A 180° twist keeps
 *  it watertight too, within 0.5% of the untwisted volume (the remainder
 *  is the faceting: the mesh is refined ALONG the twist axis, not across
 *  the section, so a hard twist's silhouette — not its shading, which uses
 *  the analytic normals — stays as coarse as the profile was drawn). */
function applyDeform(g: THREE.BufferGeometry, deform: NonNullable<ModelObject['deform']>): THREE.BufferGeometry {
  const axis = AXIS_INDEX[deform.axis]
  const twist = THREE.MathUtils.degToRad(deform.twistDeg)
  const endScale = Math.max(0.05, deform.endScale)
  if (Math.abs(twist) < 1e-9 && Math.abs(endScale - 1) < 1e-9) return g
  g.computeBoundingBox()
  const box = g.boundingBox!
  const min = box.min.getComponent(axis), span = box.max.getComponent(axis) - min
  if (!(span > 1e-9)) return g
  // Fineness: the twist's own arc, or — for a pure taper — 20 slices.
  const maxDelta = Math.abs(twist) > 1e-9 ? (span * DEFORM_SEGMENT_RAD) / Math.abs(twist) : span / 20
  const geometry = subdivideAlongAxis(g, axis, maxDelta)
  const pos = geometry.attributes.position, nrm = geometry.attributes.normal as THREE.BufferAttribute | undefined
  // Axis u, and the two cross-section axes v, w (a right-handed frame).
  const v = (axis + 1) % 3, w = (axis + 2) % 3
  const centre = box.getCenter(new THREE.Vector3())
  const cv = centre.getComponent(v), cw = centre.getComponent(w)
  const jacobian = new THREE.Matrix3(), normal = new THREE.Vector3()
  const p = new THREE.Vector3(), out = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const t = (p.getComponent(axis) - min) / span
    const f = 1 + (endScale - 1) * t, phi = twist * t
    const cos = Math.cos(phi), sin = Math.sin(phi)
    const a = p.getComponent(v) - cv, b = p.getComponent(w) - cw
    out.copy(p)
    out.setComponent(v, cv + f * (a * cos - b * sin))
    out.setComponent(w, cw + f * (a * sin + b * cos))
    if (nrm) {
      const df = (endScale - 1) / span, dphi = twist / span
      const col = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
      col[v].setComponent(v, f * cos); col[v].setComponent(w, f * sin)
      col[w].setComponent(v, -f * sin); col[w].setComponent(w, f * cos)
      col[axis].setComponent(axis, 1)
      col[axis].setComponent(v, df * (a * cos - b * sin) + f * dphi * (-a * sin - b * cos))
      col[axis].setComponent(w, df * (a * sin + b * cos) + f * dphi * (a * cos - b * sin))
      jacobian.set(
        col[0].x, col[1].x, col[2].x,
        col[0].y, col[1].y, col[2].y,
        col[0].z, col[1].z, col[2].z,
      )
      normal.fromBufferAttribute(nrm, i).applyMatrix3(jacobian.invert().transpose()).normalize()
      nrm.setXYZ(i, normal.x, normal.y, normal.z)
    }
    pos.setXYZ(i, out.x, out.y, out.z)
  }
  pos.needsUpdate = true
  if (nrm) nrm.needsUpdate = true
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** Matrix's Flow along Curve, with the ring rail as the target curve: maps
 *  the flat solid's (x, y, z) to (θ = angle − x / R, band axis, r = R + z).
 *
 *  Why this is safe to run on a finished solid (checked, not assumed —
 *  same rigor as `buildBandTextGroup`'s own bend in ringGeometry.ts):
 *  1. It is CONTINUOUS and, after the subdivision above, applied to a mesh
 *     whose triangles are small enough that the wrap follows the band's
 *     curve — so a closed mesh stays closed.
 *  2. It does NOT turn the solid inside-out. Locally the map is a rotation
 *     about Y composed with the scale diag((R+z)/R, 1, 1); that scale is
 *     POSITIVE wherever r > 0 (guaranteed by the caller's radius check),
 *     so the Jacobian's determinant stays positive and the winding — and
 *     therefore the signed volume's sign — is preserved. The θ = −x/R sign
 *     is the one that keeps it so (the naive +x/R mirrors the solid, the
 *     same trap the band-text bend documents).
 *  3. Normals are transformed by that same local frame (inverse-transpose
 *     of the scale, i.e. n_x / k) rather than recomputed, so the crisp
 *     creases `toCreasedNormals` put on the solid survive the wrap — and
 *     they describe the IDEAL wrap, not the subdivided chords, which is
 *     what makes the wrapped surface shade smoothly.
 *
 *  Measured on a throwaway script before trusting any of the above: a flat
 *  10 × 3 × 1 mm slab wrapped at R = 9 mm stays watertight, keeps its
 *  volume's sign, and grows 5.53% — exactly the 1 + t/2R a real bend owes
 *  to the material above the neutral radius, i.e. the wrap is metrically
 *  right, not just visually plausible. */
function flowAroundBand(g: THREE.BufferGeometry, radiusMm: number, angleDeg: number): THREE.BufferGeometry {
  const geometry = subdivideAlongAxis(g, 0, radiusMm * FLOW_SEGMENT_RAD)
  const pos = geometry.attributes.position, nrm = geometry.attributes.normal as THREE.BufferAttribute | undefined
  const angle = THREE.MathUtils.degToRad(angleDeg)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const theta = angle - x / radiusMm
    const r = radiusMm + z
    const cos = Math.cos(theta), sin = Math.sin(theta)
    if (nrm) {
      // Local frame: x → (sinθ, 0, −cosθ), y → (0, 1, 0), z → (cosθ, 0, sinθ).
      const k = r / radiusMm
      const nx = nrm.getX(i) / k, ny = nrm.getY(i), nz = nrm.getZ(i)
      const wx = nx * sin + nz * cos, wy = ny, wz = -nx * cos + nz * sin
      const len = Math.hypot(wx, wy, wz) || 1
      nrm.setXYZ(i, wx / len, wy / len, wz / len)
    }
    pos.setXYZ(i, r * cos, y, r * sin)
  }
  pos.needsUpdate = true
  if (nrm) nrm.needsUpdate = true
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** Flat length along x of a flowed object, the band's own circumference at
 *  that radius (the UI warns when the first exceeds the second — the wrap
 *  would then overlap itself), and how far the shape reaches BELOW the
 *  band's surface (which `buildModelObjectGeometry` rejects past the
 *  radius). Bounding box of the built solid, no boolean work. */
export function flowArcMm(obj: ModelObject, bandRadiusMm: number): { arcMm: number; circumferenceMm: number; belowMm: number } | null {
  if (!obj.flow) return null
  const built = buildBaseGeometry(obj)
  if ('error' in built) return null
  const g = applyObjectTransforms(built.geometry, obj)
  g.computeBoundingBox()
  const box = g.boundingBox!
  return { arcMm: box.max.x - box.min.x, circumferenceMm: 2 * Math.PI * bandRadiusMm, belowMm: Math.max(0, -box.min.z) }
}

/** Builds the solid for an object with its rotate / scale / mirror / array
 *  settings applied, and — when Flow is on — wrapped around the band.
 *  Returns an error string if the profile isn't valid. */
export function buildModelObjectGeometry(obj: ModelObject, bandRadiusMm = DEFAULT_BAND_RADIUS_MM): { geometry: THREE.BufferGeometry } | { error: string } {
  const built = buildBaseGeometry(obj)
  if ('error' in built) return built
  const geometry = applyObjectTransforms(built.geometry, obj)
  if (!obj.flow) return { geometry }
  geometry.computeBoundingBox()
  const minZ = geometry.boundingBox!.min.z
  // r = R + z must stay clear of the finger's own axis, or the wrap folds
  // through the centre and the solid self-intersects.
  if (bandRadiusMm + minZ < MIN_FLOW_RADIUS_MM) {
    return { error: `Flow: the shape reaches ${(-minZ).toFixed(1)} mm below the band's surface (radius ${bandRadiusMm.toFixed(1)} mm) — raise its Offset Z so it stays outside the finger.` }
  }
  return { geometry: flowAroundBand(geometry, bandRadiusMm, obj.flow.angleDeg) }
}

function orientToPlane(g: THREE.BufferGeometry, plane: ModelPlane) {
  if (plane === 'top') g.rotateX(-Math.PI / 2)
  else if (plane === 'right') g.rotateY(Math.PI / 2)
}

/** Builds the solid for an object, positioned in world space. Returns an
 *  error string instead of geometry if the profile isn't valid. */
function buildBaseGeometry(obj: ModelObject): { geometry: THREE.BufferGeometry } | { error: string } {
  const error = profileError(obj.profile, obj.op)
  if (error) return { error }
  let pts = clean(sampleProfile(obj.profile))
  let geometry: THREE.BufferGeometry
  if (obj.op === 'loft') {
    const top = obj.topProfile
    if (!top) return { error: 'Loft needs a top section.' }
    const topError = profileError(top, 'loft')
    if (topError) return { error: `Top section: ${topError}` }
    if (!(obj.heightMm > 0)) return { error: 'Loft height must be greater than 0.' }
    geometry = buildLoftGeometry(pts, clean(sampleProfile(top)), obj.heightMm, obj.twistDeg ?? 0)
    orientToPlane(geometry, obj.plane)
    geometry.translate(obj.offsetMm.x, obj.offsetMm.y, obj.offsetMm.z)
    return { geometry: toCreasedNormals(geometry, Math.PI / 5) }
  }
  if (obj.op === 'sweep') {
    const rError = railError(obj)
    if (rError) return { error: rError }
    // The rail is already in world orientation (planePoint), so the swept
    // solid is NOT rotated onto the profile's plane.
    geometry = buildSweepGeometry(pts, obj.rail!)
    geometry.translate(obj.offsetMm.x, obj.offsetMm.y, obj.offsetMm.z)
    return { geometry: toCreasedNormals(geometry, Math.PI / 5) }
  }
  if (obj.op === 'extrude') {
    if (!(obj.heightMm > 0)) return { error: 'Extrude height must be greater than 0.' }
    geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: obj.heightMm, bevelEnabled: false, curveSegments: 1 })
  } else {
    // LatheGeometry faces outward for a COUNTER-clockwise loop in (x, y-up)
    // (measured: clockwise gives a negative signed volume = inside-out), and
    // it never closes the loop itself — repeat the first point.
    if (signedArea(pts) < 0) pts = [...pts].reverse()
    geometry = new THREE.LatheGeometry([...pts, pts[0].clone()], 64)
  }
  orientToPlane(geometry, obj.plane)
  geometry.translate(obj.offsetMm.x, obj.offsetMm.y, obj.offsetMm.z)
  return { geometry: toCreasedNormals(geometry, Math.PI / 5) }
}

const cutOp = (mode: ModelMode) => (mode === 'intersect' ? INTERSECTION : SUBTRACTION)

/** Boolean of two geometries with three-bvh-csg (positions + normals only —
 *  swept/lofted solids carry no UVs). */
function csg(a: THREE.BufferGeometry, b: THREE.BufferGeometry, mode: ModelMode): THREE.BufferGeometry {
  const evaluator = new Evaluator()
  evaluator.attributes = ['position', 'normal']
  const A = new Brush(a), B = new Brush(b)
  A.updateMatrixWorld(true); B.updateMatrixWorld(true)
  return evaluator.evaluate(A, B, cutOp(mode)).geometry
}

const isCutMode = (o: ModelObject) => (o.mode ?? 'add') !== 'add'

function meshOf(geometry: THREE.BufferGeometry, index: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry)
  mesh.userData.partName = 'Modeled solid'
  mesh.userData.instanceIndex = index
  return mesh
}

/** Solids that become part of the ring's metal. Cutters that target one of
 *  them specifically are applied here, in list order, before the solid
 *  joins the design. */
export function buildModelObjects(objects: ModelObject[], bandRadiusMm = DEFAULT_BAND_RADIUS_MM): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    if (isCutMode(obj)) return
    const built = buildModelObjectGeometry(obj, bandRadiusMm)
    if ('error' in built) return
    let geometry = built.geometry
    for (const cutter of objects) {
      if (!isCutMode(cutter) || cutter.targetId !== obj.id) continue
      const cb = buildModelObjectGeometry(cutter, bandRadiusMm)
      if ('error' in cb) continue
      geometry = csg(geometry, cb.geometry, cutter.mode ?? 'subtract')
    }
    meshes.push(meshOf(geometry, index))
  })
  return meshes
}

/** Cutters for the whole-design boolean pass (no specific target), in list
 *  order. userData.cutMode says subtract vs. intersect. */
export function buildCutterMeshes(objects: ModelObject[], bandRadiusMm = DEFAULT_BAND_RADIUS_MM): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    // A cutter aimed at one object never touches the whole design — even if
    // that object was deleted (then it simply does nothing).
    if (!isCutMode(obj) || obj.targetId) return
    const built = buildModelObjectGeometry(obj, bandRadiusMm)
    if ('error' in built) return
    const mesh = meshOf(built.geometry, index)
    mesh.userData.cutMode = obj.mode
    meshes.push(mesh)
  })
  return meshes
}

/** Every valid cutter (global or targeted) as a ghost for the viewer. */
export function buildGhostMeshes(objects: ModelObject[], bandRadiusMm = DEFAULT_BAND_RADIUS_MM): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    if (!isCutMode(obj)) return
    const built = buildModelObjectGeometry(obj, bandRadiusMm)
    if ('error' in built) return
    const mesh = meshOf(built.geometry, index)
    mesh.userData.cutMode = obj.mode
    meshes.push(mesh)
  })
  return meshes
}

export function newModelObject(profile: ModelProfile, op: ModelOp, index: number): ModelObject {
  return {
    id: `m${Date.now().toString(36)}${index}`,
    name: `${op === 'extrude' ? 'Extrusion' : op === 'revolve' ? 'Revolution' : op === 'loft' ? 'Loft' : 'Sweep'} ${index + 1}`,
    op, profile, plane: 'front', offsetMm: { x: 0, y: 0, z: 0 }, heightMm: 3,
    // Sweeps start with a gentle example rail on the Top plane to edit.
    // Lofts start as a taper to 60% so the result is visibly not a prism.
    ...(op === 'loft' ? { topProfile: scaleProfile(profile, 0.6), twistDeg: 0 } : {}),
    ...(op === 'sweep' ? { rail: { plane: 'top' as ModelPlane, closed: false, points: [{ x: -8, y: 0 }, { x: 0, y: 4 }, { x: 8, y: 0 }] } } : {}),
  }
}
