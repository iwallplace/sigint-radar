import { useRef, useEffect, useCallback } from "react"
import * as THREE from "three"
import { getSignalColor } from "../utils/colorMapper"

const SWEEP_SPEED = 0.012

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return hash
}

function signalAngle(signal) {
  const seed = hashCode(`${signal.id}-${Math.round(signal.freq_hz / 1000)}`)
  return ((seed % 3600) / 3600) * Math.PI * 2
}

function signalDistance(signal, rangeKm) {
  const dist = signal.estimated_distance_km || 1
  return Math.min(dist / rangeKm, 0.92)
}

function getSignalAltitude(signal) {
  // ADS-B aircraft with altitude
  if (signal.category === "aircraft" && signal.decode_data?.altitude_baro_ft) {
    return signal.decode_data.altitude_baro_ft * 0.0003048 // ft to km, scaled
  }
  if (signal.category === "aircraft") {
    return 0.3 + Math.random() * 0.2 // Default aircraft altitude
  }
  // Satellite signals
  if (signal.category === "satellite") {
    return 0.6 + Math.random() * 0.3
  }
  // Ground-level signals (ISM, POCSAG, FM, etc.)
  return 0
}

export default function Radar3D({
  signals = [],
  selectedId,
  onSelect,
  rangeKm = 60,
  stationName = "SIGINT-01",
}) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const animRef = useRef(null)
  const sweepRef = useRef(0)
  const signalMeshesRef = useRef(new Map())
  const sweepLineRef = useRef(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const cameraAngle = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, distance: 5 })
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())

  const initScene = useCallback(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth
    const height = mount.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x060a06)
    scene.fog = new THREE.Fog(0x060a06, 8, 14)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    cameraRef.current = camera
    updateCamera()

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Ambient light
    scene.add(new THREE.AmbientLight(0x22c55e, 0.3))

    // Ground plane (dark, radar style)
    const groundGeo = new THREE.CircleGeometry(3.5, 64)
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x0a1a0a,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    scene.add(ground)

    // Range rings on ground
    const ringCount = 3
    for (let i = 1; i <= ringCount; i++) {
      const radius = (i / ringCount) * 3
      const ringGeo = new THREE.RingGeometry(radius - 0.01, radius + 0.01, 64)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.15 + i * 0.03,
        side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.001
      scene.add(ring)

      // Distance label sprite
      const km = Math.round((i / ringCount) * rangeKm)
      const labelSprite = makeTextSprite(`${km}km`, 0.15, 0x22c55e)
      labelSprite.position.set(radius + 0.15, 0.05, 0)
      scene.add(labelSprite)
    }

    // Cross lines on ground
    const crossMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.12 })
    for (let a = 0; a < 4; a++) {
      const angle = (a / 4) * Math.PI
      const pts = [
        new THREE.Vector3(-3 * Math.cos(angle), 0.001, -3 * Math.sin(angle)),
        new THREE.Vector3(3 * Math.cos(angle), 0.001, 3 * Math.sin(angle)),
      ]
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
      scene.add(new THREE.Line(lineGeo, crossMat))
    }

    // Compass labels
    const compassLabels = [
      { text: "N", angle: 0 },
      { text: "E", angle: Math.PI / 2 },
      { text: "S", angle: Math.PI },
      { text: "W", angle: (3 * Math.PI) / 2 },
    ]
    for (const { text, angle } of compassLabels) {
      const r = 3.3
      const sprite = makeTextSprite(text, 0.25, 0x22c55e)
      sprite.position.set(r * Math.sin(angle), 0.1, -r * Math.cos(angle))
      scene.add(sprite)
    }

    // Height reference lines (vertical)
    const heightMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.08 })
    for (let i = 1; i <= 3; i++) {
      const pts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, i * 0.5, 0),
      ]
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
      scene.add(new THREE.Line(lineGeo, heightMat))

      // Height label
      const altKm = Math.round(i * rangeKm * 0.15)
      const hLabel = makeTextSprite(`${altKm}km↑`, 0.12, 0x22c55e)
      hLabel.position.set(0.15, i * 0.5, 0)
      scene.add(hLabel)
    }

    // Sweep line (vertical plane rotating)
    const sweepGeo = new THREE.PlaneGeometry(3, 0.005)
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    })
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat)
    sweepMesh.position.set(1.5, 0.002, 0)
    const sweepGroup = new THREE.Group()
    sweepGroup.add(sweepMesh)
    scene.add(sweepGroup)
    sweepLineRef.current = sweepGroup

    // Center station marker
    const stationGeo = new THREE.SphereGeometry(0.06, 16, 16)
    const stationMat = new THREE.MeshBasicMaterial({ color: 0x22c55e })
    const stationMesh = new THREE.Mesh(stationGeo, stationMat)
    stationMesh.position.set(0, 0.06, 0)
    scene.add(stationMesh)

    // Station label
    const stLabel = makeTextSprite(stationName, 0.12, 0x22c55e)
    stLabel.position.set(0, 0.2, 0)
    scene.add(stLabel)
  }, [rangeKm, stationName])

  function updateCamera() {
    if (!cameraRef.current) return
    const { theta, phi, distance } = cameraAngle.current
    cameraRef.current.position.set(
      distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta)
    )
    cameraRef.current.lookAt(0, 0.3, 0)
  }

  function makeTextSprite(text, size, color) {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    canvas.width = 128
    canvas.height = 64
    ctx.clearRect(0, 0, 128, 64)
    ctx.font = "bold 24px monospace"
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 64, 32)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.7 })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(size * 2, size, 1)
    return sprite
  }

  // Update signals in scene
  const updateSignals = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return

    const existing = signalMeshesRef.current
    const currentIds = new Set()

    for (const sig of signals) {
      currentIds.add(sig.id)
      const angle = signalAngle(sig)
      const dist = signalDistance(sig, rangeKm)
      const r = dist * 3 // Scale to scene units
      const altitude = getSignalAltitude(sig)

      const x = r * Math.sin(angle)
      const z = -r * Math.cos(angle)
      const y = altitude

      const colorHex = getSignalColor(sig.category)
      const color = new THREE.Color(colorHex)
      const isSelected = sig.id === selectedId
      const isWeird = (sig.weirdness_score || 0) >= 40

      if (existing.has(sig.id)) {
        const group = existing.get(sig.id)
        group.position.set(x, y, z)
        // Update dot color
        const dot = group.children[0]
        if (dot) {
          dot.material.color = color
          dot.scale.setScalar(isSelected ? 1.5 : isWeird ? 1.3 : 1)
        }
        // Update selection ring
        const ring = group.children[1]
        if (ring) ring.visible = isSelected
        // Update altitude line
        const line = group.children[2]
        if (line && y > 0.01) {
          line.visible = true
          const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -y, 0)]
          line.geometry.setFromPoints(pts)
        } else if (line) {
          line.visible = false
        }
      } else {
        // Create new signal group
        const group = new THREE.Group()
        group.position.set(x, y, z)
        group.userData = { signalId: sig.id }

        // Signal dot (sphere)
        const dotGeo = new THREE.SphereGeometry(0.05, 12, 12)
        const dotMat = new THREE.MeshBasicMaterial({ color })
        const dot = new THREE.Mesh(dotGeo, dotMat)
        group.add(dot)

        // Selection ring
        const ringGeo = new THREE.RingGeometry(0.08, 0.1, 24)
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.visible = isSelected
        ring.lookAt(cameraRef.current?.position || new THREE.Vector3(0, 5, 5))
        group.add(ring)

        // Altitude line (from signal to ground)
        if (y > 0.01) {
          const linePts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -y, 0)]
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts)
          const lineMat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.3,
          })
          const line = new THREE.Line(lineGeo, lineMat)
          group.add(line)
        } else {
          // Placeholder invisible line
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
          ])
          const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 })
          const line = new THREE.Line(lineGeo, lineMat)
          line.visible = false
          group.add(line)
        }

        // Label sprite
        const freqMhz = (sig.freq_hz / 1e6).toFixed(1)
        const labelText = sig.protocol && sig.protocol !== "unknown" ? sig.protocol : freqMhz
        const label = makeTextSprite(labelText, 0.1, parseInt(colorHex.replace("#", ""), 16))
        label.position.set(0.12, 0.08, 0)
        group.add(label)

        scene.add(group)
        existing.set(sig.id, group)
      }
    }

    // Remove stale signals
    for (const [id, group] of existing) {
      if (!currentIds.has(id)) {
        scene.remove(group)
        // Dispose geometries/materials
        group.traverse((child) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (child.material.map) child.material.map.dispose()
            child.material.dispose()
          }
        })
        existing.delete(id)
      }
    }
  }, [signals, selectedId, rangeKm])

  // Animation loop
  const animate = useCallback(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current

    if (!renderer || !scene || !camera) return

    // Rotate sweep
    sweepRef.current += SWEEP_SPEED
    if (sweepLineRef.current) {
      sweepLineRef.current.rotation.y = sweepRef.current
    }

    updateSignals()

    // Make selection rings face camera
    for (const [, group] of signalMeshesRef.current) {
      const ring = group.children[1]
      if (ring && ring.visible) {
        ring.lookAt(camera.position)
      }
    }

    renderer.render(scene, camera)
    animRef.current = requestAnimationFrame(animate)
  }, [updateSignals])

  // Mouse interaction
  const handleMouseDown = useCallback((e) => {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }

    cameraAngle.current.theta -= dx * 0.005
    cameraAngle.current.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05,
      cameraAngle.current.phi - dy * 0.005
    ))
    updateCamera()
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    cameraAngle.current.distance = Math.max(2, Math.min(12,
      cameraAngle.current.distance + e.deltaY * 0.005
    ))
    updateCamera()
  }, [])

  const handleClick = useCallback((e) => {
    if (!onSelect || !rendererRef.current || !cameraRef.current) return

    const rect = rendererRef.current.domElement.getBoundingClientRect()
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.current.setFromCamera(mouse.current, cameraRef.current)

    // Check intersection with signal dots
    const meshes = []
    for (const [, group] of signalMeshesRef.current) {
      const dot = group.children[0]
      if (dot) meshes.push(dot)
    }

    const intersects = raycaster.current.intersectObjects(meshes)
    if (intersects.length > 0) {
      const hitGroup = intersects[0].object.parent
      if (hitGroup?.userData?.signalId) {
        onSelect(hitGroup.userData.signalId)
        return
      }
    }
    onSelect(null)
  }, [onSelect])

  // Init
  useEffect(() => {
    initScene()
    animRef.current = requestAnimationFrame(animate)

    const mount = mountRef.current
    if (mount) {
      mount.addEventListener("mousedown", handleMouseDown)
      mount.addEventListener("mousemove", handleMouseMove)
      mount.addEventListener("mouseup", handleMouseUp)
      mount.addEventListener("mouseleave", handleMouseUp)
      mount.addEventListener("wheel", handleWheel, { passive: false })
    }

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      rendererRef.current.setSize(w, h)
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener("resize", handleResize)
      if (mount) {
        mount.removeEventListener("mousedown", handleMouseDown)
        mount.removeEventListener("mousemove", handleMouseMove)
        mount.removeEventListener("mouseup", handleMouseUp)
        mount.removeEventListener("mouseleave", handleMouseUp)
        mount.removeEventListener("wheel", handleWheel)
        // Clean up renderer
        if (rendererRef.current) {
          mount.removeChild(rendererRef.current.domElement)
          rendererRef.current.dispose()
        }
      }
      // Clean up signal meshes
      signalMeshesRef.current.clear()
    }
  }, [initScene, animate, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel])

  return (
    <div
      ref={mountRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onClick={handleClick}
    />
  )
}
