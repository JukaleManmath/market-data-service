import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Particle {
  vx: number
  vy: number
}

export default function ParticleField() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.z = 18

    // ── Particles with vertex colors ─────────────────────────────────────────
    const COUNT = 170
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const meta: Particle[] = []

    // Palette: Fey blue tones + near-white
    const palette: [number, number, number][] = [
      [0.278, 0.624, 0.980],  // #479FFA bright blue
      [0.482, 0.749, 1.000],  // #7BBFFF lighter blue
      [0.102, 0.435, 0.769],  // #1A6FC4 deeper blue
      [0.820, 0.878, 0.953],  // near-white blue tint
    ]

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 34
      positions[i * 3 + 1] = (Math.random() - 0.5) * 23
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12
      meta.push({
        vx: (Math.random() - 0.5) * 0.009,
        vy: (Math.random() - 0.5) * 0.006,
      })
      const r = Math.random()
      const c = r < 0.45 ? palette[0] : r < 0.72 ? palette[1] : r < 0.90 ? palette[2] : palette[3]
      colors[i * 3]     = c[0]
      colors[i * 3 + 1] = c[1]
      colors[i * 3 + 2] = c[2]
    }

    const dotGeo = new THREE.BufferGeometry()
    dotGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    dotGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const dotMat = new THREE.PointsMaterial({
      size: 0.11,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      vertexColors: true,
    })
    const dots = new THREE.Points(dotGeo, dotMat)
    scene.add(dots)

    // ── Connection lines (pre-allocated) ─────────────────────────────────────
    const MAX_LINES = 400
    const linePos = new Float32Array(MAX_LINES * 2 * 3)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    lineGeo.setDrawRange(0, 0)

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x479FFA,
      transparent: true,
      opacity: 0.18,
    })
    const lines = new THREE.LineSegments(lineGeo, lineMat)
    scene.add(lines)

    // ── Wireframe rotating octahedron ─────────────────────────────────────────
    const octGeo = new THREE.OctahedronGeometry(3.8, 0)
    const octMat = new THREE.MeshBasicMaterial({
      color: 0x479FFA,
      wireframe: true,
      transparent: true,
      opacity: 0.07,
    })
    const octahedron = new THREE.Mesh(octGeo, octMat)
    octahedron.position.set(-8, 2, -10)
    scene.add(octahedron)

    // ── Wireframe icosahedron ─────────────────────────────────────────────────
    const icoGeo = new THREE.IcosahedronGeometry(2.2, 0)
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0x2D7EE0,
      wireframe: true,
      transparent: true,
      opacity: 0.07,
    })
    const icosahedron = new THREE.Mesh(icoGeo, icoMat)
    icosahedron.position.set(9, -3, -8)
    scene.add(icosahedron)

    // ── Wireframe torus ───────────────────────────────────────────────────────
    const torusGeo = new THREE.TorusGeometry(2.5, 0.5, 8, 24)
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0x1A6FC4,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    })
    const torus = new THREE.Mesh(torusGeo, torusMat)
    torus.position.set(3, 5, -14)
    scene.add(torus)

    // ── Ambient glow spheres ──────────────────────────────────────────────────
    const glowDefs = [
      { p: [7, 3, -7],   c: 0x479FFA, s: 5.5, o: 0.040 },
      { p: [-9, -3, -5], c: 0x2D7EE0, s: 4,   o: 0.030 },
      { p: [1, 6, -14],  c: 0x4EBE96, s: 4.5, o: 0.025 },
    ]
    const glows = glowDefs.map(({ p, c, s, o }) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(s, 24, 24),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o })
      )
      m.position.set(p[0], p[1], p[2])
      scene.add(m)
      return m
    })

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // ── Animation loop ────────────────────────────────────────────────────────
    let frameId: number
    let t = 0
    const THRESHOLD_SQ = 5.5 * 5.5

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      t += 0.004

      // Move particles
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3]     += meta[i].vx
        positions[i * 3 + 1] += meta[i].vy
        if (Math.abs(positions[i * 3])     > 17) meta[i].vx *= -1
        if (Math.abs(positions[i * 3 + 1]) > 11.5) meta[i].vy *= -1
      }
      dotGeo.attributes.position.needsUpdate = true

      // Rebuild connections
      let lineCount = 0
      for (let i = 0; i < COUNT && lineCount < MAX_LINES; i++) {
        for (let j = i + 1; j < COUNT && lineCount < MAX_LINES; j++) {
          const dx = positions[i * 3] - positions[j * 3]
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1]
          if (dx * dx + dy * dy < THRESHOLD_SQ) {
            const b = lineCount * 6
            linePos[b]     = positions[i * 3];     linePos[b + 1] = positions[i * 3 + 1]; linePos[b + 2] = positions[i * 3 + 2]
            linePos[b + 3] = positions[j * 3];     linePos[b + 4] = positions[j * 3 + 1]; linePos[b + 5] = positions[j * 3 + 2]
            lineCount++
          }
        }
      }
      lineGeo.attributes.position.needsUpdate = true
      lineGeo.setDrawRange(0, lineCount * 2)

      // Rotate objects
      dots.rotation.y += 0.00025
      octahedron.rotation.x += 0.004
      octahedron.rotation.y += 0.006
      icosahedron.rotation.x -= 0.003
      icosahedron.rotation.z += 0.005
      torus.rotation.x += 0.002
      torus.rotation.y += 0.003

      // Oscillate glows
      glows[0].position.y = 3 + Math.sin(t * 0.7) * 1.8
      glows[1].position.x = -9 + Math.sin(t * 0.5) * 2.2
      glows[2].position.y = 6 + Math.cos(t * 0.4) * 2.5

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
