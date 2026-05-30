import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { ParticleManager } from './particles';
import { EntityManager } from './entities';
import { BLOCK_DATA, getBlockFaceTexture } from './blocks';
import { DEFAULT_FOV } from './constants';

export interface EngineSettings {
  fpsLimit: number;      // 0 = unlimited
  chunksPerFrame: number;
  renderDistance: number;
}

export type ItemPickupCallback = (itemId: number, count: number) => boolean;

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player: Player;
  private particles: ParticleManager;
  private entityManager: EntityManager;
  private lastTime: number = 0;
  private lastFrameTime: number = 0;
  private running: boolean = false;
  private container: HTMLElement;
  private settings: EngineSettings = { fpsLimit: 0, chunksPerFrame: 8, renderDistance: 8 };
  private wireframeEnabled: boolean = false;

  // FPS tracking
  public fps: number = 0;
  private fpsFrameCount: number = 0;
  private fpsLastTime: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x87ceeb);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.3);
    this.scene.add(hemiLight);

    this.world = new World(this.scene);
    this.particles = new ParticleManager(this.scene);
    this.entityManager = new EntityManager(this.scene);
    this.entityManager.setParticleManager(this.particles);
    this.player = new Player(this.camera, this.world);
    this.player.setEntityManager(this.entityManager);

    this.scene.add(this.player.getHighlightMesh());

    // Block break callback: particles + dropped item
    this.player.setOnBlockBreak((wx, wy, wz, blockType) => {
      const topTex = this.world.getTexture(getBlockFaceTexture(blockType, 'top'));
      const bottomTex = this.world.getTexture(getBlockFaceTexture(blockType, 'bottom'));
      const sideTex = this.world.getTexture(getBlockFaceTexture(blockType, 'side'));
      this.particles.spawnBlockBreak(wx, wy, wz, topTex, bottomTex, sideTex);

      // Spawn dropped item at block position
      const dropPos = new THREE.Vector3(wx + 0.5, wy + 0.5, wz + 0.5);
      this.entityManager.spawnDroppedItem(dropPos, blockType, 1);
    });

    window.addEventListener('resize', this.onResize.bind(this));

    this.renderer.domElement.addEventListener('click', () => {
      if (!this.player.uiOpen) {
        this.player.requestPointerLock(this.renderer.domElement);
      }
    });
  }

  getPlayer(): Player {
    return this.player;
  }

  getWorld(): World {
    return this.world;
  }

  setWireframe(enabled: boolean): void {
    this.wireframeEnabled = enabled;
    this.applyWireframe();
  }

  private applyWireframe(): void {
    const enabled = this.wireframeEnabled;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material;
        if (mat instanceof THREE.Material) {
          mat.wireframe = enabled;
        }
      }
    });
  }

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    this.world.setChunksPerFrame(settings.chunksPerFrame);
    this.world.setRenderDistance(settings.renderDistance);
    // Update fog: fogDensity 0 = no fog, 100 = heavy fog
    if (settings.fogDensity <= 0) {
      this.scene.fog = null;
    } else {
      const density = settings.fogDensity * 0.0003;
      this.scene.fog = new THREE.FogExp2(0x87ceeb, density);
    }
  }

  setOnItemPickup(fn: ItemPickupCallback): void {
    this.entityManager.setOnItemPickup(fn);
  }

  /** Throw an item from the player's position in the look direction */
  throwItem(itemId: number, count: number): void {
    const pos = this.player.position.clone();
    pos.y += 1.5; // eye height

    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.player.camera.quaternion);

    const drop = this.entityManager.spawnDroppedItem(pos, itemId, count);
    // Override velocity: forward + slight upward
    drop.velocity.set(dir.x * 5, dir.y * 5 + 2, dir.z * 5);
  }

  requestPointerLock(): void {
    this.player.requestPointerLock(this.renderer.domElement);
  }

  exitPointerLock(): void {
    document.exitPointerLock();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.lastFrameTime = this.lastTime;
    this.animate();
  }

  stop(): void {
    this.running = false;
  }

  private animate(): void {
    if (!this.running) return;
    // Use setTimeout to decouple from display refresh rate
    setTimeout(() => this.animate(), 0);

    const now = performance.now();

    // FPS limiting
    if (this.settings.fpsLimit > 0) {
      const frameInterval = 1000 / this.settings.fpsLimit;
      if (now - this.lastFrameTime < frameInterval) return;
      this.lastFrameTime = now;
    }

    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.player.update(dt);
    this.world.update(this.player.position.x, this.player.position.y, this.player.position.z);
    this.entityManager.update(dt, (x, y, z) => this.world.getBlock(x, y, z), this.player.position);
    this.particles.update(dt);

    // Re-apply wireframe after chunk rebuilds
    if (this.wireframeEnabled) this.applyWireframe();

    this.renderer.render(this.scene, this.camera);

    // FPS counter (only counts actual rendered frames)
    this.fpsFrameCount++;
    if (now - this.fpsLastTime >= 1000) {
      this.fps = this.fpsFrameCount;
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }
  }

  dispose(): void {
    this.running = false;
    this.entityManager.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
