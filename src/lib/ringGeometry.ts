import * as THREE from 'three'
import { Brush, Evaluator, ADDITION } from 'three-bvh-csg'
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
  // brilliant's silhouette until real faceted gem geometry exists. Tagged
  // isStone so weight/volume and the boolean-union step (which should only
  // ever touch metal) both know to skip it — the gem is a separate
  // physical object sitting IN the setting, not fused with the metal.
  const stoneProxy = new THREE.Mesh(new THREE.OctahedronGeometry(stoneRadius * 0.92))
  stoneProxy.position.y = stoneRadius * 0.5
  stoneProxy.scale.y = 0.8
  stoneProxy.userData.isStone = true
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Bezel setting (round) — Matrix's own "Bezel" tool ────────────────────────
// A second setting TYPE for the same round center stone, alongside the
// prong head above — a solid wall wrapping the girdle instead of individual
// claws. Same local "+Y up" convention, same `attachHeadToBand` unchanged.

export interface BezelHeadParams {
  stoneDiameterMm: number
  /** Radial thickness of the bezel wall, in mm. */
  bezelWallMm?: number
  /** How far the wall rises above the gallery plane, in mm — tall enough
   *  to clear the crown and be burnished over the stone's edge. */
  bezelHeightMm?: number
  standHeightMm?: number
}

/** Round-stone bezel: a hollow tube (an extruded ring — a circular
 *  THREE.Shape with a circular hole) instead of individual prongs, on the
 *  same stand as the prong head. The inner radius sits a hair under the
 *  stone's own radius so it reads as gripping it. */
export function buildBezelHeadGroup(params: BezelHeadParams): THREE.Group {
  const { stoneDiameterMm } = params
  const stoneRadius = stoneDiameterMm / 2
  const wallMm = params.bezelWallMm ?? Math.max(0.4, stoneDiameterMm * 0.1)
  const heightMm = params.bezelHeightMm ?? stoneDiameterMm * 0.5
  const standHeightMm = params.standHeightMm ?? stoneDiameterMm * 0.4

  const group = new THREE.Group()

  const outerR = stoneRadius + wallMm
  const innerR = stoneRadius * 0.97
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true)
  ringShape.holes.push(hole)
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: heightMm, bevelEnabled: false, curveSegments: 48 }))
  // Same extrude→rotate convention as the fancy-shape gallery/stone proxy:
  // shape lies in local XY, extrudes along Z; rotating −90° about X maps
  // that Z onto this group's +Y (up).
  bezel.rotation.x = -Math.PI / 2
  group.add(bezel)

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(stoneRadius * 0.85, stoneRadius * 0.6, standHeightMm, 32))
  stand.position.y = -standHeightMm / 2
  group.add(stand)

  const stoneProxy = new THREE.Mesh(new THREE.OctahedronGeometry(stoneRadius * 0.92))
  stoneProxy.position.y = stoneRadius * 0.5
  stoneProxy.scale.y = 0.8
  stoneProxy.userData.isStone = true
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Halo — a ring of small stones circling the center stone ─────────────────
// Round center stone only for now — a fancy-shape halo would need to follow
// that shape's own outline (scaled outward) rather than a plain circle, a
// separate future piece (tracked in the roadmap memory alongside pear and
// adjustable fancy prong count).

export interface HaloParams {
  /** The CENTER stone's own diameter, in mm — the halo rings around it. */
  stoneDiameterMm: number
  haloCount: number
  haloStoneDiameterMm?: number
  /** Gap between the center stone's edge and the halo stones, in mm. */
  gapMm?: number
}

/** Small stones evenly spaced in a full circle just outside the center
 *  stone's girdle, built in the SAME local "+Y up" space as the head —
 *  call `attachHeadToBand` on this group too (with the same band params)
 *  so it lines up with the head it surrounds. */
