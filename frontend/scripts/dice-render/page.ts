/**
 * Banc visuel des dés (scripts/dice-render/run.mjs) : les formes de `polyhedra.ts` et leurs
 * chiffres gravés (`engraving.ts`), rendus en vrai WebGL sous plusieurs angles et matières.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ENGRAVING_NORMAL_SCALE,
  engravingTexture,
  highlightRects,
  injectInk,
  inkUniforms,
} from '@/components/dice/three/engraving';
import { DIE_TYPES, dieShape } from '@/components/dice/three/polyhedra';
import { DICE_SKINS } from '@/components/dice/three/dice-definitions';
import { bakeResin, injectResin } from '@/components/dice/three/materials/resin-material';
import { rimShaderColor } from '@/components/dice/three/visual-die';
import { coreRigUniforms, injectCoreRig } from '@/components/dice/three/cores';
import {
  bakedCompile,
  bakeProcedural,
  isBakedSkin,
  liveCompile,
  materialSettings,
  resolveStyleId,
} from '@/components/dice/three/materials/procedural-material';

declare global {
  interface Window {
    diceBench: {
      render(o: {
        width: number;
        height: number;
        resin?: boolean;
        compare?: boolean;
        rim?: boolean;
      }): void;
      cores(o: { width: number; height: number; names: string[] }): Promise<void>;
      orbs(o: { width: number; height: number }): Promise<void>;
      cost(o: {
        size: number;
        frames: number;
        rig?: 'all' | 'main' | 'none' | 'dir';
      }): Record<string, number>;
      textures(o: {
        width: number;
        height: number;
        originals: Record<string, string>;
      }): Promise<void>;
    };
  }
}

/** Série résine : quatre skins de test, une rangée chacun. */
const RESIN = ['resine_marbre', 'resine_nuit', 'resine_fumee', 'resine_jade'];

const SKINS = [
  { body: '#f2ead8', ink: '#1d1a17', metal: 0, rough: 0.35, glow: 0.12 },
  { body: '#c9a24a', ink: '#2a1e0c', metal: 1, rough: 0.28, glow: 0.12 },
  { body: '#5b1420', ink: '#f5d78e', metal: 0, rough: 0.2, glow: 0.12 },
  // Corps moyen et encre blanche : la bordure garde les chiffres lisibles
  { body: '#6f8fc0', ink: '#ffffff', metal: 0.1, rough: 0.3, glow: 0.12 },
];

