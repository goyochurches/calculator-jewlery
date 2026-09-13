import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

/** The "other half" of the original CAD ask: viewing an existing design
 *  file (a real Matrix/RhinoGold/anything-else export) inside the app,
 *  independent of the parametric generator the rest of this feature is
 *  built around. STL/OBJ/3MF via three.js's own built-in loaders;
 *  `.3dm` (Rhino/Matrix's own format) via the much heavier `rhino3dm`
 *  WASM package, lazy-loaded (dynamic import) only when a `.3dm` file
 *  is actually opened — a 2.6MB binary has no business in the main
 *  bundle for a feature most sessions never touch. */
export type ImportedCadFormat = 'stl' | 'obj' | '3mf' | '3dm'

export function detectImportFormat(fileName: string): ImportedCadFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  if (ext === '3mf') return '3mf'
  if (ext === '3dm') return '3dm'
  return null
}

// rhino3dm's own README documents TWO integration paths: bundling it as
// an ES/CJS module (what a naive `import('rhino3dm')` here would do), or
// loading its UMD build as a plain <script> tag, which attaches a global
// `rhino3dm()` factory and is the library's own recommended browser/React
// pattern specifically. The bundled-module path was tried FIRST and
// discarded: rhino3dm.js is a universal Node+browser emscripten build
// whose Node-only branch has a plain `require("ws")` inside an
// `if (ENVIRONMENT_IS_NODE)` guard that's genuinely dead in a browser —
// but Vite's bundler (Rolldown) statically resolves every require
// regardless of reachability and hard-fails the whole production build
// since "ws" isn't a real dependency of this app (confirmed: the build
// failed identically whether or not "ws" was added to
// `rolldownOptions.external`, ruling out a quick config fix). The plain-
// script-tag path sidesteps this entirely — the browser only executes
// code paths actually reached, so the guarded dead `require` never runs
// and is never even seen by a bundler in the first place.
let rhinoModulePromise: Promise<import('rhino3dm').RhinoModule> | null = null
function loadRhino3dm(): Promise<import('rhino3dm').RhinoModule> {
  if (rhinoModulePromise) return rhinoModulePromise
  rhinoModulePromise = new Promise((resolve, reject) => {
    const w = window as unknown as { rhino3dm?: (opts: { locateFile: (path: string) => string }) => Promise<import('rhino3dm').RhinoModule> }
    const init = () => w.rhino3dm!({ locateFile: () => '/rhino3dm.wasm' }).then(resolve, reject)
    if (w.rhino3dm) { init(); return }
    const script = document.createElement('script')
    script.src = '/rhino3dm.min.js'
    script.addEventListener('load', init)
    script.addEventListener('error', () => reject(new Error('Could not load the .3dm reader (rhino3dm.min.js failed to load).')))
    document.body.appendChild(script)
  })
  return rhinoModulePromise
}

/** `.3dm` files can contain BREP/NURBS surfaces and Extrusions, not just
 *  pre-tessellated meshes — tessellating a BREP is real additional work
 *  (Rhino's own adaptive meshing algorithm, not something to approximate
 *  casually) not attempted here. This app can only read objects that are
 *  ALREADY meshes in the file — a real, honest v1: some real exports
 *  (anything explicitly saved/exported as a mesh, or a "for 3D printing"
 *  variant) are mesh-based already and work fully; a native BREP-based
 *  Rhino/Matrix design won't show anything without first converting it
 *  to a mesh in Rhino/Matrix itself (Mesh > From NURBS Object, or an STL
 *  export instead, which this app already reads directly). */
async function parse3dmFile(file: File): Promise<THREE.Group> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const rhino = await loadRhino3dm()

  const model = rhino.File3dm.fromByteArray(buffer)
  if (!model) throw new Error('Could not read this .3dm file — it may be corrupted or use an unsupported version.')

  const group = new THREE.Group()
  const table = model.objects()
  let skippedNonMesh = 0
  for (let i = 0; i < table.count; i++) {
    const obj = table.get(i)
    const geo = obj.geometry()
    if (geo.objectType !== rhino.ObjectType.Mesh) { skippedNonMesh++; continue }
    // toThreejsJSON's own rotateToYUp flips Rhino's Z-up convention to
    // three.js's Y-up directly — no manual axis-swap needed.
    const json = (geo as unknown as import('rhino3dm').Mesh).toThreejsJSON(true) as {
      data: { index: { array: number[] }; attributes: { position: { array: number[] }; normal?: { array: number[] } } }
    }
    const bufferGeo = new THREE.BufferGeometry()
    bufferGeo.setIndex(json.data.index.array)
    bufferGeo.setAttribute('position', new THREE.Float32BufferAttribute(json.data.attributes.position.array, 3))
    if (json.data.attributes.normal) {
      bufferGeo.setAttribute('normal', new THREE.Float32BufferAttribute(json.data.attributes.normal.array, 3))
    } else {
      bufferGeo.computeVertexNormals()
    }
    group.add(new THREE.Mesh(bufferGeo))
  }
  if (group.children.length === 0) {
    throw new Error(skippedNonMesh > 0
      ? `This file has ${skippedNonMesh} object${skippedNonMesh === 1 ? '' : 's'} but none are meshes (likely BREP/NURBS surfaces) — this app can only read pre-tessellated meshes from .3dm files. Convert to a mesh in Rhino/Matrix first, or export as STL/OBJ/3MF instead.`
      : 'This file parsed but contained no objects.')
  }
  if (skippedNonMesh > 0) {
    group.userData.importWarning = `${skippedNonMesh} non-mesh object${skippedNonMesh === 1 ? '' : 's'} (likely BREP/NURBS surfaces) in this file were skipped — this app can only read pre-tessellated meshes from .3dm files yet.`
  }
  return group
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
  if (!format) throw new Error('Unsupported file type — expected .stl, .obj, .3mf, or .3dm')

  let group: THREE.Group

  if (format === '3dm') {
    group = await parse3dmFile(file) // group.userData.importWarning already set inside, if any non-mesh objects were skipped
  } else if (format === 'obj') {
    group = new THREE.Group()
    const text = await file.text()
    const parsed = new OBJLoader().parse(text)
    group.add(parsed)
  } else if (format === 'stl') {
    group = new THREE.Group()
    const buffer = await file.arrayBuffer()
    const geometry = new STLLoader().parse(buffer)
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry))
  } else {
    group = new THREE.Group()
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
