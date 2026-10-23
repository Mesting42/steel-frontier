import * as T from "three";
import { BIOMES, ENEMIES, WEAPONS, type WeaponId } from "./data";
import { BASE_POS, HALF } from "./world";
import { clamp, RNG, type V2 } from "./math";
import {
  baseModel,
  block,
  disposeModel,
  metal,
  obstacleModel,
  part,
  plate,
  tankModel,
  type TankModel,
} from "./models";
import type { Actor, Battle, Effect, Warning } from "./battle";
import type { Settings } from "./save";

/** Three.js 仅负责表现，不修改模拟。静态模型跨帧复用，临时特效按生命周期释放。 */
export class Renderer {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(43, 1, 0.1, 220);
  root = new T.Group();
  dynamic = new T.Group();
  environment = new T.Group();
  menu = new T.Group();
  light: T.DirectionalLight;
  actors = new Map<number, TankModel>();
  objects = new Map<number, T.Group>();
  bulletMeshes = new Map<number, T.Mesh>();
  effectMeshes = new Map<number, T.Group>();
  warningMeshes = new Map<number, T.Group>();
  battle: Battle | null = null;
  menuTank: TankModel;
  base: T.Group | null = null;
  menuActive = true;
  private raycaster = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private pointer = new T.Vector2();
  private intersection = new T.Vector3();
  private cameraTarget = new T.Vector3();
  private animationTime = 0;
  private groundTexture: T.CanvasTexture | null = null;
  private previewCache = new Map<string, string>();
  private flash = new T.PointLight(0xffcd8c, 0, 9, 2);
  private weather: T.Points | null = null;
  constructor(
    public canvas: HTMLCanvasElement,
    public settings: Settings,
  ) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.quality === "high" ? 1.8 : 1.2),
    );
    this.renderer.shadowMap.enabled = settings.quality === "high";
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.scene.background = new T.Color(0x9bada9);
    this.scene.fog = new T.Fog(0x9bada9, 48, 110);
    this.scene.add(new T.HemisphereLight(0xdde9ed, 0x606857, 2.2));
    this.light = new T.DirectionalLight(0xffe3b6, 3.2);
    this.light.position.set(-16, 35, 15);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, {
      left: -38,
      right: 38,
      top: 38,
      bottom: -38,
      near: 1,
      far: 95,
    });
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.035;
    this.scene.add(this.light, this.light.target);
    this.scene.add(this.root, this.dynamic, this.environment, this.menu);
    this.scene.add(this.flash);
    this.menuTank = tankModel("player", "shell", 0x677e6c);
    this.menuTank.root.scale.setScalar(2.7);
    this.menuTank.root.position.set(5.2, 0.02, 1);
    this.menuTank.root.rotation.y = -0.55;
    this.menu.add(this.menuTank.root);
    this.makeHangar();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  setQuality() {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.settings.quality === "high" ? 1.8 : 1.2),
    );
    this.renderer.shadowMap.enabled = this.settings.quality === "high";
    this.resize();
  }
  private makeHangar() {
    const floor = part(
      this.menu,
      new T.PlaneGeometry(150, 150),
      new T.MeshStandardMaterial({
        color: 0x56625b,
        roughness: 0.9,
        metalness: 0.2,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    plate(this.menu, 10, 0.14, 8, 0x737e70, 5.2, -0.02, 1, 0.12);
    for (const x of [-0.1, 10.5]) {
      plate(this.menu, 0.08, 0.02, 8, 0xcfbb80, x, 0.15, 1);
      for (let i = 0; i < 7; i++) {
        const mark = plate(
          this.menu,
          0.5,
          0.025,
          0.15,
          0xc8b77e,
          x < 1 ? -0.25 : 10.65,
          0.16,
          -2 + i,
        );
        mark.rotation.y = -0.5;
      }
    }
    for (const x of [-13, 15])
      for (const z of [-12, -3, 10]) {
        plate(this.menu, 0.5, 11, 0.6, 0x34433e, x, 0, z);
        plate(this.menu, 3, 0.3, 0.4, 0x869384, x, 8, z);
      }
    for (const [x, z] of [
      [-2, -8],
      [11, -7],
      [14, 5],
    ]) {
      const crate = obstacleModel("wreck", 2.5, 4, 0, x);
      crate.position.set(x, 0, z);
      this.menu.add(crate);
    }
    const wall = plate(this.menu, 50, 9, 0.5, 0x3f4e45, 0, 0, -17);
    wall.receiveShadow = true;
    for (let x = -20; x <= 20; x += 5) {
      plate(this.menu, 0.18, 8, 0.2, 0x637067, x, 0, -16.6);
      plate(this.menu, 3.8, 0.8, 0.03, 0x899a87, x, 6.5, -16.65);
    }
    const fill = new T.PointLight(0xd0dec2, 16, 20, 2);
    fill.position.set(7, 8, -4);
    this.menu.add(fill);
  }
  showMenu(weapon: WeaponId = "shell") {
    this.menuActive = true;
    this.menu.visible = true;
    this.root.visible = false;
    this.dynamic.visible = false;
    this.environment.visible = false;
    this.scene.background = new T.Color(0x303f39);
    this.scene.fog = new T.Fog(0x34453d, 25, 85);
    if (this.menuTank.weapon !== weapon) {
      this.menu.remove(this.menuTank.root);
      disposeModel(this.menuTank.root);
      this.menuTank = tankModel("player", weapon, 0x677e6c);
      this.menuTank.root.scale.setScalar(2.7);
      this.menuTank.root.position.set(5.2, 0.02, 1);
      this.menuTank.root.rotation.y = -0.55;
      this.menu.add(this.menuTank.root);
    }
  }
  setBattle(battle: Battle) {
    this.clearBattle();
    this.battle = battle;
    this.menuActive = false;
    this.menu.visible = false;
    this.root.visible = true;
    this.dynamic.visible = true;
    this.environment.visible = true;
    const biome = BIOMES[battle.world.biome];
    this.scene.background = new T.Color(biome.sky);
    this.scene.fog = new T.Fog(biome.sky, 55, 120);
    this.light.color.setHex(biome.light);
    this.groundTexture = this.makeGround(battle.world.seed, battle.world.biome);
    const ground = part(
      this.root,
      new T.PlaneGeometry(HALF * 2, HALF * 2),
      new T.MeshStandardMaterial({
        map: this.groundTexture,
        roughness: 0.95,
        metalness: 0.07,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    for (const t of battle.world.terrain) {
      const mesh = plate(
        this.root,
        t.w,
        0.012,
        t.d,
        t.kind === "mud" ? 0x625e47 : 0x8aa5ac,
        t.x,
        0.014,
        t.z,
        0.1,
      );
      (mesh.material as T.MeshStandardMaterial) = new T.MeshStandardMaterial({
        color: t.kind === "mud" ? 0x5f624b : 0x9bb8c2,
        roughness: t.kind === "mud" ? 0.78 : 0.19,
        metalness: 0.12,
      });
      mesh.userData.ownedMaterial = true;
    }
    for (const o of battle.world.objects) {
      const m = obstacleModel(o.kind, o.w, o.d, battle.world.biome, o.id);
      m.position.set(o.x, 0, o.z);
      this.root.add(m);
      this.objects.set(o.id, m);
    }
    this.base = baseModel();
    this.base.position.set(BASE_POS.x, 0, BASE_POS.z);
    this.root.add(this.base);
    const station = new T.Group();
    plate(station, 3.4, 0.1, 3.4, 0x5b7866);
    plate(station, 1.3, 1.4, 0.8, 0x778d74, -0.9, 0, -0.8);
    plate(station, 0.7, 0.13, 0.24, 0xc6d5b9, -0.9, 0.9, -0.35);
    plate(station, 0.24, 0.13, 0.7, 0xc6d5b9, -0.9, 0.9, -0.35);
    const mast = part(
      station,
      new T.CylinderGeometry(0.03, 0.03, 2),
      metal(0x9cae97),
      1,
      1,
      -0.9,
    );
    mast.castShadow = true;
    mast.userData.ownedGeometry = true;
    station.position.set(battle.station.x, 0.02, battle.station.z);
    this.root.add(station);
    this.makeSurroundings(battle.world.seed, battle.world.biome);
    const weatherRng = new RNG(battle.world.seed + 77),
      points = new Float32Array(80 * 3);
    for (let i = 0; i < 80; i++) {
      points[i * 3] = weatherRng.next() * 70 - 35;
      points[i * 3 + 1] = weatherRng.next() * 13 + 1;
      points[i * 3 + 2] = weatherRng.next() * 70 - 35;
    }
    const weatherGeometry = new T.BufferGeometry();
    weatherGeometry.setAttribute("position", new T.BufferAttribute(points, 3));
    this.weather = new T.Points(
      weatherGeometry,
      new T.PointsMaterial({
        color: battle.world.biome === 2 ? 0xe2eeee : 0xcbb99a,
        size: battle.world.biome === 2 ? 0.085 : 0.045,
        transparent: true,
        opacity: battle.world.biome === 2 ? 0.65 : 0.22,
        depthWrite: false,
      }),
    );
    this.environment.add(this.weather);
    this.cameraTarget.set(battle.player.x, 0, battle.player.z - 2);
    this.camera.position.copy(this.cameraTarget).add(new T.Vector3(0, 30, 23));
    this.camera.lookAt(this.cameraTarget);
  }
  private clearBattle() {
    // 共享模型资源保留；只销毁当前关卡专用的纹理与地面材质。
    this.groundTexture?.dispose();
    this.groundTexture = null;
    if (this.weather) {
      this.weather.geometry.dispose();
      (this.weather.material as T.Material).dispose();
      this.weather = null;
    }
    this.root.traverse((o) => {
      if (o instanceof T.Mesh && o.geometry.type === "PlaneGeometry") {
        o.geometry.dispose();
        const m = o.material as T.Material;
        m.dispose();
      }
    });
    for (const g of [
      ...this.effectMeshes.values(),
      ...this.warningMeshes.values(),
    ])
      this.disposeTransient(g);
    for (const m of this.bulletMeshes.values()) {
      m.geometry.dispose();
      (m.material as T.Material).dispose();
    }
    this.actors.forEach((m) => disposeModel(m.root));
    disposeModel(this.root);
    disposeModel(this.environment);
    this.root.clear();
    this.dynamic.clear();
    this.environment.clear();
    this.actors.clear();
    this.objects.clear();
    this.effectMeshes.clear();
    this.warningMeshes.clear();
    this.bulletMeshes.clear();
    this.base = null;
  }
  private makeGround(seed: number, biome: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const c = canvas.getContext("2d")!,
      rng = new RNG(seed);
    c.fillStyle = BIOMES[biome].dirt;
    c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 33000; i++) {
      const a = rng.next();
      c.fillStyle =
        a > 0.5
          ? `rgba(235,239,219,${rng.next() * 0.11})`
          : `rgba(22,35,28,${rng.next() * 0.16})`;
      const size = rng.next() * 4 + 0.5;
      c.fillRect(rng.next() * 1024, rng.next() * 1024, size, size * 0.6);
    }
    if (biome === 0) {
      c.fillStyle = "#5f6962";
      c.fillRect(438, 0, 148, 1024);
      c.fillRect(0, 420, 1024, 110);
      c.strokeStyle = "#999a7d";
      c.lineWidth = 3;
      c.setLineDash([19, 26]);
      c.beginPath();
      c.moveTo(512, 0);
      c.lineTo(512, 840);
      c.stroke();
      c.setLineDash([]);
      for (let i = 0; i < 20; i++) {
        const x = rng.next() * 1024,
          y = rng.next() * 1024;
        c.fillStyle = "rgba(43,63,57,.19)";
        c.beginPath();
        c.ellipse(
          x,
          y,
          rng.next() * 28 + 4,
          rng.next() * 8 + 3,
          -0.4,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    } else if (biome === 1) {
      c.strokeStyle = "rgba(90,75,49,.15)";
      c.lineWidth = 2;
      for (let i = 0; i < 90; i++) {
        const x = rng.next() * 1024,
          y = rng.next() * 1024;
        c.beginPath();
        c.moveTo(x, y);
        c.bezierCurveTo(x + 30, y - 8, x + 45, y + 10, x + 90, y + 2);
        c.stroke();
      }
    } else {
      c.fillStyle = "rgba(232,243,241,.3)";
      for (let i = 0; i < 130; i++) {
        c.beginPath();
        c.ellipse(
          rng.next() * 1024,
          rng.next() * 1024,
          rng.next() * 60,
          rng.next() * 18,
          0.2,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    // 两道履带压痕沿主路延伸，增加比例感。
    c.strokeStyle = biome === 2 ? "rgba(91,119,125,.22)" : "rgba(48,52,38,.18)";
    c.lineWidth = 4;
    for (const x of [478, 506, 545, 571]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x - 80, 350, x + 100, 600, x, 1024);
      c.stroke();
    }
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  private makeSurroundings(seed: number, biome: number) {
    const rng = new RNG(seed + 19);
    for (let i = 0; i < 42; i++) {
      const side = i % 4,
        along = -35 + Math.floor(i / 4) * 7.3;
      const x = side < 2 ? (side === 0 ? -34 : 34) : along,
        z = side >= 2 ? (side === 2 ? -34 : 34) : along;
      plate(this.environment, 0.14, 1.3, 0.14, 0x69756a, x, 0, z);
      if (i < 38) {
        const beam = plate(
          this.environment,
          7,
          0.05,
          0.04,
          0x8a9585,
          x,
          0.9,
          z,
        );
        if (side < 2) beam.rotation.y = Math.PI / 2;
      }
    }
    for (const x of [-40, 40])
      for (const z of [-25, -4, 18]) {
        if (biome === 0) {
          plate(this.environment, 10, 5.5, 14, 0x667363, x, 0, z, 0.08);
          const roof = plate(
            this.environment,
            11,
            0.4,
            15,
            0x87917e,
            x,
            5.5,
            z,
          );
          roof.rotation.z = x < 0 ? 0.08 : -0.08;
          for (let n = 0; n < 7; n++)
            plate(
              this.environment,
              0.08,
              5.4,
              14.1,
              0x7d8876,
              x - 4 + n * 1.3,
              0,
              z,
            );
          const chimney = part(
            this.environment,
            new T.CylinderGeometry(0.55, 0.7, 8, 10),
            metal(0x626f63),
            x + 2,
            4,
            z - 4,
          );
          chimney.castShadow = true;
          chimney.userData.ownedGeometry = true;
        } else if (biome === 1) {
          const rock = obstacleModel("rock", 9, 10, 1, rng.int(1, 99));
          rock.position.set(x, 0, z);
          this.environment.add(rock);
        } else {
          plate(this.environment, 8, 3.5, 9, 0x7f9699, x, 0, z);
          for (const dx of [-2, 2]) {
            const tank = part(
              this.environment,
              new T.CylinderGeometry(1.5, 1.5, 5, 16),
              metal(0xa3b6b7),
              x + dx,
              5,
              z,
            );
            tank.castShadow = true;
            tank.userData.ownedGeometry = true;
          }
        }
      }
  }
  groundPoint(clientX: number, clientY: number): V2 {
    this.pointer.set(
      (clientX / innerWidth) * 2 - 1,
      (-clientY / innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this.intersection);
    return { x: this.intersection.x, z: this.intersection.z };
  }
  project(p: V2, height = 2) {
    const v = new T.Vector3(p.x, height, p.z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * innerWidth,
      y: ((-v.y + 1) / 2) * innerHeight,
      visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
    };
  }
  render(dt: number, aim?: V2) {
    this.animationTime += dt;
    if (this.menuActive) {
      this.camera.position.set(15.5, 11.5, 18.5);
      this.camera.lookAt(2, 0.6, 0.6);
      this.menuTank.turret.rotation.y =
        Math.sin(this.animationTime * 0.13) * 0.14 - 0.2;
    } else if (this.battle) {
      const b = this.battle,
        p = b.player;
      const target = new T.Vector3(
        p.x + clamp((aim?.x ?? p.x) - p.x, -12, 12) * 0.12,
        0,
        p.z - 2 + clamp((aim?.z ?? p.z) - p.z, -12, 12) * 0.12,
      );
      this.cameraTarget.lerp(target, 1 - Math.exp(-dt * 5));
      this.camera.position
        .copy(this.cameraTarget)
        .add(new T.Vector3(0, 30, 23));
      if (this.settings.shake && p.hit > 0 && b.outcome === null) {
        this.camera.position.x += (Math.random() - 0.5) * p.hit * 1.2;
        this.camera.position.y += (Math.random() - 0.5) * p.hit;
      }
      this.camera.lookAt(this.cameraTarget);
      this.updateActors(b, dt);
      this.updateObjects(b);
      this.updateBullets(b);
      this.updateEffects(b);
      this.updateWarnings(b);
      const recentFlash = [...b.effects]
        .reverse()
        .find(
          (f) => f.kind === "blast" || (f.kind === "hit" && f.maxLife <= 0.1),
        );
      this.flash.intensity = recentFlash
        ? Math.max(0, 1 - (1 - recentFlash.life / recentFlash.maxLife) * 3) *
          (recentFlash.kind === "blast" ? 16 : 6)
        : 0;
      if (recentFlash) this.flash.position.set(recentFlash.x, 2, recentFlash.z);
      if (this.weather && dt > 0) {
        const attribute = this.weather.geometry.attributes.position;
        for (let i = 0; i < attribute.count; i++) {
          attribute.setY(
            i,
            attribute.getY(i) - dt * (b.world.biome === 2 ? 1.2 : 0.2),
          );
          if (attribute.getY(i) < 0.1) attribute.setY(i, 13);
        }
        attribute.needsUpdate = true;
      }
      if (this.base) {
        const radar = this.base.getObjectByName("radar");
        if (radar) radar.rotation.y += dt * 0.65;
        this.base.scale.y =
          1 + (b.base.hit > 1.8 ? Math.sin(b.base.hit * 40) * 0.015 : 0);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  private updateActors(b: Battle, dt: number) {
    const live = new Set<number>();
    for (const a of [b.player, ...b.enemies]) {
      live.add(a.id);
      const weapon = a.type === "player" ? b.weapon.id : ENEMIES[a.type].weapon;
      let m = this.actors.get(a.id);
      if (!m || m.weapon !== weapon) {
        if (m) {
          this.dynamic.remove(m.root);
          disposeModel(m.root);
        }
        m = tankModel(
          a.type,
          weapon,
          a.type === "player" ? 0x698772 : ENEMIES[a.type].color,
        );
        this.actors.set(a.id, m);
        this.dynamic.add(m.root);
        m.root.scale.setScalar(
          a.type === "player"
            ? 0.82
            : a.type === "boss"
              ? 0.95
              : a.radius / 1.8,
        );
      }
      m.root.position.set(a.x, a.alive ? 0 : -0.5, a.z);
      m.root.visible = a.alive;
      m.hull.rotation.y = a.body;
      m.turret.rotation.y = a.turret;
      m.gun.position.z = -a.recoil * 0.18;
      m.hull.rotation.z =
        Math.sin(this.animationTime * 27 + a.id) *
        Math.min(a.speed, 8) *
        0.0018;
      for (const [i, track] of m.tracks.entries()) {
        if (a.type === "scout" || a.type === "bomber")
          track.rotation.x += dt * a.speed * 2;
        else
          track.position.y =
            (track.userData.baseY ?? 0.73) +
            Math.sin(this.animationTime * a.speed * 4 + i) * 0.018;
      }
      if (m.core) {
        (m.core.material as T.MeshStandardMaterial).emissiveIntensity =
          0.7 + Math.sin(this.animationTime * 5) * 0.3;
        m.pods.forEach((pod, i) => {
          pod.rotation.y = a.phase === 2 ? (i ? -0.25 : 0.25) : 0;
          pod.visible = i > 0 || !a.parts;
        });
      }
      // 灯光闪烁与车体短促压缩承担受击反馈，不改共享材质。
      m.turret.position.y =
        (a.type === "boss" ? 1 : 0.87) - (a.hit > 0 ? 0.03 : 0);
    }
    for (const [id, m] of this.actors)
      if (!live.has(id)) {
        this.dynamic.remove(m.root);
        disposeModel(m.root);
        this.actors.delete(id);
      }
  }
  private updateObjects(b: Battle) {
    for (const o of b.world.objects) {
      const m = this.objects.get(o.id);
      if (!m) continue;
      if (!o.alive) {
        this.root.remove(m);
        disposeModel(m);
        this.objects.delete(o.id);
      } else if (Number.isFinite(o.hp))
        m.scale.y = 0.88 + Math.max(0, o.hp / o.maxHp) * 0.12;
    }
  }
  private updateBullets(b: Battle) {
    const live = new Set<number>();
    for (const bullet of b.bullets) {
      live.add(bullet.id);
      let m = this.bulletMeshes.get(bullet.id);
      if (!m) {
        m = new T.Mesh(
          new T.SphereGeometry(
            bullet.weapon === "missile" ? 0.13 : 0.085,
            6,
            4,
          ),
          new T.MeshBasicMaterial({ color: bullet.color }),
        );
        this.dynamic.add(m);
        this.bulletMeshes.set(bullet.id, m);
      }
      m.position.set(bullet.x, 1.15, bullet.z);
      m.scale.set(1, 1, bullet.weapon === "rail" ? 7 : 2.8);
      m.rotation.y = Math.atan2(bullet.vx, bullet.vz);
    }
    for (const [id, m] of this.bulletMeshes)
      if (!live.has(id)) {
        this.dynamic.remove(m);
        m.geometry.dispose();
        (m.material as T.Material).dispose();
        this.bulletMeshes.delete(id);
      }
  }
  private createEffect(f: Effect) {
    const g = new T.Group();
    if (f.kind === "arc" && f.end) {
      const points = [];
      for (let i = 0; i <= 10; i++)
        points.push(
          new T.Vector3(
            ((f.end.x - f.x) * i) / 10 +
              (i && i < 10 ? Math.sin(i * 8 + f.id) * 0.3 : 0),
            1.25 + (i % 2) * 0.1,
            ((f.end.z - f.z) * i) / 10,
          ),
        );
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({
          color: f.color,
          transparent: true,
          opacity: 1,
        }),
      );
      g.add(line);
      if (f.size > 1) {
        const tube = part(
          g,
          new T.CylinderGeometry(
            0.22,
            0.22,
            Math.hypot(f.end.x - f.x, f.end.z - f.z),
            8,
          ),
          new T.MeshBasicMaterial({
            color: f.color,
            transparent: true,
            opacity: 0.5,
          }),
          (f.end.x - f.x) / 2,
          1.2,
          (f.end.z - f.z) / 2,
        );
        tube.rotation.z = Math.PI / 2;
        tube.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          new T.Vector3(f.end.x - f.x, 0, f.end.z - f.z).normalize(),
        );
      }
    } else if (f.kind === "shield" || f.kind === "heal") {
      const ring = part(
        g,
        new T.RingGeometry(0.91, 1, 48),
        new T.MeshBasicMaterial({
          color: f.color,
          transparent: true,
          opacity: 0.65,
          side: T.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.11;
    } else {
      const count =
        f.kind === "blast"
          ? 8
          : f.kind === "scrap"
            ? 9
            : f.kind === "smoke"
              ? 4
              : 4;
      for (let i = 0; i < count; i++) {
        const mat = new T.MeshBasicMaterial({
          color: f.kind === "blast" && i < 3 ? 0xffdc9b : f.color,
          transparent: true,
          opacity: 0.9,
          depthWrite: f.kind !== "smoke",
        });
        const mesh = part(
          g,
          f.kind === "scrap"
            ? block(0.22, 0.18, 0.28)
            : new T.IcosahedronGeometry(1, 0),
          mat,
        );
        mesh.castShadow = false;
        mesh.userData.i = i;
      }
    }
    g.position.set(f.x, 0, f.z);
    return g;
  }
  private updateEffects(b: Battle) {
    const live = new Set<number>();
    for (const f of b.effects) {
      live.add(f.id);
      let g = this.effectMeshes.get(f.id);
      if (!g) {
        g = this.createEffect(f);
        this.effectMeshes.set(f.id, g);
        this.dynamic.add(g);
      }
      const age = 1 - f.life / f.maxLife;
      if (f.kind === "shield" || f.kind === "heal") {
        g.scale.setScalar(f.size * (0.3 + age * 0.7));
      }
      for (const [i, child] of g.children.entries()) {
        const mesh = child as T.Mesh,
          mat = mesh.material as T.MeshBasicMaterial;
        if (mat)
          mat.opacity =
            f.kind === "smoke"
              ? Math.sin(age * Math.PI) * 0.19
              : (1 - age) * 0.85;
        if (f.kind === "arc" || f.kind === "shield" || f.kind === "heal")
          continue;
        const a = (i / g.children.length) * Math.PI * 2 + f.id * 0.6,
          radius =
            f.size *
            (f.kind === "blast"
              ? age * 0.65
              : f.kind === "scrap"
                ? Math.min(age * 4, 1) * 0.65
                : 0.25);
        mesh.position.set(
          Math.sin(a) * radius,
          f.kind === "scrap"
            ? Math.max(0.1, Math.sin(Math.min(age * 4, 1) * Math.PI) * 1.5)
            : 0.4 + age * (f.kind === "smoke" ? 2.1 : 1),
          Math.cos(a) * radius,
        );
        if (f.kind !== "scrap")
          mesh.scale.setScalar(
            f.size *
              (f.kind === "blast"
                ? 0.38 * (1 - age) + 0.08
                : 0.25 + age * 0.22),
          );
        else {
          mesh.rotation.set(i + age * 9, i, age * 8);
          mat.opacity = age > 0.7 ? (1 - age) / 0.3 : 0.8;
        }
      }
    }
    for (const [id, g] of this.effectMeshes)
      if (!live.has(id)) {
        this.dynamic.remove(g);
        this.disposeTransient(g);
        this.effectMeshes.delete(id);
      }
  }
  private createWarning(w: Warning) {
    const g = new T.Group(),
      color =
        w.kind === "spawn"
          ? 0xe4b67c
          : w.team === "player"
            ? 0xa1d7be
            : 0xef9b77;
    const ring = new T.Mesh(
      new T.RingGeometry(w.radius * 0.94, w.radius, 48),
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        side: T.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    g.add(ring);
    const disc = new T.Mesh(
      new T.CircleGeometry(w.radius, 48),
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.055;
    g.add(disc);
    if (w.kind === "beam" && w.end) {
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(0, 0.2, 0),
          new T.Vector3(w.end.x - w.x, 0.2, w.end.z - w.z),
        ]),
        new T.LineDashedMaterial({
          color,
          dashSize: 0.8,
          gapSize: 0.4,
          transparent: true,
          opacity: 0.8,
        }),
      );
      line.computeLineDistances();
      g.add(line);
    }
    g.position.set(w.x, 0, w.z);
    return g;
  }
  private updateWarnings(b: Battle) {
    const live = new Set<number>();
    for (const w of b.warnings) {
      live.add(w.id);
      let g = this.warningMeshes.get(w.id);
      if (!g) {
        g = this.createWarning(w);
        this.warningMeshes.set(w.id, g);
        this.dynamic.add(g);
      }
      const disc = g.children[1] as T.Mesh;
      disc.scale.setScalar(clamp(1 - w.life / w.maxLife, 0.04, 1));
      (disc.material as T.MeshBasicMaterial).opacity =
        0.14 + Math.sin(this.animationTime * 11) * 0.07;
    }
    for (const [id, g] of this.warningMeshes)
      if (!live.has(id)) {
        this.dynamic.remove(g);
        this.disposeTransient(g);
        this.warningMeshes.delete(id);
      }
  }
  private disposeTransient(g: T.Group) {
    g.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line) {
        if (!(o instanceof T.Mesh && o.geometry.type === "ExtrudeGeometry"))
          o.geometry.dispose();
        const mat = o.material;
        (Array.isArray(mat) ? mat : [mat]).forEach((m: T.Material) =>
          m.dispose(),
        );
      }
    });
  }
  /** 使用游戏同一套模型离屏渲染商品预览，杜绝装备图与实际外观不一致。 */
  preview(weapon: WeaponId) {
    if (this.previewCache.has(weapon)) return this.previewCache.get(weapon)!;
    const scene = new T.Scene();
    scene.background = new T.Color(0x35463f);
    scene.add(new T.HemisphereLight(0xe7eee3, 0x4a6152, 3));
    const light = new T.DirectionalLight(0xffe0ad, 4);
    light.position.set(3, 8, 5);
    scene.add(light);
    const model = tankModel("player", weapon);
    model.root.rotation.y = -0.35;
    scene.add(model.root);
    const camera = new T.PerspectiveCamera(36, 1.75, 0.1, 30);
    camera.position.set(4.5, 4, 6);
    camera.lookAt(0, 0.65, 0.3);
    const size = this.renderer.getSize(new T.Vector2()),
      pixel = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(350, 200, false);
    this.renderer.render(scene, camera);
    const url = this.canvas.toDataURL("image/png");
    disposeModel(model.root);
    this.renderer.setPixelRatio(pixel);
    this.renderer.setSize(size.x, size.y, false);
    this.previewCache.set(weapon, url);
    return url;
  }
}
