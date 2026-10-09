// The studio as an architectural maquette: white clay walls and tables under a moving sun,
// with one small figure per seat. Units are km (it is a scale model sitting on the real map).
import * as THREE from 'three';

export function roomLayout(builders) {
  const N = builders.length;
  const TABLES = 8, PER_SIDE = Math.ceil(N / (TABLES * 2));
  const SP = 0.05, rowGap = 0.3, sideGap = 0.075;
  const tableLen = PER_SIDE * SP;
  const roomW = tableLen + 0.6, roomH = TABLES * rowGap + 0.4;
  const seats = new Float32Array(N * 2);
  // seat lights from the same part of the map near each other (by bearing from Hialeah)
  const order = [...Array(N).keys()].sort((a, b) => Math.atan2(builders[a][1], builders[a][0]) - Math.atan2(builders[b][1], builders[b][0]));
  order.forEach((bi, k) => {
    const table = Math.floor(k / (PER_SIDE * 2)), r = k % (PER_SIDE * 2), side = r % 2, idx = Math.floor(r / 2);
    seats[bi * 2] = -tableLen / 2 + SP / 2 + idx * SP;
    seats[bi * 2 + 1] = -((TABLES - 1) * rowGap) / 2 + table * rowGap + (side ? sideGap : -sideGap);
  });
  return { seats, TABLES, tableLen, rowGap, roomW, roomH };
}

export function createRoom({ layout, builders, mobile }) {
  const { seats, TABLES, tableLen, rowGap, roomW, roomH } = layout;
  const group = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.92, metalness: 0 });
  const clayDark = new THREE.MeshStandardMaterial({ color: '#d8d0c1', roughness: 0.95 });
  const figureMat = new THREE.MeshStandardMaterial({ color: '#cfc6b6', roughness: 0.8 });
  const litMat = new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: 0.6, emissive: new THREE.Color('#ff9a2e'), emissiveIntensity: 0.55 });
  const H = 0.17, T = 0.034, hw = roomW / 2, hh = roomH / 2, door = 0.38;

  // plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(roomW + 0.5, roomH + 0.5, 0.025), clayDark);
  plinth.position.z = 0.0125; plinth.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, 0.006), clay);
  floor.position.z = 0.028; floor.receiveShadow = true;

  // walls, each rises from the floor on its own beat
  const walls = new THREE.Group();
  const wall = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, H), clay); m.position.set(x, y, 0.028 + H / 2); m.castShadow = m.receiveShadow = true; walls.add(m); return m; };
  wall(roomW + T, T, 0, hh);                                        // north
  wall(T, roomH + T, -hw, 0);                                       // west
  wall(T, roomH + T, hw, 0);                                        // east
  const sLen = (roomW - door) / 2;
  wall(sLen, T, -hw + sLen / 2, -hh);                               // south, left of door
  wall(sLen, T, hw - sLen / 2, -hh);                                // south, right of door
  // window slots on the east wall read as light bars across the floor
  const tables = new THREE.Group();
  for (let t = 0; t < TABLES; t++) {
    const y = -((TABLES - 1) * rowGap) / 2 + t * rowGap;
    const m = new THREE.Mesh(new THREE.BoxGeometry(tableLen, 0.07, 0.036), clay);
    m.position.set(0, y, 0.031 + 0.018); m.castShadow = m.receiveShadow = true;
    tables.add(m);
  }

  // figures: one per seat, a few of them lit (the ones mid-demo)
  const N = builders.length;
  const capsule = new THREE.CapsuleGeometry(0.0115, 0.02, 3, 8);
  capsule.rotateX(Math.PI / 2);
  const litIdx = []; const plainIdx = [];
  for (let i = 0; i < N; i++) ((i * 37) % 100 < 9 ? litIdx : plainIdx).push(i);
  const figs = [];
  for (const [list, mat] of [[plainIdx, figureMat], [litIdx, litMat]]) {
    const im = new THREE.InstancedMesh(capsule, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((i, k) => { m4.makeTranslation(seats[i * 2], seats[i * 2 + 1], 0.031 + 0.0215); im.setMatrixAt(k, m4); });
    im.castShadow = !mobile; im.receiveShadow = false;
    figs.push(im);
  }
  const figures = new THREE.Group(); figs.forEach((f) => figures.add(f));
  group.add(plinth, floor, walls, tables, figures);

  // light: a sun that travels across the model as you scroll, plus a warm sky
  const sun = new THREE.DirectionalLight('#fff3e2', 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -2.1; sc.right = 2.1; sc.top = 2.1; sc.bottom = -2.1; sc.near = 0.1; sc.far = 12;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002; sun.shadow.radius = 4;
  const sunTarget = new THREE.Object3D(); sun.target = sunTarget;
  const sky = new THREE.HemisphereLight('#fff6ea', '#bcae98', 0);
  group.add(sun, sunTarget, sky);
  group.visible = false;

  const parts = [walls, tables, figures];
  return {
    group,
    // rise: 0..1 builds the room; light: 0..1 daylight; sunT: 0..1 sun travel
    update({ rise, light, sunT, show }) {
      group.visible = show > 0.001;
      if (!group.visible) return;
      const e = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
      walls.children.forEach((w, i) => {
        const s = Math.max(0.001, e(rise * 1.7 - i * 0.12));
        w.scale.z = s; w.position.z = 0.028 + (H * s) / 2;
      });
      tables.scale.z = Math.max(0.001, e(rise * 1.8 - 0.4));
      figures.visible = rise > 0.5;
      figures.scale.setScalar(Math.max(0.001, e(rise * 2 - 1)));
      const az = -2.3 + sunT * 1.6, el = 0.62 + Math.sin(sunT * Math.PI) * 0.28;
      sun.position.set(Math.cos(az) * Math.cos(el) * 4, Math.sin(az) * Math.cos(el) * 4, Math.sin(el) * 4);
      sun.intensity = 2.6 * light;
      sky.intensity = 1.7 * light + 0.05;
      litMat.emissiveIntensity = 0.5 + (1 - light) * 2.5;
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); clay.dispose(); clayDark.dispose(); figureMat.dispose(); litMat.dispose(); },
  };
}