export function buildHaloGroup(params: HaloParams): THREE.Group {
  const { stoneDiameterMm, haloCount } = params
  const stoneRadius = stoneDiameterMm / 2
  const haloStoneRadius = (params.haloStoneDiameterMm ?? Math.max(0.8, stoneDiameterMm * 0.18)) / 2
  const gapMm = params.gapMm ?? haloStoneRadius * 0.6
  const orbitRadius = stoneRadius + gapMm + haloStoneRadius

  const group = new THREE.Group()
  for (let i = 0; i < haloCount; i++) {
    const angle = (i / haloCount) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.SphereGeometry(haloStoneRadius, 14, 10))
    stone.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius)
    stone.userData.isStone = true
    group.add(stone)
  }
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
export function computeVolumeMm3(object: THREE.Object3D, opts: { includeStones?: boolean } = {}): number {
  let total = 0
  object.updateMatrixWorld(true)
  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    // Gems aren't metal — skip them by default so a metal-weight estimate
    // doesn't apply metal density to the volume a stone occupies.
    if (obj.userData.isStone && !opts.includeStones) return
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

// ── Fancy-shape heads ─────────────────────────────────────────────────────────
// Round is handled by buildStoneHeadGroup above (kept as-is, unchanged).
// These four cover the next most common center-stone shapes; pear is
// deferred (its asymmetric outline needs more careful curve-fitting than
// the exact constructions below) — see the CAD roadmap memory.

export type FancyStoneShape = 'oval' | 'cushion' | 'princess' | 'marquise' | 'pear'

/** Closed footprint outline (as seen from above) for one fancy shape, in
 *  local (u, v) = (width-axis, length-axis) mm, centered on the origin.
 *  Oval/cushion/princess/marquise are symmetric about both axes, so the
 *  extrude→rotate step in `buildFancyStoneHeadGroup` can't mirror them
 *  into anything different. Pear is only symmetric about u (width) —
 *  by convention its point sits at +v, which after that same
 *  extrude→rotate step ends up facing a fixed direction relative to the
 *  band; purely a cosmetic pick (which way the pear points), not a
 *  correctness concern. */
function buildStoneOutline(shape: FancyStoneShape, halfW: number, halfL: number, segments = 64): THREE.Vector2[] {
  switch (shape) {
    case 'oval': {
      const pts: THREE.Vector2[] = []
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2
        pts.push(new THREE.Vector2(halfW * Math.cos(a), halfL * Math.sin(a)))
      }
      return pts
    }
    case 'princess':
      return [
        new THREE.Vector2(halfW, halfL), new THREE.Vector2(-halfW, halfL),
        new THREE.Vector2(-halfW, -halfL), new THREE.Vector2(halfW, -halfL),
      ]
    case 'cushion': {
      // Rounded rectangle: a quarter-circle fillet at each corner, radius
      // scaled to the shorter side so a long/narrow cushion doesn't get an
      // oversized fillet.
      const r = Math.min(halfW, halfL) * 0.55
      const segsPerCorner = 10
      const corners = [
        { cx: halfW - r, cy: halfL - r, start: 0 },
        { cx: -halfW + r, cy: halfL - r, start: 90 },
        { cx: -halfW + r, cy: -halfL + r, start: 180 },
        { cx: halfW - r, cy: -halfL + r, start: 270 },
      ]
      const pts: THREE.Vector2[] = []
      for (const corner of corners) {
        for (let i = 0; i <= segsPerCorner; i++) {
          const a = (corner.start + (i / segsPerCorner) * 90) * (Math.PI / 180)
          pts.push(new THREE.Vector2(corner.cx + r * Math.cos(a), corner.cy + r * Math.sin(a)))
        }
      }
      return pts
    }
    case 'marquise': {
      // Exact "vesica" construction: two equal circles, centers offset
      // along the width axis by ±c, radius R — their intersection is a
      // lens with sharp points on the length axis at ±halfL and its widest
      // extent on the width axis at ±halfW. Solve c, R from halfW/halfL:
      //   halfW = R − c,  halfL = √(R² − c²)  ⇒  c = (halfL² − halfW²) / (2·halfW)
      const c = (halfL * halfL - halfW * halfW) / (2 * halfW)
      const R = halfW + c
      const half = Math.max(1, Math.round(segments / 2))
      const pts: THREE.Vector2[] = []
      // Right boundary: arc of the circle centered at (−c, 0), bulging
      // toward +u, from the top tip (0, halfL) to the bottom tip (0, −halfL).
      // thetaTop is (0, halfL)'s angle around that center: cos = c/R, sin = halfL/R.
      const thetaTop = Math.atan2(halfL, c)
      for (let i = 0; i <= half; i++) {
        const t = thetaTop - (2 * thetaTop) * (i / half)
        pts.push(new THREE.Vector2(-c + R * Math.cos(t), R * Math.sin(t)))
      }
      // Left boundary: mirror arc, circle centered at (+c, 0), bottom tip
      // back up to the top tip, closing the loop.
      for (let i = 0; i <= half; i++) {
        const t = Math.PI + thetaTop - (2 * thetaTop) * (i / half)
        pts.push(new THREE.Vector2(c + R * Math.cos(t), R * Math.sin(t)))
      }
      return pts
    }
    case 'pear': {
      // Rounded belly (a semicircle of radius halfW) smoothly blended
      // (matching tangent, not just matching position — no kink) into two
      // side arcs converging on a single sharp point at the top.
      //
      // Semicircle: center (0, v0), radius r = halfW, where v0 = −halfL + r
      // so its bottom-most point lands exactly at −halfL. It spans from
      // (r, v0) round through (0, −halfL) to (−r, v0) — tangent is VERTICAL
      // at both those ends (radius is horizontal there).
      //
      // Side arc (right half): must pass through (r, v0) with that same
      // vertical tangent (so it has to be centered on the line y = v0),
      // and through the tip (0, halfL). Center (cx, v0), radius R2:
      //   R2 = r − cx  (passes through (r, v0))
      //   R2² = cx² + h²,  h = halfL − v0  (passes through the tip)
      //   ⇒ cx = (r² − h²) / (2r)
      const r = halfW
      const v0 = -halfL + r
      const h = halfL - v0
      const cx = (r * r - h * h) / (2 * r)
      const R2 = r - cx
      const phiTip = Math.atan2(h, -cx) // tip's angle around (cx, v0)

      const belly = Math.max(1, Math.round(segments * 0.4))
      const side = Math.max(1, Math.round(segments * 0.3))
      const pts: THREE.Vector2[] = []
      // Belly: from (r, v0) [angle 0] down through the bottom to (−r, v0)
      // [angle −π], relative to the semicircle's own center (0, v0).
      for (let i = 0; i <= belly; i++) {
        const t = -Math.PI * (i / belly)
        pts.push(new THREE.Vector2(r * Math.cos(t), v0 + r * Math.sin(t)))
      }
      // Left side arc: mirror of the right one (negate u for the same t),
      // from (−r, v0) up to the tip.
      for (let i = 1; i <= side; i++) {
        const t = phiTip * (i / side)
        pts.push(new THREE.Vector2(-(cx + R2 * Math.cos(t)), v0 + R2 * Math.sin(t)))
      }
      // Right side arc: tip back down to (r, v0), closing the loop.
      for (let i = 1; i < side; i++) {
        const t = phiTip * (1 - i / side)
        pts.push(new THREE.Vector2(cx + R2 * Math.cos(t), v0 + R2 * Math.sin(t)))
      }
      return pts
    }
  }
}

