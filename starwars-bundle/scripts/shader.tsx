// Fabrique un composant React qui rend un fragment shader plein cadre en WebGL pur (aucune
// dépendance : ni three.js ni ogl). Le shader reçoit les uniforms iResolution (vec2) et iTime
// (float, secondes). Nettoyage complet au démontage (rAF, contexte WebGL). Si WebGL indisponible
// ou en erreur, le composant ne rend rien plutôt que de planter (aucune exception ne s'échappe).
import React from 'react';

const VERTEX_SRC = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

// opts.noise : fournit une texture de bruit blanc 256×256 (répétée, filtrée linéaire) au shader via
// `uniform sampler2D iChannel0` — équivalent du DataTexture Shadertoy, pour les ports qui en dépendent.
export function makeShaderBackground(fragmentSrc, opts) {
  return function ShaderBackground() {
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let raf = 0;
      let gl = null;
      try {
        gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
        if (!gl || gl.isContextLost()) return;

        const compile = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          // getShaderInfoLog renvoie souvent '' même sur un shader VALIDE : on ne logge que si le log
          // est réellement non vide (vraie erreur GLSL), pour ne pas polluer avec de faux positifs.
          const log = gl.getShaderInfoLog(s);
          if (log) console.warn('[shader] compile log:', log);
          return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SRC));
        // Bloc de précision standard : highp n'est pas garanti en fragment shader sur tous les GPU.
        const PRECISION = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, PRECISION + fragmentSrc));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          // Généralement dû à un contexte perdu/saturé : on abandonne silencieusement (fond noir).
          return;
        }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const uRes = gl.getUniformLocation(prog, 'iResolution');
        const uTime = gl.getUniformLocation(prog, 'iTime');

        if (opts && opts.noise) {
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          const size = 256; // puissance de 2 : REPEAT autorisé en WebGL1
          const data = new Uint8Array(size * size * 4);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 256) | 0;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.uniform1i(gl.getUniformLocation(prog, 'iChannel0'), 0);
        }

        // false tant que le canvas n'a pas de taille utile (parent pas encore layouté) : dessiner sur
        // un canvas 0×0 déclenche l'icône "image cassée" du navigateur.
        const resize = () => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.round(canvas.clientWidth * dpr);
          const h = Math.round(canvas.clientHeight * dpr);
          if (w < 2 || h < 2) return false;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h;
            gl.viewport(0, 0, w, h);
          }
          gl.uniform2f(uRes, canvas.width, canvas.height);
          return true;
        };

        const start = performance.now();
        const loop = () => {
          if (resize()) {
            gl.uniform1f(uTime, (performance.now() - start) / 1000);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        console.warn('[shader] exception:', err);
      }

      // SURTOUT PAS de WEBGL_lose_context.loseContext() ici : ça tue DÉFINITIVEMENT le contexte du
      // canvas, et React StrictMode (dev) rejoue l'effet sur le MÊME canvas — le 2e passage récupère
      // alors un contexte mort (link FAIL, composant noir). Le navigateur libère le contexte tout
      // seul quand le canvas quitte le DOM ; on n'annule que l'animation.
      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    }, []);

    // backgroundColor opaque : même si WebGL tarde ou échoue, le canvas reste un aplat sombre (jamais
    // l'icône "image cassée"), cohérent avec le fond spatial.
    return React.createElement('canvas', {
      ref: canvasRef,
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', backgroundColor: '#05070d' },
    });
  };
}
