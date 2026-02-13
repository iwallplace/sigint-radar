import { useRef, useEffect, useState } from "react"
import { useI18n } from "../i18n"

// Globe rendered with Three.js via dynamic import
export default function GlobeView({ station, signals = [] }) {
  const { t } = useI18n()
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const globeRef = useRef(null)
  const frameRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const lat = station?.lat || 0
  const lon = station?.lon || 0

  useEffect(() => {
    if (!containerRef.current) return
    let cleanup = false

    async function init() {
      try {
        const THREE = await import("three")

        if (cleanup) return

        const container = containerRef.current
        const w = container.clientWidth
        const h = container.clientHeight

        // Scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x030712)
        sceneRef.current = scene

        // Camera
        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
        camera.position.set(0, 0, 3)
        cameraRef.current = camera

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(w, h)
        renderer.setPixelRatio(window.devicePixelRatio)
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Globe sphere
        const geometry = new THREE.SphereGeometry(1, 64, 64)
        const material = new THREE.MeshPhongMaterial({
          color: 0x1a3a1a,
          emissive: 0x0a1a0a,
          shininess: 5,
          wireframe: false,
        })
        const globe = new THREE.Mesh(geometry, material)
        scene.add(globe)
        globeRef.current = globe

        // Wireframe overlay
        const wireGeo = new THREE.SphereGeometry(1.002, 36, 18)
        const wireMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          wireframe: true,
          transparent: true,
          opacity: 0.15,
        })
        const wireGlobe = new THREE.Mesh(wireGeo, wireMat)
        scene.add(wireGlobe)

        // Lights
        const ambient = new THREE.AmbientLight(0x404040, 1.5)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 1)
        directional.position.set(5, 3, 5)
        scene.add(directional)

        // Station marker
        if (lat !== 0 || lon !== 0) {
          const pos = latLonToVec3(lat, lon, 1.02)
          const markerGeo = new THREE.SphereGeometry(0.015, 8, 8)
          const markerMat = new THREE.MeshBasicMaterial({ color: 0x22c55e })
          const marker = new THREE.Mesh(markerGeo, markerMat)
          marker.position.copy(pos)
          scene.add(marker)

          // Glow ring
          const ringGeo = new THREE.RingGeometry(0.02, 0.035, 16)
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          })
          const ring = new THREE.Mesh(ringGeo, ringMat)
          ring.position.copy(pos)
          ring.lookAt(0, 0, 0)
          scene.add(ring)
        }

        // Signal markers on globe
        signals.forEach((s) => {
          if (s.aircraft?.lat && s.aircraft?.lon) {
            const pos = latLonToVec3(s.aircraft.lat, s.aircraft.lon, 1.03)
            const geo = new THREE.SphereGeometry(0.008, 6, 6)
            const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
            const m = new THREE.Mesh(geo, mat)
            m.position.copy(pos)
            scene.add(m)
          }
        })

        // Mouse interaction (orbit)
        let isDragging = false
        let prevMouse = { x: 0, y: 0 }
        let rotation = { x: 0, y: 0 }

        // Orient camera to look at station
        if (lat !== 0 || lon !== 0) {
          rotation.y = -((lon + 90) * Math.PI) / 180
          rotation.x = (lat * Math.PI) / 180
        }

        const onMouseDown = (e) => {
          isDragging = true
          prevMouse = { x: e.clientX, y: e.clientY }
        }
        const onMouseUp = () => { isDragging = false }
        const onMouseMove = (e) => {
          if (!isDragging) return
          const dx = e.clientX - prevMouse.x
          const dy = e.clientY - prevMouse.y
          rotation.y += dx * 0.005
          rotation.x += dy * 0.005
          rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.x))
          prevMouse = { x: e.clientX, y: e.clientY }
        }
        const onWheel = (e) => {
          camera.position.z = Math.max(1.5, Math.min(8, camera.position.z + e.deltaY * 0.002))
        }

        container.addEventListener("mousedown", onMouseDown)
        container.addEventListener("mouseup", onMouseUp)
        container.addEventListener("mousemove", onMouseMove)
        container.addEventListener("wheel", onWheel, { passive: true })

        // Animation
        function animate() {
          if (cleanup) return
          globe.rotation.y = rotation.y
          globe.rotation.x = rotation.x
          wireGlobe.rotation.y = rotation.y
          wireGlobe.rotation.x = rotation.x
          renderer.render(scene, camera)
          frameRef.current = requestAnimationFrame(animate)
        }
        animate()

        // Resize
        const ro = new ResizeObserver(() => {
          const nw = container.clientWidth
          const nh = container.clientHeight
          camera.aspect = nw / nh
          camera.updateProjectionMatrix()
          renderer.setSize(nw, nh)
        })
        ro.observe(container)

        setLoading(false)

        // Cleanup refs
        rendererRef.current._cleanup = () => {
          container.removeEventListener("mousedown", onMouseDown)
          container.removeEventListener("mouseup", onMouseUp)
          container.removeEventListener("mousemove", onMouseMove)
          container.removeEventListener("wheel", onWheel)
          ro.disconnect()
        }
      } catch (e) {
        console.error("Globe init error:", e)
        setError(e.message)
        setLoading(false)
      }
    }

    init()

    return () => {
      cleanup = true
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (rendererRef.current) {
        rendererRef.current._cleanup?.()
        rendererRef.current.dispose()
        rendererRef.current.domElement?.remove()
        rendererRef.current = null
      }
    }
  }, [lat, lon, signals.length])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800">
        <h2 className="text-sm font-bold tracking-widest text-green-400">
          {t("globe.title")}
        </h2>
        <span className="text-xs text-gray-500">
          {station?.name || ""}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <span className="text-gray-500 text-sm animate-pulse">
              {t("globe.loading")}
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <div className="text-center">
              <p className="text-red-400 text-sm">{t("globe.error")}</p>
              <p className="text-gray-500 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function latLonToVec3(lat, lon, radius = 1) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return {
    x: -(radius * Math.sin(phi) * Math.cos(theta)),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
    copy(target) {
      // For Three.js Vector3 compatibility
      if (target && target.set) {
        target.set(this.x, this.y, this.z)
      }
      return target
    },
  }
}
