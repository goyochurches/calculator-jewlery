import * as THREE from 'three'
import type { JewelryMetalOption } from '@/types'

// ── Ring-size ↔ millimeters ──────────────────────────────────────────────────
// US ring size → inside diameter (mm). Linear approximation fit to the
// standard US sizing chart (size 3 = 14.1mm … size 13 = 22.2mm, ~0.81mm per
// full size). Good enough for a first CAD pass; verify against the shop's
// actual sizing mandrel/chart before cutting anything for production —
// real charts have small non-linear steps this formula smooths over.
export function usSizeToDiameterMm(size: number): number {
  return 11.6 + size * 0.81
}

// ── Ring band (shank) geometry ───────────────────────────────────────────────

export type BandProfile = 'flat' | 'comfort'

export interface RingBandParams {
  /** US ring size (e.g. 6.5) — drives the inner diameter. */
  fingerSize: number
  /** Band width along the finger (the dimension you'd measure with a ruler
   *  laid across the ring), in mm. */
  widthMm: number
  /** Radial wall thickness of the band, in mm. */
  thicknessMm: number
  /** 'flat' = plain rectangular cross-section, sharp edges. 'comfort' =
   *  rounded (domed) outer face, flat inner face — the classic
   *  "comfort-fit" shank profile. */
  profile: BandProfile
  /** Points sampled along the revolution (higher = smoother circle). */
  radialSegments?: number
  /** Points sampled along the comfort-fit arc (ignored for 'flat'). */
  arcSegments?: number
}

/** Closed 2D cross-section outline of the band, as (radial-distance-from-axis,
 *  axial-position) pairs — this is exactly what THREE.LatheGeometry expects
 *  as its `points` argument. Revolving a CLOSED loop 360° around Y produces
 *  a watertight torus-like solid directly, with no separate end caps needed
 *  — a ring band is topologically a torus (a tube bent into a circle), so
 *  this is the correct construction, not a shortcut. */
export function buildBandProfile(params: RingBandParams): THREE.Vector2[] {
  const { widthMm, thicknessMm, profile, arcSegments = 16 } = params
  const innerRadius = usSizeToDiameterMm(params.fingerSize) / 2
  const outerRadius = innerRadius + thicknessMm
  const halfWidth = widthMm / 2

  if (profile === 'flat') {
    // Plain rectangle, traced once around: inner-bottom → inner-top →
    // outer-top → outer-bottom → (back to start, closed by the caller).
    return [
      new THREE.Vector2(innerRadius, -halfWidth),
      new THREE.Vector2(innerRadius, halfWidth),
      new THREE.Vector2(outerRadius, halfWidth),
      new THREE.Vector2(outerRadius, -halfWidth),
    ]
  }

  // Comfort-fit: inner face stays flat (sits against the finger); the outer
  // face is a circular arc chosen to pass through the two outer corners
  // (innerRadius, ±halfWidth) — no wait, through (outerRadius, 0) at its
  // apex and meet the flat inner wall's top/bottom at (innerRadius, ±halfWidth).
  // Solve for the arc's center (cx, 0) and radius from those two constraints:
  //   (innerRadius - cx)² + halfWidth² = radius²      [passes through the sides]
  //   (outerRadius - cx)² = radius²                    [passes through the apex]
  const denom = 2 * (outerRadius - innerRadius)
  const cx = denom !== 0
    ? (outerRadius * outerRadius - innerRadius * innerRadius - halfWidth * halfWidth) / denom
    : innerRadius
  const radius = outerRadius - cx

  // Degenerate input (radius too big/small/non-finite, or the arc would dip
  // back past the inner wall) — fall back to the safe flat rectangle rather
  // than emit a self-intersecting profile.
  if (!Number.isFinite(radius) || radius <= 0 || radius < halfWidth) {
    return buildBandProfile({ ...params, profile: 'flat' })
  }

  const startAngle = Math.atan2(halfWidth, innerRadius - cx)
  const endAngle = Math.atan2(-halfWidth, innerRadius - cx)
  const points: THREE.Vector2[] = [new THREE.Vector2(innerRadius, -halfWidth)]
  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments
    const angle = endAngle + (startAngle - endAngle) * t
    points.push(new THREE.Vector2(cx + radius * Math.cos(angle), radius * Math.sin(angle)))
  }
  // points now runs bottom → apex → top; caller closes top back to bottom.
  return points
}

