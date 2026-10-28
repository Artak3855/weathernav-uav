import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sim } from './sim';
import { toLocalKm, windVector } from './shared/geo';

const ALT = 1 / 200; // 1 scene unit = 1 km horizontally; altitude exaggerated (1 unit = 200 m)
export default function Scene3D({ sim }: { sim: Sim }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!, w = el.clientWidth, h = el.clientHeight;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1220);
    const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000); cam.position.set(0, 18, 30);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(w, h); el.appendChild(renderer.domElement);
    const ctl = new OrbitControls(cam, renderer.domElement);
    scene.add(new THREE.GridHelper(60, 30, 0x335577, 0x1c2a3d));
    [100, 500, 1000].forEach(a => { const p = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.05, side: THREE.DoubleSide })); p.rotation.x = -Math.PI / 2; p.position.y = a * ALT; scene.add(p); });
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(2 + i % 3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })); c.position.set(-18 + i * 9, 6 + (i % 2) * 2, -8 + i * 3); scene.add(c); } // illustrative only
    const drone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0x22d3ee })); scene.add(drone);
    let dyn = new THREE.Group(); scene.add(dyn);
    let ver = -1, raf = 0;
    const clear = () => { dyn.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); scene.remove(dyn); dyn = new THREE.Group(); scene.add(dyn); };
    const line = (pts: { lat: number; lon: number }[], color: number) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => { const l = toLocalKm(sim.start, p); return new THREE.Vector3(l.x, sim.alt * ALT, l.z); })); dyn.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color }))); };
    const loop = () => {
      if (ver !== sim.version) {
        ver = sim.version; clear(); line(sim.original, 0x94a3b8); if (sim.route !== sim.original) line(sim.route, 0x22c55e);
        sim.hazards.forEach(z => { const l = toLocalKm(sim.start, z), r = z.radiusM / 1000; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 10, 32, 1, true), new THREE.MeshBasicMaterial({ color: z.kind === 'storm' ? 0xef4444 : 0xf59e0b, transparent: true, opacity: 0.25, side: THREE.DoubleSide })); m.position.set(l.x, 5, l.z); dyn.add(m); });
        const wv = windVector(sim.wind.speed, sim.wind.from); const dir = new THREE.Vector3(wv.e, 0, -wv.n).normalize();
        dyn.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, sim.alt * ALT + 1, 0), Math.min(1 + sim.wind.speed / 3, 8), 0xfacc15));
      }
      const l = toLocalKm(sim.start, sim.pos); drone.position.set(l.x, sim.alt * ALT, l.z); drone.rotation.y = -(sim.heading * Math.PI) / 180;
      ctl.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); clear(); ctl.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [sim]);
  return <div className="scene" ref={ref}><span className="note" style={{ position: 'absolute', zIndex: 1, padding: 4 }}>Ամպերը ցուցադրական են (չեն դիտարկվել)։ Բարձրությունը ուռճացված է։</span></div>;
}
