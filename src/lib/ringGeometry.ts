import * as THREE from 'three'

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