/** Full ring-band mesh, centered on the origin with the finger axis along Y.
 *  Material is left unset here — the viewer assigns it so swapping metal
 *  color doesn't require rebuilding geometry. */
export function buildRingBandGeometry(params: RingBandParams): THREE.BufferGeometry {
  const profile = buildBandProfile(params)
  const geometry = new THREE.LatheGeometry(profile, params.radialSegments ?? 96)
  geometry.computeVertexNormals()
  return geometry
}

// ── Center-stone head (prong basket) — round brilliant only for v1 ─────────
// Fancy shapes (oval, princess, pear, marquise, cushion...) each need their
// own prong-placement logic and are a separate future piece — see the CAD
// roadmap memory. This is intentionally the simplest real case first.

/** Round-brilliant diameter (mm) from carat weight — the standard jewelry
 *  approximation `6.5 × ∛carat` (calibrated so 1.00ct ≈ 6.5mm, the commonly
 *  cited reference point). Real stones vary a little by cut proportions
 *  (depth/table ratio) — treat this as a solid estimate, not a spec. */
export function roundDiameterMmFromCarat(carat: number): number {
  return 6.5 * Math.cbrt(Math.max(0, carat))
}

export interface StoneHeadParams {
  /** Round-brilliant diameter, in mm (see roundDiameterMmFromCarat). */
  stoneDiameterMm: number
  prongCount: 4 | 6
  /** Diameter of each prong, in mm. */
  prongDiameterMm?: number
  /** How far the prong tips reach above the gallery ring, in mm — enough to
   *  clear the stone's crown and grip it. */
  prongHeightMm?: number
  /** Height of the tapered stand connecting the gallery down to the band's
   *  outer surface, in mm. */
  standHeightMm?: number
}

/** A center-stone prong head, built in its own local space with +Y as "up"
 *  (culet down, table up) — same convention as looking at a solitaire
 *  sitting on a table. `attachHeadToBand` below reorients and positions it
 *  onto an actual band. Visual/preview-grade: this is NOT yet boolean-
 *  unioned with the band (see CAD roadmap memory) — the exported STL has
 *  separate, overlapping meshes rather than one watertight manifold, and
 *  the stone itself is a plain octahedron proxy, not faceted gem geometry. */
export function buildStoneHeadGroup(params: StoneHeadParams): THREE.Group {
  const {
    stoneDiameterMm, prongCount,
    prongDiameterMm = Math.max(0.8, stoneDiameterMm * 0.12),
    prongHeightMm = stoneDiameterMm * 0.55,
    standHeightMm = stoneDiameterMm * 0.45,
  } = params
  const stoneRadius = stoneDiameterMm / 2
  const group = new THREE.Group()

  // Gallery ring — a thin torus at the girdle line the prongs rise from and
  // the stand descends from.
  const galleryTube = Math.max(0.3, prongDiameterMm * 0.4)
  const gallery = new THREE.Mesh(new THREE.TorusGeometry(stoneRadius, galleryTube, 12, 48))
  gallery.rotation.x = Math.PI / 2 // lie flat (torus defaults to standing in XY)
  group.add(gallery)

  // Prongs — tapered cylinders standing on the gallery, circling the stone
  // just outside its girdle, tips tapering in slightly to suggest a grip.
  const prongOrbitRadius = stoneRadius + prongDiameterMm / 2
  for (let i = 0; i < prongCount; i++) {
    const angle = (i / prongCount) * Math.PI * 2
    const prong = new THREE.Mesh(
      new THREE.CylinderGeometry(prongDiameterMm * 0.35, prongDiameterMm / 2, prongHeightMm, 12),
    )
    prong.position.set(
      Math.cos(angle) * prongOrbitRadius,
      prongHeightMm / 2,
      Math.sin(angle) * prongOrbitRadius,
    )
    group.add(prong)
  }

  // Stand — truncated cone descending from the gallery to where it meets
  // the band.
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(stoneRadius * 0.75, stoneRadius * 0.5, standHeightMm, 24),
  )
  stand.position.y = -standHeightMm / 2
  group.add(stand)

  // Stone placeholder — an octahedron proxy standing in for a round
  // brilliant's silhouette until real faceted gem geometry exists.
  const stoneProxy = new THREE.Mesh(new THREE.OctahedronGeometry(stoneRadius * 0.92))
  stoneProxy.position.y = stoneRadius * 0.5
  stoneProxy.scale.y = 0.8
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