/** Where to seat prongs for each fancy shape — hand-picked safe points
 *  (corners inset slightly so a prong sits on solid material rather than
 *  hanging off a sharp point; oval at the "shoulders"; marquise at the two
 *  side bulges plus just short of the two tips). 4 prongs for all four —
 *  a reasonable default; larger stones often want 6, a future refinement. */
/** A prong seat point plus whether it sits AT a sharp outline point (a
 *  marquise/pear tip) — those get a V-tip wedge prong instead of a plain
 *  round taper, since a round prong tip doesn't protect a sharp corner as
 *  well. Every other shape/point is `isTip: false`. */
interface ProngSeat { point: THREE.Vector2; isTip: boolean }

function fancyProngPoints(shape: FancyStoneShape, halfW: number, halfL: number, count: 4 | 6 = 4): ProngSeat[] {
  switch (shape) {
    case 'oval': {
      // Evenly spaced by angle works cleanly for either count — no
      // shape-specific landmark points needed, and oval has no sharp tips.
      const seats: ProngSeat[] = []
      for (let i = 0; i < count; i++) {
        const a = ((2 * i + 1) / count) * Math.PI
        seats.push({ point: new THREE.Vector2(halfW * Math.cos(a), halfL * Math.sin(a)), isTip: false })
      }
      return seats
    }
    case 'princess':
    case 'cushion': {
      const inset = 0.82
      const corners: ProngSeat[] = ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const)
        .map(([sx, sy]) => ({ point: new THREE.Vector2(sx * halfW * inset, sy * halfL * inset), isTip: shape === 'princess' }))
      if (count === 4) return corners
      // 6: the 4 corners plus the midpoints of the length-axis edges —
      // where a bigger stone's extra pair of prongs typically goes.
      return [
        ...corners,
        { point: new THREE.Vector2(0, halfL * inset), isTip: false },
        { point: new THREE.Vector2(0, -halfL * inset), isTip: false },
      ]
    }
    case 'marquise': {
      const tipInset = 0.85
      const tips: ProngSeat[] = [
        { point: new THREE.Vector2(0, halfL * tipInset), isTip: true },
        { point: new THREE.Vector2(0, -halfL * tipInset), isTip: true },
      ]
      if (count === 4) {
        return [
          { point: new THREE.Vector2(halfW, 0), isTip: false },
          { point: new THREE.Vector2(-halfW, 0), isTip: false },
          ...tips,
        ]
      }
      // 6: tips + two points per side, each halfway (by the vesica arc's
      // own angle) between a tip and the side bulge — same circle-through-
      // 3-points construction buildStoneOutline uses for the outline itself.
      const c = (halfL * halfL - halfW * halfW) / (2 * halfW)
      const R = halfW + c
      const thetaTop = Math.atan2(halfL, c)
      const mid = thetaTop / 2
      const rightPts = [mid, -mid].map(t => new THREE.Vector2(-c + R * Math.cos(t), R * Math.sin(t)))
      const leftPts = [Math.PI - mid, Math.PI + mid].map(t => new THREE.Vector2(c + R * Math.cos(t), R * Math.sin(t)))
      return [...tips, ...[...rightPts, ...leftPts].map(point => ({ point, isTip: false }))]
    }
    case 'pear': {
      // Same landmark geometry as buildStoneOutline's pear case — the
      // point (V-tip), the belly's bottom-most point, and shoulder points
      // sampled along the same side-arc formula at a couple of heights.
      const r = halfW
      const v0 = -halfL + r
      const h = halfL - v0
      const cx = (r * r - h * h) / (2 * r)
      const R2 = r - cx
      const phiTip = Math.atan2(h, -cx)
      const shoulder = (f: number, mirror: 1 | -1): THREE.Vector2 => {
        const t = phiTip * f
        return new THREE.Vector2(mirror * (cx + R2 * Math.cos(t)), v0 + R2 * Math.sin(t))
      }
      const tip: ProngSeat = { point: new THREE.Vector2(0, halfL), isTip: true }
      const bottom: ProngSeat = { point: new THREE.Vector2(0, -halfL), isTip: false }
      if (count === 4) {
        return [
          tip,
          { point: shoulder(0.55, 1), isTip: false },
          { point: shoulder(0.55, -1), isTip: false },
          bottom,
        ]
      }
      return [
        tip,
        { point: shoulder(0.75, 1), isTip: false },
        { point: shoulder(0.75, -1), isTip: false },
        { point: shoulder(0.35, 1), isTip: false },
        { point: shoulder(0.35, -1), isTip: false },
        bottom,
      ]
    }
  }
}

