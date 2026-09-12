import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sampleTrack, TRACK_WIDTH, type TrackInfo } from "../game/track";

// The start straight and first bend only, including the approach to the grid.
export const SLICE_START = 0.92;
export const SLICE_END = 1.18;
export function randomSequence(seed: number) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

export function roadDistance(track: TrackInfo, x: number, z: number) {
  let distance = Infinity;
  for (let i = 0; i < track.samples.length; i++) {
    const a = track.samples[i].center;
    const b = track.samples[(i + 1) % track.samples.length].center;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return distance;
}

export function createVerge(track: TrackInfo, side: number) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const steps = 100, rows = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pose = sampleTrack(track, SLICE_START + t * (SLICE_END - SLICE_START));
    const endFade = Math.sin(Math.PI * t) ** 2;
    for (let j = 0; j < rows; j++) {
      const f = j / (rows - 1);
      const offset = TRACK_WIDTH / 2 + 3.35 + f * 32;
      const p = pose.center.clone().addScaledVector(pose.normal, side * offset);
      const clearance = THREE.MathUtils.smoothstep(roadDistance(track, p.x, p.z), TRACK_WIDTH / 2 + 3.3, 25);
      const height = Math.sin(f * Math.PI) ** 2 * (1.8 + 1.4 * Math.sin(t * 29 + side) ** 2) * endFade * clearance;
      positions.push(p.x, pose.center.y -0.016 + height, p.z);
      const c = new THREE.Color("#73735a").lerp(new THREE.Color("#526a35"), THREE.MathUtils.smoothstep(f, 0, 0.38));
      c.multiplyScalar(0.94 + Math.sin(i * 2.7 + j * 8.3) * 0.055);
      colors.push(c.r, c.g, c.b);
      if (i < steps && j < rows - 1) {
        const a = i * rows + j, b = a + rows;
        if (side > 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

// Closed sphere topology, sunk below ground. No open bottom or seam panels.
export function createMountain(seed: number, width: number, height: number, depth: number, detail: number) {
  const g = new THREE.SphereGeometry(1, Math.max(detail,36) * 2, Math.max(detail,36));
  const p = g.getAttribute("position");
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const relief = 1 + 0.15 * Math.sin(x * 9 + seed) * Math.cos(z * 11 - seed) + 0.07 * Math.sin(z * 23 + x * 17);
    const h = Math.max(0, y);
    p.setXYZ(i, x * width * relief, y > 0 ? Math.pow(h, 1.05) * height * relief * (.62+.26*Math.sin(x*4.7+z*2.1+seed)**2+.12*Math.sin(z*7.2-seed)**2) - 5 : y * 12 - 5, z * depth * relief);
    const rock = THREE.MathUtils.smoothstep(h + Math.sin(x * 20 + z * 9) * 0.12, 0.25, 0.85);
    const color = new THREE.Color("#68705b").lerp(new THREE.Color("#918b7d"), rock);
    color.multiplyScalar(0.84 + 0.16 * Math.sin(x * 15 + z * 18 + seed) ** 2);
    colors.push(color.r, color.g, color.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // No UVs are needed for vertex-colour terrain. Weld the sphere's UV seam before
  // recalculating normals so a closed surface also has continuous lighting.
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const welded = mergeVertices(g, 0.0001);
  g.dispose();
  welded.computeVertexNormals();
  return welded;
}
