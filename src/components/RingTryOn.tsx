import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { Camera, Download, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * Hex color + metallic-ness for each metal key. The shader uses these to
 * approximate the look of the chosen alloy. Falls back to neutral yellow
 * gold when the key isn't recognised (e.g. legacy quotes).
 */
const METAL_LOOK: Record<string, { color: string; metalness: number; roughness: number }> = {
  'gold-14k-white':  { color: '#e8eaec', metalness: 1.0, roughness: 0.18 },
  'gold-14k-yellow': { color: '#dcb74a', metalness: 1.0, roughness: 0.20 },
  'gold-14k-rose':   { color: '#d8a48f', metalness: 1.0, roughness: 0.22 },
  'gold-18k-white':  { color: '#ecedee', metalness: 1.0, roughness: 0.14 },
  'gold-18k-yellow': { color: '#e9c33a', metalness: 1.0, roughness: 0.17 },
  'gold-18k-rose':   { color: '#e2a48f', metalness: 1.0, roughness: 0.20 },
  platinum:          { color: '#f0f1f3', metalness: 1.0, roughness: 0.10 },
  'gold-14k':        { color: '#dcb74a', metalness: 1.0, roughness: 0.20 },
  'gold-18k':        { color: '#e9c33a', metalness: 1.0, roughness: 0.17 },
  silver:            { color: '#dadbdd', metalness: 1.0, roughness: 0.16 },
}

export interface RingTryOnProps {
  metal: string
  ringWidthMm: number
  /** Approximate carats of the centre stone (drives the rendered gem size). */
  stoneCarats?: number | null
  onClose: () => void
}

/**
 * Browser-based AR ring try-on. Uses the device camera + MediaPipe Hands
 * to detect the ring finger and overlays a procedural 3D ring on top of
 * it. Everything runs client-side — no server roundtrip per frame.
 *
 * Tracking strategy: we anchor the ring to the **PIP joint of the ring
 * finger** (landmark 14) and size it from the distance between the
 * adjacent MCP and DIP joints (13 and 15). This makes the ring grow with
 * perspective as the hand approaches the camera. Rotation comes from the
 * vector between 13 and 14 so the ring tilts with the finger.
 */
export default function RingTryOn({ metal, ringWidthMm, stoneCarats, onClose }: RingTryOnProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef<number | null>(null)

  const [status, setStatus] = useState<'init' | 'loading-model' | 'requesting-camera' | 'ready' | 'no-hand' | 'tracking' | 'error'>('init')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)

  // Pose state shared with the Three.js scene. We mutate a ref instead of
  // setState so 30fps tracking updates don't spam React renders.
  const poseRef = useRef({
    visible: false,
    /** Normalised [0,1] position on the video frame (origin top-left). */
    x: 0.5,
    y: 0.5,
    /** Apparent ring diameter in normalised video-width units. */
    scale: 0.1,
    /** Tilt angle (radians) of the finger axis. */
    angle: 0,
  })

  // ── Boot: load MediaPipe model + open the camera ──────────────────────
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setStatus('loading-model')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        )
        if (cancelled) return
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) { landmarker.close(); return }
        landmarkerRef.current = landmarker

        setStatus('requesting-camera')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        setStatus('no-hand')
        loop()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unable to start the AR experience'
        setErrorMsg(msg)
        setStatus('error')
      }
    })()

    function loop() {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      const ts = performance.now()
      let result: HandLandmarkerResult | null = null
      try {
        result = landmarker.detectForVideo(video, ts)
      } catch {
        // Detection occasionally throws on the very first frames before the
        // video has dimensions. Skip and try again next tick.
      }
      const hand = result?.landmarks?.[0]
      if (hand && hand.length >= 17) {
        // 13 = ring-finger MCP, 14 = PIP, 15 = DIP.
        const mcp = hand[13]
        const pip = hand[14]
        const dip = hand[15]
        // Centre of the ring sits between MCP and PIP — that's the band
        // section of the finger.
        const cx = (mcp.x + pip.x) / 2
        const cy = (mcp.y + pip.y) / 2
        const dx = pip.x - mcp.x
        const dy = pip.y - mcp.y
        const phalanxLen = Math.hypot(dx, dy)
        // Phalanx length is a decent proxy for finger size in the image;
        // ring diameter ≈ 0.6 of phalanx length is empirically reasonable.
        const scale = phalanxLen * 0.6
        const angle = Math.atan2(dy, dx)

        // Light low-pass filter so the ring doesn't jitter.
        const p = poseRef.current
        const a = 0.55
        p.x       = p.visible ? p.x * a + cx * (1 - a) : cx
        p.y       = p.visible ? p.y * a + cy * (1 - a) : cy
        p.scale   = p.visible ? p.scale * a + scale * (1 - a) : scale
        // Angle interpolation needs unwrap to avoid jumping at ±π.
        const da = ((angle - p.angle + Math.PI) % (2 * Math.PI)) - Math.PI
        p.angle   = p.visible ? p.angle + da * (1 - a) : angle
        p.visible = true

        // dip is used as a sanity check — if the finger is fully folded
        // (DIP very close to MCP) we hide the ring to avoid weird overlays.
        const fingerLen = Math.hypot(dip.x - mcp.x, dip.y - mcp.y)
        if (fingerLen < 0.02) p.visible = false

        setStatus(prev => prev === 'tracking' ? prev : 'tracking')
      } else {
        poseRef.current.visible = false
        setStatus(prev => (prev === 'no-hand' || prev === 'error') ? prev : 'no-hand')
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const video = videoRef.current
      const stream = video?.srcObject as MediaStream | null
      stream?.getTracks().forEach(t => t.stop())
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  // ── Capture: rasterise <video> + <canvas> into a single PNG ───────────
  const handleCapture = () => {
    const video = videoRef.current
    const overlay = overlayRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    if (!video || !overlay) return
    const w = video.videoWidth, h = video.videoHeight
    if (!w || !h) return
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    const ctx = out.getContext('2d')!
    ctx.drawImage(video, 0, 0, w, h)
    ctx.drawImage(overlay, 0, 0, w, h)
    setSnapshot(out.toDataURL('image/png'))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Camera + overlay */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div ref={overlayRef} className="absolute inset-0">
          <Canvas
            gl={{ alpha: true, preserveDrawingBuffer: true, antialias: true }}
            camera={{ position: [0, 0, 5], fov: 35 }}
            className="!h-full !w-full"
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 4, 5]} intensity={1.4} />
            <directionalLight position={[-3, -2, 3]} intensity={0.4} color="#ffd9b0" />
            <Environment preset="studio" />
            <TrackedRing
              poseRef={poseRef}
              metal={metal}
              ringWidthMm={ringWidthMm}
              stoneCarats={stoneCarats}
            />
          </Canvas>
        </div>

        {/* Top bar */}
        <header className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">Try on</p>
            <p className="text-sm font-semibold">Point camera at your hand</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition hover:bg-white/25"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Status banner */}
        <StatusOverlay status={status} errorMsg={errorMsg} />
      </div>

      {/* Bottom action bar */}
      <footer className="grid grid-cols-1 gap-3 bg-black/85 p-4">
        <button
          type="button"
          onClick={handleCapture}
          disabled={status !== 'tracking' && status !== 'no-hand'}
          className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
        >
          <Camera className="h-4 w-4" /> Capture photo
        </button>
        <p className="text-center text-[11px] text-white/55">
          Approximate preview — the actual piece may vary slightly in scale and finish.
        </p>
      </footer>

      {/* Snapshot preview */}
      {snapshot && (
        <div className="fixed inset-0 z-60 flex flex-col bg-black/95 p-4">
          <header className="flex items-center justify-between pb-3">
            <p className="text-sm font-semibold">Your try-on</p>
            <button
              type="button"
              onClick={() => setSnapshot(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <img src={snapshot} alt="Try-on capture" className="max-h-full max-w-full rounded-2xl object-contain" />
          </div>
          <a
            href={snapshot}
            download={`try-on-${Date.now()}.png`}
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300"
          >
            <Download className="h-4 w-4" /> Save photo
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Three.js: the parametric ring ────────────────────────────────────────
function TrackedRing({
  poseRef,
  metal,
  ringWidthMm,
  stoneCarats,
}: {
  poseRef: React.MutableRefObject<{ visible: boolean; x: number; y: number; scale: number; angle: number }>
  metal: string
  ringWidthMm: number
  stoneCarats?: number | null
}) {
  const groupRef = useRef<THREE.Group>(null)
  const look = METAL_LOOK[metal] ?? METAL_LOOK['gold-18k-yellow']

  // Band: torus whose tube radius scales with the chosen ring width.
  // 1 unit ≈ 1 cm in scene space at depth z=0. We rescale per-frame from
  // the pose info, so the absolute numbers here are just a baseline.
  const bandHeight = useMemo(() => Math.max(0.04, Math.min(0.25, (ringWidthMm ?? 2.0) * 0.05)), [ringWidthMm])
  const stoneRadius = useMemo(() => {
    // Carats → mm diameter rough approximation for round brilliants:
    //   diameter_mm ≈ 6.5 × cbrt(carats / 1.0)
    const ct = Math.max(0, stoneCarats ?? 0)
    const mm = ct > 0 ? 6.5 * Math.cbrt(ct) : 0
    return mm * 0.045 // scene units
  }, [stoneCarats])

  useFrame((state) => {
    const grp = groupRef.current
    if (!grp) return
    const p = poseRef.current
    grp.visible = p.visible
    if (!p.visible) return

    const { size } = state
    // Convert normalised pose to NDC, then to scene coordinates at z=0
    // using the camera's perspective. The Canvas is full-bleed so the
    // pixel space matches the video as long as both keep the same aspect.
    const ndcX = p.x * 2 - 1
    const ndcY = -(p.y * 2 - 1)
    // Distance from camera (4 units) × tan(fov/2) gives world half-height.
    const camera = state.camera as THREE.PerspectiveCamera
    const distance = camera.position.z
    const worldHalfH = Math.tan((camera.fov * Math.PI) / 360) * distance
    const worldHalfW = worldHalfH * (size.width / size.height)
    grp.position.set(ndcX * worldHalfW, ndcY * worldHalfH, 0)

    // Ring scale derived from the apparent phalanx length on screen.
    const ringWorldDiameter = p.scale * 2 * worldHalfW
    const baseR = 0.5 // torus radius in scene units before scaling
    const s = ringWorldDiameter / (baseR * 2)
    grp.scale.setScalar(s)

    // Rotate around the finger axis (Z in screen space) so the ring tilts
    // with the finger. Add a slight tilt around X to give the band volume.
    grp.rotation.set(0.35, 0, p.angle + Math.PI / 2)
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* Band */}
      <mesh>
        <torusGeometry args={[0.5, bandHeight, 32, 96]} />
        <meshStandardMaterial color={look.color} metalness={look.metalness} roughness={look.roughness} />
      </mesh>
      {/* Centre stone (if any) — sits on the outer edge of the band */}
      {stoneRadius > 0 && (
        <group position={[0, 0.5 + bandHeight + stoneRadius * 0.6, 0]}>
          {/* Prong-cup */}
          <mesh>
            <cylinderGeometry args={[stoneRadius * 1.05, stoneRadius * 0.7, stoneRadius * 0.5, 16]} />
            <meshStandardMaterial color={look.color} metalness={look.metalness} roughness={look.roughness} />
          </mesh>
          {/* Stone */}
          <mesh position={[0, stoneRadius * 0.6, 0]}>
            <octahedronGeometry args={[stoneRadius, 0]} />
            <meshPhysicalMaterial
              color="#ffffff"
              metalness={0.0}
              roughness={0.05}
              transmission={0.85}
              thickness={0.5}
              ior={2.4}
              reflectivity={1}
              clearcoat={1}
              clearcoatRoughness={0.05}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ─── Status overlay ───────────────────────────────────────────────────────
function StatusOverlay({ status, errorMsg }: { status: string; errorMsg: string | null }) {
  if (status === 'tracking') return null
  let msg = ''
  let busy = false
  if (status === 'init')              { msg = 'Starting…'; busy = true }
  else if (status === 'loading-model'){ msg = 'Loading hand-tracking model…'; busy = true }
  else if (status === 'requesting-camera') { msg = 'Camera permission needed'; busy = true }
  else if (status === 'no-hand')      { msg = 'Show your hand to the camera' }
  else if (status === 'error')        { msg = errorMsg ?? 'Something went wrong' }
  else if (status === 'ready')        { msg = 'Ready' }

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-md">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <span>{msg}</span>
      </div>
    </div>
  )
}
