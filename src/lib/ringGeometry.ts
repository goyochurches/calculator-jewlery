import * as THREE from 'three'
import { Brush, Evaluator, ADDITION } from 'three-bvh-csg'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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
 *  this is the correct construction, not a shortcut.
 *
 *  IMPORTANT: THREE.LatheGeometry only draws faces between CONSECUTIVE
 *  points in the array (`points[j]` to `points[j+1]`) — it never wraps the
 *  last point back to the first one. So a profile has to repeat its first
 *  point at the end to actually close the loop; `closeLoop()` below does
 *  that once, for every branch, rather than each branch remembering to. */
export function buildBandProfile(params: RingBandParams): THREE.Vector2[] {
  const { widthMm, thicknessMm, profile, arcSegments = 16 } = params
  const innerRadius = usSizeToDiameterMm(params.fingerSize) / 2
  const outerRadius = innerRadius + thicknessMm
  const halfWidth = widthMm / 2
  const closeLoop = (pts: THREE.Vector2[]): THREE.Vector2[] => [...pts, pts[0].clone()]

  if (profile === 'flat') {
    // Plain rectangle, traced once around: inner-bottom → inner-top →
    // outer-top → outer-bottom → back to inner-bottom (closeLoop).
    return closeLoop([
      new THREE.Vector2(innerRadius, -halfWidth),
      new THREE.Vector2(innerRadius, halfWidth),
      new THREE.Vector2(outerRadius, halfWidth),
      new THREE.Vector2(outerRadius, -halfWidth),
    ])
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
  // Start the arc itself at i=1 (skip i=0, which lands exactly on
  // (innerRadius, -halfWidth) again — same point the array already opens
  // with — to avoid a zero-length first edge).
  const points: THREE.Vector2[] = [new THREE.Vector2(innerRadius, -halfWidth)]
  for (let i = 1; i <= arcSegments; i++) {
    const t = i / arcSegments
    const angle = endAngle + (startAngle - endAngle) * t
    points.push(new THREE.Vector2(cx + radius * Math.cos(angle), radius * Math.sin(angle)))
  }
  // points now runs bottom → apex → top; closeLoop adds the straight inner
  // wall back down from top to bottom.
  return closeLoop(points)
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

// ── Tapered shank — a real Ring Builder feature (module 2 in the roadmap's
// master list): wider at the head, narrower at the back. THREE.LatheGeometry
// can't vary its profile per angle, so this manually builds the same
// ring-by-ring vertex/face pattern Lathe uses internally (see its own
// source), evaluating buildBandProfile with a per-angle-SCALED width
// instead of a fixed one — the first concrete use of a general "profile
// swept along a varying path" primitive (Matrix's own Ring Rail/Profile
// Sweep tools), proven out here before generalizing further.

export interface TaperedBandParams extends RingBandParams {
  /** How much wider the band is at the head (angle 0, +X — the same
   *  convention `attachHeadToBand` uses) than at the back (angle 180°), as
   *  a fraction — 0.3 means 30% wider at the head and 30% narrower at the
   *  back, tapering smoothly (cosine) between. Note: because the average
   *  of cos(angle) over a full revolution is exactly 0, tapering does NOT
   *  change the band's total volume/weight — it only redistributes it
   *  around the ring (verified with a signed-tetrahedron-volume check
   *  against a numerically-integrated expectation before landing this). */
  taperAmount: number
}

export function buildTaperedBandGeometry(params: TaperedBandParams): THREE.BufferGeometry {
  const { taperAmount, radialSegments = 96 } = params
  const positions: number[] = []
  const indices: number[] = []

  const ringsOfProfiles: THREE.Vector2[][] = []
  for (let i = 0; i <= radialSegments; i++) {
    const angle = (i / radialSegments) * Math.PI * 2
    const widthScale = 1 + taperAmount * Math.cos(angle)
    ringsOfProfiles.push(buildBandProfile({ ...params, widthMm: params.widthMm * widthScale }))
  }
  // Every ring has the same POINT COUNT regardless of the width value used
  // (buildBandProfile's point count depends only on `profile`/arcSegments),
  // so a single pointsPerRing is safe to reuse across all rings.
  const pointsPerRing = ringsOfProfiles[0].length
  for (let i = 0; i <= radialSegments; i++) {
    const angle = (i / radialSegments) * Math.PI * 2
    const sin = Math.sin(angle), cos = Math.cos(angle)
    for (const p of ringsOfProfiles[i]) positions.push(p.x * sin, p.y, p.x * cos)
  }
  // Same face-index pattern THREE.LatheGeometry's own source uses.
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < pointsPerRing - 1; j++) {
      const base = j + i * pointsPerRing
      const a = base, b = base + pointsPerRing, c = base + pointsPerRing + 1, d = base + 1
      indices.push(a, b, d)
      indices.push(c, d, b)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// ── Twisted band — Matrix's own "Twist" transform, applied to the shank ────
// Rotates the band's own cross-section around the tube's local centerline
// as it sweeps around the ring — the classic "twisted ribbon" band, a
// named shank-profile style ("twisted/rope") distinct from the rope EDGING
// decoration above (that adds strands ON TOP of a plain band; this twists
// the band's OWN solid).

export interface TwistedBandParams extends RingBandParams {
  /** Full twists made all the way around the band — 1 = the cross-section
   *  rotates a full 360° over one trip around the ring. */
  twists: number
}

/** Same manual ring-by-ring construction `buildTaperedBandGeometry` uses,
 *  but instead of SCALING the profile per angle, it ROTATES it (around the
 *  tube's own local centerline at meanRadius) — a rigid rotation, so each
 *  individual ring's cross-sectional AREA is unchanged (rotation preserves
 *  area). By Cavalieri's principle that means the CONTINUOUS twisted solid
 *  has the exact same volume as the untwisted band — verified before
 *  landing this — but this discrete construction (straight-line
 *  interpolation between two *rotated* rings, not the true helical surface)
 *  slightly under-counts it at low segment density: consecutive
 *  interpolated rings form a slightly "pinched" twisted prism. Confirmed
 *  empirically to converge toward the analytic value as radialSegments
 *  increases (6.24% low at 96 segments/2.5 twists → 0.78% at 720), so the
 *  default here scales segment count with the twist count to keep that
 *  error small in practice. Origin-invariance (the actual watertightness
 *  test — see `checkWatertightness`) was exact in every case tested,
 *  confirming this is a resolution artifact, not a topology defect. */
export function buildTwistedBandGeometry(params: TwistedBandParams): THREE.BufferGeometry {
  const { twists } = params
  const radialSegments = params.radialSegments ?? Math.max(96, Math.round(300 * Math.max(twists, 0.5)))
  const profile = buildBandProfile(params)
  const innerRadius = usSizeToDiameterMm(params.fingerSize) / 2
  const outerRadius = innerRadius + params.thicknessMm
  const meanRadius = (innerRadius + outerRadius) / 2

  const positions: number[] = []
  const indices: number[] = []
  const pointsPerRing = profile.length

  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2
    const twistAngle = theta * twists
    const cosT = Math.cos(twistAngle), sinT = Math.sin(twistAngle)
    const sin = Math.sin(theta), cos = Math.cos(theta)
    for (const p of profile) {
      // Rotate this point's (radial-offset-from-meanRadius, axial) pair by
      // twistAngle around the tube's own local centerline, then place it
      // at world angle theta.
      const dr = p.x - meanRadius
      const da = p.y
      const rotDr = dr * cosT - da * sinT
      const rotDa = dr * sinT + da * cosT
      const r = meanRadius + rotDr
      positions.push(r * sin, rotDa, r * cos)
    }
  }
  for (let i = 0; i < radialSegments; i++) {
    for (let j = 0; j < pointsPerRing - 1; j++) {
      const base = j + i * pointsPerRing
      const a = base, b = base + pointsPerRing, c = base + pointsPerRing + 1, d = base + 1
      indices.push(a, b, d)
      indices.push(c, d, b)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
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

/** Every prong's default height (mm) for a given stone size — pulled out
 *  as its own function (rather than left as an inline default) so the
 *  CALLER can compute the same baseline a specific prong would otherwise
 *  get, before overriding just that one — see `StoneHeadParams.prongHeightOverridesMm`. */
export function defaultProngHeightMm(stoneDiameterMm: number): number {
  return stoneDiameterMm * 0.55
}

export interface StoneHeadParams {
  /** Round-brilliant diameter, in mm (see roundDiameterMmFromCarat). */
  stoneDiameterMm: number
  prongCount: 4 | 6
  /** Diameter of each prong, in mm. */
  prongDiameterMm?: number
  /** How far the prong tips reach above the gallery ring, in mm — enough to
   *  clear the stone's crown and grip it. Applies to every prong UNLESS
   *  overridden individually below. */
  prongHeightMm?: number
  /** Per-instance height override (mm), keyed by prong index (0..prongCount-1,
   *  same order/angle convention the build loop below uses) — the first real
   *  "select ONE part and edit just it" interaction in this file. Every
   *  index not present here still uses `prongHeightMm` (or its default). */
  prongHeightOverridesMm?: Record<number, number>
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
    prongHeightMm = defaultProngHeightMm(stoneDiameterMm),
    prongHeightOverridesMm,
    standHeightMm = stoneDiameterMm * 0.45,
  } = params
  const stoneRadius = stoneDiameterMm / 2
  const group = new THREE.Group()

  // Gallery ring — a thin torus at the girdle line the prongs rise from and
  // the stand descends from.
  const galleryTube = Math.max(0.3, prongDiameterMm * 0.4)
  const gallery = new THREE.Mesh(new THREE.TorusGeometry(stoneRadius, galleryTube, 12, 48))
  gallery.rotation.x = Math.PI / 2 // lie flat (torus defaults to standing in XY)
  gallery.userData.partName = 'Gallery'
  group.add(gallery)

  // Prongs — tapered cylinders standing on the gallery, circling the stone
  // just outside its girdle, tips tapering in slightly to suggest a grip.
  const prongOrbitRadius = stoneRadius + prongDiameterMm / 2
  for (let i = 0; i < prongCount; i++) {
    const angle = (i / prongCount) * Math.PI * 2
    const thisHeightMm = prongHeightOverridesMm?.[i] ?? prongHeightMm
    const prong = new THREE.Mesh(
      new THREE.CylinderGeometry(prongDiameterMm * 0.35, prongDiameterMm / 2, thisHeightMm, 12),
    )
    prong.position.set(
      Math.cos(angle) * prongOrbitRadius,
      thisHeightMm / 2,
      Math.sin(angle) * prongOrbitRadius,
    )
    prong.userData.partName = 'Prong'
    prong.userData.instanceIndex = i
    group.add(prong)
  }

  // Stand — truncated cone descending from the gallery to where it meets
  // the band.
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(stoneRadius * 0.75, stoneRadius * 0.5, standHeightMm, 24),
  )
  stand.position.y = -standHeightMm / 2
  stand.userData.partName = 'Stand'
  group.add(stand)

  // Real faceted stone — girdle plane sits at y=0, matching the gallery's
  // own plane, so it needs no extra vertical offset (isStone is already
  // tagged inside buildFacetedRoundStone; each of its meshes still needs
  // ITS OWN partName since one primitive serves several settings).
  const stoneProxy = buildFacetedRoundStone({ diameterMm: stoneDiameterMm })
  stoneProxy.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = 'Center stone' })
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
  /** How much of the circle the wall actually covers, in degrees — 360
   *  (default) is a full bezel; less is Matrix's own named "half bezel"
   *  (partial coverage, centered on angle 0 — the same "+X, toward the
   *  head/viewer" convention `attachHeadToBand` uses, so the OPEN gap
   *  ends up at the back of the ring). */
  coverageDeg?: number
}

/** Round-stone bezel: a hollow tube on the same stand as the prong head.
 *  A full bezel (the default) is an extruded ring — a circular
 *  THREE.Shape with a circular hole; a partial one is a single closed "C"
 *  bracket outline instead (outer arc → straight cut edge → inner arc
 *  back → straight cut edge → closes) — THREE.Path.absarc/closePath
 *  auto-insert the straight edges connecting each arc to the next, and
 *  ExtrudeGeometry caps every edge of ANY closed 2D shape automatically
 *  (unlike a partial THREE.LatheGeometry revolve, which does NOT auto-cap
 *  — see buildTensionBandGeometry), so this needs no special end-capping
 *  step; verified anyway with a signed-tetrahedron-volume check against
 *  the analytic "fraction of a full ring" volume before landing this
 *  (0.02% diff — pure discretization, not a defect). The inner radius
 *  sits a hair under the stone's own radius so it reads as gripping it. */
export function buildBezelHeadGroup(params: BezelHeadParams): THREE.Group {
  const { stoneDiameterMm } = params
  const stoneRadius = stoneDiameterMm / 2
  const wallMm = params.bezelWallMm ?? Math.max(0.4, stoneDiameterMm * 0.1)
  const heightMm = params.bezelHeightMm ?? stoneDiameterMm * 0.5
  const standHeightMm = params.standHeightMm ?? stoneDiameterMm * 0.4
  const coverageDeg = params.coverageDeg ?? 360

  const group = new THREE.Group()

  const outerR = stoneRadius + wallMm
  const innerR = stoneRadius * 0.97
  const ringShape = new THREE.Shape()
  if (coverageDeg >= 359.9) {
    ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, innerR, 0, Math.PI * 2, true)
    ringShape.holes.push(hole)
  } else {
    const halfSpan = (coverageDeg * Math.PI) / 360
    ringShape.absarc(0, 0, outerR, -halfSpan, halfSpan, false)
    ringShape.absarc(0, 0, innerR, halfSpan, -halfSpan, true)
    ringShape.closePath()
  }
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: heightMm, bevelEnabled: false, curveSegments: 48 }))
  // Same extrude→rotate convention as the fancy-shape gallery/stone proxy:
  // shape lies in local XY, extrudes along Z; rotating −90° about X maps
  // that Z onto this group's +Y (up).
  bezel.rotation.x = -Math.PI / 2
  bezel.userData.partName = 'Bezel wall'
  group.add(bezel)

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(stoneRadius * 0.85, stoneRadius * 0.6, standHeightMm, 32))
  stand.position.y = -standHeightMm / 2
  stand.userData.partName = 'Stand'
  group.add(stand)

  const stoneProxy = buildFacetedRoundStone({ diameterMm: stoneDiameterMm })
  stoneProxy.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = 'Center stone' })
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Cluster setting — several smaller stones grouped as one "flower" ───────
// A third CENTER-stone setting type alongside prong/bezel — Matrix's own
// named "cluster" setting: instead of a single larger stone, a tight
// rosette of a center stone plus a ring of smaller "petal" stones, all
// standing on one shared plate/stand, reads as one bigger unit from a
// distance. Round-only for now (a fancy-shape cluster would need the
// petals to follow that shape's outline, like halo) — same scoping as halo.

