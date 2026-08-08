/* ============================================================================
   THE SPIRE — city layout + scene assembly (pure three, no React).
   buildCity() constructs the whole world once: the 250-floor spire, the tower
   field, the DNA data-helix, GPU traffic streaks, drones, sky-lane rings,
   cloud decks, the street grid and the sky dome — all instanced/batched into
   ~15 draw calls. CityWorld.tsx mounts the returned group and drives the
   shared uniforms + camera each frame.
   ========================================================================== */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ShaderMaterial,
} from 'three'
import {
  makeCloudMaterial,
  makeDroneMaterial,
  makeGroundMaterial,
  makeHelixNodeMaterial,
  makeHelixRungMaterial,
  makeRingMaterial,
  makeSharedUniforms,
  makeSkyMaterial,
  makeTowerMaterial,
  makeVehicleMaterial,
  makeVeilMaterial,
  type CitySharedUniforms,
} from './cityShaders'

export const CITY = {
  FLOORS: 250,
  SPIRE_H: 1000, // 250 floors × 4m
  ORBIT_R: 112, // camera orbit radius around the spire
  CAM_TOP: 1035,
  CAM_END: 9,
  HELIX: { x: 64, z: -10, r: 15, y0: 6, y1: 992, n: 200 },
  CLOUDS: [795, 862, 918], // cloud-deck altitudes (crossed early in the descent)
}

export type CityTier = 'mobile' | 'desktop'

/** Deterministic PRNG — same city every visit, no hydration drift. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The camera's descent pose. Shared by the builder (hero-flyby lane placement)
 * and the frame loop so both always agree on where the eye is at descent d.
 */
export function camPose(d: number, pos: Vector3, look: Vector3, px: number, py: number) {
  const y = CITY.CAM_TOP + (CITY.CAM_END - CITY.CAM_TOP) * d
  const ang = -0.6 + d * 2.35 // ~135° of slow orbit over the full drop
  const r = CITY.ORBIT_R + Math.sin(d * Math.PI * 3) * 7 // gentle in/out breathing
  pos.set(Math.cos(ang) * r, y, Math.sin(ang) * r)
  const lookY = Math.max(y - 34 - d * 40, 10)
  look.set(px * 16, lookY - py * 12, 0)
}

export interface CityAssets {
  group: Group
  shared: CitySharedUniforms
  helixGroup: Group
  sky: Mesh
  veil: Mesh
  cloudMats: { mat: ShaderMaterial; y: number }[]
  dispose: () => void
}