window.diceBench = {
  /** Coût du motif de chaque style : ms par image, un d20 qui remplit le cadre. */
  cost({ size, frames, rig = 'all' }) {
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(size, size);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const gl = renderer.getContext();
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    // Lumières du lanceur : trois d'ambiance, plus le banc des cœurs d'orbes (éteint, mais
    // toujours dans la scène pour ne jamais recompiler)
    if (rig === 'all' || rig === 'main') {
      const spot = new THREE.SpotLight(0xffffff, 0.45, 0, 0.6, 1);
      spot.position.set(15, 40, 15);
      const spot2 = new THREE.SpotLight(0xffeedd, 0.25, 0, 0.5, 1);
      spot2.position.set(-10, 30, -10);
      const point = new THREE.PointLight(0xfff8e7, 0.25);
      point.position.set(0, 20, 0);
      scene.add(spot, spot2, point);
    }
    if (rig === 'all')
      scene.add(
        new THREE.AmbientLight(0xffffff, 0),
        new THREE.DirectionalLight(0xffffff, 0),
        new THREE.DirectionalLight(0xffffff, 0),
        new THREE.PointLight(0xffffff, 0, 3, 2),
      );
    if (rig === 'dir') {
      const dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(15, 40, 15);
      scene.add(dir);
    }
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    camera.position.set(0, 7.5, 0.01);
    camera.lookAt(0, 0, 0);
    const shape = dieShape('d20');
    const mesh = new THREE.Mesh(shape.geometry);
    scene.add(mesh);
    const engraving = {
      map: engravingTexture('d20'),
      ink: inkUniforms('#ffffff', 0.12, '#000000'),
    };
    const time = (label: string, mat: THREE.Material, tick?: (t: number) => void) => {
      mesh.material = mat;
      const px = new Uint8Array(4);
      const flush = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < 5; i++) {
        tick?.(i);
        renderer.render(scene, camera);
        flush();
      }
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        tick?.(i / 30);
        renderer.render(scene, camera);
        flush();
      }
      // Matière physique (vernis) signalée : son surcoût n'est pas celui du motif
      const varnish = (mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? ' vernis' : '';
      out[label + varnish] = Math.round(((performance.now() - t0) / frames) * 10) / 10;
    };
    const out: Record<string, number> = {};
    const plain = new THREE.MeshStandardMaterial({ color: '#888888', normalMap: engraving.map });
    plain.onBeforeCompile = (sh) => injectInk(sh, engraving.ink);
    time('uni', plain);
    const seen = new Set<number>();
    for (const skin of Object.values(DICE_SKINS)) {
      if (skin.textureMap || skin.resin || skin.effectType === 'orb') continue;
      const id = resolveStyleId(skin);
      if (seen.has(id)) continue;
      seen.add(id);
      const s = materialSettings(skin);
      const mat = s.physical
        ? new THREE.MeshPhysicalMaterial({
            ...s.props,
            clearcoat: s.clearcoat,
            clearcoatRoughness: s.clearcoatRoughness,
          })
        : new THREE.MeshStandardMaterial(s.props);
      mat.normalMap = engraving.map;
      mat.normalScale = ENGRAVING_NORMAL_SCALE;
      const baked = isBakedSkin(skin);
      mat.customProgramCacheKey = () => (baked ? 'proc-baked' : `proc-style-${id}`);
      const u = {
        uTime: { value: 0 },
        uAccent: { value: new THREE.Color(skin.edgeColor) },
        uDeep: { value: new THREE.Color(skin.bodyColor).multiplyScalar(0.45) },
        uSeed: { value: 0.3 },
        uFlash1: { value: 0 },
        uFlash2: { value: 0 },
        uSeed1: { value: 0 },
        uSeed2: { value: 0 },
        uSurge: { value: 0 },
      };
      mat.onBeforeCompile = baked
        ? bakedCompile(bakeProcedural(renderer, skin), engraving)
        : liveCompile(id, u, engraving);
      time(`${id} ${skin.procStyle ?? skin.effectType}${baked ? ' (cuit)' : ''}`, mat, (t) => {
        u.uTime.value = t;
      });
    }
    return out;
  },
  /** Skins à texture : texture d'origine (à gauche) et WebP 512 px (à droite). */
  async textures({ width, height, originals }) {
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
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 200);
    camera.position.set(0, 46, 0.01);
    camera.lookAt(0, 0, 0);
    const loader = new THREE.TextureLoader();
    const shape = dieShape('d20');
    const skins = Object.values(DICE_SKINS).filter((k) => k.textureMap);
    for (const [i, skin] of skins.entries())
      for (const [k, url] of [originals[skin.textureMap!] ?? '', skin.textureMap!].entries()) {
        const map = await loader.loadAsync(url);
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.anisotropy = 8;
        const mat = new THREE.MeshStandardMaterial({
          map,
          color: skin.tintTexture ? skin.bodyColor : '#ffffff',
          metalness: skin.metalness,
          roughness: skin.roughness,
          envMapIntensity: skin.envMapIntensity,
        });
        const mesh = new THREE.Mesh(shape.geometry, mat);
        const col = i % 5;
        const row = Math.floor(i / 5);
        mesh.position.set((col - 2) * 6.6 + (k - 0.5) * 3.2, 0, (row - 1.5) * 4.4);
        mesh.quaternion.setFromUnitVectors(shape.faces[0]!.norm, new THREE.Vector3(0, 1, 0));
        mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.5);
        scene.add(mesh);
      }
    renderer.render(scene, camera);
  },
  /** Cœurs d'orbes : modèle d'origine (à gauche) et optimisé (à droite), à la même taille. */
  /** Orbes à modèle : lumières du cœur dans la scène (à gauche), dans son shader (à droite). */
  async orbs({ width, height }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setScissorTest(true);
    renderer.autoClear = false;
    document.body.appendChild(renderer.domElement);
    renderer.setClearColor('#1b1d24');
    renderer.clear();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const shape = dieShape('d20');
    const skins = Object.values(DICE_SKINS).filter((k) => k.coreType === 'model');
    const cell = Math.floor(width / 8);
    for (const [i, skin] of skins.entries()) {
      const gltf = await loader.loadAsync(skin.coreModelUrl!);
      for (const k of [0, 1]) {
        const scene = new THREE.Scene();
        scene.environment = env;
        scene.environmentIntensity = 0.55;
        scene.add(new THREE.AmbientLight(0xffffff, 1.05));
        const spot = new THREE.SpotLight(0xffffff, 0.45, 0, 0.6, 1);
        spot.position.set(15, 40, 15);
        const spot2 = new THREE.SpotLight(0xffeedd, 0.25, 0, 0.5, 1);
        spot2.position.set(-10, 30, -10);
        const point = new THREE.PointLight(0xfff8e7, 0.25);
        point.position.set(0, 20, 0);
        scene.add(spot, spot2, point);
        // Caméra du lanceur (vue de dessus), orbe sous elle
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
        camera.position.set(0, 5.2, 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const rig = k === 1 ? coreRigUniforms(skin.coreColor || '#ffffff') : undefined;
        const glass = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(skin.shellColor || skin.bodyColor).multiplyScalar(0.45),
          roughness: 0.06,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: skin.envMapIntensity,
          transparent: true,
          opacity: (skin.shellOpacity ?? 0.25) * 0.6,
          depthWrite: false,
          normalMap: engravingTexture('d20'),
          normalScale: ENGRAVING_NORMAL_SCALE,
        });
        const ink = inkUniforms('#ffffff', 1, '#000000', { glass: true });
        glass.onBeforeCompile = (sh) => {
          injectInk(sh, ink);
          if (rig) injectCoreRig(sh, rig);
        };
        glass.customProgramCacheKey = () => (rig ? 'orb-shell-rig' : 'orb-shell');
        const shell = new THREE.Mesh(shape.geometry, glass);
        shell.renderOrder = 10;
        shell.quaternion.setFromUnitVectors(shape.faces[0]!.norm, new THREE.Vector3(0, 1, 0));
        shell.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.4);
        scene.add(shell);
        // Cœur tourné vers la caméra, normalisé comme dans `ModelCore`
        const core = new THREE.Group();
        core.quaternion.copy(camera.quaternion);
        core.scale.setScalar(skin.coreScale ?? 1);
        const model = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const sc = ((skin.coreScale ?? 1) * 2.1) / (Math.max(size.x, size.y, size.z) || 1);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(sc));
        model.scale.setScalar(sc);
        const tilt = new THREE.Group();
        tilt.rotation.set(...((skin.coreRotation ?? [0, 0, 0]) as [number, number, number]));
        tilt.add(model);
        core.add(tilt);
        scene.add(core);
        core.updateMatrixWorld(true);
        if (rig) {
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const lit = (m: THREE.Material) => {
              const c = m.clone();
              c.onBeforeCompile = (sh) => injectCoreRig(sh, rig);
              c.customProgramCacheKey = () => 'core-rig';
              return c;
            };
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map(lit)
              : lit(mesh.material);
          });
          rig.uCorePoint.value
            .set(0, 0, 2)
            .applyMatrix4(core.matrixWorld)
            .applyMatrix4(camera.matrixWorldInverse);
        } else {
          // Ancien banc : lumières de la scène placées dans le repère du cœur
          const at = (v: [number, number, number]) =>
            new THREE.Vector3(...v).applyMatrix4(core.matrixWorld);
          scene.add(new THREE.AmbientLight(0xffffff, 1.4));
          const key = new THREE.DirectionalLight(0xffffff, 2.5);
          key.position.copy(at([2, 3, 4]));
          const fill = new THREE.DirectionalLight(skin.coreColor || '#ffffff', 1.5);
          fill.position.copy(at([-3, 1, 2]));
          const p = new THREE.PointLight(0xffffff, 2, 6, 2);
          p.position.copy(at([0, 0, 2]));
          scene.add(key, fill, p);
        }
        const x = (i % 4) * cell * 2 + k * cell;
        const y = height - (Math.floor(i / 4) + 1) * cell;
        renderer.setViewport(x, y, cell, cell);
        renderer.setScissor(x, y, cell, cell);
        renderer.render(scene, camera);
      }
    }
  },
  async cores({ width, height, names }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1b1d24');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 200);
    camera.position.set(0, 3, 31);
    camera.lookAt(0, 0, 0);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    for (const [i, name] of names.entries())
      for (const [k, dir] of ['legacy3d', '3d'].entries()) {
        const gltf = await loader.loadAsync(`/${dir}/${name}.glb`);
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3()).length();
        model.scale.setScalar(2.4 / size);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(2.4 / size);
        model.position.set(
          ((i % 4) - 1.5) * 6.2 + (k - 0.5) * 2.6 - center.x,
          (i < 4 ? 2.3 : -2.3) - center.y,
          -center.z,
        );
        model.rotation.y = 0.5;
        scene.add(model);
      }
    renderer.render(scene, camera);
  },
  render({ width, height, resin = false, compare = false, rim = false }) {
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

    if (rim) {
      // Halo : avant (second dé transparent autour) / après (Fresnel dans le shader) ; dernière
      // rangée : orbe, verre à transmission / verre simulé
      const skins = Object.values(DICE_SKINS)
        .filter((k) => k.rimLight && !k.textureMap && !k.resin && k.effectType !== 'orb')
        .slice(0, 9);
      const shape = dieShape('d20');
      const body = (skin: (typeof skins)[number], withRim: boolean) => {
        const s = materialSettings(skin);
        const mat = s.physical
          ? new THREE.MeshPhysicalMaterial({
              ...s.props,
              clearcoat: s.clearcoat,
              clearcoatRoughness: s.clearcoatRoughness,
            })
          : new THREE.MeshStandardMaterial(s.props);
        mat.normalMap = engravingTexture('d20');
        mat.normalScale = ENGRAVING_NORMAL_SCALE;
        const engraving = {
          map: engravingTexture('d20'),
          ink: inkUniforms(
            skin.textColor,
            0.12,
            skin.shadowColor,
            withRim ? { rim: rimShaderColor(skin) } : {},
          ),
        };
        const baked = isBakedSkin(skin);
        mat.customProgramCacheKey = () =>
          baked ? 'proc-baked' : `proc-style-${resolveStyleId(skin)}`;
        if (baked) mat.onBeforeCompile = bakedCompile(bakeProcedural(renderer, skin), engraving);
        else {
          const u = {
            uTime: { value: 0 },
            uAccent: { value: new THREE.Color(skin.edgeColor) },
            uDeep: { value: new THREE.Color(skin.bodyColor).multiplyScalar(0.45) },
            uSeed: { value: 0.3 },
            uFlash1: { value: 0 },
            uFlash2: { value: 0 },
            uSeed1: { value: 0 },
            uSeed2: { value: 0 },
            uSurge: { value: 0 },
          };
          mat.onBeforeCompile = liveCompile(resolveStyleId(skin), u, engraving);
        }
        return mat;
      };
      camera.position.set(0, 46, 0.01);
      camera.lookAt(0, 0, 0);
      const place = (m: THREE.Object3D, i: number, k: number) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        m.position.set((col - 1.5) * 8.2 + (k - 0.5) * 3.8, 0, (row - 1.5) * 4.6);
        m.quaternion.setFromUnitVectors(shape.faces[0]!.norm, new THREE.Vector3(0, 1, 0));
        m.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.5);
        scene.add(m);
      };
      skins.forEach((skin, i) => {
        // Avant : corps + second dé transparent (BackSide, 1,02), comme l'ancien VisualDie
        const before = new THREE.Group();
        before.add(new THREE.Mesh(shape.geometry, body(skin, false)));
        const rimC = new THREE.Color(skin.rimLightColor);
        const emissive = rimC.clone().multiplyScalar(0.5);
        if (skin.innerGlow && skin.innerGlowIntensity > 0)
          emissive.add(
            new THREE.Color(skin.innerGlowColor)
              .multiply(rimC)
              .multiplyScalar(skin.innerGlowIntensity / Math.PI),
          );
        const shell = new THREE.Mesh(
          shape.geometry,
          new THREE.MeshStandardMaterial({
            color: skin.rimLightColor,
            emissive,
            metalness: 0,
            roughness: 1,
            transparent: true,
            opacity: 0.25,
            side: THREE.BackSide,
          }),
        );
        shell.scale.setScalar(1.02);
        before.add(shell);
        place(before, i, 0);
        place(new THREE.Mesh(shape.geometry, body(skin, true)), i, 1);
      });
      // Orbe : cœur lumineux dans une coque, transmission (avant) / verre simulé (après)
      const orb = Object.values(DICE_SKINS).find((k) => k.effectType === 'orb')!;
      [false, true].forEach((simulated, k) => {
        const g = new THREE.Group();
        g.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 32, 16),
            new THREE.MeshBasicMaterial({ color: orb.coreColor ?? orb.edgeColor }),
          ),
        );
        const shellMat = simulated
          ? new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(orb.shellColor ?? orb.bodyColor).multiplyScalar(0.45),
              roughness: 0.06,
              clearcoat: 1,
              clearcoatRoughness: 0.04,
              transparent: true,
              opacity: (orb.shellOpacity ?? 0.25) * 0.6,
              depthWrite: false,
              normalMap: engravingTexture('d20'),
              normalScale: ENGRAVING_NORMAL_SCALE,
            })
          : new THREE.MeshPhysicalMaterial({
              color: orb.shellColor ?? orb.bodyColor,
              roughness: 0.08,
              transmission: 1,
              thickness: orb.shellThickness ?? 1.8,
              ior: 1.45,
              attenuationColor: orb.shellColor ?? orb.bodyColor,
              attenuationDistance: orb.shellTintDistance ?? 2.5,
              clearcoat: 1,
              clearcoatRoughness: 0.04,
              transparent: true,
              depthWrite: false,
              normalMap: engravingTexture('d20'),
              normalScale: ENGRAVING_NORMAL_SCALE,
            });
        const ink = inkUniforms('#ffffff', 1, '#000000', { glass: simulated });
        shellMat.onBeforeCompile = (shader) => injectInk(shader, ink);
        const shellMesh = new THREE.Mesh(shape.geometry, shellMat);
        shellMesh.renderOrder = 10;
        g.add(shellMesh);
        place(g, skins.length + (skins.length % 4 ? 4 - (skins.length % 4) : 0), k);
      });
      renderer.render(scene, camera);
      return;
    }

    if (compare) {
      // Avant (motif calculé en direct, sans vernis) / après (motif cuit, vernis des marbres)
      const skins = Object.values(DICE_SKINS).filter(isBakedSkin);
      const shape = dieShape('d20');
      const geometry = shape.geometry;
      const live = (skin: (typeof skins)[number], baked: boolean) => {
        const s = materialSettings(baked ? skin : { ...skin, varnish: false });
        const params = {
          ...s.props,
          normalMap: engravingTexture('d20'),
          normalScale: ENGRAVING_NORMAL_SCALE,
        };
        const mat = s.physical
          ? new THREE.MeshPhysicalMaterial({
              ...params,
              clearcoat: s.clearcoat,
              clearcoatRoughness: s.clearcoatRoughness,
            })
          : new THREE.MeshStandardMaterial(params);
        const engraving = {
          map: engravingTexture('d20'),
          ink: inkUniforms(skin.textColor, 0.12, skin.shadowColor),
        };
        // Clé de programme explicite, comme l'app : sans elle, three reconnaît le programme à
        // son code source, identique pour tous les styles (ils partageraient le premier)
        mat.customProgramCacheKey = () =>
          baked ? 'proc-baked' : `proc-style-${resolveStyleId(skin)}`;
        if (baked) mat.onBeforeCompile = bakedCompile(bakeProcedural(renderer, skin), engraving);
        else {
          const u = {
            uTime: { value: 0 },
            uAccent: { value: new THREE.Color(skin.edgeColor) },
            uDeep: { value: new THREE.Color(skin.bodyColor).multiplyScalar(0.45) },
            uSeed: { value: 0 },
            uFlash1: { value: 0 },
            uFlash2: { value: 0 },
            uSeed1: { value: 0 },
            uSeed2: { value: 0 },
            uSurge: { value: 0 },
          };
          let h = 2166136261;
          for (let i = 0; i < skin.id.length; i++) {
            h ^= skin.id.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          u.uSeed.value = ((h >>> 0) % 1000) / 1000;
          mat.onBeforeCompile = liveCompile(resolveStyleId(skin), u, engraving);
        }
        return mat;
      };
      camera.position.set(0, 46, 0.01);
      camera.lookAt(0, 0, 0);
      skins.forEach((skin, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        [false, true].forEach((baked, k) => {
          const mesh = new THREE.Mesh(geometry, live(skin, baked));
          mesh.position.set((col - 1.5) * 8.2 + (k - 0.5) * 3.8, 0, (row - 2) * 4.4);
          mesh.quaternion.setFromUnitVectors(shape.faces[0]!.norm, new THREE.Vector3(0, 1, 0));
          mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.5);
          scene.add(mesh);
        });
      });
      renderer.render(scene, camera);
      return;
    }

    if (resin) {
      RESIN.forEach((id, row) => {
        const skin = DICE_SKINS[id]!;
        const texture = bakeResin(renderer, id, skin.resin!);
        DIE_TYPES.forEach((type, col) => {
          const shape = dieShape(type);
          const ink = inkUniforms(skin.textColor, 0.12, skin.shadowColor);
          if (col === 5) {
            ink.uHiRects.value = highlightRects(type, shape.faces[0]!.value);
            ink.uHiAmount.value = 1;
          }
          const mat = new THREE.MeshPhysicalMaterial({
            metalness: skin.metalness,
            roughness: skin.roughness,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            normalMap: engravingTexture(type),
            normalScale: ENGRAVING_NORMAL_SCALE,
          });
          mat.onBeforeCompile = (shader) => {
            injectInk(shader, ink);
            injectResin(shader, texture);
          };
          const mesh = new THREE.Mesh(shape.geometry, mat);
          mesh.position.set((col - 2.5) * 4.6, 0, (row - 1.5) * 4.6);
          const top = shape.corners ? shape.corners[0]!.dir : shape.faces[0]!.norm;
          mesh.quaternion.setFromUnitVectors(top, new THREE.Vector3(0, 1, 0));
          mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.55);
          mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.4 * (col - 2) + row);
          scene.add(mesh);
        });
      });
      renderer.render(scene, camera);
      return;
    }

    SKINS.forEach((skin, row) => {
      DIE_TYPES.forEach((type, col) => {
        const shape = dieShape(type);
        const ink = inkUniforms(skin.ink, skin.glow, '#05070d');
        const mat = new THREE.MeshStandardMaterial({
          color: skin.body,
          metalness: skin.metal,
          roughness: skin.rough,
          normalMap: engravingTexture(type),
          normalScale: ENGRAVING_NORMAL_SCALE,
        });
        mat.onBeforeCompile = (shader) => injectInk(shader, ink);
        // Dernière rangée : chiffre retenu doré (face ou coin tourné vers la caméra)
        if (row !== 1) {
          ink.uHiRects.value = highlightRects(
            type,
            shape.corners ? shape.corners[0]!.value : shape.faces[0]!.value,
          );
          ink.uHiAmount.value = 1;
        }
        const mesh = new THREE.Mesh(shape.geometry, mat);
        mesh.position.set((col - 2.5) * 4.6, 0, (row - 1.5) * 4.6);
        // Une face (ou un coin) vers le haut, légèrement penchée vers la caméra
        const top = shape.corners ? shape.corners[0]!.dir : shape.faces[0]!.norm;
        // Face 0 tournée vers la caméra (contrôle du sens des chiffres)
        const toCamera = camera.position.clone().sub(mesh.position).normalize();
        mesh.quaternion.setFromUnitVectors(top, toCamera);
        if (row === 1) {
          mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.35 + row * 0.15);
          mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.4 * (col - 2));
        }
        scene.add(mesh);
      });
    });
    renderer.render(scene, camera);
  },
};