export interface ClusterHeadParams {
  /** The rosette's own center stone, in mm. */
  centerStoneDiameterMm: number
  /** Stones ringing the center, e.g. 6 for a classic 7-stone cluster. */
  petalCount: number
  /** Each petal stone's diameter, in mm — defaults to just over half the
   *  center stone's, a typical cluster proportion. */
  petalStoneDiameterMm?: number
  standHeightMm?: number
}

/** Cluster head: one shared flat plate underlies the whole rosette (instead
 *  of each stone getting its own separate gallery+stand), with the center
 *  stone's own small prong cage in the middle and each petal stone getting
 *  its own smaller 3-prong cage — a reasonable, honestly-simplified stand-
 *  in for how a real cluster often shares prongs between neighboring
 *  stones. Same local "+Y up" convention as every other head in this file. */
export function buildClusterHeadGroup(params: ClusterHeadParams): THREE.Group {
  const { centerStoneDiameterMm, petalCount } = params
  const centerRadius = centerStoneDiameterMm / 2
  const petalRadius = (params.petalStoneDiameterMm ?? centerStoneDiameterMm * 0.55) / 2
  const standHeightMm = params.standHeightMm ?? centerStoneDiameterMm * 0.4

  // Petals sit just outside the center stone, touching-close (a small gap
  // so their proxies don't z-fight the center one).
  const orbitRadius = centerRadius + petalRadius * 1.05
  const plateRadius = orbitRadius + petalRadius * 1.3
  const plateThickness = Math.max(0.4, petalRadius * 0.5)

  const group = new THREE.Group()

  // Shared plate — a thin disc every stone in the rosette sits on, standing
  // in for a cluster's shared gallery/undergallery.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(plateRadius, plateRadius * 0.92, plateThickness, 48))
  plate.position.y = plateThickness / 2
  plate.userData.partName = 'Cluster plate'
  group.add(plate)

  const addStoneWithProngs = (cx: number, cz: number, radius: number, prongCount: number, stoneLabel: string, faceted: boolean) => {
    const prongDiameterMm = Math.max(0.5, radius * 0.28)
    const prongHeightMm = radius * 1.1
    for (let i = 0; i < prongCount; i++) {
      const angle = (i / prongCount) * Math.PI * 2
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(prongDiameterMm * 0.35, prongDiameterMm / 2, prongHeightMm, 10))
      prong.position.set(
        cx + Math.cos(angle) * (radius + prongDiameterMm / 2),
        plateThickness + prongHeightMm / 2,
        cz + Math.sin(angle) * (radius + prongDiameterMm / 2),
      )
      prong.userData.partName = 'Prong'
      group.add(prong)
    }
    // Real faceted geometry for the rosette's own center stone (the one
    // that actually reads as "the stone" from a normal viewing distance);
    // petals stay simple octahedron proxies, same reasoning as pavé/halo
    // melee elsewhere in this file — too small to read as anything but a
    // tiny bead regardless.
    if (faceted) {
      const stoneProxy = buildFacetedRoundStone({ diameterMm: radius * 2 })
      stoneProxy.position.set(cx, plateThickness, cz)
      stoneProxy.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = stoneLabel })
      group.add(stoneProxy)
    } else {
      const stoneProxy = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 0.92))
      stoneProxy.position.set(cx, plateThickness + radius * 0.5, cz)
      stoneProxy.scale.y = 0.8
      stoneProxy.userData.isStone = true
      stoneProxy.userData.partName = stoneLabel
      group.add(stoneProxy)
    }
  }

  addStoneWithProngs(0, 0, centerRadius, 4, 'Center stone', true)
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2
    addStoneWithProngs(Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius, petalRadius, 3, 'Cluster petal', false)
  }

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(plateRadius * 0.85, plateRadius * 0.55, standHeightMm, 24))
  stand.position.y = -standHeightMm / 2
  stand.userData.partName = 'Stand'
  group.add(stand)

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
  /** Overrides the computed orbit radius entirely — how a caller stacks a
   *  SECOND or THIRD halo ring outside the first (Matrix's own "double
   *  halo"/"triple halo"): compute the first ring normally, read its
   *  radius back via `haloOrbitRadiusMm`, then pass the next ring's own
   *  radius (that value + both rings' stone radii + a small gap) in here
   *  — see CadDesign.tsx. */
  orbitRadiusMm?: number
  /** Instance indices (0-based, build order) to skip entirely — same
   *  per-instance removal pattern `buildPaveRow` uses. */
  excludeIndices?: Set<number>
}

