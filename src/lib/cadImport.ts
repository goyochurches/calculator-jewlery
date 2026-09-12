import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

/** The "other half" of the original CAD ask: viewing an existing design
 *  file (a real Matrix/RhinoGold/anything-else export) inside the app,
 *  independent of the parametric generator the rest of this feature is
 *  built around. STL/OBJ/3MF first — three.js ships loaders for all
 *  three; `.3dm` (Rhino/Matrix's own format, via the much heavier
 *  `rhino3dm` WASM package) is a deliberately separate future step, not
 *  done here. */
export type ImportedCadFormat = 'stl' | 'obj' | '3mf'

export function detectImportFormat(fileName: string): ImportedCadFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  if (ext === '3mf') return '3mf'
  return null
}

/** Parses an uploaded file into a THREE.Group centered on the origin —
 *  same convention as every parametric model this app builds — ready to
 *  hand straight to `ModelViewer3D`. Every mesh is tagged
 *  `userData.partName = 'Imported'` so click-to-select still gives SOME
 *  feedback even though we can't know finer part identity for a file this
 *  app didn't build itself. Throws on an unsupported extension or a
 *  format the underlying loader can't parse — callers should catch and
 *  show the message rather than let it crash the page. */
export async function parseImportedCadFile(file: File): Promise<THREE.Group> {
  const format = detectImportFormat(file.name)
  if (!format) throw new Error('Unsupported file type — expected .stl, .obj, or .3mf')

  const group = new THREE.Group()

  if (format === 'obj') {
    const text = await file.text()
    const parsed = new OBJLoader().parse(text)
    group.add(parsed)
  } else if (format === 'stl') {
    const buffer = await file.arrayBuffer()
    const geometry = new STLLoader().parse(buffer)
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry))
  } else {
    const buffer = await file.arrayBuffer()
    const parsed = new ThreeMFLoader().parse(buffer)
    if (!parsed) throw new Error('Could not read this .3mf file — it may be corrupted or use an unsupported feature.')
    group.add(parsed)
  }

  if (group.children.length === 0) {
    throw new Error('The file parsed but contained no visible geometry.')
  }

  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty() || !Number.isFinite(box.min.x)) {
    throw new Error('The file parsed but its geometry looks empty or invalid.')
  }
  const center = box.getCenter(new THREE.Vector3())
  group.position.sub(center)

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) obj.userData.partName = 'Imported'
  })

  return group
}
