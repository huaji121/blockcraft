import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { ParticleManager } from './particles';
import { EntityManager } from './entities';
import { BLOCK_DATA, getBlockFaceTexture } from './blocks';

export interface EngineSettings {
  fpsLimit: number;      // 0 = unlimited
  chunksPerFrame: number;
  renderDistance: number;
}

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
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 140);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200
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
    this.player = new Player(this.camera, this.world);
    this.player.setEntityManager(this.entityManager);

    this.scene.add(this.player.getHighlightMesh());

    // Particle callback on block break
    this.player.setOnBlockBreak((wx, wy, wz, blockType) => {
      const topTex = this.world.getTexture(getBlockFaceTexture(blockType, 'top'));
      const bottomTex = this.world.getTexture(getBlockFaceTexture(blockType, 'bottom'));
      const sideTex = this.world.getTexture(getBlockFaceTexture(blockType, 'side'));
      this.particles.spawnBlockBreak(wx, wy, wz, topTex, bottomTex, sideTex);
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

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    this.world.setChunksPerFrame(settings.chunksPerFrame);
    this.world.setRenderDistance(settings.renderDistance);
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
    requestAnimationFrame(() => this.animate());

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
    this.entityManager.update(dt, (x, y, z) => this.world.getBlock(x, y, z));
    this.particles.update(dt);

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
