import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { EnemyId, WeaponId } from "./data";
/** 原创程序模型。共享几何与材质，重复履带节不重复分配 GPU 资源。 */
const geometryCache = new Map<string, T.BufferGeometry>();
const materialCache = new Map<string, T.MeshStandardMaterial>();
let paintTexture: T.CanvasTexture | null = null;
function paint() {
  if (paintTexture) return paintTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e1e4dc";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 637;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = rand() > 0.5 ? "#c8ccc0" : "#f4f4e8";
    ctx.globalAlpha = 0.06 + rand() * 0.12;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1);
  }
  for (let i = 0; i < 65; i++) {
    ctx.strokeStyle = rand() > 0.5 ? "#657366" : "#f7f5df";
    ctx.globalAlpha = 0.12 + rand() * 0.12;
    const x = rand() * 256,
      y = rand() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 + rand() * 15, y + rand() * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  paintTexture = new T.CanvasTexture(canvas);
  paintTexture.colorSpace = T.SRGBColorSpace;
  paintTexture.wrapS = paintTexture.wrapT = T.RepeatWrapping;
  return paintTexture;
}
export function metal(color: number, roughness = 0.67, metalness = 0.5) {
  const key = `${color}:${roughness}:${metalness}`;
  if (!materialCache.has(key)) {
    const m = new T.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      map: metalness > 0.25 ? paint() : null,
    });
    m.userData.shared = true;
    materialCache.set(key, m);
  }
  return materialCache.get(key)!;
}
function geometry(key: string, create: () => T.BufferGeometry) {
  if (!geometryCache.has(key)) geometryCache.set(key, create());
  return geometryCache.get(key)!;
}
export function block(w: number, h: number, d: number, bevel = 0.05) {
  return geometry(`b${w},${h},${d},${bevel}`, () => {
    const s = new T.Shape(),
      x = w / 2,
      z = d / 2,
      b = Math.min(bevel, x / 3, z / 3, h / 3);
    s.moveTo(-x + b, -z);
    s.lineTo(x - b, -z);
    s.lineTo(x, -z + b);
    s.lineTo(x, z - b);
    s.lineTo(x - b, z);
    s.lineTo(-x + b, z);
    s.lineTo(-x, z - b);
    s.lineTo(-x, -z + b);
    s.closePath();
    const g = new T.ExtrudeGeometry(s, {
      depth: Math.max(0.01, h - 2 * b),
      bevelEnabled: b > 0,
      bevelSize: b,
      bevelThickness: b,
      bevelSegments: 1,
      steps: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, b, 0);
    g.computeVertexNormals();
    return g;
  });
}
export function part(
  parent: T.Object3D,
  geo: T.BufferGeometry,
  mat: T.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.ownedMaterial = !mat.userData.shared;
  parent.add(m);
  return m;
}
export function plate(
  parent: T.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  bevel = 0.035,
) {
  return part(parent, block(w, h, d, bevel), metal(color), x, y, z);
}
function cylinder(r: number, h: number, n = 12) {
  return geometry(`c${r},${h},${n}`, () => new T.CylinderGeometry(r, r, h, n));
}
function barrel(
  parent: T.Object3D,
  r: number,
  length: number,
  color: number,
  x: number,
  y: number,
  z: number,
) {
  const b = part(parent, cylinder(r, length), metal(color), x, y, z);
  b.rotation.x = Math.PI / 2;
  return b;
}
export interface TankModel {
  root: T.Group;
  hull: T.Group;
  turret: T.Group;
  gun: T.Group;
  tracks: T.Mesh[];
  lamps: T.Mesh[];
  weapon: WeaponId;
  type: EnemyId | "player";
  core?: T.Mesh;
  pods: T.Object3D[];
}
export function weaponModel(weapon: WeaponId, color = 0x657969) {
  const g = new T.Group();
  const dark = 0x303b3b,
    steel = 0x9ba8a1;
  if (weapon === "shell") {
    barrel(g, 0.15, 1.7, dark, 0, 0.21, 1.12);
    barrel(g, 0.21, 0.5, color, 0, 0.21, 0.62);
    plate(g, 0.42, 0.32, 0.3, steel, 0, 0.05, 2.12);
    plate(g, 0.22, 0.12, 0.04, 0x1c2625, 0, 0.15, 2.29);
  } else if (weapon === "twin") {
    for (const x of [-0.23, 0.23]) {
      barrel(g, 0.09, 1.65, dark, x, 0.2, 1.15);
      barrel(g, 0.14, 0.45, steel, x, 0.2, 0.48);
      for (let i = 0; i < 4; i++)
        barrel(g, 0.125, 0.06, color, x, 0.2, 1.2 + i * 0.17);
    }
    plate(g, 0.7, 0.35, 0.55, color, 0, -0.04, 0.35);
  } else if (weapon === "rail") {
    for (const x of [-0.16, 0.16])
      plate(g, 0.15, 0.24, 2.35, dark, x, 0.06, 1.45);
    for (const z of [0.6, 1, 1.4, 1.8, 2.2]) {
      plate(g, 0.58, 0.36, 0.11, steel, 0, -0.01, z);
      plate(g, 0.27, 0.06, 0.13, 0x8dc5cd, 0, 0.36, z);
    }
    plate(g, 0.65, 0.4, 0.6, color, 0, -0.02, 0.25);
  } else if (weapon === "scatter") {
    barrel(g, 0.26, 1.2, dark, 0, 0.2, 0.95);
    plate(g, 0.68, 0.46, 0.55, steel, 0, -0.03, 1.63);
    for (const x of [-0.2, 0, 0.2]) barrel(g, 0.07, 0.08, dark, x, 0.2, 1.93);
  } else if (weapon === "missile") {
    plate(g, 1.2, 0.13, 1.4, dark, 0, 0.1, 0.53);
    for (const x of [-0.37, 0.37])
      for (const y of [0.3, 0.64]) {
        plate(g, 0.38, 0.3, 1.35, color, x, y, 0.63);
        barrel(g, 0.12, 0.07, 0x202c2c, x, y + 0.15, 1.33);
        const cone = part(
          g,
          geometry("missiletip", () => new T.ConeGeometry(0.085, 0.19, 10)),
          metal(0xbe7753),
          x,
          y + 0.15,
          1.37,
        );
        cone.rotation.x = Math.PI / 2;
      }
  } else {
    plate(g, 0.72, 0.25, 0.8, dark, 0, 0.04, 0.45);
    for (const x of [-0.32, 0.32]) {
      barrel(g, 0.11, 1.1, steel, x, 0.4, 1.02);
      for (let i = 0; i < 4; i++)
        barrel(g, 0.19, 0.1, 0x8da9af, x, 0.4, 0.75 + i * 0.18);
    }
    const orb = part(
      g,
      geometry("arcOrb", () => new T.SphereGeometry(0.2, 12, 8)),
      new T.MeshStandardMaterial({
        color: 0xa9e1ed,
        emissive: 0x4a94a1,
        emissiveIntensity: 0.7,
      }),
      0,
      0.38,
      1.3,
    );
    orb.name = "emitter";
  }
  return g;
}
export function tankModel(
  type: EnemyId | "player",
  weapon: WeaponId,
  color = 0x667e6c,
): TankModel {
  const root = new T.Group(),
    hull = new T.Group(),
    turret = new T.Group(),
    tracks: T.Mesh[] = [],
    lamps: T.Mesh[] = [],
    pods: T.Object3D[] = [];
  root.add(hull);
  root.add(turret);
  turret.position.y = 0.87;
  const player = type === "player",
    boss = type === "boss",
    wheeled = type === "scout" || type === "bomber";
  const width = boss ? 3.1 : type === "heavy" ? 2.3 : wheeled ? 1.6 : 1.9,
    length = boss ? 4.6 : type === "artillery" ? 3 : 2.6;
  const rubber = metal(0x252e2c, 0.94, 0.08),
    wheel = metal(0x56605b, 0.78, 0.4),
    armor = metal(color);
  for (const side of [-1, 1]) {
    const x = (side * width) / 2;
    if (wheeled) {
      for (const z of [-0.82, 0, 0.82]) {
        const tire = part(hull, cylinder(0.34, 0.25, 12), rubber, x, 0.38, z);
        tire.rotation.z = Math.PI / 2;
        tracks.push(tire);
        const hub = part(hull, cylinder(0.16, 0.27, 10), wheel, x, 0.38, z);
        hub.rotation.z = Math.PI / 2;
      }
    } else {
      plate(hull, 0.35, 0.53, length, 0x2b3431, x, 0.17, 0, 0.12);
      for (let i = 0; i < (boss ? 7 : 5); i++) {
        const z = -length * 0.37 + (i * length * 0.74) / (boss ? 6 : 4);
        const w = part(hull, cylinder(0.265, 0.39), wheel, x, 0.43, z);
        w.rotation.z = Math.PI / 2;
      }
      for (let i = 0; i < 13; i++) {
        const z = -length * 0.45 + (i / 12) * length * 0.9;
        const tread = plate(hull, 0.44, 0.07, 0.13, 0x414b45, x, 0.73, z);
        tracks.push(tread);
        plate(hull, 0.44, 0.07, 0.13, 0x414b45, x, 0.11, z);
      }
      plate(hull, 0.54, 0.12, length * 0.88, color, x, 0.79, -0.05);
      for (const z of [-length * 0.25, length * 0.25])
        plate(hull, 0.56, 0.06, 0.2, 0x8c9a85, x, 0.92, z);
    }
  }
  plate(hull, width * 0.83, 0.48, length * 0.86, color, 0, 0.46, 0, 0.14);
  const nose = plate(
    hull,
    width * 0.78,
    0.15,
    0.65,
    color,
    0,
    0.83,
    length * 0.28,
  );
  nose.rotation.x = -0.16;
  plate(hull, width * 0.7, 0.09, 0.38, 0x3b4a41, 0, 0.94, -length * 0.31);
  for (let i = 0; i < 7; i++)
    plate(
      hull,
      width * 0.51,
      0.035,
      0.035,
      0x192b25,
      0,
      1.04,
      -length * 0.36 + i * 0.055,
    );
  for (const side of [-1, 1]) {
    const lamp = part(
      hull,
      block(0.16, 0.12, 0.07, 0.02),
      new T.MeshStandardMaterial({
        color: player ? 0xf5e9b6 : 0xdfa27b,
        emissive: player ? 0xc5bb79 : 0xa95735,
        emissiveIntensity: 0.8,
      }),
      side * width * 0.31,
      0.85,
      length * 0.45,
    );
    lamps.push(lamp);
    plate(
      hull,
      0.1,
      0.13,
      0.08,
      0xb7604a,
      side * width * 0.32,
      0.72,
      -length * 0.46,
    );
    const exhaust = part(
      hull,
      cylinder(0.09, 0.4),
      metal(0x434b44),
      side * width * 0.28,
      0.95,
      -length * 0.35,
    );
    exhaust.rotation.x = -0.3;
    // 侧装甲与接缝令车体由实际结构构成，而非单色几何块。
    for (let i = 0; i < 3; i++)
      plate(
        hull,
        0.07,
        0.32,
        0.56,
        color,
        side * (width * 0.47),
        0.49,
        -0.65 + i * 0.62,
      );
  }
  const turretGeo = geometry(`turret-${type}`, () => {
    const shape = new T.Shape();
    shape.moveTo(-0.63, -0.62);
    shape.lineTo(0.63, -0.62);
    shape.lineTo(0.72, 0.1);
    shape.lineTo(0.4, 0.62);
    shape.lineTo(-0.4, 0.62);
    shape.lineTo(-0.72, 0.1);
    shape.closePath();
    const g = new T.ExtrudeGeometry(shape, {
      depth: 0.43,
      bevelEnabled: true,
      bevelSize: 0.06,
      bevelThickness: 0.05,
      bevelSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    return g;
  });
  part(turret, turretGeo, armor, 0, 0.09, 0);
  part(turret, cylinder(0.26, 0.08), metal(0x8a9a87), -0.15, 0.62, -0.16);
  plate(turret, 0.28, 0.07, 0.15, 0x233b32, 0.25, 0.65, 0.02);
  const antenna = part(
    turret,
    cylinder(0.018, 1.05, 6),
    metal(0x363e36),
    -0.48,
    0.95,
    -0.4,
  );
  antenna.rotation.z = 0.1;
  const stripe = plate(
    turret,
    0.24,
    0.018,
    0.55,
    player ? 0xc3d2bc : 0xd6a081,
    0.4,
    0.61,
    -0.14,
  );
  stripe.rotation.y = 0.1;
  let actualWeapon = weapon;
  if (type === "artillery") actualWeapon = "rail";
  if (type === "bomber") actualWeapon = "missile";
  if (type === "engineer") actualWeapon = "twin";
  if (type === "jammer") actualWeapon = "arc";
  const gun = weaponModel(actualWeapon, color);
  gun.position.y = 0.18;
  turret.add(gun);
  if (type === "scout") {
    turret.scale.set(0.67, 0.7, 0.75);
    hull.scale.z = 0.85;
  }
  if (type === "heavy") {
    turret.scale.set(1.15, 1.15, 1);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++)
        plate(
          hull,
          0.18,
          0.42,
          0.48,
          0x8a8372,
          side * 1.18,
          0.43,
          -0.88 + i * 0.58,
        );
  }
  if (type === "artillery") {
    gun.rotation.x = -0.15;
    turret.position.z = -0.3;
    plate(hull, 1.3, 0.5, 0.5, color, 0, 0.78, -1);
  }
  if (type === "bomber") {
    turret.visible = false;
    for (const x of [-0.35, 0.35]) {
      const fuel = part(
        hull,
        cylinder(0.27, 1.15),
        metal(0xb87349),
        x,
        1.03,
        0,
      );
      fuel.rotation.x = Math.PI / 2;
      for (const z of [-0.35, 0.35])
        barrel(hull, 0.29, 0.07, 0x443c30, x, 1.03, z);
    }
    plate(hull, 0.4, 0.08, 0.5, 0xf0c57a, 0, 0.88, 0.95);
  }
  if (type === "engineer") {
    turret.scale.set(0.7, 0.8, 0.75);
    const arm = plate(hull, 0.16, 0.2, 1.6, 0xb8a56c, 0.7, 1.1, -0.2);
    arm.rotation.x = -0.5;
    plate(hull, 0.9, 0.45, 0.6, 0x9aa482, 0, 0.87, -0.8);
  }
  if (type === "jammer") {
    turret.visible = false;
    const mast = part(hull, cylinder(0.07, 1.2), metal(0x88929a), 0, 1.3, -0.3);
    pods.push(mast);
    const dish = part(
      hull,
      geometry(
        "dish",
        () => new T.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, 0.75),
      ),
      metal(0xb0b7bb),
      0,
      1.8,
      -0.3,
    );
    dish.rotation.x = -0.7;
    pods.push(dish);
  }
  let core: T.Mesh | undefined;
  if (boss) {
    turret.scale.set(1.7, 1.4, 1.5);
    turret.position.set(0, 1.0, 0.3);
    for (const x of [-1.15, 1.15]) {
      const pod = weaponModel("missile", 0x7b827f);
      pod.position.set(x, 1, -0.7);
      pod.scale.set(0.8, 0.8, 0.9);
      hull.add(pod);
      pods.push(pod);
    }
    plate(hull, 1.8, 0.65, 1.1, 0x505b58, 0, 0.9, -1.5);
    core = part(
      hull,
      block(1.2, 0.12, 0.7),
      new T.MeshStandardMaterial({
        color: 0xffb579,
        emissive: 0xd37c3d,
        emissiveIntensity: 0.9,
      }),
      0,
      1.58,
      -1.5,
    );
    for (let i = 0; i < 5; i++)
      plate(hull, 0.06, 0.12, 0.8, 0x46514e, -0.5 + i * 0.25, 1.68, -1.5);
  }
  // 按材质合并静态装甲，履带、灯、炮塔和可损坏部件保留独立变换。
  if (!wheeled) {
    const animatedTracks: T.Mesh[] = [];
    for (const side of [-1, 1]) {
      const pieces = tracks.filter((t) => Math.sign(t.position.x) === side);
      const copies = pieces.map((piece) => {
        piece.updateMatrix();
        return piece.geometry.clone().applyMatrix4(piece.matrix);
      });
      const joined = mergeGeometries(copies);
      copies.forEach((c) => c.dispose());
      if (joined) {
        pieces.forEach((t) => hull.remove(t));
        const movingTrack = part(
          hull,
          joined,
          pieces[0].material as T.Material,
        );
        movingTrack.userData.ownedGeometry = true;
        movingTrack.userData.baseY = 0;
        animatedTracks.push(movingTrack);
      }
    }
    tracks.splice(0, tracks.length, ...animatedTracks);
  }
  const exclusions = new Set<T.Object3D>([
    ...tracks,
    ...lamps,
    ...pods,
    ...(core ? [core] : []),
  ]);
  mergeParts(hull, exclusions);
  mergeParts(gun, new Set());
  return { root, hull, turret, gun, tracks, lamps, weapon, type, core, pods };
}

function mergeParts(parent: T.Group, excluded: Set<T.Object3D>) {
  const buckets = new Map<T.Material, T.Mesh[]>();
  for (const child of [...parent.children])
    if (
      child instanceof T.Mesh &&
      !excluded.has(child) &&
      !Array.isArray(child.material)
    ) {
      const list = buckets.get(child.material) ?? [];
      list.push(child);
      buckets.set(child.material, list);
    }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      mesh.updateMatrix();
      const g = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      return g.applyMatrix4(mesh.matrix);
    });
    const joined = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (joined) {
      meshes.forEach((mesh) => parent.remove(mesh));
      const merged = part(parent, joined, mat);
      merged.userData.ownedGeometry = true;
    }
  }
}

