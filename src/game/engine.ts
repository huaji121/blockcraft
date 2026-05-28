import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player: Player;
  private lastTime: number = 0;
  private running: boolean = false;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = false; // Disable for performance
    this.renderer.setClearColor(0x87ceeb); // Sky blue
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 100);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);

    // Hemisphere light for better ambient
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.3);
    this.scene.add(hemiLight);

    // World and Player
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world);

    // Add highlight mesh to scene
    this.scene.add(this.player.getHighlightMesh());

    // Events
    window.addEventListener('resize', this.onResize.bind(this));

    // Click to lock pointer
    this.renderer.domElement.addEventListener('click', () => {
      this.player.requestPointerLock(this.renderer.domElement);
    });
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    this.animate();
  }

  stop(): void {
    this.running = false;
  }

  private animate(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Cap delta time
    this.lastTime = now;

    // Update player
    this.player.update(dt);

    // Update world chunks based on player position
    this.world.update(this.player.position.x, this.player.position.z);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.running = false;
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