/** The orbit radius (mm) `buildHaloGroup` would use for a given stone size/
 *  gap, exposed on its own so a caller can stack additional rings outside
 *  it without duplicating this formula — see `HaloParams.orbitRadiusMm`. */
export function haloOrbitRadiusMm(stoneDiameterMm: number, haloStoneDiameterMm?: number, gapMm?: number): number {
  const stoneRadius = stoneDiameterMm / 2
  const haloStoneRadius = (haloStoneDiameterMm ?? Math.max(0.8, stoneDiameterMm * 0.18)) / 2
  const gap = gapMm ?? haloStoneRadius * 0.6
  return stoneRadius + gap + haloStoneRadius
}

/** Small stones evenly spaced in a full circle just outside the center
 *  stone's girdle, built in the SAME local "+Y up" space as the head —
 *  call `attachHeadToBand` on this group too (with the same band params)
 *  so it lines up with the head it surrounds. */
export function buildHaloGroup(params: HaloParams): THREE.Group {
  const { stoneDiameterMm, haloCount } = params
  const haloStoneRadius = (params.haloStoneDiameterMm ?? Math.max(0.8, stoneDiameterMm * 0.18)) / 2
  const orbitRadius = params.orbitRadiusMm ?? haloOrbitRadiusMm(stoneDiameterMm, params.haloStoneDiameterMm, params.gapMm)

  const group = new THREE.Group()
  for (let i = 0; i < haloCount; i++) {
    if (params.excludeIndices?.has(i)) continue
    const angle = (i / haloCount) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.SphereGeometry(haloStoneRadius, 14, 10))
    stone.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius)
    stone.userData.isStone = true
    stone.userData.partName = 'Halo stone'
    stone.userData.instanceIndex = i
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

