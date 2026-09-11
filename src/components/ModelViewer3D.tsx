import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useEffect, useRef } from 'react'

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
}

/**
 * Reusable three.js viewport: scene/camera/renderer/lights/orbit-controls
 * set up once per mount, with the displayed object swapped in and out as
 * `object` changes. Deliberately generic — a single mesh or a whole group
 * both work, so this same component is the future home of an imported CAD
 * file's mesh, not just the parametric ring band.
 */
export function ModelViewer3D({ object, color = '#d4af37', metalness = 0.85, roughness = 0.28, className }: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const displayedRef = useRef<THREE.Object3D | null>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const stoneMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)

  // One-time scene/camera/renderer/controls setup, torn down on unmount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f172a')
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
    camera.position.set(28, 22, 28)

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
      controls.dispose()
      material.dispose()
      stoneMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
    // Intentionally empty — color/metalness/roughness updates are applied
    // to the existing material in the effect below rather than tearing
    // down the whole renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap the displayed object whenever it changes, without rebuilding the
  // scene/renderer/controls.
  useEffect(() => {
    const scene = sceneRef.current
    const material = materialRef.current
    const stoneMaterial = stoneMaterialRef.current
    if (!scene || !material || !stoneMaterial) return

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
