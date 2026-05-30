import * as THREE from 'three';

const ENTITY_WIDTH = 0.6;
const ENTITY_HEIGHT = 1.2;
const ENTITY_GRAVITY = 25;
const ENTITY_MAX_HP = 20;
const KNOCKBACK_STRENGTH = 6;
const DAMAGE_FLASH_DURATION = 150; // ms
const GROUND_FRICTION = 8; // horizontal velocity damping per second

export class Entity {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public hp: number = ENTITY_MAX_HP;
  public mesh: THREE.Mesh;
  public width: number = ENTITY_WIDTH;
  public height: number = ENTITY_HEIGHT;

  // Damage flash
  private flashUntil: number = 0;
  private originalColor: THREE.Color;
  private material: THREE.MeshLambertMaterial;

  private scene: THREE.Scene;
  private isGrounded: boolean = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.scene = scene;
    this.position = position.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.material = new THREE.MeshLambertMaterial({ color: 0xcc8844 });
    this.originalColor = new THREE.Color(0xcc8844);

    const geo = new THREE.BoxGeometry(ENTITY_WIDTH, ENTITY_HEIGHT, ENTITY_WIDTH);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.copy(this.position);
    this.mesh.position.y += ENTITY_HEIGHT / 2;
    scene.add(this.mesh);
  }

  takeDamage(amount: number, knockbackDir: THREE.Vector3): void {
    this.hp -= amount;
    this.flashUntil = performance.now() + DAMAGE_FLASH_DURATION;
    this.material.color.set(0xff0000);

    // Apply knockback
    this.velocity.x += knockbackDir.x * KNOCKBACK_STRENGTH;
    this.velocity.y += 4; // slight upward
    this.velocity.z += knockbackDir.z * KNOCKBACK_STRENGTH;
  }

  update(dt: number, getBlock: (x: number, y: number, z: number) => number): boolean {
    // Restore color after flash
    if (performance.now() > this.flashUntil) {
      this.material.color.copy(this.originalColor);
    }

    // Check if grounded by testing block directly below feet
    this.isGrounded = this.checkGrounded(getBlock);

    if (this.isGrounded) {
      // On ground: snap Y, zero vertical velocity, apply horizontal friction
      this.velocity.y = 0;
      // Friction: exponentially damp horizontal velocity
      const friction = Math.exp(-GROUND_FRICTION * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      // Stop tiny movements
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    } else {
      // In air: apply gravity
      this.velocity.y -= ENTITY_GRAVITY * dt;
    }

    // Move X
    this.position.x += this.velocity.x * dt;
    if (this.collides(getBlock)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    // Move Z
    this.position.z += this.velocity.z * dt;
    if (this.collides(getBlock)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    // Move Y
    this.position.y += this.velocity.y * dt;
    if (this.collides(getBlock)) {
      if (this.velocity.y <= 0) {
        // Falling: snap to top of block
        this.position.y = Math.floor(this.position.y) + 1;
      } else {
        // Rising: undo
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    // Update mesh
    this.mesh.position.set(
      this.position.x,
      this.position.y + ENTITY_HEIGHT / 2,
      this.position.z
    );

    // Remove if fell out of world
    return this.position.y < -50 || this.hp <= 0;
  }

  private checkGrounded(getBlock: (x: number, y: number, z: number) => number): boolean {
    // Check if there's a solid block directly below the entity's feet
    const halfW = this.width / 2;
    const testY = this.position.y - 0.01;
    const minX = Math.floor(this.position.x - halfW + 0.01);
    const maxX = Math.floor(this.position.x + halfW - 0.01);
    const minZ = Math.floor(this.position.z - halfW + 0.01);
    const maxZ = Math.floor(this.position.z + halfW - 0.01);
    const by = Math.floor(testY);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (getBlock(bx, by, bz) !== 0) {
          return true;
        }
      }
    }
    return false;
  }

  private collides(getBlock: (x: number, y: number, z: number) => number): boolean {
    return this.collidesAt(getBlock, this.position);
  }

  private collidesAt(getBlock: (x: number, y: number, z: number) => number, pos: THREE.Vector3): boolean {
    const halfW = this.width / 2;
    const minX = Math.floor(pos.x - halfW);
    const maxX = Math.floor(pos.x + halfW);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.height - 0.001);
    const minZ = Math.floor(pos.z - halfW);
    const maxZ = Math.floor(pos.z + halfW);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (getBlock(x, y, z) !== 0) {
            if (
              pos.x + halfW > x && pos.x - halfW < x + 1 &&
              pos.y + this.height > y && pos.y < y + 1 &&
              pos.z + halfW > z && pos.z - halfW < z + 1
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export class EntityManager {
  private entities: Entity[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(position: THREE.Vector3): Entity {
    const entity = new Entity(this.scene, position);
    this.entities.push(entity);
    return entity;
  }

  /** Raycast against entities. Returns closest hit or null. */
  raycastEntities(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): {
    entity: Entity;
    distance: number;
  } | null {
    const ray = new THREE.Ray(origin, direction);
    let closest: { entity: Entity; distance: number } | null = null;

    for (const entity of this.entities) {
      // Create bounding box for entity
      const halfW = entity.width / 2;
      const min = new THREE.Vector3(
        entity.position.x - halfW,
        entity.position.y,
        entity.position.z - halfW
      );
      const max = new THREE.Vector3(
        entity.position.x + halfW,
        entity.position.y + entity.height,
        entity.position.z + halfW
      );
      const box = new THREE.Box3(min, max);

      const hit = new THREE.Vector3();
      if (ray.intersectBox(box, hit)) {
        const dist = origin.distanceTo(hit);
        if (dist <= maxDistance && (!closest || dist < closest.distance)) {
          closest = { entity, distance: dist };
        }
      }
    }

    return closest;
  }

  update(dt: number, getBlock: (x: number, y: number, z: number) => number): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const shouldRemove = this.entities[i].update(dt, getBlock);
      if (shouldRemove) {
        this.entities[i].dispose();
        this.entities.splice(i, 1);
      }
    }
  }

  getEntities(): Entity[] {
    return this.entities;
  }

  dispose(): void {
    for (const entity of this.entities) {
      entity.dispose();
    }
    this.entities = [];
  }
}
