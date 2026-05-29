import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  materials: THREE.MeshLambertMaterial[];
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleManager {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private gravity: number = 15;
  private sharedGeo: THREE.BoxGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  }

  /** Spawn block-breaking particles with per-face textures */
  spawnBlockBreak(
    x: number, y: number, z: number,
    topTex: THREE.Texture | null,
    bottomTex: THREE.Texture | null,
    sideTex: THREE.Texture | null,
  ): void {
    for (let i = 0; i < 8; i++) {
      const makeMat = (tex: THREE.Texture | null) =>
        new THREE.MeshLambertMaterial({
          map: tex ? tex.clone() : null,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });

      const top = makeMat(topTex);
      const bottom = makeMat(bottomTex);
      const side = makeMat(sideTex);

      // BoxGeometry groups: +X, -X, +Y, -Y, +Z, -Z
      const materials = [side, side, top, bottom, side, side];

      const mesh = new THREE.Mesh(this.sharedGeo, materials);
      mesh.position.set(
        x + 0.5 + (Math.random() - 0.5) * 0.8,
        y + 0.5 + (Math.random() - 0.5) * 0.8,
        z + 0.5 + (Math.random() - 0.5) * 0.8,
      );

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 4,
      );

      const life = 0.5 + Math.random() * 0.5;

      this.scene.add(mesh);
      this.particles.push({ mesh, materials, velocity, life, maxLife: life });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.materials.forEach(m => m.dispose());
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity.y -= this.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.z += dt * 3;

      // Fade out all materials
      const alpha = p.life / p.maxLife;
      for (const mat of p.materials) {
        mat.opacity = alpha;
      }
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.materials.forEach(m => m.dispose());
    }
    this.particles = [];
    this.sharedGeo.dispose();
  }
}