export interface FancyStoneHeadParams {
  shape: FancyStoneShape
  /** Stone footprint, in mm — the two numbers you'd see quoted as e.g.
   *  "8×6mm oval". */
  lengthMm: number
  widthMm: number
  prongCount?: 4 | 6
  prongDiameterMm?: number
  prongHeightMm?: number
  standHeightMm?: number
}

/** Fancy-shape counterpart to buildStoneHeadGroup — same local convention
 *  (+Y up, culet down) and the same visual-preview caveats: the stone is an
 *  extruded/beveled proxy (not faceted gem geometry) and nothing here is
 *  boolean-unioned with the band yet. `attachHeadToBand` works for this
 *  group unchanged, since it only cares about the group's own local +Y. */
export function buildFancyStoneHeadGroup(params: FancyStoneHeadParams): THREE.Group {
  const { shape, lengthMm, widthMm } = params
  const halfW = widthMm / 2
  const halfL = lengthMm / 2
  const maxHalf = Math.max(halfW, halfL)
  const prongDiameterMm = params.prongDiameterMm ?? Math.max(0.8, Math.min(widthMm, lengthMm) * 0.12)
  const prongHeightMm = params.prongHeightMm ?? maxHalf * 1.0
  const standHeightMm = params.standHeightMm ?? maxHalf * 0.8

  const group = new THREE.Group()
  const outline = buildStoneOutline(shape, halfW, halfL)

  // ExtrudeGeometry builds its shape in local XY and extrudes along local
  // Z; rotating −90° about X maps that Z (depth) onto this group's +Y (up)
  // — the same "footprint flat, height vertical" convention every other
  // mesh in this file uses. Since every shape above is symmetric about
  // both axes, the accompanying axis mirror from that rotation changes
  // nothing visually.
  const galleryDepth = Math.max(0.3, prongDiameterMm * 0.4)
  const galleryShape = new THREE.Shape(outline.map(p => p.clone().multiplyScalar(1.08)))
  const gallery = new THREE.Mesh(new THREE.ExtrudeGeometry(galleryShape, { depth: galleryDepth, bevelEnabled: false }))
  gallery.rotation.x = -Math.PI / 2
  gallery.position.y = -galleryDepth / 2
  group.add(gallery)

  const prongSeats = fancyProngPoints(shape, halfW, halfL, params.prongCount ?? 4)
  for (const seat of prongSeats) {
    // V-tip: a 3-sided wedge (ConeGeometry with 3 radial segments) instead
    // of a round taper — better protects a sharp outline point (a
    // princess corner or a marquise tip) than a round prong tip would.
    const prong = new THREE.Mesh(
      seat.isTip
        ? new THREE.ConeGeometry(prongDiameterMm * 0.55, prongHeightMm, 3)
        : new THREE.CylinderGeometry(prongDiameterMm * 0.35, prongDiameterMm / 2, prongHeightMm, 12),
    )
    prong.position.set(seat.point.x, prongHeightMm / 2, seat.point.y)
    group.add(prong)
  }

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(maxHalf * 0.85, maxHalf * 0.6, standHeightMm, 24),
  )
  stand.position.y = -standHeightMm / 2
  group.add(stand)

  // Stone placeholder — the footprint outline extruded with a bevel to
  // fake a crown/pavilion taper, standing in for real faceted geometry.
  const stoneDepth = maxHalf * 0.9
  const stoneShape2D = new THREE.Shape(outline)
  const bevelSize = Math.min(halfW, halfL) * 0.35
  const stoneProxy = new THREE.Mesh(new THREE.ExtrudeGeometry(stoneShape2D, {
    depth: stoneDepth * 0.5, bevelEnabled: true,
    bevelThickness: stoneDepth * 0.5, bevelSize, bevelSegments: 6,
  }))
  stoneProxy.rotation.x = -Math.PI / 2
  stoneProxy.position.y = 0
  stoneProxy.userData.isStone = true
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Pavé side stones ──────────────────────────────────────────────────────────
// Maps to MatrixGold's "Gems on Ring Rail" / "Gems on Curve" tools — a row
// of small stones set along the shank, split evenly on both sides of the
// head so it doesn't collide with the stand. Uses the SIDE/MELEE role data
// already modeled in the quote/stock builders conceptually (a future step
// can pull real melee sizes from useQuoteConfig instead of a flat input).

