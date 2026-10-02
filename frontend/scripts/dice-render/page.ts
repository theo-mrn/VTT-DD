/**
 * Banc visuel des dés (scripts/dice-render/run.mjs) : les formes de `polyhedra.ts` et leurs
 * chiffres gravés (`engraving.ts`), rendus en vrai WebGL sous plusieurs angles et matières.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ENGRAVING_NORMAL_SCALE,
  engravingTexture,
  injectInk,
  inkUniforms,
} from '@/components/dice/three/engraving';
import { DIE_TYPES, dieShape } from '@/components/dice/three/polyhedra';

declare global {
  interface Window {
    diceBench: { render(o: { width: number; height: number }): void };
  }
}

const SKINS = [
  { body: '#f2ead8', ink: '#1d1a17', metal: 0, rough: 0.35, glow: 0.12 },
  { body: '#c9a24a', ink: '#2a1e0c', metal: 1, rough: 0.28, glow: 0.12 },
  { body: '#5b1420', ink: '#f5d78e', metal: 0, rough: 0.2, glow: 0.12 },
];

window.diceBench = {
  render({ width, height }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1b1d24');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    const key = new THREE.SpotLight(0xffffff, 0.45 * 400, 0, 0.6, 1);
    key.position.set(15, 40, 15);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 200);
    camera.position.set(0, 26, 16);
    camera.lookAt(0, 0, 0);

    SKINS.forEach((skin, row) => {
      DIE_TYPES.forEach((type, col) => {
        const shape = dieShape(type);
        const ink = inkUniforms(skin.ink, skin.glow);
        const mat = new THREE.MeshStandardMaterial({
          color: skin.body,
          metalness: skin.metal,
          roughness: skin.rough,
          normalMap: engravingTexture(type),
          normalScale: ENGRAVING_NORMAL_SCALE,
        });
        mat.onBeforeCompile = (shader) => injectInk(shader, ink);
        const mesh = new THREE.Mesh(shape.geometry, mat);
        mesh.position.set((col - 2.5) * 4.6, 0, (row - 1) * 5);
        // Une face (ou un coin) vers le haut, légèrement penchée vers la caméra
        const top = shape.corners ? shape.corners[0]!.dir : shape.faces[0]!.norm;
        // Face 0 tournée vers la caméra (contrôle du sens des chiffres)
        const toCamera = camera.position.clone().sub(mesh.position).normalize();
        mesh.quaternion.setFromUnitVectors(top, toCamera);
        if (row > 0) {
          mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.35 + row * 0.15);
          mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.4 * (col - 2));
        }
        scene.add(mesh);
      });
    });
    renderer.render(scene, camera);
  },
};
