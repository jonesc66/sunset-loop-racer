import * as THREE from "three";
export const TRACK_SAMPLE_COUNT = 360;
export const TRACK_WIDTH = 25.5;
export const CHECKPOINT_COUNT = 14;
const TWO_PI = Math.PI * 2;
const TRACK_SCALE = 2.25;
const BREMGARTEN_POINTS = [
    [42, 58],
    [63, 49],
    [78, 33],
    [70, 13],
    [58, -5],
    [40, -24],
    [23, -39],
    [5, -34],
    [-19, -40],
    [-43, -36],
    [-61, -24],
    [-66, -4],
    [-77, 9],
    [-70, 22],
    [-55, 28],
    [-47, 42],
    [-30, 53],
    [-8, 54],
    [14, 50],
    [31, 55]
].map(([x, z]) => new THREE.Vector3(x * TRACK_SCALE, 0, z * TRACK_SCALE));
const BREMGARTEN_CURVE = new THREE.CatmullRomCurve3(BREMGARTEN_POINTS, true, "centripetal", 0.32);
function centerAt(progress) {
    const t = wrapProgress(progress);
    const a = t * TWO_PI;
    const point = BREMGARTEN_CURVE.getPointAt(t);
    return point.add(new THREE.Vector3(Math.sin(a * 5) * 0.75, 0, Math.cos(a * 4) * 0.55));
}
export function wrapProgress(progress) {
    return ((progress % 1) + 1) % 1;
}
export function forwardDelta(from, to) {
    return wrapProgress(to - from);
}
export function crossedProgress(last, current, target) {
    if (current >= last) {
        return target > last && target <= current;
    }
    return target > last || target <= current;
}
function makeSample(progress) {
    const center = centerAt(progress);
    const prev = centerAt(progress - 0.002);
    const next = centerAt(progress + 0.002);
    const tangent = next.sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    return { center, tangent, normal, progress: wrapProgress(progress) };
}
export function createTrack() {
    const samples = Array.from({ length: TRACK_SAMPLE_COUNT }, (_, index) => makeSample(index / TRACK_SAMPLE_COUNT));
    let length = 0;
    for (let index = 0; index < samples.length; index += 1) {
        const next = samples[(index + 1) % samples.length];
        length += samples[index].center.distanceTo(next.center);
    }
    const checkpointTargets = Array.from({ length: CHECKPOINT_COUNT - 1 }, (_, index) => (index + 1) / CHECKPOINT_COUNT);
    checkpointTargets.push(0);
    return { samples, length, checkpointTargets };
}
export function sampleTrack(track, progress) {
    const wrapped = wrapProgress(progress);
    const exact = wrapped * track.samples.length;
    const index = Math.floor(exact) % track.samples.length;
    const nextIndex = (index + 1) % track.samples.length;
    const mix = exact - Math.floor(exact);
    const sample = track.samples[index];
    const next = track.samples[nextIndex];
    return {
        center: sample.center.clone().lerp(next.center, mix),
        tangent: sample.tangent.clone().lerp(next.tangent, mix).normalize(),
        normal: sample.normal.clone().lerp(next.normal, mix).normalize(),
        progress: wrapped
    };
}
export function nearestTrackSample(track, position) {
    let bestIndex = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let index = 0; index < track.samples.length; index += 1) {
        const distanceSq = track.samples[index].center.distanceToSquared(position);
        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestIndex = index;
        }
    }
    const best = track.samples[bestIndex];
    const offset = position.clone().sub(best.center);
    const lateral = offset.dot(best.normal);
    return {
        sample: best,
        distance: Math.sqrt(bestDistanceSq),
        lateral,
        progress: best.progress
    };
}
export function tangentHeading(tangent) {
    return Math.atan2(tangent.x, tangent.z);
}
export function createRoadGeometry(track) {
    const vertices = [];
    const uvs = [];
    const indices = [];
    let distance = 0;
    // Duplicate the closing vertex pair so UVs never interpolate back across the whole lap.
    const repeats = Math.round(track.length / 4);
    for (let index = 0; index <= track.samples.length; index++) {
        const sample = track.samples[index % track.samples.length];
        if (index > 0)
            distance += sample.center.distanceTo(track.samples[index - 1].center);
        const left = sample.center.clone().addScaledVector(sample.normal, TRACK_WIDTH / 2);
        const right = sample.center.clone().addScaledVector(sample.normal, -TRACK_WIDTH / 2);
        vertices.push(left.x, 0.05, left.z, right.x, 0.05, right.z);
        uvs.push(0, distance / track.length * repeats, TRACK_WIDTH / 4, distance / track.length * repeats);
        if (index < track.samples.length) {
            const l = index * 2, r = l + 1, nl = l + 2, nr = l + 3;
            indices.push(l, nr, r, l, nl, nr);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
export function createDashGeometry(track) {
    const vertices = [];
    const indices = [];
    const dashWidth = 0.55;
    const dashLength = 4.6;
    let quad = 0;
    for (let index = 0; index < track.samples.length; index += 12) {
        const sample = track.samples[index];
        const front = sample.center.clone().addScaledVector(sample.tangent, dashLength / 2);
        const back = sample.center.clone().addScaledVector(sample.tangent, -dashLength / 2);
        const leftFront = front.clone().addScaledVector(sample.normal, dashWidth / 2);
        const rightFront = front.clone().addScaledVector(sample.normal, -dashWidth / 2);
        const leftBack = back.clone().addScaledVector(sample.normal, dashWidth / 2);
        const rightBack = back.clone().addScaledVector(sample.normal, -dashWidth / 2);
        vertices.push(leftFront.x, 0.09, leftFront.z, rightFront.x, 0.09, rightFront.z, leftBack.x, 0.09, leftBack.z, rightBack.x, 0.09, rightBack.z);
        const start = quad * 4;
        indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
        quad += 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
