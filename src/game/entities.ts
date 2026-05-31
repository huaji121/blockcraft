import * as THREE from 'three';
import { ITEM_REGISTRY } from './items';
import { BLOCK_DATA } from './blocks';
import type { ParticleManager } from './particles';
import { ENTITY_PUSH_FORCE, PLAYER_PUSH_FORCE } from './constants';

const ENTITY_WIDTH = 0.6;
const ENTITY_HEIGHT = 1.2;
const ENTITY_GRAVITY = 32; // 0.08 blocks/tick² at 20 ticks/s
const ENTITY_MAX_HP = 20;
const KNOCKBACK_STRENGTH = 6;
const DAMAGE_FLASH_DURATION = 150; // ms
const GROUND_FRICTION = 8;

// Dropped item constants
const DROP_SIZE = 0.25;
const DROP_PICKUP_RANGE = 1.5;
const DROP_PICKUP_DELAY = 500; // ms before item can be picked up
const DROP_MERGE_RANGE = 0.5; // merge with nearby same-type drops
const DROP_LIFETIME = 60_000; // 60 seconds

export class Entity {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public hp: number = ENTITY_MAX_HP;
  public mesh: THREE.Mesh;
  public width: number = ENTITY_WIDTH;
  public height: number = ENTITY_HEIGHT;
  public pushForce: number = ENTITY_PUSH_FORCE;

