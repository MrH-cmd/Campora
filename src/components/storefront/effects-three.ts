// The two WebGL effects. This file is only downloaded when a store uses one of them, and only on desktop.
import * as THREE from "three";

export function startThree(el: HTMLElement, slug: string, p: { color: string; speed: number; density: number }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
  const color = new THREE.Color(p.color);
  let tick: (t: number) => void;
  if (slug === "orbit-crystal") {
    camera.position.z = 4.2;
    const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.25, 0)), new THREE.LineBasicMaterial({ color }));
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.8, 1)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .25 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .008, 8, 120), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .6 }));
    ring.rotation.x = 1.25; scene.add(core, shell, ring);
    tick = (t) => { core.rotation.set(t * .5, t * .7, 0); shell.rotation.set(-t * .2, t * .15, t * .1); ring.rotation.z = t * .4; };
  } else {
    camera.position.set(0, 2.4, 6); camera.lookAt(0, 0, 0);
    const n = Math.round(46 * Math.min(1.5, Math.max(.5, p.density))); const pos = new Float32Array(n * n * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .05, transparent: true, opacity: .9 })));
    tick = (t) => {
      let i = 0;
      for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
        const px = (x / n - .5) * 14, pz = (z / n - .5) * 10;
        pos[i++] = px; pos[i++] = Math.sin(px * .8 + t) * .35 + Math.cos(pz * .9 + t * .8) * .35; pos[i++] = pz;
      }
      geo.attributes.position.needsUpdate = true;
    };
  }
  const fit = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(fit); ro.observe(el); fit();
  let raf = 0, t = 0, last = 0, paused = false;
  const frame = (now: number) => { raf = requestAnimationFrame(frame); t += Math.min(.05, (now - (last || now)) / 1000) * p.speed; last = now; tick(t); renderer.render(scene, camera); };
  raf = requestAnimationFrame(frame);
  return {
    pause(v: boolean) { if (v === paused) return; paused = v; if (v) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
