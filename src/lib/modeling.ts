import * as THREE from 'three'

// Rhino-style general modeling core (first slice): draw a curve on a
// construction plane, then turn it into a solid with Extrude or Revolve.
// Each ModelObject keeps its own profile + operation parameters, so it stays
// editable (drag a point, change the height) and the solid is rebuilt from
// them — same parametric approach as the rest of this page, and undoable
// through the parameter history.

export type ProfileKind = 'polyline' | 'spline' | 'rectangle' | 'circle'
export type ModelPlane = 'front' | 'top' | 'right'
export type ModelOp = 'extrude' | 'revolve'

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

/** The model group's meshes for all valid, visible objects. Invalid objects
 *  are skipped here (the panel shows their error). */
export function buildModelObjects(objects: ModelObject[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  objects.forEach((obj, index) => {
    const result = buildModelObjectGeometry(obj)
    if ('error' in result) return
    const mesh = new THREE.Mesh(result.geometry)
    mesh.userData.partName = 'Modeled solid'
    mesh.userData.instanceIndex = index
    meshes.push(mesh)
  })
  return meshes
}

export function newModelObject(profile: ModelProfile, op: ModelOp, index: number): ModelObject {
  return {
    id: `m${Date.now().toString(36)}${index}`,
    name: `${op === 'extrude' ? 'Extrusion' : 'Revolution'} ${index + 1}`,
    op, profile, plane: 'front', offsetMm: { x: 0, y: 0, z: 0 }, heightMm: 3,
  }
}