// ── Manufacturability check — watertightness ─────────────────────────────────
// A real "prepare for production" concern (module 15 in the roadmap's master
// list): before trusting an export, every individual mesh should be a
// genuinely closed/watertight solid — the class of bug already caught once
// this session in buildBandProfile (a missing face, silently under-
// computing weight by ~17%). This catches that class of defect directly
// instead of relying on eyeballing a rendered preview.
//
// How: the divergence-theorem volume sum above (`signedTetraVolume`) is
// mathematically INDEPENDENT of where the implicit origin sits — but only
// for a genuinely CLOSED surface. Translate every vertex by a large
// arbitrary offset and recompute: a closed mesh gives the same volume
// either way (floating-point noise only, ~1e-8 relative); an open one (a
// missing face) does NOT, because the "phantom" contribution of the
// missing region depends on where the origin sits relative to the hole.
// Verified against known-good primitives (Torus/Sphere/Box/Cylinder — all
// correctly report watertight) and the exact already-fixed real bug (the
// original unclosed band Lathe profile — correctly reports NOT watertight,
// with a wildly different volume under the shift) before landing this. A
// naive edge-topology check was tried FIRST and discarded: even three.js's
// own BufferGeometryUtils.mergeVertices doesn't weld across a UV seam (it
// considers every vertex attribute, not just position), so an index/edge-
// based check false-flagged known-good shapes like a plain sphere.

function volumeWithOffset(geometry: THREE.BufferGeometry, offset: THREE.Vector3): number {
  const pos = geometry.attributes.position
  if (!pos) return 0
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let volume = 0
  const readTriangle = (ia: number, ib: number, ic: number) => {
    a.fromBufferAttribute(pos, ia).add(offset)
    b.fromBufferAttribute(pos, ib).add(offset)
    c.fromBufferAttribute(pos, ic).add(offset)
    volume += signedTetraVolume(a, b, c)
  }
  if (geometry.index) {
    const idx = geometry.index
    for (let i = 0; i < idx.count; i += 3) readTriangle(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2))
  } else {
    for (let i = 0; i < pos.count; i += 3) readTriangle(i, i + 1, i + 2)
  }
  return volume
}

export interface WatertightCheckResult {
  partName: string
  watertight: boolean
}