  private flashUntil: number = 0;
  private originalColor: THREE.Color;
  protected material: THREE.MeshLambertMaterial;
  protected scene: THREE.Scene;
  private isGrounded: boolean = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color: number = 0xcc8844) {
    this.scene = scene;
    this.position = position.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.material = new THREE.MeshLambertMaterial({ color });
    this.originalColor = new THREE.Color(color);

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

    this.velocity.x += knockbackDir.x * KNOCKBACK_STRENGTH;
    this.velocity.y += 4;
    this.velocity.z += knockbackDir.z * KNOCKBACK_STRENGTH;
  }

  update(dt: number, getBlock: (x: number, y: number, z: number) => number): boolean {
    if (performance.now() > this.flashUntil) {
      this.material.color.copy(this.originalColor);
    }

    this.isGrounded = this.checkGrounded(getBlock);

    if (this.isGrounded) {
      this.velocity.y = 0;
      const friction = Math.exp(-GROUND_FRICTION * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    } else {
      this.velocity.y -= ENTITY_GRAVITY * dt;
    }

    this.position.x += this.velocity.x * dt;
    if (this.collides(getBlock)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    this.position.z += this.velocity.z * dt;
    if (this.collides(getBlock)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    this.position.y += this.velocity.y * dt;
    if (this.collides(getBlock)) {
      if (this.velocity.y <= 0) {
        this.position.y = Math.floor(this.position.y) + 1;
      } else {
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    this.mesh.position.set(
      this.position.x,
      this.position.y + this.height / 2,
      this.position.z
    );

    return this.hp <= 0;
  }

  private checkGrounded(getBlock: (x: number, y: number, z: number) => number): boolean {
    const halfW = this.width / 2;
    const testY = this.position.y - 0.01;
    const minX = Math.floor(this.position.x - halfW + 0.01);
    const maxX = Math.floor(this.position.x + halfW - 0.01);
    const minZ = Math.floor(this.position.z - halfW + 0.01);
    const maxZ = Math.floor(this.position.z + halfW - 0.01);
    const by = Math.floor(testY);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (getBlock(bx, by, bz) !== 0) return true;
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

  /** Get the entity's axis-aligned bounding box */
  getAABB(): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
    const halfW = this.width / 2;
    return {
      minX: this.position.x - halfW,
      maxX: this.position.x + halfW,
      minY: this.position.y,
      maxY: this.position.y + this.height,
      minZ: this.position.z - halfW,
      maxZ: this.position.z + halfW,
    };
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// ── Dropped Item ──

export class DroppedItem extends Entity {
  public itemId: number;
  public count: number;
  public spawnTime: number;
  private faceMaterials: THREE.MeshLambertMaterial[] = [];

  private static loader = new THREE.TextureLoader();
  private static texCache = new Map<string, THREE.Texture>();

  private static getTex(path: string): THREE.Texture | null {
    if (!path) return null;
    let tex = DroppedItem.texCache.get(path);
    if (!tex) {
      tex = DroppedItem.loader.load(path);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      DroppedItem.texCache.set(path, tex);
    }
    return tex;
  }

  private static makeFaceMat(texPath: string, transparent: boolean): THREE.MeshLambertMaterial {
    const tex = DroppedItem.getTex(texPath);
    return new THREE.MeshLambertMaterial({
      map: tex,
      color: 0xffffff,
      transparent,
      opacity: transparent ? 0.5 : 1,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  constructor(scene: THREE.Scene, position: THREE.Vector3, itemId: number, count: number = 1) {
    super(scene, position, 0xffffff);
    this.itemId = itemId;
    this.count = count;
    this.spawnTime = performance.now();
    this.pushForce = 0; // dropped items don't push anything

    // Build per-face materials: [+X, -X, +Y, -Y, +Z, -Z]
    const item = ITEM_REGISTRY.getById(itemId);
    if (item) {
      const blockType = item.getBlockType();
      const isTransparent = blockType != null && BLOCK_DATA[blockType]?.transparent;
      const side = item.getFaceTexture('side');
      const top = item.getFaceTexture('top');
      const bottom = item.getFaceTexture('bottom');
      this.faceMaterials = [
        DroppedItem.makeFaceMat(side, isTransparent),     // +X right
        DroppedItem.makeFaceMat(side, isTransparent),     // -X left
        DroppedItem.makeFaceMat(top, isTransparent),      // +Y top
        DroppedItem.makeFaceMat(bottom, isTransparent),   // -Y bottom
        DroppedItem.makeFaceMat(side, isTransparent),     // +Z front
        DroppedItem.makeFaceMat(side, isTransparent),     // -Z back
      ];
    }

    // Replace mesh with smaller cube using per-face materials
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const geo = new THREE.BoxGeometry(DROP_SIZE, DROP_SIZE, DROP_SIZE);
    this.width = DROP_SIZE;
    this.height = DROP_SIZE;
    this.mesh = new THREE.Mesh(geo, this.faceMaterials.length > 0 ? this.faceMaterials : undefined);
    this.mesh.position.copy(this.position);
    this.mesh.position.y += DROP_SIZE / 2;
    scene.add(this.mesh);

    // Deterministic velocity based on position + itemId
    const seed = this.dropHash(position.x, position.y, position.z, itemId);
    this.velocity.set(
      ((seed & 0xff) / 255 - 0.5) * 2,
      3 + ((seed >> 8 & 0xff) / 255) * 2,
      ((seed >> 16 & 0xff) / 255 - 0.5) * 2,
    );
  }

  /** Deterministic hash for drop velocity */
  private dropHash(x: number, y: number, z: number, id: number): number {
    let h = ((x * 1097) | 0) ^ ((y * 1549) | 0) ^ ((z * 2039) | 0) ^ ((id * 3571) | 0);
    h = ((h ^ (h >> 13)) * 2654435761) | 0;
    return h >>> 0;
  }

  // Immune to damage
  takeDamage(_amount: number, _knockbackDir: THREE.Vector3): void {}

  dispose(): void {
    for (const mat of this.faceMaterials) mat.dispose();
    this.faceMaterials = [];
    super.dispose();
  }

  update(dt: number, getBlock: (x: number, y: number, z: number) => number): boolean {
    // Rotate slowly
    this.mesh.rotation.y += dt * 2;

    // Check lifetime
    if (performance.now() - this.spawnTime > DROP_LIFETIME) return true;

    return super.update(dt, getBlock);
  }
}

// ── Entity Manager ──

export class EntityManager {
  private entities: Entity[] = [];
  private scene: THREE.Scene;
  private particleManager: ParticleManager | null = null;
  private onItemPickup: ((itemId: number, count: number) => boolean) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setParticleManager(pm: ParticleManager): void {
    this.particleManager = pm;
  }

  setOnItemPickup(fn: (itemId: number, count: number) => boolean): void {
    this.onItemPickup = fn;
  }

  spawn(position: THREE.Vector3): Entity {
    const entity = new Entity(this.scene, position);
    this.entities.push(entity);
    return entity;
  }

  spawnDroppedItem(position: THREE.Vector3, itemId: number, count: number = 1): DroppedItem {
    const drop = new DroppedItem(this.scene, position, itemId, count);
    this.entities.push(drop);
    return drop;
  }

  /** Raycast against entities (ignores DroppedItems). */
  raycastEntities(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): {
    entity: Entity;
    distance: number;
  } | null {
    const ray = new THREE.Ray(origin, direction);
    let closest: { entity: Entity; distance: number } | null = null;

    for (const entity of this.entities) {
      if (entity instanceof DroppedItem) continue; // can't attack dropped items

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

  update(dt: number, getBlock: (x: number, y: number, z: number) => number, playerPos: THREE.Vector3 | null): void {
    // Collect dropped items near player
    if (playerPos && this.onItemPickup) {
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        if (!(e instanceof DroppedItem)) continue;
        const drop = e as DroppedItem;

        // Skip if too new (pickup delay)
        if (performance.now() - drop.spawnTime < DROP_PICKUP_DELAY) continue;

        const dist = playerPos.distanceTo(drop.position);
        if (dist < DROP_PICKUP_RANGE) {
          const pickedUp = this.onItemPickup(drop.itemId, drop.count);
          if (pickedUp) {
            drop.dispose();
            this.entities.splice(i, 1);
          }
        }
      }
    }

    // Merge nearby same-type drops
    const drops = this.entities.filter((e): e is DroppedItem => e instanceof DroppedItem);
    for (let i = 0; i < drops.length; i++) {
      for (let j = i + 1; j < drops.length; j++) {
        const a = drops[i];
        const b = drops[j];
        if (a.itemId !== b.itemId) continue;
        if (a.count + b.count > 64) continue;
        const dist = a.position.distanceTo(b.position);
        if (dist < DROP_MERGE_RANGE) {
          a.count += b.count;
          const idx = this.entities.indexOf(b);
          if (idx !== -1) {
            b.dispose();
            this.entities.splice(idx, 1);
          }
          drops.splice(j, 1);
          j--;
        }
      }
    }

    // Update all entities
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      const shouldRemove = entity.update(dt, getBlock);
      if (shouldRemove) {
        // Spawn death particles for non-item entities
        if (!(entity instanceof DroppedItem) && this.particleManager) {
          this.particleManager.spawnDeathEffect(
            entity.position.x,
            entity.position.y,
            entity.position.z
          );
        }
        entity.dispose();
        this.entities.splice(i, 1);
      }
    }
  }

  /** Handle entity-entity and player-entity AABB collisions with pushing */
  handleEntityCollisions(
    playerAABB: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
    dt: number,
  ): void {
    const liveEntities = this.entities.filter(e => !(e instanceof DroppedItem));

    // Entity vs Entity
    for (let i = 0; i < liveEntities.length; i++) {
      for (let j = i + 1; j < liveEntities.length; j++) {
        const a = liveEntities[i];
        const b = liveEntities[j];
        const aAABB = a.getAABB();
        const bAABB = b.getAABB();

        // Quick AABB overlap check
        if (aAABB.maxX <= bAABB.minX || aAABB.minX >= bAABB.maxX) continue;
        if (aAABB.maxY <= bAABB.minY || aAABB.minY >= bAABB.maxY) continue;
        if (aAABB.maxZ <= bAABB.minZ || aAABB.minZ >= bAABB.maxZ) continue;

        // Compute overlap on each axis
        const overlapX = Math.min(aAABB.maxX - bAABB.minX, bAABB.maxX - aAABB.minX);
        const overlapY = Math.min(aAABB.maxY - bAABB.minY, bAABB.maxY - aAABB.minY);
        const overlapZ = Math.min(aAABB.maxZ - bAABB.minZ, bAABB.maxZ - aAABB.minZ);

        // Push along the axis of least overlap (minimum translation vector)
        const totalPush = a.pushForce + b.pushForce;
        if (totalPush === 0) continue;
        const aRatio = a.pushForce / totalPush;
        const bRatio = b.pushForce / totalPush;

        if (overlapX <= overlapY && overlapX <= overlapZ) {
          const sign = a.position.x < b.position.x ? -1 : 1;
          const push = overlapX * 0.5;
          a.position.x += sign * push * aRatio;
          b.position.x -= sign * push * bRatio;
        } else if (overlapY <= overlapX && overlapY <= overlapZ) {
          const sign = a.position.y < b.position.y ? -1 : 1;
          const push = overlapY * 0.5;
          a.position.y += sign * push * aRatio;
          b.position.y -= sign * push * bRatio;
        } else {
          const sign = a.position.z < b.position.z ? -1 : 1;
          const push = overlapZ * 0.5;
          a.position.z += sign * push * aRatio;
          b.position.z -= sign * push * bRatio;
        }
      }
    }

    // Player vs Entity: push entities away from player
    for (const entity of this.entities) {
      const eAABB = entity.getAABB();

      if (playerAABB.maxX <= eAABB.minX || playerAABB.minX >= eAABB.maxX) continue;
      if (playerAABB.maxY <= eAABB.minY || playerAABB.minY >= eAABB.maxY) continue;
      if (playerAABB.maxZ <= eAABB.minZ || playerAABB.minZ >= eAABB.maxZ) continue;

      const overlapX = Math.min(playerAABB.maxX - eAABB.minX, eAABB.maxX - playerAABB.minX);
      const overlapY = Math.min(playerAABB.maxY - eAABB.minY, eAABB.maxY - playerAABB.minY);
      const overlapZ = Math.min(playerAABB.maxZ - eAABB.minZ, eAABB.maxZ - playerAABB.minZ);

      const pushForce = PLAYER_PUSH_FORCE * dt;

      if (overlapX <= overlapY && overlapX <= overlapZ) {
        const sign = playerAABB.minX < eAABB.minX ? 1 : -1;
        entity.velocity.x += sign * pushForce;
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        const sign = playerAABB.minY < eAABB.minY ? 1 : -1;
        entity.velocity.y += sign * pushForce;
      } else {
        const sign = playerAABB.minZ < eAABB.minZ ? 1 : -1;
        entity.velocity.z += sign * pushForce;
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
