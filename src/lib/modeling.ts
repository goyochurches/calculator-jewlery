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
}

const CIRCLE_SEGMENTS = 48

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
  let base = g
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

/** Builds the solid for an object with its rotate / scale / mirror / array
 *  settings applied. Returns an error string if the profile isn't valid. */
export function buildModelObjectGeometry(obj: ModelObject): { geometry: THREE.BufferGeometry } | { error: string } {
  const built = buildBaseGeometry(obj)
  if ('error' in built) return built
  return { geometry: applyObjectTransforms(built.geometry, obj) }
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
export function buildModelObjects(objects: ModelObject[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    if (isCutMode(obj)) return
    const built = buildModelObjectGeometry(obj)
    if ('error' in built) return
    let geometry = built.geometry
    for (const cutter of objects) {
      if (!isCutMode(cutter) || cutter.targetId !== obj.id) continue
      const cb = buildModelObjectGeometry(cutter)
      if ('error' in cb) continue
      geometry = csg(geometry, cb.geometry, cutter.mode ?? 'subtract')
    }
    meshes.push(meshOf(geometry, index))
  })
  return meshes
}

/** Cutters for the whole-design boolean pass (no specific target), in list
 *  order. userData.cutMode says subtract vs. intersect. */
export function buildCutterMeshes(objects: ModelObject[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    // A cutter aimed at one object never touches the whole design — even if
    // that object was deleted (then it simply does nothing).
    if (!isCutMode(obj) || obj.targetId) return
    const built = buildModelObjectGeometry(obj)
    if ('error' in built) return
    const mesh = meshOf(built.geometry, index)
    mesh.userData.cutMode = obj.mode
    meshes.push(mesh)
  })
  return meshes
}

/** Every valid cutter (global or targeted) as a ghost for the viewer. */
export function buildGhostMeshes(objects: ModelObject[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    if (!isCutMode(obj)) return
    const built = buildModelObjectGeometry(obj)
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