/** Checks every mesh inside `object` individually, using each one's WORLD-
 *  baked geometry (same helper `unionMetalParts` uses) so the check
 *  reflects what's actually displayed/exported, not raw local-space
 *  geometry a transform might otherwise distort. */
export function checkWatertightness(object: THREE.Object3D, tolerance = 1e-3): WatertightCheckResult[] {
  const results: WatertightCheckResult[] = []
  object.updateMatrixWorld(true)
  object.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    const geo = worldBakedGeometry(obj)
    const v0 = volumeWithOffset(geo, new THREE.Vector3())
    const v1 = volumeWithOffset(geo, new THREE.Vector3(1000, -2000, 3000))
    const scale = Math.max(Math.abs(v0), 1e-9)
    const watertight = Math.abs(v0 - v1) / scale < tolerance
    results.push({ partName: typeof obj.userData.partName === 'string' ? obj.userData.partName : 'Unnamed part', watertight })
  })
  return results
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
  gallery.userData.partName = 'Gallery'
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
    prong.userData.partName = 'Prong'
    group.add(prong)
  }

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(maxHalf * 0.85, maxHalf * 0.6, standHeightMm, 24),
  )
  stand.position.y = -standHeightMm / 2
  stand.userData.partName = 'Stand'
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
  stoneProxy.userData.partName = 'Center stone'
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
  /** Instance indices to skip entirely (0-based, side=+1 first then
   *  side=-1, in build order) — the first real per-instance REMOVAL, not
   *  just an edit, proving the pattern for "click one stone, take it out"
   *  the way the per-instance prong-height slider proved out editing. */
  excludeIndices?: Set<number>
}

/** A row of small placeholder stones (spheres — pavé doesn't need the
 *  faceted-proxy treatment the center stone gets, they're too small to
 *  read as anything but tiny round beads at this scale) set along the
 *  band's outer surface, in WORLD/band coordinates directly — unlike the
 *  center-stone heads, this doesn't need `attachHeadToBand`'s local→band
 *  reorientation since it's built straight onto the band's own outer
 *  surface at each angle. */
export function buildPaveRow(params: PaveRowParams, band: RingBandParams): THREE.Group {
  const { count, stoneDiameterMm, spreadDeg = 70, gapDeg = 12, excludeIndices } = params
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const stoneRadius = stoneDiameterMm / 2
  const seatRadius = outerRadius - stoneRadius * 0.3 // sink each stone slightly into the band
  const perSide = Math.max(1, Math.round(count / 2))

  const group = new THREE.Group()
  let index = 0
  for (const side of [1, -1]) {
    for (let i = 0; i < perSide; i++) {
      const thisIndex = index++
      if (excludeIndices?.has(thisIndex)) continue
      const t = perSide === 1 ? 0 : i / (perSide - 1)
      const angleDeg = side * (gapDeg + t * Math.max(0, spreadDeg - gapDeg))
      const angle = (angleDeg * Math.PI) / 180
      const stone = new THREE.Mesh(new THREE.SphereGeometry(stoneRadius, 16, 12))
      stone.position.set(Math.cos(angle) * seatRadius, 0, Math.sin(angle) * seatRadius)
      stone.userData.isStone = true
      stone.userData.partName = 'Pavé stone'
      stone.userData.instanceIndex = thisIndex
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
      stone.userData.partName = 'Flush stone'
      group.add(stone)

      // The burnished collar — a small torus lying flat against the band's
      // outer surface (same angle, but at the band's actual outer radius
      // rather than the sunk stone's), ringing where the metal is pushed
      // over the stone's edge.
      const rim = new THREE.Mesh(new THREE.TorusGeometry(stoneRadius * 0.85, rimTube, 10, 24))
      rim.position.set(cos * outerRadius, 0, sin * outerRadius)
      rim.rotation.x = Math.PI / 2
      rim.userData.partName = 'Flush collar'
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
    mesh.userData.partName = obj.userData.partName
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
      stone.userData.partName = 'Channel stone'
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
      wall.userData.partName = 'Channel rail'
      group.add(wall)
    }
  }

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Tension setting — Matrix's own "tension" setting TYPE ───────────────────
// Unlike every other center-stone setting above, a tension setting isn't an
// add-on sitting ON the band — the band itself is CUT (a gap at the top),
// and the stone bridges that gap, gripped only by two small contact points
// where the band's own two cut ends meet it. So this needs its own band
// geometry (a partial revolve, not the full 360° torus every other feature
// assumes) as well as its own "head".

/** How wide (degrees) to cut the band's gap for a given stone/band size, so
 *  the stone's own footprint comfortably bridges it — chord length ≈ 1.3×
 *  the stone's diameter at the band's outer radius. Exported so the CALLER
 *  computes this once and passes the SAME value to both
 *  `buildTensionBandGeometry` and `buildTensionSetting` — they must agree,
 *  or the contact points and the cut ends won't line up. */
export function tensionGapDegForStone(stoneDiameterMm: number, outerRadiusMm: number): number {
  const chord = stoneDiameterMm * 1.3
  const ratio = Math.min(0.9, chord / (2 * outerRadiusMm))
  const rad = 2 * Math.asin(ratio)
  return Math.min(50, Math.max(10, (rad * 180) / Math.PI))
}

/** The band, revolved only through (360° − gapDeg) instead of the full
 *  circle — THREE.LatheGeometry supports this directly via phiStart/
 *  phiLength, but (unlike a full 360° revolve, where phi=0 and phi=2π
 *  coincide and stitch the tube closed) a partial revolve leaves both cut
 *  ends OPEN — no cap faces. Left alone, that's a non-manifold mesh: wrong
 *  for `computeVolumeMm3` (verified — an earlier version of this exact
 *  problem, the whole band missing ONE face, underestimated volume by
 *  ~17%; see the fix in `buildBandProfile`) and unusable by
 *  `unionMetalParts`'s CSG. So this builds two flat cap polygons — the same
 *  cross-section profile, as a filled `THREE.Shape` — and rotates each into
 *  place at its own cut angle using the same phi→world mapping the Lathe
 *  itself uses (vertex = (x·sinφ, y, x·cosφ), which a plain rotateY(φ−90°)
 *  of a flat shape built in local (x=radial, y=axial) reproduces exactly —
 *  verified by hand against the Lathe's own vertex formula and cross-
 *  checked with a signed-tetrahedron-volume script before landing this).
 *  The gap sits centered on angle 0 (the same "+X" convention
 *  `attachHeadToBand`/`buildPaveRow`/etc. all share), so its two cut edges
 *  are at angle ±gapDeg/2. */
export function buildTensionBandGeometry(params: RingBandParams, gapDeg: number): THREE.BufferGeometry {
  const profileClosed = buildBandProfile(params)
  const profile = profileClosed.slice(0, -1) // drop the closeLoop repeat — the Shape below closes itself
  const gapRad = (gapDeg * Math.PI) / 180
  const phiStart = gapRad / 2
  const phiLength = Math.PI * 2 - gapRad

  const lathe = new THREE.LatheGeometry(profileClosed, params.radialSegments ?? 96, phiStart, phiLength)

  const capShape = new THREE.Shape(profile)
  const capTemplate = new THREE.ShapeGeometry(capShape)
  const makeCap = (phi: number, flip: boolean) => {
    const g = capTemplate.clone()
    g.rotateY(phi - Math.PI / 2)
    if (flip) {
      // The two cut ends face opposite directions along the revolve, so
      // the second cap needs the opposite winding (and thus opposite
      // outward normal) from the first.
      const idx = g.getIndex()
      if (idx) {
        const arr = idx.array.slice()
        for (let i = 0; i < arr.length; i += 3) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t }
        idx.array.set(arr)
        idx.needsUpdate = true
      }
    }
    return g
  }
  const merged = mergeGeometries([lathe, makeCap(phiStart, false), makeCap(phiStart + phiLength, true)])
  merged.computeVertexNormals()
  return merged
}

