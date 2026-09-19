import * as THREE from 'three'

// Rhino-style general modeling core (first slice): draw a curve on a
// construction plane, then turn it into a solid with Extrude or Revolve.
// Each ModelObject keeps its own profile + operation parameters, so it stays
// editable (drag a point, change the height) and the solid is rebuilt from
// them — same parametric approach as the rest of this page, and undoable
// through the parameter history.

export type ProfileKind = 'polyline' | 'spline' | 'rectangle' | 'circle'
export type ModelPlane = 'front' | 'top' | 'right'
export type ModelOp = 'extrude' | 'revolve' | 'sweep'
/** 'add' = part of the ring's metal; 'subtract' = a cutter removed from it. */
export type ModelMode = 'add' | 'subtract'

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
  /** Sweep only: the smooth rail curve the profile travels along, drawn on
   *  its own construction plane (points in that plane's 2D mm coordinates).
   *  `closed` makes it a loop (a ring/torus-like sweep). */
  rail?: { points: Point2[]; plane: ModelPlane; closed: boolean }
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
function orientToPlane(g: THREE.BufferGeometry, plane: ModelPlane) {
  if (plane === 'top') g.rotateX(-Math.PI / 2)
  else if (plane === 'right') g.rotateY(Math.PI / 2)
}

/** Builds the solid for an object, positioned in world space. Returns an
 *  error string instead of geometry if the profile isn't valid. */
export function buildModelObjectGeometry(obj: ModelObject): { geometry: THREE.BufferGeometry } | { error: string } {
  const error = profileError(obj.profile, obj.op)
  if (error) return { error }
  let pts = clean(sampleProfile(obj.profile))
  let geometry: THREE.BufferGeometry
  if (obj.op === 'sweep') {
    const rError = railError(obj)
    if (rError) return { error: rError }
    // The rail is already in world orientation (planePoint), so the swept
    // solid is NOT rotated onto the profile's plane.
    geometry = buildSweepGeometry(pts, obj.rail!)
    geometry.translate(obj.offsetMm.x, obj.offsetMm.y, obj.offsetMm.z)
    geometry.computeVertexNormals()
    return { geometry }
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
  geometry.computeVertexNormals()
  return { geometry }
}

/** Meshes for the valid objects whose mode is `mode` (instanceIndex is the
 *  object's index in the FULL list, so selection maps back to it). Invalid
 *  objects are skipped here (the panel shows their error). */
function meshesForMode(objects: ModelObject[], mode: ModelMode): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    if ((obj.mode ?? 'add') !== mode) return
    const result = buildModelObjectGeometry(obj)
    if ('error' in result) return
    const mesh = new THREE.Mesh(result.geometry)
    mesh.userData.partName = 'Modeled solid'
    mesh.userData.instanceIndex = index
    meshes.push(mesh)
  })
  return meshes
}

/** Solids that become part of the ring's metal. */
export const buildModelObjects = (objects: ModelObject[]) => meshesForMode(objects, 'add')
/** Cutters: subtracted from the metal by the boolean pass. */
export const buildCutterMeshes = (objects: ModelObject[]) => meshesForMode(objects, 'subtract')

export function newModelObject(profile: ModelProfile, op: ModelOp, index: number): ModelObject {
  return {
    id: `m${Date.now().toString(36)}${index}`,
    name: `${op === 'extrude' ? 'Extrusion' : op === 'revolve' ? 'Revolution' : 'Sweep'} ${index + 1}`,
    op, profile, plane: 'front', offsetMm: { x: 0, y: 0, z: 0 }, heightMm: 3,
    // Sweeps start with a gentle example rail on the Top plane to edit.
    ...(op === 'sweep' ? { rail: { plane: 'top' as ModelPlane, closed: false, points: [{ x: -8, y: 0 }, { x: 0, y: 4 }, { x: 8, y: 0 }] } } : {}),
  }
}