export interface PaveRowParams {
  /** Total stone count, split evenly across both sides of the head. */
  count: number
  stoneDiameterMm: number
  /** How far the row reaches around the band from the head, in degrees
   *  (0° = at the head, 180° = the far side / back of the ring). */
  spreadDeg?: number
  /** Angular gap left empty right next to the head's stand, in degrees,
   *  so pavé stones don't overlap it. */
  gapDeg?: number
}

/** A row of small placeholder stones (spheres — pavé doesn't need the
 *  faceted-proxy treatment the center stone gets, they're too small to
 *  read as anything but tiny round beads at this scale) set along the
 *  band's outer surface, in WORLD/band coordinates directly — unlike the
 *  center-stone heads, this doesn't need `attachHeadToBand`'s local→band
 *  reorientation since it's built straight onto the band's own outer
 *  surface at each angle. */
export function buildPaveRow(params: PaveRowParams, band: RingBandParams): THREE.Group {
  const { count, stoneDiameterMm, spreadDeg = 70, gapDeg = 12 } = params
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const stoneRadius = stoneDiameterMm / 2
  const seatRadius = outerRadius - stoneRadius * 0.3 // sink each stone slightly into the band
  const perSide = Math.max(1, Math.round(count / 2))

  const group = new THREE.Group()
  for (const side of [1, -1]) {
    for (let i = 0; i < perSide; i++) {
      const t = perSide === 1 ? 0 : i / (perSide - 1)
      const angleDeg = side * (gapDeg + t * Math.max(0, spreadDeg - gapDeg))
      const angle = (angleDeg * Math.PI) / 180
      const stone = new THREE.Mesh(new THREE.SphereGeometry(stoneRadius, 16, 12))
      stone.position.set(Math.cos(angle) * seatRadius, 0, Math.sin(angle) * seatRadius)
      stone.userData.isStone = true
      group.add(stone)
    }
  }
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Flush (gypsy) setting ────────────────────────────────────────────────────
// Matrix's "flush"/"gypsy" setting — a third alternative to pavé/channel for
// side stones: each stone is set directly INTO the metal (sunk well below
// the band's outer surface, not resting on top like pavé or sitting between
// rails like channel), with a small burnished collar of metal folded over
// its girdle to hold it in place. Same "split evenly on both sides of the
// head, with a gap" layout convention as pavé/channel above, so it's a
// drop-in third option in the UI.

export interface FlushSettingParams {
  count: number
  stoneDiameterMm: number
  spreadDeg?: number
  gapDeg?: number
}

/** A row of stones sunk into the band's outer surface, each ringed by a
 *  thin torus "collar" sitting flush at the band's own surface — the
 *  defining visual signature of a flush/gypsy setting (no prongs, no
 *  rails, just metal burnished over the stone's edge). */
export function buildFlushSetting(params: FlushSettingParams, band: RingBandParams): THREE.Group {
  const { count, stoneDiameterMm, spreadDeg = 70, gapDeg = 12 } = params
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const stoneRadius = stoneDiameterMm / 2
  // Sunk much deeper than pavé's shallow sink (0.3×) or channel's near-flush
  // seating (0.1×) — only the crown/table sits near the band's own surface.
  const seatRadius = outerRadius - stoneRadius * 0.75
  const rimTube = Math.max(0.25, stoneRadius * 0.18)
  const perSide = Math.max(1, Math.round(count / 2))

  const group = new THREE.Group()
  for (const side of [1, -1]) {
    for (let i = 0; i < perSide; i++) {
      const t = perSide === 1 ? 0 : i / (perSide - 1)
      const angleDeg = side * (gapDeg + t * Math.max(0, spreadDeg - gapDeg))
      const angle = (angleDeg * Math.PI) / 180
      const cos = Math.cos(angle), sin = Math.sin(angle)

      const stone = new THREE.Mesh(new THREE.SphereGeometry(stoneRadius, 16, 12))
      stone.position.set(cos * seatRadius, 0, sin * seatRadius)
      stone.userData.isStone = true
      group.add(stone)

      // The burnished collar — a small torus lying flat against the band's
      // outer surface (same angle, but at the band's actual outer radius
      // rather than the sunk stone's), ringing where the metal is pushed
      // over the stone's edge.
      const rim = new THREE.Mesh(new THREE.TorusGeometry(stoneRadius * 0.85, rimTube, 10, 24))
      rim.position.set(cos * outerRadius, 0, sin * outerRadius)
      rim.rotation.x = Math.PI / 2
      group.add(rim)
    }
  }
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Boolean union — MatrixGold's own "Parametric Boolean" tool ──────────────
// Everything above builds separate, overlapping meshes (a real preview
// limitation flagged throughout the CAD roadmap memory). This is the actual
// fix: fold every METAL mesh (band + gallery + prongs + stand — never the
// gem proxies, which are separate physical objects, not part of the metal)
// into one true watertight solid via three-bvh-csg, the same operation
// Matrix itself exposes as a named tool rather than something automatic.

/** Clones `mesh.geometry` with its current world transform baked in, so the
 *  result can be combined with other meshes regardless of how deep they
 *  each sit in their own local group hierarchy (the head's local "+Y up"
 *  space vs. the band's, for instance). */
function worldBakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const g = mesh.geometry.clone()
  g.applyMatrix4(mesh.matrixWorld)
  return g
}

/** Unions every non-stone mesh inside `object` into one manifold geometry.
 *  Returns null if there's nothing to union. Can throw on a genuinely
 *  degenerate input (e.g. a self-intersecting profile) — callers should
 *  treat this as a beta operation and catch accordingly, per the roadmap. */
export function unionMetalParts(object: THREE.Object3D): THREE.BufferGeometry | null {
  object.updateMatrixWorld(true)
  const metalMeshes: THREE.Mesh[] = []
  object.traverse(obj => {
    if (obj instanceof THREE.Mesh && !obj.userData.isStone) metalMeshes.push(obj)
  })
  if (metalMeshes.length === 0) return null

  const evaluator = new Evaluator()
  let acc = new Brush(worldBakedGeometry(metalMeshes[0]))
  acc.updateMatrixWorld(true)
  for (let i = 1; i < metalMeshes.length; i++) {
    const next = new Brush(worldBakedGeometry(metalMeshes[i]))
    next.updateMatrixWorld(true)
    acc = evaluator.evaluate(acc, next, ADDITION)
  }
  return acc.geometry
}

/** Every gem (center stone + pavé), as standalone world-baked meshes at
 *  identity transform — the boolean-union counterpart to
 *  `unionMetalParts`, kept separate since gems are never unioned into the
 *  metal. Pass both into one Group to redisplay/re-export the merged
 *  result. */
export function extractStoneMeshes(object: THREE.Object3D): THREE.Mesh[] {
  object.updateMatrixWorld(true)
  const stones: THREE.Mesh[] = []
  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) || !obj.userData.isStone) return
    const mesh = new THREE.Mesh(worldBakedGeometry(obj))
    mesh.userData.isStone = true
    stones.push(mesh)
  })
  return stones
}