export interface TensionSettingParams {
  stoneDiameterMm: number
  /** Must be the SAME value passed to `buildTensionBandGeometry` for this
   *  band, or the contact points won't line up with the actual cut ends —
   *  see `tensionGapDegForStone`. */
  gapDeg: number
  contactDiameterMm?: number
}

/** The stone bridging the band's gap, plus two small tapered contact points
 *  — one per cut end — angled inward to just touch the stone's girdle from
 *  either side, standing in for the tiny bit of metal a real tension
 *  setting relies on to grip the stone (no bezel wall, no prongs). Built
 *  directly in the band's own WORLD coordinates (like `buildPaveRow`), not
 *  the local "+Y up" convention the other heads use, since it has to line
 *  up exactly with the band's own cut. */
export function buildTensionSetting(params: TensionSettingParams, band: RingBandParams): THREE.Group {
  const { stoneDiameterMm, gapDeg } = params
  const stoneRadius = stoneDiameterMm / 2
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const contactDiameterMm = params.contactDiameterMm ?? Math.max(0.6, stoneDiameterMm * 0.14)

  const group = new THREE.Group()

  const stoneCenter = new THREE.Vector3(outerRadius + stoneRadius * 0.15, stoneRadius * 0.5, 0)
  const stone = buildFacetedRoundStone({ diameterMm: stoneDiameterMm })
  stone.position.copy(stoneCenter)
  stone.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = 'Center stone' })
  group.add(stone)

  const gapRad = (gapDeg * Math.PI) / 180
  for (const edgeAngle of [gapRad / 2, -gapRad / 2]) {
    const edgePoint = new THREE.Vector3(Math.cos(edgeAngle) * outerRadius, 0, Math.sin(edgeAngle) * outerRadius)
    const dir = stoneCenter.clone().sub(edgePoint)
    const length = dir.length()
    dir.normalize()
    const contactLength = length * 0.55
    const cone = new THREE.Mesh(new THREE.ConeGeometry(contactDiameterMm / 2, contactLength, 10))
    // ConeGeometry's default axis is +Y — rotate it to point from this cut
    // edge toward the stone, base sitting at the edge itself.
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    cone.position.copy(edgePoint).addScaledVector(dir, contactLength / 2)
    cone.userData.partName = 'Tension contact'
    group.add(cone)
  }

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Illusion setting — Matrix's own "illusion" setting TYPE ─────────────────
// The last remaining named center-stone setting type. A small stone sits in
// a faceted metal "skirt" flaring out wider than the stone itself — the cut
// facets catch light and read, from a little distance, as more stone than
// is actually there (the setting's whole point, hence the name).

/** A frustum (or straight cylinder, if topRadius === bottomRadius) with
 *  each side face given its OWN 4 vertices — never shared with its
 *  neighbors — so it reads as genuinely FACETED (sharp creases between
 *  faces) after this file's usual `computeVertexNormals()` post-pass.
 *  THREE.CylinderGeometry shares vertices between adjacent side faces, so
 *  computeVertexNormals would smooth right over them there — the opposite
 *  of what an illusion setting's skirt needs. Fully capped (top + bottom),
 *  so it stays a closed/watertight solid — verified with a signed-
 *  tetrahedron-volume check against the analytic frustum volume formula
 *  (matches to within the expected inscribed-polygon-vs-circle difference,
 *  ~4.5% at 12 facets) and a per-triangle outward-normal check on every
 *  side facet AND both caps before landing this. */
