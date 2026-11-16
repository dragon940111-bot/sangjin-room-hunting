/* 배치도 입체 보기 — window.Plan3D.open(pid, {view, lightOn, lightColor, lens})
   데이터: window.PLAN3D_DATA[pid] (plans.py PLANS 원본 형식) 우선, 없으면 data JSON의 places[].plan 이 같은 형식일 때 사용.
   three.js 는 lib/three.module.min.js (상대 경로, CDN 안 씀). */
(function () {
  'use strict';
  const LIB = (window.PLAN3D_LIB || 'lib/');
  let THREEp = null;
  function loadThree() {
    if (!THREEp) {
      const base = new URL(LIB, document.baseURI);
      THREEp = Promise.all([
        import(new URL('three.module.min.js', base).href),
        import(new URL('OrbitControls.js', base).href)
      ]).then(([T, O]) => ({ T, OrbitControls: O.OrbitControls }));
    }
    return THREEp;
  }

  /* ---------- 데이터 ---------- */
  let PDATA = null;
  function pageData() {
    if (PDATA) return PDATA;
    try { const el = document.getElementById('data'); PDATA = el ? JSON.parse(el.textContent) : {}; } catch (e) { PDATA = {}; }
    return PDATA;
  }
  function placeInfo(pid) {
    const d = pageData(); const p = (d.places || []).find(x => x.id === pid);
    return p || { id: pid, name: pid };
  }
  function isRaw(c) { return c && Array.isArray(c.walls) && c.walls.length && 'w' in c.walls[0] && 'a' in c.walls[0]; }
  function getPlan(pid) {
    const D = window.PLAN3D_DATA || {};
    if (isRaw(D[pid])) return D[pid];
    const p = placeInfo(pid);
    if (isRaw(p.plan)) return p.plan;
    if (p.plan && isRaw(p.plan.raw)) return p.plan.raw;
    return null;
  }

  /* ---------- 상수 ---------- */
  const H = 2.4, T = 0.12;                // 벽 높이, 두께 (m)
  const WROOM = 4.2;                      // 방 가로 대략 4.2m 기준
  const COL = {
    moon: [0xc4d6ff, 6.0], warm: [0xffb26a, 4.8], red: [0xff2d1e, 6.0]
  };
  const FIRST = s => String(s || '').split('\n')[0];

  /* ---------- 스타일 ---------- */
  function injectCSS() {
    if (document.getElementById('p3d-css')) return;
    const st = document.createElement('style'); st.id = 'p3d-css';
    st.textContent = `
.p3d{position:fixed;inset:0;z-index:90;background:#05070a;color:#e9ecee;display:flex;flex-direction:column;font:14px/1.45 "IBM Plex Sans KR",system-ui,sans-serif}
.p3d *{box-sizing:border-box}
.p3d .p3hd{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #1d262d;flex:none}
.p3d .p3warn{flex:none;background:#2a2112;color:#f0dcb4;border-bottom:1px solid #4a3a1e;padding:7px 14px;font-size:13.5px}
.p3d .p3ov{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;opacity:.5}
.p3d .p3hd h3{margin:0;font:600 16px/1.3 "Noto Serif KR",serif;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p3d .p3note{color:#97a3ac;font-size:12.5px;white-space:nowrap}
.p3d .p3x{border:1px solid #2a353e;background:#11171c;color:#e9ecee;border-radius:6px;min-width:44px;min-height:40px;font-size:18px;cursor:pointer}
.p3d .p3stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;cursor:grab}
.p3d .p3stage.dragging{cursor:grabbing}
.p3d canvas{display:block;width:100%;height:100%}
.p3d .p3lbls{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.p3d .p3l{position:absolute;transform:translate(-50%,-50%);font-size:12px;padding:1px 7px;border-radius:4px;background:rgba(6,8,10,.78);border:1px solid #33414c;white-space:nowrap;color:#d6dde2}
.p3d .p3l.win{border-color:#6f8fc4;color:#cfe0ff}.p3d .p3l.door{border-color:#8a7650;color:#ecdcb8}
.p3d .p3l.g{border-style:dashed}.p3d .p3l.g::after{content:" · 예상";color:#c9b98f}
.p3d .p3l.bed{background:#b9d1ff;color:#0d1114;border:0;font-weight:600}
.p3d .p3l.zone{background:none;border:0;color:#7f8c95}.p3d .p3l.fur{background:none;border:0;color:#9aa6ae;font-size:11px}
.p3d .p3frame{position:absolute;border:1.5px solid rgba(233,236,238,.75);box-shadow:0 0 0 9999px rgba(0,0,0,.42);pointer-events:none;display:none}
.p3d .p3frame span{position:absolute;left:8px;top:6px;font-size:12px;color:#e9ecee;background:rgba(0,0,0,.5);padding:1px 6px;border-radius:3px}
.p3d .p3frame i{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-left:1px solid rgba(233,236,238,.5);border-top:1px solid rgba(233,236,238,.5);transform:rotate(45deg) scale(.7);opacity:.6}
.p3d .p3load{position:absolute;inset:0;display:grid;place-items:center;color:#97a3ac}
.p3d .p3hint{position:absolute;left:12px;bottom:10px;font-size:12.5px;color:#97a3ac;background:rgba(6,8,10,.6);padding:3px 8px;border-radius:4px;pointer-events:none;max-width:70%}
.p3d .p3pad{position:absolute;right:12px;bottom:12px;display:none;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:6px}
.p3d .p3pad button{border:1px solid #2a353e;background:rgba(17,23,28,.85);color:#e9ecee;border-radius:8px;font-size:18px;cursor:pointer;touch-action:none;user-select:none}
.p3d .p3bar{flex:none;border-top:1px solid #1d262d;padding:8px 10px;display:grid;gap:6px;background:#080b0e}
.p3d .p3row{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:thin;white-space:nowrap;padding-bottom:2px}
.p3d .p3row>b{font-size:12.5px;color:#97a3ac;font-weight:500;margin:0 2px 0 6px;flex:none}
.p3d .p3row>b:first-child{margin-left:0}
.p3d .p3b{flex:none;border:1px solid #2a353e;background:#11171c;color:#e9ecee;border-radius:6px;padding:6px 11px;min-height:36px;font-size:13.5px;cursor:pointer}
.p3d .p3b[aria-pressed=true]{background:#b9d1ff;color:#0d1114;border-color:#b9d1ff;font-weight:600}
.p3d .p3b .sw{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}
.p3d .p3sep{flex:none;width:1px;height:24px;background:#1d262d;margin:0 4px}
.p3d .p3rng{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#97a3ac}
.p3d .p3rng input{width:110px;accent-color:#b9d1ff}
@media(max-width:600px){.p3d .p3note{display:none}.p3d .p3b{padding:6px 9px;font-size:13px}.p3d .p3rng input{width:90px}}
`;
    document.head.appendChild(st);
  }

  /* ---------- 장면 만들기 ---------- */
  function build(THREE, c, rnd, photos, onTex) {
    const rw = c.rw || 300, rh = c.rh || 220;
    const W = WROOM, Dp = WROOM * rh / rw;
    const U = (u, v) => [(u - 0.5) * W, (v - 0.5) * Dp];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x05070a, 0.045);
    const disp = [];
    const M = (o) => { const m = new THREE.MeshStandardMaterial(o); disp.push(m); return m; };
    const G = (g) => { disp.push(g); return g; };
    const matWall = M({ color: 0xa69d8f, roughness: 0.95 });
    const matWallOut = M({ color: 0x3c3a37, roughness: 1 });
    const matFloor = M({ color: 0x8a6034, roughness: 0.6, metalness: 0.0 });
    const matFrame = M({ color: 0x4e3b29, roughness: 0.8 });
    const matDoor = M({ color: 0x5c3f27, roughness: 0.75 });
    const matHave = M({ color: 0x4a5058, roughness: 0.85 });
    const matAdd = M({ color: 0x7fa4e8, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
    const matBed = M({ color: 0x2f4256, roughness: 0.8 });
    const matSheet = M({ color: 0xbfc4c6, roughness: 0.9 });
    const matDark = M({ color: 0x24282c, roughness: 1 });
    const matGround = M({ color: 0x0b0d0b, roughness: 1 });
    const glass = M({ color: 0x9fb8d8, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.12, depthWrite: false });
    const matCeil = M({ color: 0x6f6a62, roughness: 1 });

    const box = (sx, sy, sz, mat, x, y, z, cast = true, recv = true) => {
      const m = new THREE.Mesh(G(new THREE.BoxGeometry(sx, sy, sz)), mat);
      m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
    };

    // 바닥 · 바깥 땅 · 천장
    box(W, 0.04, Dp, matFloor, 0, -0.02, 0, false, true);
    const ground = new THREE.Mesh(G(new THREE.PlaneGeometry(60, 60)), matGround);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.045; ground.receiveShadow = true; scene.add(ground);
    const ceil = box(W + 2 * T, 0.08, Dp + 2 * T, matCeil, 0, H + 0.04, 0, true, true);

    // 벽 + 구멍
    const sides = { N: [], S: [], W: [], E: [] };
    (c.walls || []).forEach(f => { if (f.k !== 'wall') sides[f.w].push(f); });
    const openings = [];
    const lbls = [];
    const ln = (w) => (w === 'N' || w === 'S') ? W : Dp;
    function wallPos(w, t) { // t 0..1 along wall → [x,z]
      if (w === 'N') return [-W / 2 + t * W, -Dp / 2];
      if (w === 'S') return [-W / 2 + t * W, Dp / 2];
      if (w === 'W') return [-W / 2, -Dp / 2 + t * Dp];
      return [W / 2, -Dp / 2 + t * Dp];
    }
    const nrm = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
    function seg(w, t0, t1, y0, y1, mat) {
      if (t1 - t0 <= 1e-4 || y1 - y0 <= 1e-4) return;
      const L = ln(w); const ext = (w === 'N' || w === 'S') ? T : 0;
      const a = t0 * L - (t0 <= 0 ? ext : 0), b = t1 * L + (t1 >= 1 ? ext : 0);
      const len = b - a; const mid = (a + b) / 2;
      const p = wallPos(w, mid / L);
      if (w === 'N' || w === 'S') box(len, y1 - y0, T, mat, p[0], (y0 + y1) / 2, p[1] + nrm[w][1] * T / 2);
      else box(T, y1 - y0, len, mat, p[0] + nrm[w][0] * T / 2, (y0 + y1) / 2, p[1]);
    }
    const dims = (f) => {
      const small = /작은/.test(f.t || '');
      if (f.k === 'win') return small ? [1.25, 1.95] : [0.82, 2.05];
      if (f.k === 'door') return [0, 2.02];
      return [0, 2.08];
    };
    Object.keys(sides).forEach(w => {
      const L = sides[w].slice().sort((p, q) => p.a - q.a);
      let t = 0;
      L.forEach(f => {
        const a = Math.max(t, f.a), b = Math.max(a, f.b);
        seg(w, t, a, 0, H, matWall);
        const [y0, y1] = dims(f);
        seg(w, a, b, 0, y0, matWall); seg(w, a, b, y1, H, matWall);
        openings.push({ f, w, a, b, y0, y1 });
        t = b;
      });
      seg(w, t, 1, 0, H, matWall);
    });

    // 창·문 세부
    const lineMat = new THREE.LineDashedMaterial({ color: 0xe0c28a, dashSize: 0.09, gapSize: 0.06, transparent: true, opacity: 0.95 }); disp.push(lineMat);
    openings.forEach(o => {
      const { f, w, a, b, y0, y1 } = o; const L = ln(w);
      const p0 = wallPos(w, a), p1 = wallPos(w, b); const n = nrm[w];
      const along = (w === 'N' || w === 'S');
      const width = (b - a) * L; const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
      const guess = f.c !== 'seen';
      if (f.k === 'win') {
        const g = new THREE.Mesh(G(new THREE.PlaneGeometry(width, y1 - y0)), glass);
        g.position.set(cx + n[0] * 0.02, (y0 + y1) / 2, cz + n[1] * 0.02); if (!along) g.rotation.y = Math.PI / 2;
        g.castShadow = false; g.receiveShadow = false; scene.add(g);
        // 창틀(테두리 + 가운데 문살) — 그림자가 생김
        const fw = 0.05;
        const fr = (sx, sy, x, y, z) => along ? box(sx, sy, fw, matFrame, x, y, z) : box(fw, sy, sx, matFrame, x, y, z);
        const off = (d) => along ? [cx + d, cz + n[1] * T * 0.5] : [cx + n[0] * T * 0.5, cz + d];
        let q = off(0); fr(width, fw, q[0], y0 + fw / 2, q[1]); fr(width, fw, q[0], y1 - fw / 2, q[1]);
        q = off(-width / 2 + fw / 2); fr(fw, y1 - y0, q[0], (y0 + y1) / 2, q[1]);
        q = off(width / 2 - fw / 2); fr(fw, y1 - y0, q[0], (y0 + y1) / 2, q[1]);
        const panes = width > 1.6 ? 4 : width > 0.9 ? 2 : 1;
        for (let i = 1; i < panes; i++) { q = off(-width / 2 + width * i / panes); fr(0.04, y1 - y0, q[0], (y0 + y1) / 2, q[1]); }
        if (/방범/.test(f.t || '')) { // 방범창 창살
          const nb = Math.max(4, Math.round(width / 0.11));
          for (let i = 1; i < nb; i++) {
            const d = -width / 2 + width * i / nb;
            const qq = along ? [cx + d, cz + n[1] * (T + 0.05)] : [cx + n[0] * (T + 0.05), cz + d];
            along ? box(0.018, y1 - y0, 0.018, matDark, qq[0], (y0 + y1) / 2, qq[1]) : box(0.018, y1 - y0, 0.018, matDark, qq[0], (y0 + y1) / 2, qq[1]);
          }
          const qq = along ? [cx, cz + n[1] * (T + 0.05)] : [cx + n[0] * (T + 0.05), cz];
          along ? box(width, 0.02, 0.02, matDark, qq[0], (y0 + y1) / 2, qq[1]) : box(0.02, 0.02, width, matDark, qq[0], (y0 + y1) / 2, qq[1]);
        }
      } else if (f.k === 'door') {
        // 열린 문짝(경첩은 a 쪽, 방 안쪽으로 70°)
        const leaf = new THREE.Mesh(G(new THREE.BoxGeometry(width, 2.0, 0.04)), matDoor);
        leaf.castShadow = true; leaf.receiveShadow = true;
        const pivot = new THREE.Object3D(); pivot.position.set(p0[0], 0, p0[1]);
        leaf.position.set(width / 2, 1.0, 0); pivot.add(leaf); scene.add(pivot);
        const ux = (p1[0] - p0[0]) / (width || 1), uz = (p1[1] - p0[1]) / (width || 1), th = 1.22;
        const dx = ux * Math.cos(th) - n[0] * Math.sin(th), dz = uz * Math.cos(th) - n[1] * Math.sin(th);
        pivot.rotation.y = Math.atan2(-dz, dx);
      } else {
        // 열린 입구(발·문 없는 통로): 위쪽 점선 문지방
      }
      if (guess) { // 예상: 점선 테두리
        const pts = [];
        const P = (d, y) => along ? new THREE.Vector3(cx + d, y, cz - n[1] * 0.07) : new THREE.Vector3(cx - n[0] * 0.07, y, cz + d);
        const yb = Math.max(0.02, y0);
        pts.push(P(-width / 2, yb), P(width / 2, yb), P(width / 2, yb), P(width / 2, y1), P(width / 2, y1), P(-width / 2, y1), P(-width / 2, y1), P(-width / 2, yb));
        const lg = G(new THREE.BufferGeometry().setFromPoints(pts));
        const l = new THREE.LineSegments(lg, lineMat); l.computeLineDistances(); scene.add(l);
      }
      lbls.push({ cls: (f.k === 'win' ? 'win' : 'door') + (guess ? ' g' : ''), text: FIRST(f.t), pos: [cx - n[0] * 0.25, Math.min(y1 + 0.18, H - 0.1), cz - n[1] * 0.25], kind: 'open' });
    });

    // 가구
    const hOf = (t) => /장롱|붙박이|장 |나무 장$|자개장|자개 장롱/.test(t) ? 2.0 : /책장|책상·책장/.test(t) ? 1.6 : /소파/.test(t) ? 0.82 : /탁자|TV장|TV 탁자/.test(t) ? 0.5 :
      /TV/.test(t) ? 0.55 : /책상/.test(t) ? 0.75 : /장식장|전축/.test(t) ? 1.1 : /침대/.test(t) ? 0.5 : /판/.test(t) ? 2.2 : /^$/.test(t) ? 1.7 : 0.8;
    (c.furn || []).forEach(f => {
      const [x0, z0] = U(f.x, f.y); const sx = f.w * W, sz = f.h * Dp; const t = FIRST(f.t);
      const hh = hOf(t);
      const add = f.k === 'add';
      const m = box(sx, hh, sz, add ? matAdd : matHave, x0 + sx / 2, hh / 2, z0 + sz / 2, !add, true);
      if (add) {
        const eg = G(new THREE.EdgesGeometry(m.geometry)); const el = new THREE.LineSegments(eg, lineMat);
        el.position.copy(m.position); el.computeLineDistances(); scene.add(el);
      }
      if (t) lbls.push({ cls: 'fur', text: t + (add ? ' (들임)' : ''), pos: [x0 + sx / 2, hh + 0.12, z0 + sz / 2], kind: 'fur' });
    });

    // 상진 침대
    let eye = null, bedC = null;
    if (c.bed) {
      const b = c.bed; const [x0, z0] = U(b.x, b.y); const sx = b.w * W, sz = b.h * Dp;
      const add = b.k === 'add';
      box(sx, 0.32, sz, matBed, x0 + sx / 2, 0.16, z0 + sz / 2);
      box(sx * 0.96, 0.14, sz * 0.96, matSheet, x0 + sx / 2, 0.39, z0 + sz / 2);
      const [ex, ez] = U(b.eye[0], b.eye[1]);
      // 베개: 눈 위치 쪽
      const horiz = sx >= sz; // 긴 쪽이 가로
      const pw = horiz ? Math.min(0.45, sx * 0.25) : sz * 0.8, pd = horiz ? sz * 0.8 : Math.min(0.45, sz * 0.25);
      box(pw, 0.12, pd, matSheet, ex, 0.52, ez);
      if (add) {
        const eg = G(new THREE.EdgesGeometry(G(new THREE.BoxGeometry(sx, 0.46, sz)))); const el = new THREE.LineSegments(eg, lineMat);
        el.position.set(x0 + sx / 2, 0.23, z0 + sz / 2); el.computeLineDistances(); scene.add(el);
      }
      eye = new THREE.Vector3(ex, 0.88, ez); bedC = new THREE.Vector3(x0 + sx / 2, 0.5, z0 + sz / 2);
      lbls.push({ cls: 'bed', text: FIRST(b.t), pos: [x0 + sx / 2, 0.75, z0 + sz / 2], kind: 'bed' });
    }

    // 바깥 구역
    const zoneFar = 7;
    (c.out || []).forEach(z => {
      const w = z.w; const n = nrm[w]; const k = z.k;
      const zl = FIRST(z.t).replace(/\s*\(.*$/, '');
      const along = (w === 'N' || w === 'S');
      if (k === 'hall' || k === 'room' || k === 'living') {
        const a = z.a ?? 0.3, b = z.b ?? 0.7;
        const p0 = wallPos(w, a), p1 = wallPos(w, b); const width = Math.max(0.9, (b - a) * ln(w));
        const depth = k === 'hall' ? 4.6 : 3.0;
        const cx = (p0[0] + p1[0]) / 2 + n[0] * (T + depth / 2), cz = (p0[1] + p1[1]) / 2 + n[1] * (T + depth / 2);
        const sx = along ? width : depth, sz = along ? depth : width;
        const mf = k === 'hall' ? M({ color: 0x3a3026, roughness: 0.8 }) : M({ color: 0x4c3a26, roughness: 0.8 });
        box(sx, 0.04, sz, mf, cx, -0.02, cz, false, true);
        box(sx + 0.2, 0.08, sz + 0.2, matCeil, cx, H + 0.04, cz, true, false);
        // 옆벽 두 개 + 끝벽
        if (along) {
          box(0.1, H, sz, matWallOut, cx - sx / 2, H / 2, cz); box(0.1, H, sz, matWallOut, cx + sx / 2, H / 2, cz);
          box(sx, H, 0.1, matWallOut, cx, H / 2, cz + n[1] * sz / 2);
        } else {
          box(sx, H, 0.1, matWallOut, cx, H / 2, cz - sz / 2); box(sx, H, 0.1, matWallOut, cx, H / 2, cz + sz / 2);
          box(0.1, H, sz, matWallOut, cx + n[0] * sx / 2, H / 2, cz);
        }
        lbls.push({ cls: 'zone', text: zl, pos: [cx, 1.2, cz], kind: 'zone' });
      } else {
        const mid = wallPos(w, 0.5);
        const ox = mid[0] + n[0] * 3.2, oz = mid[1] + n[1] * 3.2;
        if (k === 'forest') {
          const trunk = M({ color: 0x2a2620, roughness: 1 }), leaf = M({ color: 0x1a2a1d, roughness: 1 });
          for (let i = 0; i < 14; i++) {
            const s = (rnd() - 0.5) * (along ? W + 3 : Dp + 3), d = 1.6 + rnd() * 6;
            const x = along ? s : mid[0] + n[0] * d, zz = along ? mid[1] + n[1] * d : s;
            const h = 3.5 + rnd() * 3;
            const tr = new THREE.Mesh(G(new THREE.CylinderGeometry(0.06, 0.11, h, 6)), trunk); tr.position.set(x, h / 2, zz); tr.castShadow = true; scene.add(tr);
            const cn = new THREE.Mesh(G(new THREE.ConeGeometry(0.9 + rnd() * 0.6, 2.4, 7)), leaf); cn.position.set(x, h + 0.6, zz); cn.castShadow = true; scene.add(cn);
          }
        } else if (k === 'alley') {
          const bw = along ? W + 4 : 0.3, bd = along ? 0.3 : Dp + 4;
          box(bw, 4.2, bd, M({ color: 0x2c3033, roughness: 1 }), mid[0] + n[0] * 3.6, 2.1, mid[1] + n[1] * 3.6, true, true);
          const em = M({ color: 0x1a1a14, emissive: 0x6b5a32, emissiveIntensity: 0.35 });
          for (let i = 0; i < 3; i++) {
            const s = -1.6 + i * 1.6;
            const x = along ? s : mid[0] + n[0] * 3.43, zz = along ? mid[1] + n[1] * 3.43 : s;
            box(along ? 0.7 : 0.02, 0.5, along ? 0.02 : 0.7, em, x, 2.6 + (i % 2) * 0.3, zz, false, false);
          }
        } else if (k === 'sea' || k === 'mud') {
          const water = M({ color: 0x142028, roughness: 0.55, metalness: 0.0 });
          const pl = new THREE.Mesh(G(new THREE.PlaneGeometry(along ? 30 : 16, along ? 16 : 30)), water);
          pl.rotation.x = -Math.PI / 2; pl.position.set(mid[0] + n[0] * 9, -0.03, mid[1] + n[1] * 9); pl.receiveShadow = true; scene.add(pl);
        } else { // yard
          const sh = M({ color: 0x1f2a1e, roughness: 1 });
          for (let i = 0; i < 6; i++) {
            const s = (rnd() - 0.5) * 5, d = 1.5 + rnd() * 4;
            const x = along ? s : mid[0] + n[0] * d, zz = along ? mid[1] + n[1] * d : s;
            const m = new THREE.Mesh(G(new THREE.SphereGeometry(0.35 + rnd() * 0.3, 8, 6)), sh); m.position.set(x, 0.3, zz); m.castShadow = true; scene.add(m);
          }
        }
        lbls.push({ cls: 'zone', text: zl, pos: [ox, 0.6, oz], kind: 'zone' });
      }
    });

    // 1·8씬 카메라 자리
    const cams = (c.cams || []).map(cm => {
      let u, v;
      if ('rx' in cm) { u = cm.rx; v = cm.ry; }
      else { const rx = (680 - rw) / 2, ry = 120 + (220 - rh) / 2; u = (cm.x - rx) / rw; v = (cm.y - ry) / rh; }
      const [x, z] = U(u, v); const a = (cm.ang - 90) * Math.PI / 180;
      return { pos: new THREE.Vector3(x, 1.45, z), dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), t: cm.t };
    });

    // 1·8씬: 카메라가 있는 쪽 벽의 문·입구와 줄을 맞춰 문틀 너머로 방을 보게
    let cam18 = null, cam18look = null;
    if (cams[0]) {
      const cp = cams[0].pos;
      const side = Math.abs(cp.x) - W / 2 > Math.abs(cp.z) - Dp / 2 ? (cp.x > 0 ? 'E' : 'W') : (cp.z > 0 ? 'S' : 'N');
      const ops = openings.filter(o => o.w === side && o.f.k !== 'win');
      if (ops.length) {
        const o = ops.reduce((m, q) => { const pm = wallPos(m.w, (m.a + m.b) / 2), pq = wallPos(q.w, (q.a + q.b) / 2); return Math.hypot(pq[0] - cp.x, pq[1] - cp.z) < Math.hypot(pm[0] - cp.x, pm[1] - cp.z) ? q : m; });
        const pc = wallPos(side, (o.a + o.b) / 2); const n = nrm[side];
        const dist = Math.max(1.6, Math.abs(side === 'E' || side === 'W' ? cp.x - pc[0] : cp.z - pc[1]));
        cam18 = new THREE.Vector3(pc[0] + n[0] * Math.min(dist, 3.6), 1.45, pc[1] + n[1] * Math.min(dist, 3.6));
        cam18look = new THREE.Vector3(pc[0] - n[0] * 2.5, 0.9, pc[1] - n[1] * 2.5);
      }
    }
    // 헌팅 사진 시점
    const shots = (c.shots || []).map(sh => {
      let u, v;
      if ('cx' in sh) { const rx = (680 - rw) / 2, ry = 120 + (220 - rh) / 2; u = (sh.cx - rx) / rw; v = (sh.cy - ry) / rh; } else { u = sh.x; v = sh.y; }
      const [x, z] = U(u, v); const a = (sh.ang - 90) * Math.PI / 180;
      return { n: sh.n, pos: new THREE.Vector3(x, 1.5, z), yaw: Math.atan2(Math.cos(a), -Math.sin(a)) };
    });
    // 벽에 입힌 헌팅 사진
    const texPlanes = [];
    (photos || []).forEach(e => {
      const w = e.wall, [sa, sb] = e.span, L = ln(w); const n = nrm[w];
      const p0 = wallPos(w, sa), p1 = wallPos(w, sb); const len = (sb - sa) * L;
      const tex = new THREE.TextureLoader().load(e.tex, () => onTex && onTex());
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; disp.push(tex);
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, roughness: 0.9, side: THREE.FrontSide }); disp.push(mat);
      const pl = new THREE.Mesh(G(new THREE.PlaneGeometry(len, H)), mat);
      pl.position.set((p0[0] + p1[0]) / 2 - n[0] * 0.004, H / 2, (p0[1] + p1[1]) / 2 - n[1] * 0.004);
      pl.rotation.y = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[w];
      pl.castShadow = false; pl.receiveShadow = true; pl.renderOrder = 2; scene.add(pl); texPlanes.push(pl);
    });
    // 정면 시선 목표
    let front = null;
    if (c.pov && c.pov.front) { const f = c.pov.front; const p = wallPos(f[0], (f[1] + f[2]) / 2); front = new THREE.Vector3(p[0], 1.05, p[1]); }

    // 빛 기본 방향(창)
    const lw = (c.light && c.light.w) || ((c.walls || []).find(f => f.k === 'win') || { w: 'N' }).w;
    const la = c.light ? (c.light.a + c.light.b) / 2 : 0.5;
    const lp = wallPos(lw, la);
    const lightWin = { w: lw, n: nrm[lw], pos: new THREE.Vector3(lp[0], 1.4, lp[1]) };

    return { scene, disp, ceil, lbls, eye, bedC, cams, cam18, cam18look, front, lightWin, W, Dp, shots, texPlanes };
  }

  /* ---------- 대화상자 ---------- */
  let CUR = null;
  function close() {
    if (!CUR) return;
    const s = CUR; CUR = null;
    cancelAnimationFrame(s.raf); s.alive = false;
    window.removeEventListener('keydown', s.onKey, true); window.removeEventListener('keyup', s.onKeyUp, true);
    window.removeEventListener('resize', s.onResize);
    document.removeEventListener('visibilitychange', s.onVis);
    try { s.controls && s.controls.dispose(); } catch (e) { }
    if (s.scene) s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    (s.disp || []).forEach(d => d.dispose && d.dispose());
    if (s.light) s.light.shadow.map && s.light.shadow.map.dispose();
    if (s.renderer) { s.renderer.dispose(); try { s.renderer.forceContextLoss(); } catch (e) { } }
    s.el.remove(); document.body.style.overflow = s.prevOverflow;
    if (s.opener && s.opener.focus) s.opener.focus();
  }

  async function open(pid, state) {
    state = state || {};
    if (CUR) close();
    injectCSS();
    const c = getPlan(pid); const info = placeInfo(pid);
    const el = document.createElement('div'); el.className = 'p3d'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    const title = `${info.rank ? info.rank + '. ' : ''}${info.name || pid} — 입체 보기${c ? ' · ' + FIRST(c.room) : ''}`;
    el.innerHTML = `<div class="p3hd"><h3></h3><span class="p3note">크기·비율은 대략 · 점선 테두리 = 사진으로 확인 못 한 예상</span><button class="p3x" aria-label="닫기">✕</button></div>
<div class="p3warn">예시입니다 — 헌팅 사진으로 짐작해 만든 입체라 실제 공간·크기·위치와 다를 수 있습니다. 답사 때 실측으로 바꿉니다.</div>
<div class="p3stage"><div class="p3load">불러오는 중…</div><div class="p3lbls"></div><div class="p3frame"><img class="p3ov" alt=""><span></span><i></i></div><div class="p3hint"></div>
<div class="p3pad"><button data-mv="tl" aria-label="왼쪽으로 돌기">↺</button><button data-mv="f" aria-label="앞으로">▲</button><button data-mv="tr" aria-label="오른쪽으로 돌기">↻</button><button data-mv="l" aria-label="왼쪽으로">◀</button><button data-mv="b" aria-label="뒤로">▼</button><button data-mv="r" aria-label="오른쪽으로">▶</button></div></div>
<div class="p3bar">
 <div class="p3row"><b>시점</b><button class="p3b" data-view="orbit">위에서</button><button class="p3b" data-view="pov">상진 시선</button><button class="p3b" data-view="cam18">1·8씬 카메라</button><button class="p3b" data-view="free">자유 이동</button><span class="p3sep"></span><b>렌즈</b><button class="p3b" data-lens="24">24mm</button><button class="p3b" data-lens="35">35mm</button><button class="p3b" data-lens="50">50mm</button><button class="p3b" data-lens="85">85mm</button><span class="p3sep"></span><button class="p3b" data-tg="labels">이름표</button><button class="p3b" data-act="reset">처음대로</button></div>
 <div class="p3row"><b>빛</b><button class="p3b" data-tg="light">달빛 켜짐</button><button class="p3b" data-col="moon"><span class="sw" style="background:#c4d6ff"></span>달빛</button><button class="p3b" data-col="warm"><span class="sw" style="background:#ffb26a"></span>따뜻한 빛</button><button class="p3b" data-col="red"><span class="sw" style="background:#ff2d1e"></span>붉은 번쩍임</button><button class="p3b" data-tg="sweep">등대 훑기</button><button class="p3b" data-tg="branch">나뭇가지 그림자</button><span class="p3sep"></span><label class="p3rng">방향<input type="range" min="-70" max="70" value="0" data-rng="az"></label><label class="p3rng">높이<input type="range" min="8" max="70" value="30" data-rng="el"></label><label class="p3rng">실내 밝기<input type="range" min="0" max="250" value="100" data-rng="amb"></label></div>
 <div class="p3row p3photo"><b>헌팅 사진</b><button class="p3b" data-tg="tex">사진 입히기</button><span class="p3sep"></span><span class="p3shots"></span><label class="p3rng">겹쳐 보기<input type="range" min="0" max="100" value="50" data-rng="ov"></label><label class="p3rng">화각<input type="range" min="50" max="110" value="72" data-rng="hfov"></label></div>
</div>`;
    el.querySelector('h3').textContent = title;
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.body.appendChild(el);
    const s = { el, opener: document.activeElement, prevOverflow, alive: true, disp: [] };
    CUR = s;
    el.querySelector('.p3x').onclick = close;
    s.onKey = (e) => {
      if (!CUR) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (s.keys) { const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].includes(k) && s.view === 'free') { s.keys[k] = 1; e.preventDefault(); s.kick(); } }
    };
    s.onKeyUp = (e) => { if (s.keys) s.keys[e.key.toLowerCase()] = 0; };
    window.addEventListener('keydown', s.onKey, true); window.addEventListener('keyup', s.onKeyUp, true);
    el.querySelector('.p3x').focus();
    if (!c) { el.querySelector('.p3load').textContent = '이 장소는 배치도 데이터가 없습니다.'; return; }
    let lib;
    try { lib = await loadThree(); } catch (e) { el.querySelector('.p3load').textContent = '입체 보기를 불러오지 못했습니다.'; console.warn(e); return; }
    if (CUR !== s) return;
    const THREE = lib.T;
    const stage = el.querySelector('.p3stage');
    let dirty = true;
    let seed = 7; for (const ch of pid) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 10000) / 10000; };
    const PH = (window.PLAN3D_PHOTOS || {})[pid] || [];
    const B = build(THREE, c, rnd, PH, () => { dirty = true; });
    s.scene = B.scene; s.disp = B.disp;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.8;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    s.renderer = renderer;
    stage.insertBefore(renderer.domElement, stage.firstChild);
    el.querySelector('.p3load').remove();

    const scene = B.scene;
    const hemi = new THREE.HemisphereLight(0x6a7c9c, 0x2a1d12, 1.35); scene.add(hemi);
    const amb = new THREE.AmbientLight(0x1b2230, 0.45); scene.add(amb);
    const light = new THREE.DirectionalLight(COL.moon[0], COL.moon[1]);
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
    const sc = light.shadow.camera; sc.left = -4.6; sc.right = 4.6; sc.top = 4.6; sc.bottom = -4.6; sc.near = 0.5; sc.far = 30;
    light.shadow.bias = -0.0006; light.shadow.normalBias = 0.025;
    scene.add(light); scene.add(light.target); light.target.position.set(0, 0.6, 0);
    s.light = light;
    // 창밖 손잡이(달)
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe9ff }); s.disp.push(moonMat);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), moonMat); scene.add(moon);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xb9d1ff, transparent: true, opacity: 0.18, depthWrite: false }); s.disp.push(haloMat);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), haloMat); moon.add(halo);
    // 나뭇가지(창 앞)
    const branch = new THREE.Group(); scene.add(branch);
    {
      const bm = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 1 }); s.disp.push(bm);
      const n = B.lightWin.n; const base = B.lightWin.pos.clone().add(new THREE.Vector3(n[0] * 0.9, 0, n[1] * 0.9));
      const addB = (x0, y0, z0, x1, y1, z1, r) => {
        const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1); const len = a.distanceTo(b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 5), bm); m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; branch.add(m); return b;
      };
      const along = n[0] === 0; const sx = along ? 1 : 0, sz = along ? 0 : 1;
      let p = base.clone().add(new THREE.Vector3(-0.9 * sx, -1.4, -0.9 * sz));
      const grow = (p, dir, len, r, depth) => {
        if (depth === 0) return;
        const q = p.clone().add(dir.clone().multiplyScalar(len));
        addB(p.x, p.y, p.z, q.x, q.y, q.z, r);
        const t1 = dir.clone().applyAxisAngle(new THREE.Vector3(n[0], 0, n[1]), 0.55).normalize();
        const t2 = dir.clone().applyAxisAngle(new THREE.Vector3(n[0], 0, n[1]), -0.45).normalize();
        grow(q, t1, len * 0.7, r * 0.65, depth - 1); grow(q, t2, len * 0.62, r * 0.6, depth - 1);
      };
      grow(p, new THREE.Vector3(0.45 * sx, 1, 0.45 * sz).normalize(), 1.1, 0.05, 5);
      branch.visible = false;
    }

    // 카메라
    const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
    const controls = new lib.OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.maxPolarAngle = 1.48; controls.minDistance = 2; controls.maxDistance = 16;
    controls.target.set(0, 0.6, 0); s.controls = controls;

    // 상태
    const ST = s.st = { view: state.view || 'orbit', lens: state.lens || 35, lightOn: state.lightOn !== false, col: state.lightColor || 'moon', az: 0, el: 30, sweep: false, branch: false, labels: true, tex: true, amb: 100, ov: 50, hfov: 72, photo: state.photo || null };
    s.view = ST.view;
    s.keys = {};
    let yaw = 0, pitch = 0; const camPos = new THREE.Vector3();
    s.kick = () => { dirty = true; };
    controls.addEventListener('change', () => { dirty = true; });

    function setLight() {
      const n = B.lightWin.n; const az = ST.az * Math.PI / 180, elv = ST.el * Math.PI / 180;
      const out = new THREE.Vector3(n[0], 0, n[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), az);
      const dir = out.multiplyScalar(Math.cos(elv)); dir.y = Math.sin(elv);
      light.position.copy(light.target.position).add(dir.clone().multiplyScalar(12));
      moon.position.copy(B.lightWin.pos).add(dir.clone().multiplyScalar(3.2));
      light.color.setHex(COL[ST.col][0]); light.intensity = ST.lightOn ? COL[ST.col][1] : 0;
      moonMat.color.setHex(ST.lightOn ? (ST.col === 'moon' ? 0xdfe9ff : COL[ST.col][0]) : 0x30363c);
      haloMat.color.setHex(COL[ST.col][0]); halo.visible = ST.lightOn;
      dirty = true;
    }
    function lensFov() { // 16:9 프레임 기준 화각 → 캔버스 세로 fov
      const r = stage.getBoundingClientRect(); const cw = r.width, ch = r.height;
      const asp = ST.view === 'photo' ? (s.ovAspect || 4 / 3) : 16 / 9;
      let fw = cw, fh = cw / asp; if (fh > ch) { fh = ch; fw = ch * asp; }
      const hf = ST.view === 'photo' ? ST.hfov * Math.PI / 180 : 2 * Math.atan(36 / (2 * ST.lens)); const vf = 2 * Math.atan(Math.tan(hf / 2) / asp);
      const vfull = 2 * Math.atan(Math.tan(vf / 2) * (ch / fh));
      const fr = el.querySelector('.p3frame'); fr.style.left = (cw - fw) / 2 + 'px'; fr.style.top = (ch - fh) / 2 + 'px'; fr.style.width = fw + 'px'; fr.style.height = fh + 'px';
      return vfull * 180 / Math.PI;
    }
    const VIEWNAME = { pov: '상진 시선', cam18: '1·8씬 카메라', free: '자유 이동', photo: '사진 시점' };
    function lookDir(from, to) { const d = to.clone().sub(from).normalize(); yaw = Math.atan2(d.x, -d.z); pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); }
    function applyLook() {
      const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      cam.position.copy(camPos); cam.lookAt(camPos.clone().add(d)); dirty = true;
    }
    function setView(v) {
      ST.view = v; s.view = v;
      const orbit = v === 'orbit';
      controls.enabled = orbit;
      B.ceil.material.colorWrite = !orbit; B.ceil.material.depthWrite = !orbit; B.ceil.material.needsUpdate = true;
      moon.visible = orbit;
      el.querySelector('.p3frame').style.display = orbit ? 'none' : 'block';
      ov.style.display = v === 'photo' ? 'block' : 'none';
      el.querySelector('.p3pad').style.display = v === 'free' ? 'grid' : 'none';
      if (orbit) {
        cam.fov = 40; cam.position.set(B.W * 0.75, 7.2, B.Dp * 1.75); controls.target.set(0, 0.2, 0); controls.update();
        ST.labels = true;
      } else {
        ST.labels = false;
        if (v === 'pov') {
          camPos.copy(B.eye || new THREE.Vector3(0, 0.9, 0));
          lookDir(camPos, B.front || new THREE.Vector3(0, 1.0, 0)); if (!s.userLens) ST.lens = 24;
        } else if (v === 'cam18') {
          const c0 = B.cams[0];
          if (!s.userLens) ST.lens = 50;
          if (c0) { camPos.copy(B.cam18 || c0.pos); lookDir(camPos, B.cam18look || (B.bedC || new THREE.Vector3(0, 0.6, 0)).clone().setY(0.75)); }
          else { camPos.set(0, 1.45, B.Dp / 2 + 3); lookDir(camPos, new THREE.Vector3(0, 0.8, 0)); }
        } else if (v === 'photo') {
          const sh = B.shots.find(x => x.n === ST.photo) || B.shots[0];
          if (sh) { camPos.copy(sh.pos); yaw = sh.yaw; pitch = -0.03; ST.photo = sh.n; }
          const src = photoSrc(ST.photo); if (ov.getAttribute('src') !== src) { s.ovAspect = null; ov.src = src; }
        } else {
          const c0 = B.cams[0];
          camPos.copy(c0 ? c0.pos : new THREE.Vector3(0, 1.5, B.Dp / 2 - 0.4)); camPos.y = 1.5;
          lookDir(camPos, new THREE.Vector3(0, 1.0, 0));
        }
        applyLook();
      }
      updButtons(); hint(); resize();
    }
    function hint() {
      const h = el.querySelector('.p3hint');
      const touch = matchMedia('(pointer:coarse)').matches;
      h.textContent = ST.view === 'orbit' ? (touch ? '한 손가락: 돌리기 · 두 손가락: 확대·이동 · 창밖 달을 끌면 빛 방향이 바뀝니다' : '끌기: 돌리기 · 휠: 확대 · 오른쪽 끌기: 이동 · 창밖 달을 끌면 빛 방향이 바뀝니다')
        : ST.view === 'free' ? (touch ? '끌기: 둘러보기 · 아래 단추: 이동' : '끌기: 둘러보기 · W A S D / 화살표: 이동 · Q E: 돌기')
          : ST.view === 'photo' ? '끌기: 방향 맞추기 · 아래 「겹쳐 보기」로 실제 사진 겹침, 「화각」으로 넓이 맞추기 · 가구는 벽 사진에 납작하게 찍혀 있어 입체와 어긋날 수 있습니다' : '끌기: 고개 돌리기';
    }
    function updButtons() {
      el.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === ST.view));
      el.querySelectorAll('[data-lens]').forEach(b => { b.setAttribute('aria-pressed', ST.view !== 'orbit' && +b.dataset.lens === ST.lens); b.disabled = ST.view === 'orbit'; b.style.opacity = ST.view === 'orbit' ? .45 : 1; });
      el.querySelectorAll('[data-col]').forEach(b => b.setAttribute('aria-pressed', b.dataset.col === ST.col));
      const tl = el.querySelector('[data-tg=light]'); tl.setAttribute('aria-pressed', ST.lightOn); tl.textContent = ST.lightOn ? '달빛 켜짐' : '달빛 꺼짐';
      el.querySelector('[data-tg=sweep]').setAttribute('aria-pressed', ST.sweep);
      el.querySelector('[data-tg=branch]').setAttribute('aria-pressed', ST.branch);
      el.querySelector('[data-tg=labels]').setAttribute('aria-pressed', ST.labels);
      el.querySelector('[data-rng=az]').value = ST.az; el.querySelector('[data-rng=el]').value = ST.el;
      const fr = el.querySelector('.p3frame span'); fr.textContent = ST.view === 'photo' ? `사진 ${ST.photo} 시점 · 가로 화각 ${ST.hfov}° · 사진 겹침 ${ST.ov}%` : `${ST.lens}mm · ${VIEWNAME[ST.view] || ''}`;
      el.querySelectorAll('[data-shot]').forEach(b => b.setAttribute('aria-pressed', ST.view === 'photo' && +b.dataset.shot === ST.photo));
      if (B.texPlanes.length) el.querySelector('[data-tg=tex]').setAttribute('aria-pressed', ST.tex);
      el.querySelectorAll('[data-rng=ov],[data-rng=hfov]').forEach(r => { r.disabled = ST.view !== 'photo'; r.parentElement.style.opacity = ST.view === 'photo' ? 1 : .45; });
    }
    function resize() {
      const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height;
      if (ST.view !== 'orbit') cam.fov = lensFov();
      cam.updateProjectionMatrix(); dirty = true;
    }
    s.onResize = resize; window.addEventListener('resize', resize);
    s.onVis = () => { if (!document.hidden) dirty = true; }; document.addEventListener('visibilitychange', s.onVis);

    // 이름표
    const lblBox = el.querySelector('.p3lbls');
    const L = B.lbls.map(l => { const d = document.createElement('div'); d.className = 'p3l ' + l.cls; d.textContent = l.text; lblBox.appendChild(d); return { d, v: new THREE.Vector3(...l.pos), kind: l.kind }; });
    const tmp = new THREE.Vector3();
    function drawLabels() {
      const show = ST.labels; lblBox.style.display = show ? '' : 'none'; if (!show) return;
      const r = stage.getBoundingClientRect(); const placed = [];
      L.forEach(o => {
        tmp.copy(o.v).project(cam);
        if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) { o.d.style.display = 'none'; return; }
        let x = (tmp.x + 1) / 2 * r.width, y = (1 - tmp.y) / 2 * r.height;
        o.d.style.display = ''; const w = o.d.offsetWidth || 60, h = o.d.offsetHeight || 18;
        // 겹치면 아래로 비키기, 가구 이름은 겹치면 숨김
        for (let k = 0; k < 6; k++) {
          const hit = placed.find(p => Math.abs(p.x - x) < (p.w + w) / 2 + 4 && Math.abs(p.y - y) < (p.h + h) / 2 + 2);
          if (!hit) break;
          if (o.kind === 'fur' || o.kind === 'zone') { x = -999; break; }
          y = hit.y + (hit.h + h) / 2 + 3;
        }
        if (x < -500) { o.d.style.display = 'none'; return; }
        placed.push({ x, y, w, h }); o.d.style.left = x + 'px'; o.d.style.top = y + 'px';
      });
    }

    // 입력: 시점 드래그(카메라 보기), 달 끌기(위에서 보기)
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let drag = null;
    renderer.domElement.addEventListener('pointerdown', (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      if (ST.view === 'orbit' && moon.visible) {
        ray.setFromCamera(ndc, cam);
        if (ray.intersectObject(moon, true).length) {
          drag = { type: 'moon', x: e.clientX, y: e.clientY, az: ST.az, el: ST.el };
          controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); stage.classList.add('dragging'); e.preventDefault(); return;
        }
        return;
      }
      drag = { type: 'look', x: e.clientX, y: e.clientY, yaw, pitch };
      renderer.domElement.setPointerCapture(e.pointerId); stage.classList.add('dragging');
    });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.type === 'moon') {
        ST.az = Math.max(-70, Math.min(70, drag.az - dx * 0.35)); ST.el = Math.max(8, Math.min(70, drag.el - dy * 0.3));
        setLight(); updButtons();
      } else {
        const k = (cam.fov * Math.PI / 180) / (renderer.domElement.clientHeight || 600);
        yaw = drag.yaw - dx * k; pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + dy * k));
        applyLook();
      }
    });
    const endDrag = (e) => { if (!drag) return; if (drag.type === 'moon') controls.enabled = ST.view === 'orbit'; drag = null; stage.classList.remove('dragging'); };
    renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (drag || ST.view !== 'orbit') return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam);
      renderer.domElement.style.cursor = ray.intersectObject(moon, true).length ? 'pointer' : '';
    });
    // 이동 단추
    const pad = { f: 0, b: 0, l: 0, r: 0, tl: 0, tr: 0 };
    el.querySelectorAll('.p3pad button').forEach(b => {
      const k = b.dataset.mv;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); pad[k] = 1; b.setPointerCapture(e.pointerId); dirty = true; });
      const up = () => { pad[k] = 0; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });

    // 단추들
    el.querySelector('.p3bar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.view) setView(b.dataset.view);
      else if (b.dataset.lens) { ST.lens = +b.dataset.lens; s.userLens = true; resize(); updButtons(); }
      else if (b.dataset.col) { ST.col = b.dataset.col; ST.lightOn = true; setLight(); updButtons(); }
      else if (b.dataset.tg) {
        const k = b.dataset.tg;
        if (k === 'light') ST.lightOn = !ST.lightOn;
        else if (k === 'sweep') { ST.sweep = !ST.sweep; if (ST.sweep) { ST.lightOn = true; s.sweepT0 = performance.now(); s.sweepBase = ST.az; } else { ST.az = s.sweepBase ?? ST.az; } }
        else if (k === 'branch') { ST.branch = !ST.branch; branch.visible = ST.branch; }
        else if (k === 'labels') ST.labels = !ST.labels;
        else if (k === 'tex') { ST.tex = !ST.tex; B.texPlanes.forEach(p => p.visible = ST.tex); }
        setLight(); updButtons(); dirty = true;
      } else if (b.dataset.act === 'reset') {
        Object.assign(ST, { lens: 35, lightOn: true, col: 'moon', az: 0, el: 30, sweep: false, branch: false, tex: true, amb: 100, ov: 50, hfov: 72 }); branch.visible = false;
        B.texPlanes.forEach(p => p.visible = true); hemi.intensity = 1.35; amb.intensity = 0.45; ov.style.opacity = .5;
        el.querySelector('[data-rng=amb]').value = 100; el.querySelector('[data-rng=ov]').value = 50; el.querySelector('[data-rng=hfov]').value = 72;
        setLight(); setView('orbit');
      }
    });
    el.querySelectorAll('[data-rng]').forEach(r => r.addEventListener('input', () => {
      const k = r.dataset.rng; ST[k] = +r.value;
      if (k === 'amb') { hemi.intensity = 1.35 * ST.amb / 100; amb.intensity = 0.45 * ST.amb / 100; dirty = true; }
      else if (k === 'ov') { ov.style.opacity = ST.ov / 100; updButtons(); }
      else if (k === 'hfov') { resize(); updButtons(); }
      else setLight();
    }));

    // 사진 시점 단추
    const shotBox = el.querySelector('.p3shots');
    shotBox.innerHTML = B.shots.length ? B.shots.map(sh => `<button class="p3b" data-shot="${sh.n}">사진 ${sh.n} 시점</button>`).join('') : '<span class="p3rng">사진 시점 없음</span>';
    if (!B.texPlanes.length) { const tb = el.querySelector('[data-tg=tex]'); tb.disabled = true; tb.textContent = '입힐 사진 없음'; tb.style.opacity = .5; }
    const ov = el.querySelector('.p3ov');
    ov.addEventListener('load', () => { s.ovAspect = ov.naturalWidth / ov.naturalHeight; resize(); });
    function photoSrc(n) { const ph = (info.photos || [])[n - 1]; return ph && ph.f && !/^data:/.test(ph.f) ? ph.f : `ph/${pid}/${String(n).padStart(2, '0')}.jpg`; }
    el.querySelector('.p3photo').addEventListener('click', (e) => {
      const b = e.target.closest('[data-shot]'); if (!b) return;
      ST.photo = +b.dataset.shot; setView('photo');
    });
    // 루프
    let last = performance.now();
    function loop(now) {
      if (!s.alive) return;
      s.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let anim = false;
      if (ST.sweep) { ST.az = (s.sweepBase || 0) + Math.sin((now - s.sweepT0) / 1000 * 0.55) * 55; setLight(); anim = true; el.querySelector('[data-rng=az]').value = ST.az; }
      if (ST.col === 'red' && ST.lightOn) { // 붉은 번쩍임: 짧게 켜졌다 꺼짐
        const ph = ((now / 1000) % 1.8); light.intensity = ph < 0.12 ? COL.red[1] : ph < 0.2 ? COL.red[1] * 0.35 : 0.0; anim = true; dirty = true;
      }
      if (ST.view === 'free') {
        const k = s.keys; const mvF = (k.w || k.arrowup || pad.f ? 1 : 0) - (k.s || k.arrowdown || pad.b ? 1 : 0);
        const mvR = (k.d || pad.r ? 1 : 0) - (k.a || pad.l ? 1 : 0);
        const turn = (k.e || k.arrowright || pad.tr ? 1 : 0) - (k.q || k.arrowleft || pad.tl ? 1 : 0);
        if (mvF || mvR || turn) {
          yaw += turn * dt * 1.4;
          const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), rt = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
          camPos.addScaledVector(fwd, mvF * dt * 1.4).addScaledVector(rt, mvR * dt * 1.4);
          applyLook(); anim = true;
        }
      }
      if (ST.view === 'orbit') controls.update();
      if (dirty || anim) { renderer.render(scene, cam); drawLabels(); dirty = false; }
    }

    // 시작
    setLight(); setView(ST.view);
    if (state.lens) { ST.lens = state.lens; s.userLens = true; resize(); }
    updButtons();
    s.raf = requestAnimationFrame(loop);
    return s;
  }

  window.Plan3D = { open, close, isOpen: () => !!CUR };
})();
