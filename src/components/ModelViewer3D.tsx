import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { DIAMOND_LOOK } from '@/lib/gemLooks'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/** Named camera views — Matrix's own 3D Viewer module ("Front / Back /
 *  Left / Right / Top / Bottom / Perspective"). Snapping to one is a
 *  one-off camera move, not a persistent prop — see `ModelViewer3DHandle`. */
export type CameraView = 'front' | 'top' | 'side' | 'perspective'

export interface ModelViewer3DHandle {
  setView: (view: CameraView) => void
  /** Renders one frame and returns it as a PNG data URL (for "Save image"
   *  in Render mode). Null if the viewer isn't mounted yet. */
  snapshot: () => string | null
}

/** Walks up from a clicked mesh to the nearest ancestor tagged
 *  `userData.isMovableRoot` — that ancestor (not the individual mesh) is
 *  what `attachHeadToBand` actually transforms, so it's what the drag
 *  gizmo needs to attach to. Returns null if nothing in the chain (or a
 *  null starting point) is movable. Module-level, not a component method,
 *  so the one-time setup effect below can reference it without becoming a
 *  stale-closure dependency risk. */
function findMovableRoot(start: THREE.Object3D | null): THREE.Object3D | null {
  let cur: THREE.Object3D | null = start
  while (cur) {
    if (cur.userData.isMovableRoot) return cur
    cur = cur.parent
  }
  return null
}

/** Shows only the handles/planes relevant to how a movable part's drag is
 *  actually interpreted downstream (see `onMove`'s own doc comment) —
 *  'xz' for a part positioned by an angle around the band (X/Z + the XZ
 *  plane), 'y' for one positioned by a plain linear offset along Y (the
 *  matching band). Defaults to 'xz' if a movable root doesn't set its own
 *  `userData.moveAxis`. */
function applyMoveAxis(tc: TransformControls, moveAxis: unknown) {
  const y = moveAxis === 'y'
  tc.showX = !y
  tc.showY = y
  tc.showZ = !y
}

/** What clicking a part of the model in the viewer reports back — the
 *  human-readable `userData.partName` every ringGeometry.ts builder now
 *  tags its meshes with (e.g. "Prong", "Gallery", "Center stone"), plus
 *  whether it's a gem vs. metal. `null` means the click missed every part
 *  (background, or a part with no partName tag) — treat that as a
 *  deselect. */
export interface SelectedPart {
  name: string
  isStone: boolean
  /** The selected mesh's own world-space bounding-box size, in mm (the
   *  modeling unit everywhere in ringGeometry.ts) — a first, honest step
   *  toward a real CAD "properties" panel. */
  dimensionsMm: { x: number; y: number; z: number }
  /** Which specific instance of this part (e.g. which of the 4 prongs) was
   *  clicked, when the builder tagged one — see `userData.instanceIndex`
   *  in ringGeometry.ts. Undefined for parts that only ever exist once
   *  (the band, the gallery, the stone itself) or haven't been wired up
   *  for per-instance editing yet. */
  instanceIndex?: number
}

