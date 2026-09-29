/* =========================================================
   3D コースシーン（Three.js）
   - hero   : ホーム画面のカメラワーク（ティー → フェアウェイ → グリーン）
   - explore: コース図鑑。ドラッグで回転し、各エリアの名前をタップして学ぶ
   ========================================================= */
(function () {
  'use strict';

  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = () => window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;

  /* ---------- ホールのレイアウト（単位: m）：コースごとに applyLayout() で差し替える ---------- */
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let TEE_Z = 124, GREEN_Z = -122, GX = 0, CUP = { x: 0, z: 0 };
  let FW = { z0: 88, z1: -104 };
  let cx = () => 0;
  let green, bunkers, pond, TEES, HOLES, C, RELIEF = 1, DUNE = 0, TREES;

  function blobSd(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const u = (dx * c + dz * s) / b.rx, v = (-dx * s + dz * c) / b.ry;
    const r = Math.sqrt(u * u + v * v);
    const th = Math.atan2(v, u);
    const w = 1 + b.w * Math.sin(3 * th + b.p) + b.w * 0.5 * Math.sin(5 * th + b.p * 2);
    return (w - r) * Math.min(b.rx, b.ry);
  }
  function fairwayWidth(z) { return 36 + (27 - 36) * smooth(-40, -100, z); }
  function fairwaySd(x, z) {
    const mid = (FW.z0 + FW.z1) / 2, half = (FW.z0 - FW.z1) / 2;
    const u = Math.min(1, Math.abs((z - mid) / half));
    const f = Math.pow(1 - Math.pow(u, 6), 1 / 6);
    return (fairwayWidth(z) / 2) * f - Math.abs(x - cx(z)) - (u >= 1 ? 30 : 0);
  }
  // ティーは2つ：バックティー（1・3ホール目）と、ショートホール用ティー（2ホール目）
  const teeBoxSd = (t, x, z) => Math.min(t.hw - Math.abs(x - t.x), t.hd - Math.abs(z - t.z));
  const teeSd = (x, z) => Math.max(teeBoxSd(TEES[0], x, z), teeBoxSd(TEES[1], x, z));
  const pathX = (z) => cx(z) - 44 + 6 * Math.sin(z * 0.03);
  const pathSd = (x, z) => (z > 135 || z < -170) ? -99 : 1.6 - Math.abs(x - pathX(z));

  function height(x, z, noTee) {
    const d = x - cx(z), ad = Math.abs(d);
    let h = 0.9 * Math.sin(x * 0.035 + 0.7) * Math.cos(z * 0.028) + 0.6 * Math.sin(z * 0.05 + x * 0.013);
    h += smooth(38, 95, ad) * (4 + 2 * Math.sin(z * 0.031 + (d > 0 ? 2 : 0)));
    h *= RELIEF;
    if (DUNE) h += DUNE * (Math.sin(x * 0.09 + z * 0.05) * Math.cos(z * 0.08 - x * 0.03) + 0.4) * smooth(14, 44, ad);
    h += smooth(150, 320, ad) * 30;
    h += smooth(150, 330, -z) * 26 + smooth(170, 330, z) * 18;
    const fm = smooth(-6, 8, fairwaySd(x, z));
    h *= 1 - 0.55 * fm;
    const gm = smooth(-9, 2, blobSd(green, x, z));
    if (gm > 0) {
      const gh = 1.2 + (x - GX) * 0.018 - (z - GREEN_Z) * 0.012 +
        0.25 * Math.sin((x - GX) * 0.2) * Math.cos((z - GREEN_Z) * 0.18);
      h = h * (1 - gm) + gh * gm;
    }
    if (!noTee) for (const t of TEES) {
      const tm = smooth(-3, 0.5, teeBoxSd(t, x, z));
      if (tm > 0) {
        if (t.h == null) t.h = height(t.x, t.z, true) + 0.5;
        h = h * (1 - tm) + t.h * tm;
      }
    }
    for (const b of bunkers) {
      const sd = blobSd(b, x, z);
      if (sd > -6) h -= 0.9 * smooth(-0.8, 1.6, sd) - 0.25 * smooth(-5, -1, sd) * (1 - smooth(-1, 1, sd));
    }
    const pm = smooth(-4, 3, blobSd(pond, x, z));
    h = h * (1 - pm) - 2.4 * pm;
    return h;
  }
  const WATER_Y = -0.75;

  /* ---------- 乱数・ノイズ ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(ix, iz) {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /* ---------- 芝のテクスチャ（Canvas に 1 ピクセルずつ塗る） ---------- */
  const TEX = { x0: -170, z0: -200, size: 380 };
  function paintTexture(THREE, N) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(N, N);
    const data = img.data;
    const px = TEX.size / N;
    let r, g, b;
    const mix = (col, t) => { r += (col[0] - r) * t; g += (col[1] - g) * t; b += (col[2] - b) * t; };
    for (let j = 0; j < N; j++) {
      const z = TEX.z0 + (j + 0.5) * px;
      const stripeF = Math.max(-1, Math.min(1, Math.sin(z * Math.PI / 9) * 5)) * 0.5 + 0.5;
      const nearGreen = Math.abs(z - GREEN_Z) < 30;
      for (let i = 0; i < N; i++) {
        const x = TEX.x0 + (i + 0.5) * px;
        const n1 = vnoise(x * 0.07, z * 0.07), n2 = vnoise(x * 0.45 + 50, z * 0.45);
        const nn = n1 * 0.65 + n2 * 0.35;
        r = C.rough[0]; g = C.rough[1]; b = C.rough[2];
        const shade = 0.82 + nn * 0.34;
        r *= shade; g *= shade; b *= shade;

        const fsd = fairwaySd(x, z);
        if (fsd > -6) {
          mix(C.cut, smooth(-5.5, -4.5, fsd));
          if (fsd > -0.6) {
            const fw = [C.fwB[0] + (C.fwA[0] - C.fwB[0]) * stripeF, C.fwB[1] + (C.fwA[1] - C.fwB[1]) * stripeF, C.fwB[2] + (C.fwA[2] - C.fwB[2]) * stripeF];
            const k = 0.94 + nn * 0.1;
            mix([fw[0] * k, fw[1] * k, fw[2] * k], smooth(-0.5, 0.5, fsd));
          }
        }
        const psd = pathSd(x, z);
        if (psd > -1) mix(C.path, smooth(-0.3, 0.3, psd) * (0.9 + n2 * 0.1));
        const tsd = teeSd(x, z);
        if (tsd > -1) {
          const t = Math.sin(x * Math.PI / 3) > 0 ? C.teeA : C.teeB;
          mix(t, smooth(-0.3, 0.3, tsd));
        }
        if (nearGreen) {
          const gsd = blobSd(green, x, z);
          if (gsd > -3) {
            mix(C.collar, smooth(-2.6, -2.0, gsd));
            const chk = Math.sin((x + z) * Math.PI / 3.2) * Math.sin((x - z) * Math.PI / 3.2) > 0;
            mix(chk ? C.grA : C.grB, smooth(-0.3, 0.3, gsd));
          }
        }
        for (let k = 0; k < bunkers.length; k++) {
          const bk = bunkers[k];
          if (Math.abs(x - bk.x) > 14 || Math.abs(z - bk.z) > 14) continue;
          const bsd = blobSd(bk, x, z);
          if (bsd > -1.5) {
            mix([r * 0.78, g * 0.78, b * 0.78], smooth(-1.4, -0.4, bsd) * (1 - smooth(-0.2, 0.2, bsd)));
            const sk = 0.93 + n2 * 0.1 - 0.08 * (1 - smooth(0, 1.6, bsd));
            mix([C.sand[0] * sk, C.sand[1] * sk, C.sand[2] * sk], smooth(-0.2, 0.2, bsd));
          }
        }
        if (Math.abs(x - pond.x) < 45 && Math.abs(z - pond.z) < 45) {
          const wsd = blobSd(pond, x, z);
          if (wsd > -5) mix(C.bed, smooth(-4, 0, wsd) * 0.85);
        }
        const o = (j * N + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.anisotropy = 8;
    return tex;
  }

  /* ---------- 地形メッシュ（中央は細かく、外側は粗く） ---------- */
  function buildTerrain(THREE, tex) {
    const SEG = isSmall() ? 180 : 240;
    const XC = 20, ZC = -5;
    const g = (s) => 200 * s + Math.sign(s) * Math.pow(Math.max(0, Math.abs(s) - 0.72), 2) * 7000;
    const verts = (SEG + 1) * (SEG + 1);
    const pos = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
    let p = 0, q = 0;
    for (let j = 0; j <= SEG; j++) {
      const z = ZC + g(j / SEG * 2 - 1);
      for (let i = 0; i <= SEG; i++) {
        const x = XC + g(i / SEG * 2 - 1);
        pos[p++] = x; pos[p++] = height(x, z); pos[p++] = z;
        uv[q++] = (x - TEX.x0) / TEX.size; uv[q++] = (z - TEX.z0) / TEX.size;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildWater(THREE) {
    const shape = new THREE.Shape();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const th = i / steps * Math.PI * 2;
      // 輪郭を少し外側に広げ、岸の下に隠す
      const w = 1 + pond.w * Math.sin(3 * th + pond.p) + pond.w * 0.5 * Math.sin(5 * th + pond.p * 2);
      const u = Math.cos(th) * (w + 0.12) * pond.rx, v = Math.sin(th) * (w + 0.12) * pond.ry;
      const c = Math.cos(pond.rot), s = Math.sin(pond.rot);
      const x = pond.x + u * c - v * s, z = pond.z + u * s + v * c;
      if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    }
    const geo = new THREE.ShapeGeometry(shape, 8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x2c6f86, roughness: 0.06, metalness: 0.0, transmission: 0, clearcoat: 1,
      transparent: true, opacity: 0.92, envMapIntensity: 1.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = WATER_Y;
    mesh.receiveShadow = true;
    return mesh;
  }

  function segDist(x, z, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - ax - vx * t, z - az - vz * t);
  }

  function buildTrees(THREE) {
    const rand = rng(TREES.seed);
    const list = [];
    const ok = (x, z) => {
      if (blobSd(pond, x, z) > -7) return false;
      if (blobSd(green, x, z) > -13) return false;
      if (teeSd(x, z) > -9) return false;
      if (segDist(x, z, TEES[1].x, TEES[1].z, GX, GREEN_Z) < 16) return false;
      if (Math.hypot(x - TEES[1].x, z - TEES[1].z) < 24) return false;
      if (pathSd(x, z) > -3.5) return false;
      if (fairwaySd(x, z) > -14) return false;
      for (const b of bunkers) if (blobSd(b, x, z) > -6) return false;
      for (const t of list) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 30) return false;
      return true;
    };
    let tries = 0;
    const target = Math.round(TREES.n * (isSmall() ? 0.7 : 1));
    while (list.length < target && tries < 6000) {
      tries++;
      let x, z;
      if (rand() < 0.15 * TREES.back) { z = -150 - rand() * 90; x = GX + (rand() * 2 - 1) * 110; }
      else {
        z = -160 + rand() * 360;
        const side = rand() < 0.5 ? -1 : 1;
        const d = TREES.near + Math.pow(rand(), 1.6) * 110;
        x = cx(z) + side * d;
      }
      if (!ok(x, z)) continue;
      list.push({ x, z, s: 0.85 + rand() * 0.8, type: rand() < TREES.cone ? 'cone' : 'round', r: rand(), r2: rand() });
    }
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const coneGeo = new THREE.ConeGeometry(1, 1, 8);
    coneGeo.translate(0, 0.5, 0);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 0.9 });
    const rounds = list.filter(t => t.type === 'round');
    const cones = list.filter(t => t.type === 'cone');
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, rounds.length * 2);
    const coneMesh = new THREE.InstancedMesh(coneGeo, leafMat, cones.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const palette = TREES.cols;
    const col = new THREE.Color();
    let ti = 0, ci = 0, ki = 0;
    for (const t of list) {
      const y = height(t.x, t.z) - 0.2;
      const s = t.s;
      const trunkH = t.type === 'cone' ? 2.2 * s : 3.2 * s;
      q.setFromAxisAngle(up, t.r * Math.PI * 2);
      m.compose(ps.set(t.x, y, t.z), q, sc.set(s, trunkH, s));
      trunks.setMatrixAt(ti++, m);
      col.setHex(palette[Math.floor(t.r2 * palette.length)]);
      if (t.type === 'round') {
        const R = 3.4 * s;
        m.compose(ps.set(t.x, y + trunkH + R * 0.75, t.z), q, sc.set(R, R * 0.92, R));
        crowns.setMatrixAt(ci, m); crowns.setColorAt(ci++, col);
        const R2 = R * 0.7;
        m.compose(ps.set(t.x + R * 0.5 * Math.cos(t.r * 9), y + trunkH + R * 1.45, t.z + R * 0.5 * Math.sin(t.r * 9)), q, sc.set(R2, R2, R2));
        crowns.setMatrixAt(ci, m); crowns.setColorAt(ci++, col.clone().offsetHSL(0, 0, 0.03));
      } else {
        const Hc = 11 * s, Rc = 2.9 * s;
        m.compose(ps.set(t.x, y + trunkH * 0.6, t.z), q, sc.set(Rc, Hc, Rc));
        coneMesh.setMatrixAt(ki, m); coneMesh.setColorAt(ki++, col.clone().offsetHSL(0.01, 0.05, -0.04));
      }
    }
    for (const mesh of [trunks, crowns, coneMesh]) {
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
    return group;
  }

  function buildStakes(THREE) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.18, 1.3, 0.18);
    geo.translate(0, 0.65, 0);
    const make = (color, pts) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), pts.length);
      const m = new THREE.Matrix4();
      pts.forEach((p, i) => { m.makeTranslation(p[0], height(p[0], p[1]) - 0.1, p[1]); mesh.setMatrixAt(i, m); });
      mesh.castShadow = true;
      group.add(mesh);
    };
    const ob = [];
    for (let z = 140; z > -175; z -= 16) { ob.push([cx(z) - 72, z]); ob.push([cx(z) + 86, z]); }
    make(0xf4f4f0, ob);
    const red = [];
    for (let i = 0; i < 40; i++) {
      const th = i / 40 * Math.PI * 2;
      const w = 1 + pond.w * Math.sin(3 * th + pond.p) + pond.w * 0.5 * Math.sin(5 * th + pond.p * 2);
      const u = Math.cos(th) * (w + 0.22) * pond.rx, v = Math.sin(th) * (w + 0.22) * pond.ry;
      const c = Math.cos(pond.rot), s = Math.sin(pond.rot);
      red.push([pond.x + u * c - v * s, pond.z + u * s + v * c]);
    }
    make(0xd8322b, red);
    // 残り150ヤードの目安杭
    const z150 = GREEN_Z + 137;
    const x150 = cx(z150) - fairwayWidth(z150) / 2 - 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
    post.position.set(x150, height(x150, z150) + 0.8, z150);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5 }));
    cap.position.set(x150, height(x150, z150) + 1.45, z150);
    post.castShadow = cap.castShadow = true;
    group.add(post, cap);
    return { group, marker150: new THREE.Vector3(x150, height(x150, z150) + 2, z150) };
  }

  function buildFlag(THREE) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 10), new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 }));
    pole.position.set(0, 2.5, 0);
    pole.castShadow = true;
    const flagGeo = new THREE.PlaneGeometry(2.2, 1.4, 16, 6);
    flagGeo.translate(1.1, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.7, side: THREE.DoubleSide }));
    flag.position.set(0.05, 4.25, 0);
    flag.rotation.y = -0.5;
    flag.castShadow = true;
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0x0b0f0c }));
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(0, 0.03, 0);
    group.add(pole, flag, cup);
    const base = flagGeo.attributes.position.array.slice();
    const api = {
      group, pole, flagMesh: flag,
      top: new THREE.Vector3(),
      setPin(x, z) {
        const gy = height(x, z);
        group.position.set(x, gy, z);
        api.top.set(x, gy + 5.2, z);
      },
      setWind(angle) { flag.rotation.y = angle; },
      wave(t) {
        const arr = flagGeo.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          const x = base[i];
          arr[i + 2] = Math.sin(x * 2.4 - t * 4.2) * 0.2 * (x / 2.2) + Math.sin(x * 5 - t * 7) * 0.04 * (x / 2.2);
          arr[i + 1] = base[i + 1] - 0.05 * (x / 2.2) * (x / 2.2);
        }
        flagGeo.attributes.position.needsUpdate = true;
        flagGeo.computeVertexNormals();
      },
    };
    api.setPin(CUP.x, CUP.z);
    return api;
  }

  function buildTeeObjects(THREE) {
    const group = new THREE.Group();
    const y = height(0, TEE_Z);
    const mk = (color, x) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
      m.position.set(x, y + 0.26, TEE_Z - 5.5);   // ボールはマーカーを結んだ線より後ろに置く
      m.castShadow = true;
      group.add(m);
    };
    mk(0x2f6fd6, -4.6); mk(0x2f6fd6, 4.6);
    // ショートホール用ティーのマーカー（グリーン方向に向けて並べる）
    const t2 = TEES[1], y2 = height(t2.x, t2.z);
    const a = Math.atan2(GX - t2.x, GREEN_Z - t2.z);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), new THREE.MeshStandardMaterial({ color: t2.marker, roughness: 0.4 }));
      m.position.set(t2.x + Math.sin(a) * 2 + Math.cos(a) * 2.6 * s, y2 + 0.26, t2.z + Math.cos(a) * 2 - Math.sin(a) * 2.6 * s);
      m.castShadow = true;
      group.add(m);
    }
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.4 }));
    peg.position.set(0.6, y + 0.03, TEE_Z - 4);
    group.add(peg);
    return { group, ballPos: new THREE.Vector3(0.6, y + 0.06 + 0.0214 * 2.4, TEE_Z - 4), y };
  }

  function makeBall(THREE, scale, color) {
    const mat = new THREE.MeshPhysicalMaterial({ color: color || 0xf8f8f4, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const holder = new THREE.Group();
    holder.userData.mat = mat;
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
    holder.add(fallback);
    holder.scale.setScalar(scale);
    const b64 = window.BALL_GLB_BASE64;
    const Loader = window.THREE_ADDONS && window.THREE_ADDONS.GLTFLoader;
    if (b64 && Loader) {
      try {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new Loader().parse(buf.buffer, '', (gltf) => {
          gltf.scene.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; } });
          holder.remove(fallback);
          holder.add(gltf.scene);
        }, () => {});
      } catch (e) { /* 読み込めなければ球体のまま */ }
    }
    fallback.castShadow = true;
    return holder;
  }
  window.GolfMakeBall = makeBall;

  function buildClouds(THREE) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    const mats = [];
    const rand = rng(99);
    for (let i = 0; i < 14; i++) {
      const cluster = new THREE.Group();
      const a = rand() * Math.PI * 2, R = 700 + rand() * 500;
      cluster.position.set(Math.cos(a) * R, 170 + rand() * 120, Math.sin(a) * R);
      for (let k = 0; k < 5; k++) {
        const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, opacity: 0.8, toneMapped: false });
        mats.push(mat);
        const s = new THREE.Sprite(mat);
        s.position.set((rand() - 0.5) * 160, (rand() - 0.5) * 20, (rand() - 0.5) * 60);
        const w = 90 + rand() * 90;
        s.scale.set(w, w * 0.45, 1);
        cluster.add(s);
      }
      group.add(cluster);
    }
    return { group, mats };
  }

  /* ---------- 解説ポイント ---------- */
  function hotspotDefs(THREE, extra) {
    const V = (x, z, dy) => new THREE.Vector3(x, height(x, z) + (dy || 1.5), z);
    const b0 = bunkers[0], b2 = bunkers[2];
    return [
      { id: 'tee', label: 'ティーイングエリア', pos: V(0, TEE_Z, 2),
        body: '各ホールの1打目を打つ場所。2つのティーマーカーを結んだ線から、後ろに2クラブの長さの範囲内にボールを置きます。マーカーより前から打つと2罰打。',
        tip: '初心者は一番前のティーから始めてもOK。予約時やスタート前に確認しましょう。' },
      { id: 'fairway', label: 'フェアウェイ', pos: V(cx(40), 40, 1.5),
        body: 'ティーからグリーンまで、芝が短く刈られた道。ここにボールがあると次のショットが打ちやすくなります。',
        tip: '芝の縞模様は、刈り込みの向きで光の反射が変わるためにできます。' },
      { id: 'rough', label: 'ラフ', pos: V(cx(-10) - 30, -10, 1.5),
        body: 'フェアウェイの外側の、芝が長いエリア。ボールが沈みやすく、クラブに芝がからみます。',
        tip: 'ラフからは欲張らずに、フェアウェイへ出すことを最優先に。' },
      { id: 'fbunker', label: 'フェアウェイバンカー', pos: V(b2.x, b2.z, 2),
        body: 'フェアウェイの横にある砂のエリア。ティーショットが落ちやすい場所に作られています。',
        tip: '打つ前にクラブを砂につけると2罰打。ボールだけをクリーンに打ちます。' },
      { id: 'water', label: 'ペナルティエリア（池）', pos: V(pond.x, pond.z, 2.5),
        body: '池や川は赤杭または黄杭で示されるペナルティエリア。入ったら1打罰で、杭の外にドロップして打てます。',
        tip: '無理に池越えを狙わず、池の手前に刻むのも立派な作戦です。' },
      { id: 'ob', label: 'OB（白杭）', pos: V(cx(60) - 72, 60, 2.2),
        body: '白い杭の外はプレー禁止区域。OBになったら1打罰で元の場所から打ち直します。',
        tip: '多くのコースには「前進4打」の特設ティーがあり、そこから4打目として打てます。' },
      { id: 'marker', label: '150ヤードの目安杭', pos: extra.marker150,
        body: 'グリーンの中心までの残り距離を示す杭や目印。コースによって色や形、距離の単位が違います。',
        tip: 'スコアカードやカートのナビにも残り距離が表示されます。' },
      { id: 'cartpath', label: 'カート道', pos: V(pathX(-20), -20, 1.8),
        body: '乗用カートが通る道。ボールが乗ったら、無罰でひざの高さからドロップして道から避けられます。',
        tip: 'そのまま打っても構いませんが、クラブが傷むので救済を受けるのがおすすめ。' },
      { id: 'gbunker', label: 'ガードバンカー', pos: V(b0.x, b0.z, 2),
        body: 'グリーンを守るように配置されたバンカー。砂ごとボールを運ぶように打ちます。',
        tip: '1回で出れば100点。出すことだけを考えましょう。' },
      { id: 'green', label: 'グリーン', pos: V(GX - 5, GREEN_Z + 5, 1.2),
        body: 'カップのある、一番短く刈られたエリア。ここではパターで転がします。ボールはマークすれば拾って拭けます。',
        tip: 'ボールが落ちたくぼみ（ボールマーク）はグリーンフォークで直しましょう。' },
      { id: 'collar', label: 'カラー（エッジ）', pos: V(GX + 12, GREEN_Z - 12, 1),
        body: 'グリーンを縁取る、少しだけ芝が長い帯。ここはまだグリーンではないので、ボールを拾えません。',
        tip: 'カラーからはパターで転がすのが一番やさしい選択です。' },
      { id: 'pin', label: 'ピンとカップ', pos: extra.flagTop,
        body: 'カップの直径は108mm。旗竿（ピン）は立てたままでも、抜いてもパットできます（2019年から）。',
        tip: '旗の色で、ピンがグリーンの手前・真ん中・奥のどこにあるかを示すコースもあります。' },
    ];
  }

  /* ---------- シーン本体 ---------- */
  const state = {
    built: false, failed: false, renderer: null, scene: null, camera: null, controls: null,
    container: null, layer: null, mode: 'hero', running: false, hotspots: [], buttons: {},
    flag: null, fly: null, onSelect: null, courseId: 'hills', weatherId: 'sunny', lastT: 0, t0: performance.now(), observer: null, visible: true, onReady: [],
  };

  /* ---------- コースごとのレイアウトと見た目 ---------- */
  const TREES_GREEN = [0x2b5a2b, 0x356a31, 0x234d27, 0x41743a, 0x2f6134, 0x4f7d34];
  const LAYOUTS = {
    hills: {
      name: 'グリーンヒルズ', desc: 'ゆるやかな丘とドッグレッグ。ゴルフの基本が全部そろった、はじめの一歩のコース', lv: 1,
      pal: {
        rough: [52, 104, 48], cut: [70, 124, 58], fwA: [112, 170, 78], fwB: [95, 153, 66],
        grA: [124, 188, 90], grB: [108, 172, 76], collar: [88, 148, 62], sand: [232, 218, 180], path: [186, 178, 158],
        teeA: [112, 170, 78], teeB: [98, 156, 68], bed: [58, 86, 66],
      },
      relief: 1, dune: 0, trees: { n: 330, cone: 0.3, cols: TREES_GREEN, seed: 20260928, near: 38, back: 1 },
      make() {
        TEE_Z = 124; GREEN_Z = -122;
        cx = (z) => { const t = (TEE_Z - z) / (TEE_Z - GREEN_Z); return 22 * Math.sin(t * Math.PI * 0.85) - 4 * t; };
        GX = cx(GREEN_Z); CUP = { x: GX + 3, z: GREEN_Z - 2 }; FW = { z0: 88, z1: -104 };
        green = { x: GX, z: GREEN_Z, rx: 17, ry: 14, rot: 0.35, w: 0.05, p: 1 };
        bunkers = [
          { x: GX - 19, z: GREEN_Z + 6, rx: 7, ry: 4.2, rot: 1.1, w: 0.12, p: 2 },
          { x: GX + 15, z: GREEN_Z + 14, rx: 6.5, ry: 3.6, rot: -0.7, w: 0.12, p: 4 },
          { x: cx(8) - 20, z: 8, rx: 10, ry: 4.5, rot: 0.15, w: 0.14, p: 0.5 },
          { x: cx(-40) + 20, z: -40, rx: 7.5, ry: 4, rot: -0.25, w: 0.14, p: 3 },
        ];
        pond = { x: cx(30) + 41, z: 30, rx: 16, ry: 30, rot: 0.2, w: 0.1, p: 1.3 };
        TEES = [
          { x: 0, z: TEE_Z, hw: 7, hd: 5, h: 1.4, marker: 0x2f6fd6 },
          { x: 70, z: -25, hw: 5, hd: 4, h: null, marker: 0xd8322b },
        ];
        HOLES = [
          { n: 1, par: 4, tee: { x: 0.6, z: TEE_Z - 4 }, pin: { x: GX + 3, z: GREEN_Z - 2 }, wind: [0, 4] },
          { n: 2, par: 3, tee: { x: TEES[1].x, z: TEES[1].z }, pin: { x: GX - 5, z: GREEN_Z + 5 }, wind: [1, 4] },
          { n: 3, par: 4, tee: { x: -1.6, z: TEE_Z - 1.5 }, pin: { x: GX + 7, z: GREEN_Z - 6 }, wind: [2, 6] },
        ];
      },
    },
    lake: {
      name: 'レイクサイド', desc: '左サイドに大きな池が広がる秋のコース。曲げないショットが大切', lv: 3,
      pal: {
        rough: [104, 108, 52], cut: [92, 126, 60], fwA: [126, 170, 80], fwB: [108, 152, 68],
        grA: [130, 190, 92], grB: [112, 174, 78], collar: [96, 148, 62], sand: [236, 222, 184], path: [196, 182, 150],
        teeA: [126, 170, 80], teeB: [108, 154, 68], bed: [62, 84, 70],
      },
      relief: 0.8, dune: 0, trees: { n: 300, cone: 0.15, cols: [0xd9822b, 0xc2452d, 0xe0a030, 0x9c5a2a, 0x7a8a2a, 0xb8641f], seed: 771, near: 36, back: 1 },
      make() {
        TEE_Z = 124; GREEN_Z = -118;
        cx = (z) => { const t = (TEE_Z - z) / (TEE_Z - GREEN_Z); return 14 * Math.sin(t * Math.PI * 1.15) - 2 * t; };
        GX = cx(GREEN_Z); CUP = { x: GX + 3, z: GREEN_Z - 2 }; FW = { z0: 90, z1: -100 };
        green = { x: GX, z: GREEN_Z, rx: 16, ry: 13, rot: -0.35, w: 0.05, p: 2 };
        bunkers = [
          { x: GX + 19, z: GREEN_Z + 5, rx: 6.5, ry: 3.8, rot: 0.9, w: 0.12, p: 1 },
          { x: GX - 4, z: GREEN_Z + 21, rx: 6, ry: 3.4, rot: 0.2, w: 0.12, p: 3 },
          { x: cx(34) + 22, z: 34, rx: 9, ry: 4.2, rot: -0.2, w: 0.14, p: 2 },
          { x: cx(-34) + 21, z: -34, rx: 7.5, ry: 4, rot: 0.3, w: 0.14, p: 5 },
        ];
        pond = { x: cx(-12) - 39, z: -12, rx: 17, ry: 62, rot: 0.06, w: 0.09, p: 0.7 };
        TEES = [
          { x: 0, z: TEE_Z, hw: 7, hd: 5, h: 1.4, marker: 0x2f6fd6 },
          { x: cx(44) + 26, z: 44, hw: 5, hd: 4, h: null, marker: 0xd8322b },
        ];
        HOLES = [
          { n: 1, par: 4, tee: { x: 0.6, z: TEE_Z - 4 }, pin: { x: GX + 4, z: GREEN_Z - 2 }, wind: [0, 4] },
          { n: 2, par: 3, tee: { x: TEES[1].x, z: TEES[1].z }, pin: { x: GX - 8, z: GREEN_Z + 3 }, wind: [1, 5] },
          { n: 3, par: 4, tee: { x: -1.6, z: TEE_Z - 1.5 }, pin: { x: GX - 6, z: GREEN_Z - 6 }, wind: [2, 6] },
        ];
      },
    },
    links: {
      name: 'シーサイドリンクス', desc: '木のない砂丘のコース。風が強く、小川を越える正確さが試される', lv: 5,
      pal: {
        rough: [136, 138, 76], cut: [122, 144, 74], fwA: [142, 178, 88], fwB: [124, 162, 76],
        grA: [128, 192, 98], grB: [112, 176, 84], collar: [104, 156, 70], sand: [238, 226, 188], path: [200, 190, 164],
        teeA: [142, 178, 88], teeB: [124, 162, 76], bed: [70, 88, 66],
      },
      relief: 0.4, dune: 2.8, trees: { n: 22, cone: 0, cols: [0x5f7a3a, 0x6b8442, 0x55703a], seed: 4242, near: 60, back: 0 },
      make() {
        TEE_Z = 124; GREEN_Z = -122;
        cx = (z) => { const t = (TEE_Z - z) / (TEE_Z - GREEN_Z); return 16 * Math.sin(t * Math.PI * 0.6) + 7 * Math.sin(t * Math.PI * 2.3); };
        GX = cx(GREEN_Z); CUP = { x: GX - 2, z: GREEN_Z + 1 }; FW = { z0: 92, z1: -104 };
        green = { x: GX, z: GREEN_Z, rx: 13, ry: 15, rot: 1.2, w: 0.07, p: 3 };
        bunkers = [
          { x: GX + 15, z: GREEN_Z + 6, rx: 5, ry: 3.2, rot: 0.4, w: 0.16, p: 1 },
          { x: GX - 15, z: GREEN_Z - 4, rx: 4.5, ry: 3, rot: -0.6, w: 0.16, p: 2 },
          { x: GX + 2, z: GREEN_Z + 19, rx: 5, ry: 3, rot: 0.1, w: 0.16, p: 4 },
          { x: cx(60) + 17, z: 60, rx: 5, ry: 3.4, rot: 0.3, w: 0.16, p: 1 },
          { x: cx(52) - 17, z: 52, rx: 4.5, ry: 3, rot: -0.2, w: 0.16, p: 3 },
          { x: cx(-6) + 16, z: -6, rx: 5.5, ry: 3.4, rot: 0.5, w: 0.16, p: 2 },
          { x: cx(-62) - 16, z: -62, rx: 5, ry: 3.2, rot: -0.4, w: 0.16, p: 5 },
        ];
        pond = { x: cx(-30) + 3, z: -30, rx: 50, ry: 5.5, rot: 0.05, w: 0.05, p: 0.3 };
        TEES = [
          { x: 0, z: TEE_Z, hw: 7, hd: 5, h: 1.4, marker: 0x2f6fd6 },
          { x: cx(10) - 14, z: 10, hw: 5, hd: 4, h: null, marker: 0xd8322b },
        ];
        HOLES = [
          { n: 1, par: 4, tee: { x: 0.6, z: TEE_Z - 4 }, pin: { x: GX - 2, z: GREEN_Z + 1 }, wind: [3, 7] },
          { n: 2, par: 3, tee: { x: TEES[1].x, z: TEES[1].z }, pin: { x: GX + 4, z: GREEN_Z + 3 }, wind: [3, 8] },
          { n: 3, par: 4, tee: { x: -1.6, z: TEE_Z - 1.5 }, pin: { x: GX + 3, z: GREEN_Z - 5 }, wind: [4, 9] },
        ];
      },
    },
  };
  function applyLayout(id) {
    const L = LAYOUTS[id];
    L.make();
    C = L.pal; RELIEF = L.relief; DUNE = L.dune; TREES = L.trees;
    HOLES.forEach((h) => { h.course = id; });
  }
  applyLayout('hills');

  /* ---------- 天候（空・光・霧・雨。風の強さと転がりにも影響する） ---------- */
  const WEATHERS = {
    sunny: { name: '晴れ', elev: 28, az: 35, sun: 0xfff0d6, sunI: 2.7, glow: 1, top: 0x2f7fc6, mid: 0x7fbde6, hor: 0xdaecf1, fog: [0xd3e7ee, 280, 1300],
      hemi: [0xcfe6ff, 0x3d5c35, 0.55], env: 0.5, cloud: 0.8, exp: 1.0, wind: 1, roll: 1, rain: 0 },
    sunset: { name: '夕焼け', elev: 7, az: 82, sun: 0xffa860, sunI: 2.5, glow: 1, top: 0x3a4a92, mid: 0xdc8a72, hor: 0xf8c88c, fog: [0xefb48c, 200, 1200],
      hemi: [0xffc9a0, 0x554a55, 0.85], env: 0.6, cloud: 0.9, cc: 1, exp: 1.08, wind: 0.8, roll: 1, rain: 0 },
    cloudy: { name: 'くもり', elev: 40, az: 35, sun: 0xffffff, sunI: 0.9, glow: 0, top: 0x8c9aa5, mid: 0xa9b6be, hor: 0xd0d8db, fog: [0xc4cdd1, 150, 1000],
      hemi: [0xdfe6ea, 0x50604a, 1.15], env: 0.6, cloud: 0.6, cc: 0.85, exp: 1.0, wind: 1.2, roll: 1, rain: 0 },
    rain: { name: '雨', elev: 40, az: 35, sun: 0xdde6ee, sunI: 0.4, glow: 0, top: 0x55616b, mid: 0x76838c, hor: 0xa0aab0, fog: [0x98a3a9, 60, 520],
      hemi: [0xc8d4dc, 0x40503f, 1.0], env: 0.5, cloud: 0.5, cc: 0.65, exp: 0.95, wind: 1.6, roll: 0.7, rain: 1 },
  };

  function buildRain(THREE) {
    const N = 1600, BOX = 60, H = 34;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6), drop = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { drop[i * 3] = (Math.random() - 0.5) * BOX; drop[i * 3 + 1] = Math.random() * H; drop[i * 3 + 2] = (Math.random() - 0.5) * BOX; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd6e4ee, transparent: true, opacity: 0.5, depthWrite: false }));
    line.frustumCulled = false;
    const write = () => {
      for (let i = 0; i < N; i++) {
        const x = drop[i * 3], y = drop[i * 3 + 1], z = drop[i * 3 + 2];
        pos.set([x, y, z, x + 0.12, y - 0.9, z + 0.05], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    };
    write();
    return {
      line,
      update(dt, cam) {
        line.position.set(cam.x, cam.y - 12, cam.z);
        if (prefersReduced()) return;
        for (let i = 0; i < N; i++) { drop[i * 3 + 1] -= 24 * dt; if (drop[i * 3 + 1] < 0) drop[i * 3 + 1] += H; }
        write();
      },
    };
  }

  function bakeEnv() {
    const S = state;
    S.envScene.add(S.sky);
    const rt = S.pmrem.fromScene(S.envScene);
    S.envScene.remove(S.sky);
    S.scene.add(S.sky);
    if (S.envRT) S.envRT.dispose();
    S.envRT = rt;
    S.scene.environment = rt.texture;
  }

  function setWeather(id) {
    if (!WEATHERS[id]) id = 'sunny';
    state.weatherId = id;
    if (!state.built) return;
    const W = WEATHERS[id], T = state.THREE;
    const dir = new T.Vector3().setFromSphericalCoords(1, T.MathUtils.degToRad(90 - W.elev), T.MathUtils.degToRad(W.az));
    const u = state.sky.material.uniforms;
    u.top.value.setHex(W.top); u.mid.value.setHex(W.mid); u.horizon.value.setHex(W.hor);
    u.sunDir.value.copy(dir); u.glow.value = W.glow;
    state.sun.color.setHex(W.sun); state.sun.intensity = W.sunI;
    state.sun.position.copy(state.sun.target.position).addScaledVector(dir, 420);
    state.hemi.color.setHex(W.hemi[0]); state.hemi.groundColor.setHex(W.hemi[1]); state.hemi.intensity = W.hemi[2];
    state.scene.fog.color.setHex(W.fog[0]); state.scene.fog.near = W.fog[1]; state.scene.fog.far = W.fog[2];
    state.scene.environmentIntensity = W.env;
    state.renderer.toneMappingExposure = W.exp;
    state.cloudMats.forEach((m) => { m.opacity = 0.8 * W.cloud; m.color.setScalar(W.cc == null ? 1 : W.cc); });
    state.rain.line.visible = !!W.rain;
    bakeEnv();
  }

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); });
    });
    if (g.parent) g.parent.remove(g);
  }

  // いまのレイアウトで、地形・池・木・杭・旗・ティーを作る
  function buildCourse() {
    const THREE = state.THREE, renderer = state.renderer;
    const group = new THREE.Group();
    const tex = paintTexture(THREE, isSmall() ? 1280 : 2048);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    group.add(buildTerrain(THREE, tex), buildWater(THREE), buildTrees(THREE));
    const stakes = buildStakes(THREE);
    group.add(stakes.group);
    const flag = buildFlag(THREE);
    group.add(flag.group);
    const tee = buildTeeObjects(THREE);
    group.add(tee.group);
    const ball = makeBall(THREE, 0.0214 * 2.4);
    ball.position.copy(tee.ballPos);
    group.add(ball);

    // ヒーロー用のカメラ経路（閉じたループ）
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const ty = tee.y, bp = tee.ballPos;
    const gy = height(GX, GREEN_Z);
    const camPts = [
      V(bp.x - 0.22, bp.y + 0.1, bp.z + 0.62), V(-2.5, ty + 4, TEE_Z - 8), V(cx(60) - 16, 17, 60),
      V(cx(-20) - 24, 21, -20), V(GX - 30, gy + 9, -92), V(GX - 13, gy + 4.5, -106), V(GX + 14, gy + 5, -108),
      V(GX + 44, 32, -96), V(85, 72, -20), V(42, 46, 118), V(4, ty + 7, TEE_Z + 12),
    ];
    const lookPts = [
      V(bp.x + 0.5, bp.y, bp.z - 3), V(cx(60), 0, 60), V(cx(0), 0, 0),
      V(cx(-80), 0, -80), V(GX, gy + 1, GREEN_Z), V(CUP.x, gy + 2.2, CUP.z), V(CUP.x, gy + 2, CUP.z),
      V(GX, gy, GREEN_Z), V(cx(0), 0, -30), V(0, 0, 60), V(bp.x, bp.y + 0.4, bp.z - 6),
    ];
    return {
      group, flag, teeBall: ball,
      camCurve: new THREE.CatmullRomCurve3(camPts, true, 'centripetal'),
      lookCurve: new THREE.CatmullRomCurve3(lookPts, true, 'centripetal'),
      hotspots: hotspotDefs(THREE, { marker150: stakes.marker150, flagTop: flag.top }),
    };
  }

  function setCourse(id) {
    if (!LAYOUTS[id]) id = 'hills';
    if (state.courseId === id) return;
    applyLayout(id);
    state.courseId = id;
    if (!state.built) return;
    if (state.course) disposeGroup(state.course);
    const c = buildCourse();
    state.scene.add(c.group);
    Object.assign(state, { course: c.group, flag: c.flag, teeBall: c.teeBall, camCurve: c.camCurve, lookCurve: c.lookCurve, hotspots: c.hotspots });
  }

  // 別コースのホール定義だけ知りたいとき（地形は作り直さない）
  function holesOf(id) {
    const cur = state.courseId;
    if (id === cur) return HOLES;
    applyLayout(id);
    const list = HOLES;
    applyLayout(cur);
    return list;
  }

  function build() {
    if (state.built || state.failed) return;
    const THREE = window.THREE;
    const A = window.THREE_ADDONS || {};
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) { state.failed = true; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.6 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'scene-canvas';

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd3e7ee, 280, 1300);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);

    // 空（グラデーション + 太陽のにじみ）。色や太陽の向きは setWeather() で変える
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fc6) }, mid: { value: new THREE.Color(0x7fbde6) },
        horizon: { value: new THREE.Color(0xdaecf1) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 1 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform float glow; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.9, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += vec3(1.0, 0.94, 0.8) * (pow(s, 400.0) * 1.2 + pow(s, 12.0) * 0.12) * glow;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3d5c35, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
    sun.target.position.set(20, 0, -8);
    sun.castShadow = true;
    const sm = isSmall() ? 2048 : 4096;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -200; sc.right = 200; sc.top = 200; sc.bottom = -200; sc.near = 50; sc.far = 900;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);

    const clouds = buildClouds(THREE);
    scene.add(clouds.group);
    const rain = buildRain(THREE);
    scene.add(rain.line);
    Object.assign(state, {
      renderer, scene, camera, sky, sun, hemi, THREE, rain, cloudMats: clouds.mats,
      pmrem: new THREE.PMREMGenerator(renderer), envScene: new THREE.Scene(), envRT: null,
    });

    const c = buildCourse();
    scene.add(c.group);
    Object.assign(state, { course: c.group, flag: c.flag, teeBall: c.teeBall, camCurve: c.camCurve, lookCurve: c.lookCurve, hotspots: c.hotspots });

    let controls = null;
    if (A.OrbitControls) {
      controls = new A.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = 1.32;
      controls.minDistance = 10;
      controls.maxDistance = 560;
      controls.target.set(18, 0, -10);
      controls.enabled = false;
      controls.addEventListener('start', () => { state.fly = null; });
      renderer.domElement.style.touchAction = 'pan-y';
    }
    Object.assign(state, { built: true, controls, tmpLook: new THREE.Vector3() });
    setWeather(state.weatherId || 'sunny');
    state.onReady.splice(0).forEach(fn => fn());
  }

  function size() {
    if (!state.container || !state.renderer) return;
    const w = state.container.clientWidth || 1, h = state.container.clientHeight || 1;
    state.renderer.setSize(w, h, false);
    state.renderer.domElement.style.width = '100%';
    state.renderer.domElement.style.height = '100%';
    state.camera.aspect = w / h;
    state.camera.fov = w / h < 0.8 ? 62 : 50;
    state.camera.updateProjectionMatrix();
  }

  const OVERVIEW = { pos: [150, 150, 95], target: [14, 0, -4] };
  function setOverview(instant) {
    const T = state.THREE;
    flyTo(new T.Vector3(...OVERVIEW.pos), new T.Vector3(...OVERVIEW.target), instant);
  }
  function flyTo(pos, target, instant) {
    if (!state.controls) return;
    if (instant || prefersReduced()) {
      state.camera.position.copy(pos);
      state.controls.target.copy(target);
      state.fly = null;
      return;
    }
    state.fly = {
      p0: state.camera.position.clone(), t0: state.controls.target.clone(), p1: pos, t1: target,
      start: performance.now(), dur: 1300,
    };
  }

  function heroFrame(time) {
    const { camera, camCurve, lookCurve } = state;
    if (prefersReduced()) {
      camera.position.set(-16, 15, 146);
      camera.lookAt(cx(-20), 0, -20);
      return;
    }
    const u = ((time - state.t0) / 1000 / 84) % 1;
    camCurve.getPoint(u, camera.position);
    lookCurve.getPoint(u, state.tmpLook);
    camera.lookAt(state.tmpLook);
  }

  function updateHotspots() {
    if (!state.layer) return;
    const w = state.container.clientWidth, h = state.container.clientHeight;
    const v = new state.THREE.Vector3();
    // 選択中のラベルを優先し、重なるラベルは点だけにする
    const order = state.hotspots.slice().sort((a, b) => (b.id === state.active) - (a.id === state.active));
    const placed = [];
    for (const hs of order) {
      const btn = state.buttons[hs.id];
      if (!btn) continue;
      v.copy(hs.pos).project(state.camera);
      const inView = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      btn.hidden = !inView;
      if (!inView) continue;
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
      btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const box = { x0: x - 10, x1: x + 16 + hs.label.length * 14, y0: y - 22, y1: y + 6 };
      const clash = placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
      btn.classList.toggle('no-label', clash);
      if (!clash) placed.push(box);
      else placed.push({ x0: x - 10, x1: x + 10, y0: y - 10, y1: y + 10 });
    }
  }

  function loop(time) {
    if (!state.built) return;
    const reduced = prefersReduced();
    const dt = Math.min(0.1, Math.max(0, (time - (state.lastT || time)) / 1000));
    state.lastT = time;
    if (state.flag && !reduced) state.flag.wave(time / 1000);
    if (state.mode === 'hero') heroFrame(time);
    else if (state.mode === 'play') { if (state.onFrame) state.onFrame(time); }
    else if (state.controls) {
      if (state.fly) {
        const f = state.fly;
        const k = Math.min(1, (time - f.start) / f.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        state.camera.position.lerpVectors(f.p0, f.p1, e);
        state.controls.target.lerpVectors(f.t0, f.t1, e);
        if (k >= 1) state.fly = null;
      }
      state.controls.update();
    }
    if (state.rain.line.visible) state.rain.update(dt, state.camera.position);
    state.renderer.render(state.scene, state.camera);
    if (state.mode === 'explore') updateHotspots();
  }

  function setRunning() {
    const should = !!(state.built && state.container && state.visible && !document.hidden && state.container.isConnected);
    if (should === state.running) return;
    state.running = should;
    state.renderer.setAnimationLoop(should ? loop : null);
  }

  function buildLayer() {
    state.buttons = {};
    state.active = null;
    if (!state.layer) return;
    state.layer.innerHTML = '';
    for (const hs of state.hotspots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hs';
      b.dataset.id = hs.id;
      b.setAttribute('aria-label', hs.label);
      b.innerHTML = `<span class="hs-dot" aria-hidden="true"></span><span class="hs-label" aria-hidden="true">${hs.label}</span>`;
      b.addEventListener('click', () => select(hs.id));
      state.layer.appendChild(b);
      state.buttons[hs.id] = b;
    }
  }

  function select(id) {
    const hs = state.hotspots.find(h => h.id === id);
    if (!hs) return;
    state.active = id;
    Object.values(state.buttons).forEach(b => b.classList.toggle('is-active', b.dataset.id === id));
    const T = state.THREE;
    const dir = new T.Vector3().subVectors(state.camera.position, state.controls.target).setY(0).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0.6, 0, 0.8);
    const dist = id === 'pin' ? 22 : id === 'tee' ? 34 : 48;
    const pos = hs.pos.clone().addScaledVector(dir, dist).add(new T.Vector3(0, dist * 0.55, 0));
    flyTo(pos, hs.pos.clone(), false);
    if (state.onSelect) state.onSelect(hs);
  }

  function mount(container, opts) {
    opts = opts || {};
    const go = () => {
      // ゲーム以外（図鑑など）は、いつも晴れのグリーンヒルズ
      const playing = opts.mode === 'play';
      setCourse(playing ? (opts.course || 'hills') : 'hills');
      setWeather(playing ? (opts.weather || 'sunny') : 'sunny');
      build();
      if (state.failed) { container.classList.add('scene-failed'); return; }
      state.container = container;
      state.mode = opts.mode || 'hero';
      state.layer = opts.layer || null;
      state.onSelect = opts.onSelect || null;
      state.onFrame = opts.onFrame || null;
      state.teeBall.visible = state.mode !== 'play';
      if (state.mode !== 'play') { state.flag.setPin(CUP.x, CUP.z); state.flag.setWind(-0.5); state.flag.group.scale.setScalar(1); }
      container.prepend(state.renderer.domElement);
      requestAnimationFrame(() => container.classList.add('scene-ready'));
      if (state.controls) {
        state.controls.enabled = state.mode === 'explore';
        state.renderer.domElement.style.touchAction = state.mode === 'hero' ? 'pan-y' : 'none';
      }
      if (state.mode === 'explore') { buildLayer(); setOverview(true); }
      size();
      if (state.observer) state.observer.disconnect();
      state.observer = new IntersectionObserver((es) => { state.visible = es[0].isIntersecting; setRunning(); });
      state.observer.observe(container);
      state.visible = true;
      state.running = false;
      setRunning();
      if (opts.onReady) opts.onReady();
    };
    const whenThree = () => {
      if (window.THREE) {
        // テクスチャ生成が重いので、描画を1フレーム待ってから
        setTimeout(go, state.built ? 0 : 60);
      } else {
        window.addEventListener('three-ready', whenThree, { once: true });
      }
    };
    whenThree();
  }

  function unmount() {
    if (state.observer) state.observer.disconnect();
    state.container = null;
    state.layer = null;
    if (state.renderer) setRunning();
  }

  window.addEventListener('resize', () => size());
  document.addEventListener('visibilitychange', () => { if (state.renderer) setRunning(); });

  /* ---------- ゲーム用：地面の種類（ライ）の判定 ---------- */
  function lie(x, z) {
    const d = x - cx(z);
    if (d < -72 || d > 86 || z > 142 || z < -178) return 'ob';
    if (blobSd(pond, x, z) > 0) return 'water';
    for (const b of bunkers) if (blobSd(b, x, z) > 0) return 'bunker';
    const g = blobSd(green, x, z);
    if (g > 0) return 'green';
    if (g > -2.4) return 'fringe';
    if (teeSd(x, z) > 0) return 'tee';
    if (fairwaySd(x, z) > 0) return 'fairway';
    if (pathSd(x, z) > 0) return 'path';
    return 'rough';
  }
  window.GolfScene = {
    world() {
      if (!state.built) return null;
      return { THREE: state.THREE, scene: state.scene, camera: state.camera, renderer: state.renderer,
        height: (x, z) => height(x, z), lie, center: (z) => cx(z), makeBall,
        get holes() { return HOLES; }, get flag() { return state.flag; },
        get course() { return state.courseId; }, get weather() { return WEATHERS[state.weatherId]; } };
    },
    mount, unmount, select, setCourse, setWeather, holesOf,
    get course() { return state.courseId; },
    COURSES: Object.keys(LAYOUTS).map((id) => ({ id, name: LAYOUTS[id].name, desc: LAYOUTS[id].desc, lv: LAYOUTS[id].lv })),
    WEATHERS: Object.keys(WEATHERS).map((id) => ({ id, name: WEATHERS[id].name })),
    resetView: () => setOverview(false),
    get hotspots() { return state.hotspots; },
    get failed() { return state.failed; },
  };
})();
