import * as THREE from 'three';

// Helper for consistent die face values
export const getDieValue = (type: string, index: number) => {
    if (type === 'd4') {
        const val = (index % 4) + 1;
        return val.toString();
    }
    if (type === 'd10') {
        const val = index % 10;
        return val === 0 ? "10" : val.toString();
    }
    if (type === 'd20') {
        // Standard D20 balanced layout matched to Three.js IcosahedronGeometry face order
        // Verified neighbors of 20 (index 1) are 2 (index 0), 14 (index 2), and 8 (index 5)
        const verifiedD20Map = [
            2, 20, 14, 6, 12,
            8, 18, 17, 15, 10,
            5, 19, 1, 7, 9,
            16, 11, 13, 3, 4
        ];
        return (verifiedD20Map[index % 20] || index + 1).toString();
    }
    if (type === 'd6') {
        return (index + 1).toString();
    }
    return (index + 1).toString();
};

// Create beveled geometry for premium look
export const createBeveledGeometry = (type: string) => {
    let geo: THREE.BufferGeometry;
    const detail = 0; // Higher detail for smoother look

    switch (type) {
        case 'd4': geo = new THREE.OctahedronGeometry(1.8, detail); break;
        case 'd6': geo = new THREE.BoxGeometry(2.2, 2.2, 2.2, 2, 2, 2); break;
        case 'd8': geo = new THREE.OctahedronGeometry(1.8, detail); break;
        case 'd10': geo = new THREE.IcosahedronGeometry(1.8, detail); break;
        case 'd12': geo = new THREE.DodecahedronGeometry(1.8, detail); break;
        case 'd20': geo = new THREE.IcosahedronGeometry(1.8, detail); break;
        default: geo = new THREE.BoxGeometry(2.2, 2.2, 2.2, 2, 2, 2);
    }

    if (geo.index !== null) {
        geo = geo.toNonIndexed();
    }
    geo.computeVertexNormals();

    const position = geo.attributes.position;

    // ── Planar per-face UVs ──────────────────────────────────────────────
    // The default polyhedron UVs are spherical and badly distorted, so any
    // textureMap reads as a flat tint. We rebuild UVs by projecting each
    // triangle onto its own face plane, giving a clean per-face texture.
    {
        const uvArray = new Float32Array(position.count * 2);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
        const tangent = new THREE.Vector3(), bitangent = new THREE.Vector3();
        const up = new THREE.Vector3();
        const d = new THREE.Vector3();
        // Texture spans roughly this many world units across a face.
        const uvScale = 1 / 2.2;
        for (let i = 0; i < position.count; i += 3) {
            a.fromBufferAttribute(position, i);
            b.fromBufferAttribute(position, i + 1);
            c.fromBufferAttribute(position, i + 2);
            ab.subVectors(b, a); ac.subVectors(c, a);
            n.crossVectors(ab, ac).normalize();
            // Build a stable tangent frame on the face plane
            up.set(0, 1, 0);
            if (Math.abs(n.dot(up)) > 0.95) up.set(1, 0, 0);
            tangent.crossVectors(up, n).normalize();
            bitangent.crossVectors(n, tangent).normalize();
            for (let k = 0; k < 3; k++) {
                const idx = i + k;
                d.set(position.getX(idx), position.getY(idx), position.getZ(idx)).sub(a);
                uvArray[idx * 2] = 0.5 + d.dot(tangent) * uvScale;
                uvArray[idx * 2 + 1] = 0.5 + d.dot(bitangent) * uvScale;
            }
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }

    const groupedFaces: { normal: THREE.Vector3, centers: THREE.Vector3[], vertices: THREE.Vector3[][] }[] = [];
    for (let i = 0; i < position.count; i += 3) {
        const a = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        const b = new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
        const c = new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));

        const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();

        let found = groupedFaces.find(g => g.normal.dot(normal) > 0.90);
        if (found) {
            found.centers.push(center);
            found.vertices.push([a.clone(), b.clone(), c.clone()]);
        } else {
            groupedFaces.push({ normal, centers: [center], vertices: [[a.clone(), b.clone(), c.clone()]] });
        }
    }

    const trueFaces = groupedFaces.map(g => {
        const avgCenter = new THREE.Vector3();
        g.centers.forEach(c => avgCenter.add(c));
        avgCenter.divideScalar(g.centers.length);

        // Collect unique edge vertices for border decoration
        const allVerts: THREE.Vector3[] = [];
        g.vertices.forEach(tri => {
            tri.forEach(v => {
                if (!allVerts.some(ev => ev.distanceTo(v) < 0.01)) {
                    allVerts.push(v);
                }
            });
        });

        return { pos: avgCenter, norm: g.normal, edgeVerts: allVerts };
    });

    const uniqueVertices: number[][] = [];
    const cannonFaces: number[][] = [];
    const vertMap = new Map<string, number>();

    const getVertIndex = (x: number, y: number, z: number) => {
        const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
        if (vertMap.has(key)) return vertMap.get(key)!;
        const idx = uniqueVertices.length;
        uniqueVertices.push([x, y, z]);
        vertMap.set(key, idx);
        return idx;
    };

    for (let i = 0; i < position.count; i += 3) {
        const i1 = getVertIndex(position.getX(i), position.getY(i), position.getZ(i));
        const i2 = getVertIndex(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
        const i3 = getVertIndex(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
        cannonFaces.push([i1, i2, i3]);
    }

    return {
        vertices: uniqueVertices,
        faces: cannonFaces,
        trueFaces,
        geometry: geo
    };
};

// Global geometry cache — avoids duplicating identical geometries for same die type
const geometryCache = new Map<string, ReturnType<typeof createBeveledGeometry>>();
export const getCachedGeometry = (type: string) => {
    if (!geometryCache.has(type)) {
        geometryCache.set(type, createBeveledGeometry(type));
    }
    return geometryCache.get(type)!;
};