interface ModelViewer3DProps {
  /** The object (a single Mesh, or a Group with several — band + head +
   *  prongs, etc.) to display, centered on the origin. Swapping this
   *  rebuilds just the displayed object, not the whole scene/renderer.
   *  Every Mesh gets the shared metal material, EXCEPT one tagged
   *  `userData.isStone = true` (the center-stone/pavé proxies from
   *  ringGeometry.ts), which gets a fixed gem-like material instead — so
   *  metal and gem read as visibly different materials, not one gold
   *  blob. */
  object: THREE.Object3D | null
  /** Base color of the material — e.g. the selected metal's tint. */
  color?: string
  metalness?: number
  roughness?: number
  className?: string
  /** Called when the viewer is clicked: with the clicked part's info if a
   *  tagged mesh was hit, or `null` on a miss (deselect). First step toward
   *  real click-to-select CAD interaction — currently identifies+highlights
   *  a part; editing that specific part is a future step. */
  onSelectPart?: (part: SelectedPart | null) => void
  /** Called after dragging a movable part's own gizmo (see
   *  `userData.isMovableRoot`/`movablePartName`/`moveAxis` — set by the
   *  caller directly on whatever group/mesh should be draggable, not by
   *  ringGeometry.ts itself, since "movable" is a per-USE decision, e.g.
   *  the signet-top primitive is movable when reused as a side panel but
   *  not as the main head) — Matrix's Transform > Base "Move" tool, the
   *  first real drag-to-reposition interaction in the viewer. Reports the
   *  part's own name and its resulting LOCAL position (relative to its
   *  own parent, same as `Object3D.position`) — deliberately raw, not
   *  pre-interpreted as an angle, since different movable parts map a
   *  drag to different real parameters (an angle around the band for a
   *  band-attached part, a plain offset for the matching band). The
   *  caller decides how to read it. Only the axis/plane `moveAxis` (see
   *  below) actually shows drag handles for is meaningful — any other
   *  component has no parameter to persist it, so it snaps back on the
   *  next rebuild. This stays honest with the fact the whole model is
   *  regenerated from parameters every render, not a free scene graph. */
  onMove?: (partName: string, position: { x: number; y: number; z: number }) => void
  /** 360° turntable — Matrix's own "Animation" module includes exactly
   *  this. Delegates to OrbitControls' own `autoRotate`, which keeps
   *  spinning alongside (not instead of) manual orbit-dragging. */
  autoRotate?: boolean
  /** Wireframe display mode — Matrix's own 3D Viewer module lists this
   *  alongside Shaded/Realistic/Metal/Gemstone/Transparent/X-ray; this is
   *  the first of those beyond the default shaded look. */
  wireframe?: boolean
  /** Photoreal presentation mode (Matrix's own "Render"): image-based
   *  lighting from a studio environment map, ACES tone mapping, real
   *  refraction/transmission on gems, clear-coated metal, soft contact
   *  shadows on a ground plane and a studio gradient backdrop — instead
   *  of the flat 3-point-light working view used while designing. */
  renderMode?: boolean
  /** Physically based PATH TRACING on top of Render mode (three-gpu-pathtracer):
   *  real refraction inside gems (IOR 2.42, many internal bounces), true
   *  reflections between parts, soft shadows from area lights, accumulating
   *  samples so the image sharpens over time. Needs a capable GPU. */
  pathTrace?: boolean
  /** Gem look in Render / Ray-trace modes: body color + refractive index.
   *  Default = colorless diamond. Applies to every stone in the model. */
  gem?: { color: string; ior: number }
  /** Reports the accumulated sample count while path tracing. */
  onPathTraceSamples?: (samples: number) => void
}

/**
 * Reusable three.js viewport: scene/camera/renderer/lights/orbit-controls
 * set up once per mount, with the displayed object swapped in and out as
 * `object` changes. Deliberately generic — a single mesh or a whole group
 * both work, so this same component is the future home of an imported CAD
 * file's mesh, not just the parametric ring band.
 */