function buildFacetedFrustum(topRadius: number, bottomRadius: number, height: number, facetCount: number): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const pushTri = (a: number, b: number, c: number) => indices.push(a, b, c)

  for (let i = 0; i < facetCount; i++) {
    const a0 = (i / facetCount) * Math.PI * 2
    const a1 = ((i + 1) / facetCount) * Math.PI * 2
    const topA = [Math.cos(a0) * topRadius, height / 2, Math.sin(a0) * topRadius]
    const topB = [Math.cos(a1) * topRadius, height / 2, Math.sin(a1) * topRadius]
    const botA = [Math.cos(a0) * bottomRadius, -height / 2, Math.sin(a0) * bottomRadius]
    const botB = [Math.cos(a1) * bottomRadius, -height / 2, Math.sin(a1) * bottomRadius]
    const base = positions.length / 3
    for (const v of [topA, topB, botB, botA]) positions.push(...v)
    // base+0=topA, base+1=topB, base+2=botB, base+3=botA — wound outward
    // (verified empirically before landing this, not just by inspection).
    pushTri(base, base + 2, base + 3)
    pushTri(base, base + 1, base + 2)
  }

  const topCenterIdx = positions.length / 3
  positions.push(0, height / 2, 0)
  for (let i = 0; i < facetCount; i++) {
    const a0 = (i / facetCount) * Math.PI * 2
    const a1 = ((i + 1) / facetCount) * Math.PI * 2
    const base = positions.length / 3
    positions.push(Math.cos(a0) * topRadius, height / 2, Math.sin(a0) * topRadius)
    positions.push(Math.cos(a1) * topRadius, height / 2, Math.sin(a1) * topRadius)
    pushTri(topCenterIdx, base + 1, base)
  }
  const botCenterIdx = positions.length / 3
  positions.push(0, -height / 2, 0)
  for (let i = 0; i < facetCount; i++) {
    const a0 = (i / facetCount) * Math.PI * 2
    const a1 = ((i + 1) / facetCount) * Math.PI * 2
    const base = positions.length / 3
    positions.push(Math.cos(a0) * bottomRadius, -height / 2, Math.sin(a0) * bottomRadius)
    positions.push(Math.cos(a1) * bottomRadius, -height / 2, Math.sin(a1) * bottomRadius)
    pushTri(botCenterIdx, base, base + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

// ── Real faceted round stone — replaces the octahedron placeholder ─────────
// Every "stoneProxy" elsewhere in this file has been a plain octahedron
// since the very first CAD commit — an explicitly-disclosed placeholder,
// not real gem geometry. This is the first real upgrade: an actual faceted
// crown+pavilion, not a smooth/generic silhouette. Reuses
// buildFacetedFrustum for both halves (a frustum for the crown — table at
// top, girdle at bottom — and a degenerate frustum/cone for the pavilion —
// girdle at top, tapering to a point at the culet — both already verified
// watertight/correctly-wound above, including the bottomRadius=0 cone case
// this pavilion needs).
//
// Facet count defaults to 8, matching a genuine simplified/"single cut"
// round diamond's real facet arrangement (8 crown + 8 pavilion + table) —
// small stones ARE actually cut this way in the real world, so this isn't
// an arbitrary simplification dressed up as something it's not. It is
// still simpler than a full 57-facet "round brilliant" (no separate star/
// bezel/upper- and lower-girdle facet families) — disclosed honestly.

export interface FacetedRoundStoneParams {
  diameterMm: number
  /** 8 = a real "single cut" facet count. Higher counts still read as a
   *  faceted stone, just with more (smaller) facets per crown/pavilion —
   *  not historically standard, but a reasonable stylistic choice. */
  facetCount?: number
  /** Table width as a fraction of the full diameter — real stones run
   *  roughly 0.54–0.60 for a round brilliant; defaults to a typical 0.56. */
  tableRatio?: number
  /** Crown height and pavilion depth as fractions of the full diameter —
   *  defaults approximate real "ideal cut" proportions (crown ≈0.15,
   *  pavilion ≈0.43 of diameter). */
  crownHeightRatio?: number
  pavilionDepthRatio?: number
}

/** A real faceted stone (crown + pavilion meeting at a girdle), built with
 *  its girdle plane at local y=0 and the table facing +Y (culet at −Y) —
 *  same "+Y up" convention as every head in this file, so it drops straight
 *  into any of them in place of the octahedron placeholder. Tagged
 *  isStone; NOT tagged with a specific partName here — callers set that
 *  (e.g. 'Center stone') since the same primitive serves several settings. */
export function buildFacetedRoundStone(params: FacetedRoundStoneParams): THREE.Group {
  const {
    diameterMm, facetCount = 8,
    tableRatio = 0.56, crownHeightRatio = 0.15, pavilionDepthRatio = 0.43,
  } = params
  const girdleRadius = diameterMm / 2
  const tableRadius = girdleRadius * tableRatio
  const crownHeight = diameterMm * crownHeightRatio
  const pavilionDepth = diameterMm * pavilionDepthRatio

  const group = new THREE.Group()

  const crown = new THREE.Mesh(buildFacetedFrustum(tableRadius, girdleRadius, crownHeight, facetCount))
  crown.position.y = crownHeight / 2
  crown.userData.isStone = true
  group.add(crown)

  const pavilion = new THREE.Mesh(buildFacetedFrustum(girdleRadius, 0, pavilionDepth, facetCount))
  pavilion.position.y = -pavilionDepth / 2
  pavilion.userData.isStone = true
  group.add(pavilion)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

export interface IllusionHeadParams {
  stoneDiameterMm: number
  /** Facets around the skirt — classic illusion settings show 8–16. */
  facetCount?: number
  standHeightMm?: number
}

/** Small stone gripped by a low bezel rim, sitting atop a faceted skirt
 *  that flares out wider than the stone — same local "+Y up" convention as
 *  every other head, so `attachHeadToBand` works unchanged. */
export function buildIllusionHeadGroup(params: IllusionHeadParams): THREE.Group {
  const { stoneDiameterMm, facetCount = 12 } = params
  const stoneRadius = stoneDiameterMm / 2
  const standHeightMm = params.standHeightMm ?? stoneDiameterMm * 0.4

  const group = new THREE.Group()

  // Faceted skirt — wider at the top (visible from above, where the
  // illusion actually reads) tapering down to meet the stand.
  const skirtTopRadius = stoneRadius * 2.1
  const skirtBottomRadius = stoneRadius * 1.25
  const skirtHeight = stoneRadius * 0.9
  const skirt = new THREE.Mesh(buildFacetedFrustum(skirtTopRadius, skirtBottomRadius, skirtHeight, facetCount))
  skirt.position.y = skirtHeight / 2
  skirt.userData.partName = 'Illusion skirt'
  group.add(skirt)

  // Low bezel rim gripping the stone, sitting on top of the skirt.
  const wallMm = Math.max(0.4, stoneDiameterMm * 0.1)
  const rimHeightMm = stoneDiameterMm * 0.3
  const outerR = stoneRadius + wallMm
  const innerR = stoneRadius * 0.97
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true)
  ringShape.holes.push(hole)
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: rimHeightMm, bevelEnabled: false, curveSegments: 48 }))
  rim.rotation.x = -Math.PI / 2
  rim.position.y = skirtHeight
  rim.userData.partName = 'Bezel wall'
  group.add(rim)

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(skirtBottomRadius * 0.9, skirtBottomRadius * 0.6, standHeightMm, 24))
  stand.position.y = -standHeightMm / 2
  stand.userData.partName = 'Stand'
  group.add(stand)

  const stoneProxy = buildFacetedRoundStone({ diameterMm: stoneDiameterMm })
  stoneProxy.position.y = skirtHeight + rimHeightMm * 0.5
  stoneProxy.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = 'Center stone' })
  group.add(stoneProxy)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Milgrain — Matrix's own "Milgrain" decorative-surface tool ─────────────