export function buildCity(tier: CityTier): CityAssets {
  const rng = mulberry32(1789)
  const group = new Group()
  const shared = makeSharedUniforms()
  const geometries: BufferGeometry[] = []
  const materials: ShaderMaterial[] = []
  const track = <G extends BufferGeometry>(g: G): G => {
    geometries.push(g)
    return g
  }
  const trackM = <M extends ShaderMaterial>(m: M): M => {
    materials.push(m)
    return m
  }

  const m4 = new Matrix4()
  const qIdent = new Quaternion()
  const vPos = new Vector3()
  const vScale = new Vector3()

  /* --- tower field -------------------------------------------------------- */
  const nTowers = tier === 'mobile' ? 130 : 300
  const towerGeo = track(new BoxGeometry(1, 1, 1))
  const towerMat = trackM(makeTowerMaterial(shared, false))
  const towers = new InstancedMesh(towerGeo, towerMat, nTowers)
  const towerSeeds = new Float32Array(nTowers)
  {
    let placed = 0
    let guard = 0
    const innerCount = 10 // low foreground blocks, kept out of the final shot
    while (placed < nTowers && guard++ < nTowers * 40) {
      let x: number, z: number, h: number
      if (placed < innerCount) {
        // inner band, on the far side of the camera's final bearing
        const a = -0.6 + 2.35 + Math.PI + (rng() - 0.5) * 2.4
        const rr = 58 + rng() * 30
        x = Math.cos(a) * rr
        z = Math.sin(a) * rr
        h = 34 + rng() * 90
      } else {
        const a = rng() * Math.PI * 2
        const rr = 150 + Math.sqrt(rng()) * 680
        x = Math.cos(a) * rr
        z = Math.sin(a) * rr
        h = 46 + Math.pow(rng(), 2.4) * 330
        if (rng() < 0.05) h = 470 + rng() * 200 // a few supertalls on the skyline
      }
      // keep clear of the helix column
      if (Math.hypot(x - CITY.HELIX.x, z - CITY.HELIX.z) < CITY.HELIX.r + 26) continue
      const w = 13 + rng() * 24
      const dep = 13 + rng() * 24
      m4.compose(vPos.set(x, h / 2, z), qIdent, vScale.set(w, h, dep))
      towers.setMatrixAt(placed, m4)
      towerSeeds[placed] = rng()
      placed++
    }
  }
  towerGeo.setAttribute('aSeed', new InstancedBufferAttribute(towerSeeds, 1))
  towers.instanceMatrix.needsUpdate = true
  towers.frustumCulled = false
  group.add(towers)

  /* --- the Spire: stacked drums with setbacks + antenna ------------------- */
  const drumRadii = [27, 24, 21, 18, 15, 11]
  const drumFrac = [0.14, 0.17, 0.18, 0.17, 0.17, 0.17]
  const spireGeo = track(new CylinderGeometry(1, 1, 1, 18, 1))
  const spireMat = trackM(makeTowerMaterial(shared, true))
  const spire = new InstancedMesh(spireGeo, spireMat, drumRadii.length + 1)
  const spireSeeds = new Float32Array(drumRadii.length + 1)
  const spireRads = new Float32Array(drumRadii.length + 1)
  {
    let y = 0
    for (let i = 0; i < drumRadii.length; i++) {
      const h = drumFrac[i] * CITY.SPIRE_H
      m4.compose(vPos.set(0, y + h / 2, 0), qIdent, vScale.set(drumRadii[i], h, drumRadii[i]))
      spire.setMatrixAt(i, m4)
      spireSeeds[i] = 0.31 + i * 0.11
      spireRads[i] = drumRadii[i]
      y += h
    }
    // antenna
    m4.compose(vPos.set(0, CITY.SPIRE_H + 34, 0), qIdent, vScale.set(0.9, 68, 0.9))
    spire.setMatrixAt(drumRadii.length, m4)
    spireSeeds[drumRadii.length] = 0.77
    spireRads[drumRadii.length] = 0.9
  }
  spireGeo.setAttribute('aSeed', new InstancedBufferAttribute(spireSeeds, 1))
  spireGeo.setAttribute('aRad', new InstancedBufferAttribute(spireRads, 1))
  spire.instanceMatrix.needsUpdate = true
  spire.frustumCulled = false
  group.add(spire)

  /* --- the DNA data-helix ------------------------------------------------- */
  const helixGroup = new Group()
  helixGroup.position.set(CITY.HELIX.x, 0, CITY.HELIX.z)
  const H = CITY.HELIX
  const nNodes = H.n * 2
  const nodeGeo = track(new SphereGeometry(1.15, 10, 8))
  const nodeMat = trackM(makeHelixNodeMaterial(shared))
  const nodes = new InstancedMesh(nodeGeo, nodeMat, nNodes)
  const nodePhase = new Float32Array(nNodes)
  const nodeStrand = new Float32Array(nNodes)
  const turn = (Math.PI * 2) / 64 // one full twist every 64m — the DNA read
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < H.n; i++) {
      const t = i / (H.n - 1)
      const y = H.y0 + (H.y1 - H.y0) * t
      const a = y * turn + s * Math.PI + 0.9
      m4.compose(
        vPos.set(Math.cos(a) * H.r, y, Math.sin(a) * H.r),
        qIdent,
        vScale.set(1, 1, 1),
      )
      const idx = s * H.n + i
      nodes.setMatrixAt(idx, m4)
      nodePhase[idx] = t
      nodeStrand[idx] = s
    }
  }
  nodeGeo.setAttribute('aPhase', new InstancedBufferAttribute(nodePhase, 1))
  nodeGeo.setAttribute('aStrand', new InstancedBufferAttribute(nodeStrand, 1))
  nodes.instanceMatrix.needsUpdate = true
  nodes.frustumCulled = false
  helixGroup.add(nodes)

  const rungEvery = 5
  const nRungs = Math.floor(H.n / rungEvery)
  const rungGeo = track(new CylinderGeometry(0.22, 0.22, 1, 6, 1))
  const rungMat = trackM(makeHelixRungMaterial(shared))
  const rungs = new InstancedMesh(rungGeo, rungMat, nRungs)
  const rungPhase = new Float32Array(nRungs)
  const rungStrand = new Float32Array(nRungs)
  const qRung = new Quaternion()
  const UP = new Vector3(0, 1, 0)
  const dir = new Vector3()
  for (let k = 0; k < nRungs; k++) {
    const i = k * rungEvery
    const t = i / (H.n - 1)
    const y = H.y0 + (H.y1 - H.y0) * t
    const a = y * turn + 0.9
    dir.set(Math.cos(a), 0, Math.sin(a))
    qRung.setFromUnitVectors(UP, dir)
    m4.compose(vPos.set(0, y, 0), qRung, vScale.set(1, H.r * 2 - 2.6, 1))
    rungs.setMatrixAt(k, m4)
    rungPhase[k] = t
    rungStrand[k] = k % 2
  }
  rungGeo.setAttribute('aPhase', new InstancedBufferAttribute(rungPhase, 1))
  rungGeo.setAttribute('aStrand', new InstancedBufferAttribute(rungStrand, 1))
  rungs.instanceMatrix.needsUpdate = true
  rungs.frustumCulled = false
  helixGroup.add(rungs)
  group.add(helixGroup)

  /* --- GPU traffic streaks ------------------------------------------------ */
  const nVeh = (tier === 'mobile' ? 60 : 140) + 3 // +3 scripted close flybys
  const quad = new PlaneGeometry(1, 1)
  const vehGeo = new InstancedBufferGeometry()
  vehGeo.index = quad.index
  vehGeo.setAttribute('position', quad.getAttribute('position'))
  vehGeo.setAttribute('uv', quad.getAttribute('uv'))
  track(vehGeo)
  track(quad)
  const aStart = new Float32Array(nVeh * 3)
  const aDir = new Float32Array(nVeh * 3)
  const aParam = new Float32Array(nVeh * 4)
  const aColor = new Float32Array(nVeh * 3)
  const aThick = new Float32Array(nVeh)
  const setLane = (
    i: number,
    px: number,
    py: number,
    pz: number,
    heading: number,
    len: number,
    unitsPerSec: number,
    streak: number,
    thick: number,
    r: number,
    g: number,
    b: number,
  ) => {
    const dx = Math.cos(heading)
    const dz = Math.sin(heading)
    aStart[i * 3] = px - (dx * len) / 2
    aStart[i * 3 + 1] = py
    aStart[i * 3 + 2] = pz - (dz * len) / 2
    aDir[i * 3] = dx
    aDir[i * 3 + 1] = 0
    aDir[i * 3 + 2] = dz
    aParam[i * 4] = unitsPerSec / len
    aParam[i * 4 + 1] = rng()
    aParam[i * 4 + 2] = len
    aParam[i * 4 + 3] = streak
    aColor[i * 3] = r
    aColor[i * 3 + 1] = g
    aColor[i * 3 + 2] = b
    aThick[i] = thick
  }
  for (let i = 0; i < nVeh - 3; i++) {
    const y = 40 + rng() * 920
    const len = 600 + rng() * 900
    const cw = rng()
    // cool white / amber / teal traffic populations
    const col: [number, number, number] =
      cw < 0.62 ? [0.81, 0.91, 1.0] : cw < 0.86 ? [1.0, 0.7, 0.42] : [0.15, 0.95, 0.75]
    setLane(
      i,
      (rng() - 0.5) * 700,
      y,
      (rng() - 0.5) * 700,
      rng() * Math.PI * 2,
      len,
      14 + rng() * 30,
      7 + rng() * 10,
      0.3 + rng() * 0.5,
      col[0],
      col[1],
      col[2],
    )
  }
  // scripted hero flybys: lanes that pass just outside the camera path
  const flyPos = new Vector3()
  const flyLook = new Vector3()
  ;[0.3, 0.58, 0.86].forEach((d, k) => {
    camPose(d, flyPos, flyLook, 0, 0)
    const out = flyPos.clone().setY(0).normalize()
    const tangent = Math.atan2(-out.x, out.z) // heading ⊥ to the radial — sweeps across view
    setLane(
      nVeh - 3 + k,
      flyPos.x + out.x * 14,
      flyPos.y - 3,
      flyPos.z + out.z * 14,
      tangent,
      760,
      64,
      22,
      1.15,
      1.0,
      0.98,
      0.92,
    )
  })
  vehGeo.setAttribute('aStart', new InstancedBufferAttribute(aStart, 3))
  vehGeo.setAttribute('aDir', new InstancedBufferAttribute(aDir, 3))
  vehGeo.setAttribute('aParam', new InstancedBufferAttribute(aParam, 4))
  vehGeo.setAttribute('aColor', new InstancedBufferAttribute(aColor, 3))
  vehGeo.setAttribute('aThick', new InstancedBufferAttribute(aThick, 1))
  vehGeo.instanceCount = nVeh
  const vehicles = new Mesh(vehGeo, trackM(makeVehicleMaterial(shared)))
  vehicles.frustumCulled = false
  group.add(vehicles)

  /* --- drones + crown beacons --------------------------------------------- */
  const nDrones = (tier === 'mobile' ? 24 : 54) + 2
  const dronePos = new Float32Array(nDrones * 3)
  const dronePhase = new Float32Array(nDrones)
  const droneCol = new Float32Array(nDrones * 3)
  for (let i = 0; i < nDrones - 2; i++) {
    const a = rng() * Math.PI * 2
    const rr = 60 + rng() * 360
    dronePos[i * 3] = Math.cos(a) * rr
    dronePos[i * 3 + 1] = 50 + rng() * 770
    dronePos[i * 3 + 2] = Math.sin(a) * rr
    dronePhase[i] = rng()
    const cw = rng()
    const col: [number, number, number] =
      cw < 0.3 ? [1.0, 0.33, 0.2] : cw < 0.8 ? [0.9, 0.95, 1.0] : [0.15, 0.95, 0.75]
    droneCol[i * 3] = col[0]
    droneCol[i * 3 + 1] = col[1]
    droneCol[i * 3 + 2] = col[2]
  }
  // spire crown beacons (slow red strobes)
  for (let k = 0; k < 2; k++) {
    const i = nDrones - 2 + k
    dronePos[i * 3] = 0
    dronePos[i * 3 + 1] = CITY.SPIRE_H + 8 + k * 52
    dronePos[i * 3 + 2] = 0
    dronePhase[i] = k * 0.5
    droneCol[i * 3] = 1.0
    droneCol[i * 3 + 1] = 0.22
    droneCol[i * 3 + 2] = 0.15
  }
  const droneGeo = track(new BufferGeometry())
  droneGeo.setAttribute('position', new BufferAttribute(dronePos, 3))
  droneGeo.setAttribute('aPhase', new BufferAttribute(dronePhase, 1))
  droneGeo.setAttribute('aCol', new BufferAttribute(droneCol, 3))
  const drones = new Points(droneGeo, trackM(makeDroneMaterial(shared)))
  drones.frustumCulled = false
  group.add(drones)

  /* --- sky-lane traffic rings around the spire ---------------------------- */
  const ringDefs = [
    { y: 250, r: 46, count: 22, flow: 0.5 },
    { y: 500, r: 60, count: 30, flow: -0.35 },
    { y: 750, r: 50, count: 26, flow: 0.42 },
  ]
  for (const rd of ringDefs) {
    const g = track(new TorusGeometry(rd.r, 0.55, 6, 160))
    const ring = new Mesh(g, trackM(makeRingMaterial(shared, rd.count, rd.flow)))
    ring.rotation.x = Math.PI / 2
    ring.position.y = rd.y
    ring.frustumCulled = false
    group.add(ring)
  }

  /* --- cloud decks + ground haze ------------------------------------------ */
  const cloudMats: { mat: ShaderMaterial; y: number }[] = []
  const cloudDefs = [
    { y: CITY.CLOUDS[0], tintA: '#0c1524', tintB: '#3a4f6e', wind: 0.010, scale: 7 },
    { y: CITY.CLOUDS[1], tintA: '#0e1828', tintB: '#48607f', wind: 0.014, scale: 9 },
    { y: CITY.CLOUDS[2], tintA: '#101a2c', tintB: '#566e8e', wind: 0.008, scale: 6 },
    { y: 18, tintA: '#1c1206', tintB: '#4e3417', wind: 0.006, scale: 5 }, // street haze
  ]
  for (const cd of cloudDefs) {
    const g = track(new PlaneGeometry(1700, 1700))
    const m = trackM(makeCloudMaterial(shared, cd.tintA, cd.tintB, cd.wind, cd.scale))
    const plane = new Mesh(g, m)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = cd.y
    plane.frustumCulled = false
    group.add(plane)
    cloudMats.push({ mat: m, y: cd.y })
  }

  /* --- ground ------------------------------------------------------------- */
  const groundGeo = track(new CircleGeometry(1700, 64))
  const ground = new Mesh(groundGeo, trackM(makeGroundMaterial(shared)))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0.4
  ground.frustumCulled = false
  group.add(ground)

  /* --- sky dome (follows the camera) -------------------------------------- */
  const skyGeo = track(new SphereGeometry(1900, 24, 16))
  const sky = new Mesh(skyGeo, trackM(makeSkyMaterial(shared)))
  sky.renderOrder = -1
  sky.frustumCulled = false
  group.add(sky)

  /* --- cloud-breakthrough veil (clip-space quad, drawn last) --------------- */
  const veilGeo = track(new PlaneGeometry(2, 2))
  const veil = new Mesh(veilGeo, trackM(makeVeilMaterial(shared)))
  veil.renderOrder = 999
  veil.frustumCulled = false
  group.add(veil)

  return {
    group,
    shared,
    helixGroup,
    sky,
    veil,
    cloudMats,
    dispose: () => {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      towers.dispose()
      spire.dispose()
      nodes.dispose()
      rungs.dispose()
    },
  }
}