/** Reorients a head group (built "+Y up") and places it on the band's outer
 *  surface at angle 0 (the Lathe convention's +X direction — see
 *  buildBandProfile) so its "up" axis points radially outward, matching how
 *  a stone sits above the shank when worn. Mutates and returns `head`. */
export function attachHeadToBand(head: THREE.Group, band: RingBandParams): THREE.Group {
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  head.rotation.z = -Math.PI / 2
  head.position.set(outerRadius, 0, 0)
  return head
}

// ── Weight & cost estimation ─────────────────────────────────────────────────
// Volume → weight → cost, so the CAD page can show a live estimate using the
// SAME $/gram the rest of the app already prices from (config.metalPriceMap)
// — the one advantage a generic CAD tool doesn't have built in.

/** Signed volume of one triangle (as three position vectors) about the
 *  origin, via the divergence theorem — the standard way to get a closed
 *  mesh's volume without a dedicated CSG/solid-modeling library. */
function signedTetraVolume(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  return a.dot(b.clone().cross(c)) / 6
}

/** Volume of ONE closed/manifold mesh, in the geometry's own units³ (mm³
 *  here, since every dimension in this file is in mm). Every primitive this
 *  file builds (Lathe band, Torus gallery, capped Cylinder prongs/stand,
 *  Octahedron stone proxy) is individually closed, so this is exact per
 *  part. */
function meshVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position
  if (!pos) return 0
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let volume = 0
  const readTriangle = (ia: number, ib: number, ic: number) => {
    a.fromBufferAttribute(pos, ia)
    b.fromBufferAttribute(pos, ib)
    c.fromBufferAttribute(pos, ic)
    volume += signedTetraVolume(a, b, c)
  }
  if (geometry.index) {
    const idx = geometry.index
    for (let i = 0; i < idx.count; i += 3) readTriangle(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2))
  } else {
    for (let i = 0; i < pos.count; i += 3) readTriangle(i, i + 1, i + 2)
  }
  return Math.abs(volume)
}

/** Total volume (mm³) of every mesh inside an object/group, summed. Since
 *  the band and head aren't boolean-unioned yet (see the CAD roadmap
 *  memory), their small overlap at the join gets counted twice — a minor,
 *  deliberately-safe-direction overestimate rather than a gap, until real
 *  booleans land. */
export function computeVolumeMm3(object: THREE.Object3D): number {
  let total = 0
  object.updateMatrixWorld(true)
  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    // Scale factored in via the world matrix's determinant, so a scaled
    // mesh (the stone proxy squashes Y by 0.8) still reports correctly.
    const scale = new THREE.Vector3()
    obj.getWorldScale(scale)
    total += meshVolume(obj.geometry) * Math.abs(scale.x * scale.y * scale.z)
  })
  return total
}

/** Density (g/cm³) per metal — standard jewelry-industry reference values.
 *  Real alloys vary a little by manufacturer; treat this as an estimate to
 *  cross-check, not a certified figure. */
export const METAL_DENSITY_G_PER_CM3: Record<JewelryMetalOption, number> = {
  'gold-14k-white': 12.9,
  'gold-14k-yellow': 13.1,
  'gold-14k-rose': 13.4,
  'gold-18k-white': 15.4,
  'gold-18k-yellow': 15.6,
  'gold-18k-rose': 15.2,
  platinum: 21.45,
  'gold-14k': 13.1,
  'gold-18k': 15.6,
  silver: 10.3,
}

/** Grams of metal for a given volume (mm³) and density (g/cm³) — 1 cm³ =
 *  1000 mm³, so grams = volumeMm3 × density / 1000. */
export function estimateWeightGrams(volumeMm3: number, densityGPerCm3: number): number {
  return (volumeMm3 * densityGPerCm3) / 1000
}