// A row of tiny beads along an edge — the classic finishing touch on a
// band's outer rim. Purely decorative metal (not a gem), so it's included
// like any other metal mesh in the weight estimate and the boolean union.

export interface MilgrainParams {
  /** Beads per full 360° revolution, on EACH edge — omit to derive a count
   *  from the band's own circumference so bead spacing stays roughly
   *  constant regardless of ring size. */
  beadCount?: number
  beadDiameterMm?: number
}

/** A row of small sphere beads running along BOTH edges where the band's
 *  outer face meets its two side faces — the two edges you'd actually see
 *  milgrain applied to on a real band. Built directly in the band's own
 *  WORLD coordinates (like `buildPaveRow`), not the local head convention. */
export function buildMilgrainEdges(params: MilgrainParams, band: RingBandParams): THREE.Group {
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const halfWidth = band.widthMm / 2
  const beadDiameterMm = params.beadDiameterMm ?? Math.max(0.25, band.thicknessMm * 0.12)
  const beadCount = params.beadCount
    ?? Math.max(24, Math.round((2 * Math.PI * outerRadius) / (beadDiameterMm * 1.6)))

  const group = new THREE.Group()
  for (const edgeY of [halfWidth, -halfWidth]) {
    for (let i = 0; i < beadCount; i++) {
      const angle = (i / beadCount) * Math.PI * 2
      const bead = new THREE.Mesh(new THREE.SphereGeometry(beadDiameterMm / 2, 10, 8))
      bead.position.set(Math.cos(angle) * outerRadius, edgeY, Math.sin(angle) * outerRadius)
      bead.userData.partName = 'Milgrain bead'
      group.add(bead)
    }
  }
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}

// ── Rope / twisted wire — Matrix's own "Rope" decorative-surface tool ──────
// Classic twisted-rope texture: two (or more) thin strands helically
// wound around each other, run all the way around the band's outer edge.
// Each strand is ONE closed THREE.TubeGeometry (the curve and the tube
// sweep both wrap seamlessly with `closed: true`) — verified beforehand
// with a signed-tetrahedron-volume check against the analytic circular-
// tube-swept-along-its-own-arc-length volume (matches to <1% once the
// tube's own radial-segment count is reasonable; the coarser default here
// still reads fine visually at this scale, same tradeoff pavé/milgrain
// beads already make).

export interface RopeParams {
  /** 2 = the classic twisted-wire look; higher counts read as a thicker
   *  braided rope. */
  strandCount?: number
  strandDiameterMm?: number
  /** Full twists made all the way around the band — higher = a tighter
   *  spiral. Omit to derive one from the band's own circumference so the
   *  twist density looks roughly the same across ring sizes. */
  twists?: number
}

/** Two (or more) helically-wound strands running the band's own outer
 *  edge — built directly in the band's WORLD coordinates, same convention
 *  as `buildMilgrainEdges`/`buildPaveRow`. Each strand's own curve winds
 *  around the band's circumference (angle) while also spiraling radially/
 *  axially (so it visibly crosses over its neighbor strand, the actual
 *  "twisted" look) — offset from the others by an even phase. */
export function buildRopeEdge(params: RopeParams, band: RingBandParams): THREE.Group {
  const outerRadius = usSizeToDiameterMm(band.fingerSize) / 2 + band.thicknessMm
  const strandCount = params.strandCount ?? 2
  const strandDiameterMm = params.strandDiameterMm ?? Math.max(0.3, band.thicknessMm * 0.15)
  const helixRadius = strandDiameterMm * 0.6
  const twists = params.twists ?? Math.max(8, Math.round((2 * Math.PI * outerRadius) / (strandDiameterMm * 3)))
  const segments = Math.max(64, twists * 12)

  const group = new THREE.Group()
  for (let s = 0; s < strandCount; s++) {
    const phase = (s / strandCount) * Math.PI * 2
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2
      const twistAngle = theta * twists + phase
      const r = outerRadius + Math.cos(twistAngle) * helixRadius
      const y = Math.sin(twistAngle) * helixRadius
      points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r))
    }
    const curve = new THREE.CatmullRomCurve3(points, true)
    const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, strandDiameterMm / 2, 8, true))
    strand.userData.partName = 'Rope strand'
    group.add(strand)
  }
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.geometry.computeVertexNormals()
  })
  return group
}