// ── Channel setting ───────────────────────────────────────────────────────────
// Alternative to pavé for side stones — the stones sit flush between two
// raised metal rails running along the shank, instead of resting on top
// held by beads. Same "split evenly on both sides of the head, with a gap"
// layout as buildPaveRow, reusing the same angular convention.

export interface ChannelSettingParams {
  count: number
  stoneDiameterMm: number
  spreadDeg?: number
  gapDeg?: number
  wallHeightMm?: number
  wallThicknessMm?: number
}

/** Points along a circular arc (radius `r`, at axial height `y`) from
 *  `fromDeg` to `toDeg`, in the same (angle 0 = +X, +angle → +Z)
 *  convention every other angular placement in this file uses. */
function arcPoints3(r: number, y: number, fromDeg: number, toDeg: number, segments = 24): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const deg = fromDeg + (toDeg - fromDeg) * (i / segments)
    const rad = (deg * Math.PI) / 180
    pts.push(new THREE.Vector3(Math.cos(rad) * r, y, Math.sin(rad) * r))
  }
  return pts
}

/** A row of stones (spheres, same as pavé) sitting flush at the band's
 *  outer radius, flanked on both sides (along the band's WIDTH axis, not
 *  radially) by two raised rail walls — each wall a `THREE.TubeGeometry`
 *  swept along the arc it covers, built from sampled points rather than
 *  TorusGeometry's own arc/rotation parameters (easier to reason about
 *  correctly against this file's existing angle convention). */