export const ModelViewer3D = forwardRef<ModelViewer3DHandle, ModelViewer3DProps>(function ModelViewer3D(
  { object, color = '#d4af37', metalness = 0.85, roughness = 0.28, className, onSelectPart, onMove, autoRotate = false, wireframe = false, renderMode = false, pathTrace = false, onPathTraceSamples, gem = DIAMOND_LOOK },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const displayedRef = useRef<THREE.Object3D | null>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const stoneMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null)
  const envTextureRef = useRef<THREE.Texture | null>(null)
  const groundRef = useRef<THREE.Mesh | null>(null)
  const pathGroundRef = useRef<THREE.Mesh | null>(null)
  // Set only while the path tracer owns rendering (after its scene is built).
  const pathTracerRef = useRef<{ renderSample: () => void; updateCamera: () => void; samples: number; dispose: () => void } | null>(null)
  const onPathSamplesRef = useRef(onPathTraceSamples)
  useEffect(() => { onPathSamplesRef.current = onPathTraceSamples }, [onPathTraceSamples])
  const backdropRef = useRef<THREE.Texture | null>(null)
  const highlightMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const ghostMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const ghostIntersectMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformControlsRef = useRef<TransformControls | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  // Read inside the stable click handler below without re-registering the
  // DOM listener every time the caller passes a new callback instance.
  const onSelectPartRef = useRef(onSelectPart)
  useEffect(() => { onSelectPartRef.current = onSelectPart }, [onSelectPart])
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // One-time scene/camera/renderer/controls setup, torn down on unmount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f172a')
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
    camera.position.set(28, 22, 28)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Studio environment (image-based lighting) — built once, only ASSIGNED
    // to scene.environment while renderMode is on (see the renderMode
    // effect), so the working view keeps its cheap flat lighting.
    const pmrem = new THREE.PMREMGenerator(renderer)
    envTextureRef.current = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
    pmrem.dispose()
    // Soft radial studio backdrop for Render mode.
    const bg = document.createElement('canvas')
    bg.width = 256; bg.height = 256
    const bgCtx = bg.getContext('2d')
    if (bgCtx) {
      const grad = bgCtx.createRadialGradient(128, 110, 10, 128, 128, 190)
      grad.addColorStop(0, '#f4f5f8'); grad.addColorStop(0.55, '#b9bec9'); grad.addColorStop(1, '#4a505c')
      bgCtx.fillStyle = grad; bgCtx.fillRect(0, 0, 256, 256)
    }
    const backdrop = new THREE.CanvasTexture(bg)
    backdrop.colorSpace = THREE.SRGBColorSpace
    backdropRef.current = backdrop
    // Invisible ground that only catches the ring's shadow.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.ShadowMaterial({ opacity: 0.28 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.visible = false
    scene.add(ground)
    groundRef.current = ground
    // Real (matte) floor for the path tracer, which can't use ShadowMaterial.
    const pathGround = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshStandardMaterial({ color: '#e7e9ee', roughness: 0.45, metalness: 0 }))
    pathGround.rotation.x = -Math.PI / 2
    pathGround.visible = false
    scene.add(pathGround)
    pathGroundRef.current = pathGround

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8
    controls.maxDistance = 200
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 4
    controlsRef.current = controls

    // "Move" transform gizmo (Matrix's Transform > Base) — attached only to
    // whichever movable-root ancestor was last clicked (see handleClick
    // below); detached (invisible) otherwise. Translate-only. Which
    // handles/planes show up is set per-part in handleClick, from that
    // part's own `userData.moveAxis` — a band-attached part (moved by
    // ANGLE) shows X/Z + the XZ plane; a linearly-offset part (the
    // matching band, moved along one axis) shows just that one axis.
    const transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.setMode('translate')
    scene.add(transformControls.getHelper())
    transformControlsRef.current = transformControls
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
    })
    // Interacting with the gizmo (mouseDown only fires when a handle was
    // actually hit — see TransformControls' own pointerDown) still lets the
    // browser's native 'click' fire afterward on the SAME canvas element
    // (stopping propagation on pointerdown doesn't cancel a later native
    // click). Without this flag, handleClick below would immediately
    // deselect/detach right after every drag, since its own raycast never
    // hits the gizmo (added to `scene`, not to `displayed`).
    let ignoreNextClick = false
    transformControls.addEventListener('mouseDown', () => { ignoreNextClick = true })
    transformControls.addEventListener('mouseUp', () => {
      const obj = transformControls.object
      const partName = obj?.userData.movablePartName
      if (obj && typeof partName === 'string') {
        onMoveRef.current?.(partName, { x: obj.position.x, y: obj.position.y, z: obj.position.z })
      }
    })

    // Studio-style three-point lighting so a metal material reads well
    // without needing an HDR environment map.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(40, 60, 40)
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = -30; key.shadow.camera.right = 30
    key.shadow.camera.top = 30; key.shadow.camera.bottom = -30
    key.shadow.bias = -0.0005
    keyLightRef.current = key
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-40, 20, -20)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.5)
    rim.position.set(0, -40, -40)
    scene.add(rim)

    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness })
    materialRef.current = material
    // Fixed gem look — icy, glassy, low metalness — independent of the
    // selected metal color.
    const stoneMaterial = new THREE.MeshPhysicalMaterial({
      color: '#eaf6ff', metalness: 0.05, roughness: 0.05, transparent: true, opacity: 0.85,
    })
    stoneMaterialRef.current = stoneMaterial
    // Selection highlight — a warm amber glow, applied to whichever ONE
    // mesh is currently selected (swapped back to its normal metal/stone
    // material when deselected or when a different part is picked).
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.3,
    })
    highlightMaterialRef.current = highlightMaterial
    // Translucent red "ghost" for boolean cutters (userData.isCutterGhost):
    // shows where a subtracted solid sits so it can be placed; hidden in
    // Render / Ray-trace, where only the cut result matters.
    const ghostMaterial = new THREE.MeshStandardMaterial({ color: '#ef4444', transparent: true, opacity: 0.4, depthWrite: false, metalness: 0, roughness: 0.6 })
    ghostMaterialRef.current = ghostMaterial
    // Green ghost for Intersect cutters (keep-only-the-overlap).
    const ghostIntersectMaterial = ghostMaterial.clone()
    ghostIntersectMaterial.color.set('#22c55e')
    ghostIntersectMaterialRef.current = ghostIntersectMaterial

    // Click-to-select: raycast from the click point through the camera,
    // find the first tagged part it hits, and toggle its material to the
    // highlight one — the first real "select a part of the model" CAD
    // interaction, instead of only a parametric form driving a preview.
    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    const handleClick = (event: MouseEvent) => {
      if (ignoreNextClick) { ignoreNextClick = false; return }
      const cam = cameraRef.current
      const displayed = displayedRef.current
      const stoneMat = stoneMaterialRef.current
      const metalMat = materialRef.current
      const highlightMat = highlightMaterialRef.current
      if (!cam || !stoneMat || !metalMat || !highlightMat) return

      const rect = renderer.domElement.getBoundingClientRect()
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointerNdc, cam)
      const hit = displayed ? raycaster.intersectObject(displayed, true)[0]?.object : undefined

      const prev = selectedMeshRef.current
      if (prev) {
        prev.material = prev.userData.isCutterGhost ? ((prev.userData.cutMode === 'intersect' ? ghostIntersectMaterialRef.current : ghostMaterialRef.current) ?? metalMat) : prev.userData.isStone ? stoneMat : metalMat
        selectedMeshRef.current = null
      }

      if (hit instanceof THREE.Mesh && typeof hit.userData.partName === 'string') {
        hit.material = highlightMat
        selectedMeshRef.current = hit
        const size = new THREE.Box3().setFromObject(hit).getSize(new THREE.Vector3())
        onSelectPartRef.current?.({
          name: hit.userData.partName,
          isStone: !!hit.userData.isStone,
          dimensionsMm: { x: size.x, y: size.y, z: size.z },
          instanceIndex: typeof hit.userData.instanceIndex === 'number' ? hit.userData.instanceIndex : undefined,
        })
      } else {
        onSelectPartRef.current?.(null)
      }

      // Attach/detach the "Move" gizmo to whichever movable-root ancestor
      // the click landed on (independent of the partName-based selection
      // above — a click can select a non-movable part, or miss entirely,
      // in which case the gizmo just disappears).
      const movableRoot = findMovableRoot(hit ?? null)
      const tc = transformControlsRef.current
      if (movableRoot && tc) {
        applyMoveAxis(tc, movableRoot.userData.moveAxis)
        tc.attach(movableRoot)
      } else {
        tc?.detach()
      }
    }
    renderer.domElement.addEventListener('click', handleClick)

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    let running = true
    let pathFrames = 0
    controls.addEventListener('change', () => { pathTracerRef.current?.updateCamera() })
    const animate = () => {
      if (!running) return
      controls.update()
      const pt = pathTracerRef.current
      if (pt) {
        pt.renderSample()
        if (++pathFrames % 6 === 0) onPathSamplesRef.current?.(Math.floor(pt.samples))
      } else {
        renderer.render(scene, camera)
      }
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      running = false
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('click', handleClick)
      transformControls.dispose()
      controls.dispose()
      envTextureRef.current?.dispose()
      backdropRef.current?.dispose()
      ground.geometry.dispose()
      pathGround.geometry.dispose()
      ;(pathGround.material as THREE.Material).dispose()
      pathTracerRef.current?.dispose()
      pathTracerRef.current = null
      ;(ground.material as THREE.Material).dispose()
      rendererRef.current = null
      material.dispose()
      stoneMaterial.dispose()
      highlightMaterial.dispose()
      ghostMaterial.dispose()
      ghostIntersectMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      transformControlsRef.current = null
    }
    // Intentionally empty — color/metalness/roughness/autoRotate updates
    // are applied to the existing material/controls in the effects below
    // rather than tearing down the whole renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap the displayed object whenever it changes, without rebuilding the
  // scene/renderer/controls. The OLD mesh reference is about to be
  // disposed either way, but a rebuild can happen because the currently
  // SELECTED part was itself just edited (e.g. dragging one prong's height
  // slider) — in that case the same logical part still exists in the new
  // object and should stay visibly selected, not flicker deselected on
  // every drag tick. So: remember the previous selection's IDENTITY
  // (partName + instanceIndex, not the JS object) before disposing it, and
  // try to re-find + re-highlight that same identity in the new object
  // before falling back to clearing the selection.
  useEffect(() => {
    const scene = sceneRef.current
    const material = materialRef.current
    const stoneMaterial = stoneMaterialRef.current
    const highlightMat = highlightMaterialRef.current
    if (!scene || !material || !stoneMaterial || !highlightMat) return

    const prevSelected = selectedMeshRef.current
    const prevIdentity = prevSelected
      ? { partName: prevSelected.userData.partName as string | undefined, instanceIndex: prevSelected.userData.instanceIndex as number | undefined }
      : null
    selectedMeshRef.current = null

    if (displayedRef.current) {
      const prev = displayedRef.current
      scene.remove(prev)
      prev.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose() })
      displayedRef.current = null
    }

    const meshes: THREE.Mesh[] = []
    if (object) {
      object.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return
        obj.material = obj.userData.isCutterGhost ? ((obj.userData.cutMode === 'intersect' ? ghostIntersectMaterialRef.current : ghostMaterialRef.current) ?? material) : obj.userData.isStone ? stoneMaterial : material
        obj.castShadow = true
        meshes.push(obj)
      })
      scene.add(object)
      displayedRef.current = object
    }
    const rehit = prevIdentity
      ? meshes.find(m => m.userData.partName === prevIdentity.partName && m.userData.instanceIndex === prevIdentity.instanceIndex)
      : undefined

    if (rehit) {
      rehit.material = highlightMat
      selectedMeshRef.current = rehit
      // Same part, by identity — leave the parent's selection state as-is
      // rather than reporting a change.
    } else {
      onSelectPartRef.current?.(null)
    }

    // Same identity-preservation idea for the "Move" gizmo: if the part it
    // was attached to still exists (by identity) in the rebuilt object,
    // re-attach to its new movable-root ancestor rather than dropping the
    // gizmo on every parameter tweak while mid-drag-adjacent edits happen
    // (e.g. changing logo size while the logo is still selected).
    const tc = transformControlsRef.current
    const newMovableRoot = rehit ? findMovableRoot(rehit) : null
    if (newMovableRoot && tc) {
      applyMoveAxis(tc, newMovableRoot.userData.moveAxis)
      tc.attach(newMovableRoot)
    } else {
      tc?.detach()
    }
  }, [object])

  // Live-update material appearance without touching geometry.
  useEffect(() => {
    const material = materialRef.current
    if (!material) return
    material.color.set(color)
    material.metalness = metalness
    material.roughness = roughness
  }, [color, metalness, roughness])

  // Live-toggle the 360° turntable without touching anything else.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = autoRotate
  }, [autoRotate])

  // Named camera views — snap the camera to a standard angle around
  // whatever the controls' current target/distance is, so this respects
  // however far the user has already zoomed. Exposed imperatively (not a
  // persistent prop) since clicking "Front" is a one-off move, not a
  // state the viewer holds — the user can freely orbit away from it after.
  useImperativeHandle(ref, () => ({
    snapshot: () => {
      const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current
      if (!renderer || !scene || !camera) return null
      // The canvas is only readable right after drawing, so draw first.
      if (pathTracerRef.current) pathTracerRef.current.renderSample()
      else renderer.render(scene, camera)
      return renderer.domElement.toDataURL('image/png')
    },
    setView: (view: CameraView) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      const distance = camera.position.distanceTo(controls.target) || 40
      const offsets: Record<CameraView, THREE.Vector3> = {
        front: new THREE.Vector3(0, 0, 1),
        top: new THREE.Vector3(0, 1, 0.001), // slight Z nudge avoids a degenerate up-vector straight down
        side: new THREE.Vector3(1, 0, 0),
        perspective: new THREE.Vector3(0.7, 0.55, 0.7),
      }
      const dir = offsets[view].normalize()
      camera.position.copy(controls.target).addScaledVector(dir, distance)
      camera.up.set(0, 1, 0)
      controls.update()
    },
  }), [])

  // Live-toggle wireframe mode on the metal/stone materials (not the
  // amber selection highlight — that one stays solid so a selected part
  // is still easy to spot in wireframe view).
  useEffect(() => {
    const material = materialRef.current
    const stoneMaterial = stoneMaterialRef.current
    if (material) material.wireframe = wireframe
    if (stoneMaterial) stoneMaterial.wireframe = wireframe
  }, [wireframe])

  // Render mode: swap the flat working look for a presentation look.
  // Working view keeps scene.environment null + cheap lights; Render mode
  // turns on image-based lighting, ACES tone mapping, shadows, refraction
  // on gems and a clear-coated metal, and drops a shadow-catching ground
  // under the ring. Re-runs when the displayed object changes so the
  // ground follows the model's lowest point.
  useEffect(() => {
    const renderer = rendererRef.current, scene = sceneRef.current
    const material = materialRef.current, stone = stoneMaterialRef.current
    const key = keyLightRef.current, ground = groundRef.current
    if (!renderer || !scene || !material || !stone || !key || !ground) return
    if (pathTrace && renderMode) return // the path-tracing effect below owns the scene
    renderer.shadowMap.enabled = renderMode
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = renderMode ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    renderer.toneMappingExposure = 1.05
    scene.environment = renderMode ? envTextureRef.current : null
    scene.background = renderMode ? backdropRef.current : new THREE.Color('#0f172a')
    key.castShadow = renderMode
    material.envMapIntensity = renderMode ? 1.15 : 1
    material.roughness = renderMode ? 0.16 : 0.28
    // Refraction: diamond-like IOR, transmissive, thin — replaces the
    // working view's flat translucent look.
    stone.transmission = renderMode ? 1 : 0
    stone.ior = renderMode ? gem.ior : 1.5
    stone.thickness = renderMode ? 1.6 : 0
    // Colored gems absorb along the light path (Beer-Lambert-style).
    stone.attenuationColor.set(gem.color)
    stone.attenuationDistance = gem.color.toLowerCase() === '#ffffff' ? Infinity : 6
    stone.roughness = renderMode ? 0 : 0.05
    stone.opacity = renderMode ? 1 : 0.85
    stone.transparent = !renderMode
    stone.envMapIntensity = renderMode ? 4 : 1
    stone.dispersion = renderMode ? 0.5 : 0 // fire (rainbow splitting)
    stone.clearcoat = renderMode ? 1 : 0
    stone.specularIntensity = renderMode ? 1 : 0.5
    stone.color.set(renderMode ? gem.color : '#eaf6ff')
    stone.needsUpdate = true
    material.needsUpdate = true
    ground.visible = renderMode
    if (renderMode && object) {
      const box = new THREE.Box3().setFromObject(object)
      ground.position.y = box.min.y - 0.02
    }
  }, [renderMode, object, pathTrace, gem])

  // Cutter ghosts are a working-view aid only.
  useEffect(() => {
    displayedRef.current?.traverse(o => { if (o.userData.isCutterGhost) o.visible = !renderMode })
  }, [renderMode, object])

  // Path tracing (three-gpu-pathtracer, loaded on demand so it isn't part of
  // the main bundle). Builds a studio environment with softboxes, swaps in a
  // real floor and physically based gem/metal settings, then accumulates
  // samples every frame. Rebuilds (debounced) when the model changes.
  useEffect(() => {
    if (!(pathTrace && renderMode)) return
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current
    const material = materialRef.current, stone = stoneMaterialRef.current
    const pathGround = pathGroundRef.current
    if (!renderer || !scene || !camera || !material || !stone || !pathGround) return
    let cancelled = false
    let tracer: { dispose: () => void } | null = null
    const disposables: { dispose: () => void }[] = []
    const lights: THREE.Object3D[] = []
    scene.traverse(o => { if (o instanceof THREE.Light) lights.push(o) })
    const helper = transformControlsRef.current?.getHelper()
    const timer = setTimeout(async () => {
      const mod = await import('three-gpu-pathtracer')
      if (cancelled) return
      // Studio: dim ambient dome + big softboxes (key, fill, rim, top strip).
      const env = new mod.ProceduralEquirectTexture(512, 256)
      env.generationCallback = (polar, _uv, _coord, target) => {
        const y = Math.cos(polar.phi), x = Math.sin(polar.phi) * Math.sin(polar.theta), z = Math.sin(polar.phi) * Math.cos(polar.theta)
        let v = y < 0 ? 0.04 : 0.28 + 0.35 * y
        if (x * 0.5 + y * 0.75 + z * 0.45 > 0.93) v = 14
        else if (-x * 0.7 + y * 0.4 + z * 0.2 > 0.92) v = 5
        else if (y * 0.3 - z * 0.95 > 0.94) v = 9
        else if (y > 0.985) v = 6
        target.setRGB(v, v, v * 1.03)
      }
      env.update()
      const backdrop = new mod.GradientEquirectTexture()
      backdrop.topColor.set('#f4f5f8'); backdrop.bottomColor.set('#a3aab6')
      backdrop.update()
      disposables.push(env, backdrop)
      scene.environment = env
      scene.background = backdrop
      lights.forEach(l => { l.visible = false })
      if (helper) helper.visible = false
      transformControlsRef.current?.detach()
      if (groundRef.current) groundRef.current.visible = false
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.0
      // Physically based materials.
      material.metalness = 1; material.roughness = 0.14
      stone.transmission = 1; stone.ior = gem.ior; stone.thickness = 0; stone.roughness = 0
      stone.transparent = false; stone.opacity = 1; stone.color.set(gem.color)
      stone.needsUpdate = true; material.needsUpdate = true
      if (object) pathGround.position.y = new THREE.Box3().setFromObject(object).min.y - 0.02
      pathGround.visible = true
      const pt = new mod.WebGLPathTracer(renderer)
      pt.bounces = 12
      pt.transmissiveBounces = 16
      pt.filterGlossyFactor = 0.4
      pt.dynamicLowRes = true
      pt.lowResScale = 0.3
      pt.renderDelay = 60
      pt.minSamples = 2
      tracer = pt
      try {
        pt.setScene(scene, camera)
        pathTracerRef.current = pt as unknown as NonNullable<typeof pathTracerRef.current>
      } catch (err) {
        console.error('Path tracer could not build the scene', err)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
      pathTracerRef.current = null
      tracer?.dispose()
      disposables.forEach(d => d.dispose())
      lights.forEach(l => { l.visible = true })
      if (helper) helper.visible = true
      pathGround.visible = false
    }
  }, [pathTrace, renderMode, object, gem])

  return <div ref={containerRef} className={className} />
})
