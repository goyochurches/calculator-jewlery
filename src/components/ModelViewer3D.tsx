import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useEffect, useRef } from 'react'

/** What clicking a part of the model in the viewer reports back — the
 *  human-readable `userData.partName` every ringGeometry.ts builder now
 *  tags its meshes with (e.g. "Prong", "Gallery", "Center stone"), plus
 *  whether it's a gem vs. metal. `null` means the click missed every part
 *  (background, or a part with no partName tag) — treat that as a
 *  deselect. */
export interface SelectedPart {
  name: string
  isStone: boolean
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
}

/**
 * Reusable three.js viewport: scene/camera/renderer/lights/orbit-controls
 * set up once per mount, with the displayed object swapped in and out as
 * `object` changes. Deliberately generic — a single mesh or a whole group
 * both work, so this same component is the future home of an imported CAD
 * file's mesh, not just the parametric ring band.
 */
export function ModelViewer3D({ object, color = '#d4af37', metalness = 0.85, roughness = 0.28, className, onSelectPart }: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const displayedRef = useRef<THREE.Object3D | null>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const stoneMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const highlightMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  // Read inside the stable click handler below without re-registering the
  // DOM listener every time the caller passes a new callback instance.
  const onSelectPartRef = useRef(onSelectPart)
  useEffect(() => { onSelectPartRef.current = onSelectPart }, [onSelectPart])

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

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8
    controls.maxDistance = 200

    // Studio-style three-point lighting so a metal material reads well
    // without needing an HDR environment map.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(40, 60, 40)
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
    const stoneMaterial = new THREE.MeshStandardMaterial({
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

    // Click-to-select: raycast from the click point through the camera,
    // find the first tagged part it hits, and toggle its material to the
    // highlight one — the first real "select a part of the model" CAD
    // interaction, instead of only a parametric form driving a preview.
    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    const handleClick = (event: MouseEvent) => {
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
        prev.material = prev.userData.isStone ? stoneMat : metalMat
        selectedMeshRef.current = null
      }

      if (hit instanceof THREE.Mesh && typeof hit.userData.partName === 'string') {
        hit.material = highlightMat
        selectedMeshRef.current = hit
        onSelectPartRef.current?.({ name: hit.userData.partName, isStone: !!hit.userData.isStone })
      } else {
        onSelectPartRef.current?.(null)
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
    const animate = () => {
      if (!running) return
      controls.update()
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      running = false
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      material.dispose()
      stoneMaterial.dispose()
      highlightMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
    }
    // Intentionally empty — color/metalness/roughness updates are applied
    // to the existing material in the effect below rather than tearing
    // down the whole renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap the displayed object whenever it changes, without rebuilding the
  // scene/renderer/controls. Any prior selection necessarily belonged to
  // the OLD object (the new one was just rebuilt from the latest params),
  // so it's cleared here rather than left pointing at a disposed mesh.
  useEffect(() => {
    const scene = sceneRef.current
    const material = materialRef.current
    const stoneMaterial = stoneMaterialRef.current
    if (!scene || !material || !stoneMaterial) return

    selectedMeshRef.current = null
    onSelectPartRef.current?.(null)

    if (displayedRef.current) {
      const prev = displayedRef.current
      scene.remove(prev)
      prev.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose() })
      displayedRef.current = null
    }
    if (object) {
      object.traverse(obj => {
        if (obj instanceof THREE.Mesh) obj.material = obj.userData.isStone ? stoneMaterial : material
      })
      scene.add(object)
      displayedRef.current = object
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

  return <div ref={containerRef} className={className} />
}