export function buildChannelSetting(params: ChannelSettingParams, band: RingBandParams): THREE.Group {
  const { count, stoneDiameterMm, spreadDeg = 70, gapDeg = 12 } = params
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const stoneRadius = stoneDiameterMm / 2
  const wallHeightMm = params.wallHeightMm ?? stoneRadius * 0.8
  const wallThicknessMm = params.wallThicknessMm ?? Math.max(0.4, stoneRadius * 0.3)
  const seatRadius = outerRadius - stoneRadius * 0.1 // sit almost flush, minimal sinking
  const perSide = Math.max(1, Math.round(count / 2))

  const group = new THREE.Group()

  for (const side of [1, -1]) {
    for (let i = 0; i < perSide; i++) {
      const t = perSide === 1 ? 0 : i / (perSide - 1)
      const deg = side * (gapDeg + t * Math.max(0, spreadDeg - gapDeg))
      const rad = (deg * Math.PI) / 180
      const stone = new THREE.Mesh(new THREE.SphereGeometry(stoneRadius, 16, 12))
      stone.position.set(Math.cos(rad) * seatRadius, wallHeightMm * 0.3, Math.sin(rad) * seatRadius)
      stone.userData.isStone = true
      group.add(stone)
    }
  }

  // Two wall arcs (one per side of the head) × two rails each (flanking
  // the stones along the width axis).
  for (const side of [1, -1]) {
    const fromDeg = side === 1 ? gapDeg : -spreadDeg
    const toDeg = side === 1 ? spreadDeg : -gapDeg
    for (const railSide of [1, -1]) {
      const yOffset = railSide * (stoneRadius + wallThicknessMm / 2)
      const curve = new THREE.CatmullRomCurve3(arcPoints3(seatRadius, yOffset, fromDeg, toDeg))
      const wall = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, wallThicknessMm / 2, 8, false))
      group.add(wall)
    }
  }

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}
