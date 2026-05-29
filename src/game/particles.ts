import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleManager {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private gravity: number = 15;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn block-breaking particles at world position using the given texture */
  spawnBlockBreak(x: number, y: number, z: number, texture: THREE.Texture | null): void {
    const sharedGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(sharedGeo, material);
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
      this.particles.push({ mesh, velocity, life, maxLife: life });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.MeshLambertMaterial).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity.y -= this.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.z += dt * 3;

      // Fade out
      const alpha = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = alpha;
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.MeshLambertMaterial).dispose();
    }
    this.particles = [];
  }
}