/** 只释放该模型私有的合并网格和发光材质，共享缓存不得随敌军死亡销毁。 */
export function disposeModel(root: T.Object3D) {
  root.traverse((child) => {
    if (child instanceof T.Mesh) {
      if (child.userData.ownedGeometry) child.geometry.dispose();
      if (child.userData.ownedMaterial)
        (Array.isArray(child.material)
          ? child.material
          : [child.material]
        ).forEach((m) => m.dispose());
    }
  });
}

export function baseModel() {
  const g = new T.Group();
  plate(g, 4.7, 0.23, 4.7, 0x666d63, 0, 0.02, 0, 0.16);
  plate(g, 3.8, 0.85, 3.5, 0x7d8f7b, 0, 0.23, 0, 0.22);
  plate(g, 3.25, 0.13, 3, 0xa2afa1, 0, 1.13, 0, 0.14);
  plate(g, 2.3, 0.7, 2.3, 0x5c7166, 0, 1.25, 0, 0.17);
  plate(g, 2.5, 0.16, 2.5, 0x95a694, 0, 1.95, 0, 0.16);
  for (const x of [-1.15, 1.15])
    plate(g, 0.13, 0.38, 0.12, 0xb8dbc9, x, 1.28, 1.18);
  for (const x of [-0.76, 0, 0.76])
    plate(g, 0.48, 0.27, 0.08, 0x223e3b, x, 1.49, 1.18);
  part(g, cylinder(0.06, 2.6), metal(0x586c62), 0.68, 2.6, -0.6);
  const radar = part(
    g,
    geometry(
      "baseradar",
      () => new T.TorusGeometry(0.65, 0.06, 6, 20, Math.PI),
    ),
    metal(0xc1d0b8),
    0.68,
    3.9,
    -0.6,
  );
  radar.rotation.y = 0.5;
  radar.name = "radar";
  const emblem = plate(g, 0.75, 0.09, 0.75, 0xe2d7ad, 0, 2.14, 0);
  emblem.rotation.y = Math.PI / 4;
  mergeParts(g, new Set([radar]));
  return g;
}

