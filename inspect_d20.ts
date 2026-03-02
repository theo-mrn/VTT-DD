import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(1.8, 0);
geo.toNonIndexed();
const position = geo.attributes.position;

const faces = [];
for (let i = 0; i < position.count; i += 3) {
    const v1 = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
    const v2 = new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
    const v3 = new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));

    const center = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);
    const normal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(v2, v1),
        new THREE.Vector3().subVectors(v3, v1)
    ).normalize();

    faces.push({
        index: i / 3,
        center: { x: center.x, y: center.y, z: center.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        vertices: [
            { x: v1.x, y: v1.y, z: v1.z },
            { x: v2.x, y: v2.y, z: v2.z },
            { x: v3.x, y: v3.y, z: v3.z }
        ]
    });
}

// Find neighbors
const areNeighbors = (f1, f2) => {
    let shared = 0;
    for (const v1 of f1.vertices) {
        for (const v2 of f2.vertices) {
            if (Math.abs(v1.x - v2.x) < 0.01 && Math.abs(v1.y - v2.y) < 0.01 && Math.abs(v1.z - v2.z) < 0.01) {
                shared++;
            }
        }
    }
    return shared >= 2;
};

const results = faces.map(f => {
    const neighbors = faces.filter(other => other.index !== f.index && areNeighbors(f, other)).map(n => n.index);
    return {
        index: f.index,
        y: f.center.y,
        normal: f.normal,
        neighbors
    };
});

// Sort by Y desc to find top faces
results.sort((a, b) => b.y - a.y);

console.log(JSON.stringify(results, null, 2));
