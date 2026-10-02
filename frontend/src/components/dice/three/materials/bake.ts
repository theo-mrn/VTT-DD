/**
 * Cuisson d'un motif de dé dans une cubemap : le shader `fragment` reçoit `vDir` (direction depuis
 * le centre du dé) et écrit la couleur ; rendu une fois (6 faces) depuis l'intérieur d'une sphère.
 * Le dé la lit ensuite par la direction de chaque point : sur un dé convexe, une direction = un
 * point de la surface. Une texture appartient à un contexte WebGL : cache par renderer et clé.
 */
import * as THREE from 'three';

export const BAKE_SIZE = 512;

export const BAKE_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const baked = new WeakMap<THREE.WebGLRenderer, Map<string, THREE.CubeTexture>>();

export function bakeCube(
  gl: THREE.WebGLRenderer,
  key: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
): THREE.CubeTexture {
  let byKey = baked.get(gl);
  if (!byKey) {
    byKey = new Map();
    baked.set(gl, byKey);
  }
  const done = byKey.get(key);
  if (done) return done;
  const target = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader,
    side: THREE.BackSide,
    uniforms,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  const scene = new THREE.Scene();
  scene.add(sphere);
  new THREE.CubeCamera(0.1, 10, target).update(gl, scene);
  sphere.geometry.dispose();
  material.dispose();
  byKey.set(key, target.texture);
  return target.texture;
}