export function obstacleModel(
  kind: string,
  w: number,
  d: number,
  biome: number,
  seed: number,
) {
  const g = new T.Group(),
    brick = [0x9d7158, 0xb38f68, 0x8a9999][biome];
  if (kind === "brick") {
    const rows = 3,
      columns = Math.max(2, Math.round(w / 0.65));
    plate(g, w - 0.03, 1.28, d - 0.03, 0x6b675b, 0, 0, 0);
    // 正面与顶面的错缝砖纹是结构细节，不只是换色立方体。
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < columns; col++) {
        const x = -w / 2 + ((col + 0.5) * w) / columns,
          y = 0.04 + row * 0.43;
        plate(
          g,
          w / columns - 0.045,
          0.38,
          d + 0.015,
          brick + ((row + col + seed) % 3) * 0x030201,
          x,
          y,
          0,
          0.025,
        );
      }
  } else if (kind === "steel") {
    plate(g, w, 1.6, d, 0x677475, 0, 0, 0, 0.1);
    for (const x of [-w * 0.39, w * 0.39])
      plate(g, 0.16, 1.8, d + 0.08, 0x879291, x, 0, 0);
    for (const z of [-d / 2 - 0.045, d / 2 + 0.045]) {
      plate(g, w * 0.65, 0.18, 0.06, 0x9da496, 0, 0.8, z);
      for (const x of [-w * 0.28, w * 0.28])
        plate(g, 0.07, 0.08, 0.06, 0xc2c6b5, x, 1.3, z);
    }
    plate(g, w, 0.12, d, 0x8a9998, 0, 1.62, 0);
  } else if (kind === "sandbag") {
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 3; i++)
        plate(
          g,
          w / 3 - 0.035,
          0.34,
          d * 0.9,
          r ? 0xaaa283 : 0x968e70,
          -w / 2 + ((i + 0.5) * w) / 3,
          0.04 + r * 0.32,
          0,
          0.13,
        );
  } else if (kind === "barrel") {
    const radius = Math.min(w, d) * 0.4;
    part(g, cylinder(radius, 1.25, 16), metal(0xb47149, 0.75, 0.3), 0, 0.65, 0);
    for (const y of [0.22, 1.03])
      part(g, cylinder(radius + 0.03, 0.07, 16), metal(0x5b6255), 0, y, 0);
    part(g, cylinder(radius * 0.85, 0.04, 16), metal(0x8c7153), 0, 1.3, 0);
    plate(g, 0.27, 0.32, 0.035, 0xebcb7a, 0, 0.57, radius);
    const sign = plate(g, 0.17, 0.17, 0.04, 0x544736, 0, 0.64, radius + 0.025);
    sign.rotation.z = Math.PI / 4;
  } else if (kind === "wreck") {
    plate(g, w * 0.9, 0.7, d * 0.9, 0x626b60, 0, 0.18, 0, 0.13);
    plate(g, w * 0.75, 0.6, d * 0.35, 0x7c7b67, 0, 0.86, d * 0.15, 0.1);
    plate(g, w * 0.6, 0.34, 0.06, 0x37433c, 0, 1.02, d * 0.33);
    for (const x of [-w * 0.45, w * 0.45])
      for (const z of [-d * 0.3, d * 0.3]) {
        const wheel = part(
          g,
          cylinder(0.38, 0.22),
          metal(0x333c32),
          x,
          0.35,
          z,
        );
        wheel.rotation.z = Math.PI / 2;
      }
    const broken = plate(
      g,
      w * 0.7,
      0.07,
      d * 0.3,
      0x8e8067,
      0,
      0.86,
      -d * 0.27,
    );
    broken.rotation.x = -0.3;
  } else if (kind === "rock") {
    const geo = geometry(`rock${seed % 9}`, () => {
      const geo = new T.DodecahedronGeometry(1, 0);
      const a = geo.attributes.position;
      for (let i = 0; i < a.count; i++)
        a.setXYZ(
          i,
          a.getX(i) * (1 + Math.sin(i * 9 + seed) * 0.17),
          a.getY(i),
          a.getZ(i) * (1 + Math.cos(i * 5 + seed) * 0.17),
        );
      geo.computeVertexNormals();
      return geo;
    });
    const rock = part(
      g,
      geo,
      metal(biome === 2 ? 0x88999b : 0x8a826e, 0.98, 0.02),
    );
    rock.scale.set(w / 2, 1.3, d / 2);
    rock.position.y = 0.5;
    if (biome === 2) {
      const cap = part(g, geo, metal(0xd6dfdc, 0.98, 0), 0, 1.12, 0);
      cap.scale.set(w * 0.4, 0.4, d * 0.4);
    }
  } else if (kind === "water") {
    plate(g, w, 0.06, d, biome === 2 ? 0x647e88 : 0x4b6463, 0, -0.02, 0);
    for (const x of [-w / 2, w / 2]) plate(g, 0.18, 0.28, d, 0x7b8276, x, 0, 0);
  }
  mergeParts(g, new Set());
  return g;
}
