import * as THREE from 'three';
import { ITEM_REGISTRY } from './items';
import { BLOCK_DATA } from './blocks';
import type { ParticleManager } from './particles';
import { ENTITY_PUSH_FORCE } from './constants';

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
  public isGrounded: boolean = false;

  private flashUntil: number = 0;
  private originalColor: THREE.Color;
  protected material: THREE.MeshLambertMaterial;
  protected scene: THREE.Scene;

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

  /** Template method: subclasses override prePhysics() for input/velocity setup */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prePhysics(dt: number): void {}

  update(
    dt: number,
    getBlock: (x: number, y: number, z: number) => number,
    applyFriction: boolean = true,
  ): boolean {
    if (performance.now() > this.flashUntil) {
      this.material.color.copy(this.originalColor);
    }

    // Ground friction (before input so entities decelerate naturally)
    if (applyFriction && this.isGrounded) {
      this.velocity.y = 0;
      const friction = Math.exp(-GROUND_FRICTION * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }

    // Hook for subclasses (Player sets velocity from input here)
    this.prePhysics(dt);

    // Grounded check (after prePhysics so jump isGrounded=false isn't overridden)
    this.isGrounded = this.checkGrounded(getBlock);

    // Gravity (after grounded check)
    if (!this.isGrounded) {
      this.velocity.y -= ENTITY_GRAVITY * dt;
    }

    // X axis
    this.position.x += this.velocity.x * dt;
    if (this.collides(getBlock)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    // Z axis
    this.position.z += this.velocity.z * dt;
    if (this.collides(getBlock)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    // Y axis
    this.position.y += this.velocity.y * dt;
    if (this.collides(getBlock)) {
      if (this.velocity.y <= 0) {
        this.position.y = Math.floor(this.position.y - 0.001) + 1;
        this.isGrounded = true;
      } else {
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    this.syncMeshPosition();

    return this.hp <= 0;
  }

  /** Sync the Three.js mesh position to the entity's logical position */
  syncMeshPosition(): void {
    this.mesh.position.set(
      this.position.x,
      this.position.y + this.height / 2,
      this.position.z
    );
  }

  protected checkGrounded(getBlock: (x: number, y: number, z: number) => number): boolean {
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

  protected collides(getBlock: (x: number, y: number, z: number) => number): boolean {
    return this.collidesAt(getBlock, this.position);
  }

  protected collidesAt(getBlock: (x: number, y: number, z: number) => number, pos: THREE.Vector3): boolean {
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

  update(
    dt: number,
    getBlock: (x: number, y: number, z: number) => number,
  ): boolean {
    // Rotate slowly
    this.mesh.rotation.y += dt * 2;

    // Check lifetime
    if (performance.now() - this.spawnTime > DROP_LIFETIME) return true;

    return super.update(dt, getBlock);
  }
}

// ── Entity Manager ──

/** AABB representation for collision checks */
interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export class EntityManager {
  private entities: Entity[] = [];
  private scene: THREE.Scene;
  private particleManager: ParticleManager | null = null;
  private onItemPickup: ((itemId: number, count: number) => boolean) | null = null;
  private playerRef: Entity | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setParticleManager(pm: ParticleManager): void {
    this.particleManager = pm;
  }

  setOnItemPickup(fn: (itemId: number, count: number) => boolean): void {
    this.onItemPickup = fn;
  }

  setPlayerRef(player: Entity): void {
    this.playerRef = player;
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

  update(dt: number, getBlock: (x: number, y: number, z: number) => number): void {
    // Collect dropped items near player
    const playerPos = this.playerRef?.position ?? null;
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

    // Update all entities (block-world collision + physics only)
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

  /** Unified collision resolution for all collidable entities (including player). */
  resolveCollisions(): void {
    // Collect all collidable objects (entities + player, excluding DroppedItems)
    const collidables: Entity[] = [];
    for (const e of this.entities) {
      if (!(e instanceof DroppedItem)) collidables.push(e);
    }
    // Player is a separate Entity, add to collidables
    if (this.playerRef) collidables.push(this.playerRef);

    // Resolve all pairs
    for (let i = 0; i < collidables.length; i++) {
      const a = collidables[i];
      const aAABB = a.getAABB();

      for (let j = i + 1; j < collidables.length; j++) {
        const b = collidables[j];
        const overlap = this.computeOverlap(aAABB, b.getAABB());
        if (!overlap) continue;

        this.resolvePairSymmetric(a, b, overlap);
        // Refresh AABB after position change
        aAABB.minX = a.position.x - a.width / 2;
        aAABB.maxX = a.position.x + a.width / 2;
        aAABB.minY = a.position.y;
        aAABB.maxY = a.position.y + a.height;
        aAABB.minZ = a.position.z - a.width / 2;
        aAABB.maxZ = a.position.z + a.width / 2;
      }

      a.syncMeshPosition();
    }
  }

  /** Compute AABB overlap between two boxes. Returns null if no overlap. */
  private computeOverlap(a: AABB, b: AABB): { x: number; y: number; z: number } | null {
    const overlapX = Math.min(a.maxX - b.minX, b.maxX - a.minX);
    if (overlapX <= 0) return null;
    const overlapY = Math.min(a.maxY - b.minY, b.maxY - a.minY);
    if (overlapY <= 0) return null;
    const overlapZ = Math.min(a.maxZ - b.minZ, b.maxZ - a.minZ);
    if (overlapZ <= 0) return null;
    return { x: overlapX, y: overlapY, z: overlapZ };
  }

  /** Resolve collision between two entities — both move equally. */
  private resolvePairSymmetric(a: Entity, b: Entity, overlap: { x: number; y: number; z: number }): void {
    // Y-axis priority: stacking
    if (a.velocity.y <= 0 && a.position.y >= b.position.y) {
      // A falling onto B — snap A on top
      a.position.y = b.position.y + b.height;
      a.velocity.y = 0;
      a.isGrounded = true;
      return;
    }
    if (b.velocity.y <= 0 && b.position.y >= a.position.y) {
      // B falling onto A — snap B on top
      b.position.y = a.position.y + a.height;
      b.velocity.y = 0;
      b.isGrounded = true;
      return;
    }
    if (a.velocity.y > 0 && a.position.y <= b.position.y) {
      // A jumping into B from below
      a.position.y -= overlap.y;
      a.velocity.y = 0;
      return;
    }
    if (b.velocity.y > 0 && b.position.y <= a.position.y) {
      // B jumping into A from below
      b.position.y -= overlap.y;
      b.velocity.y = 0;
      return;
    }

    // Lateral push — both move half the overlap along minimum penetration axis
    const dx = a.position.x - b.position.x;
    const dz = a.position.z - b.position.z;

    if (overlap.x <= overlap.z) {
      const push = overlap.x * 0.5;
      const sign = dx >= 0 ? 1 : -1;
      a.position.x += sign * push;
      b.position.x -= sign * push;
    } else {
      const push = overlap.z * 0.5;
      const sign = dz >= 0 ? 1 : -1;
      a.position.z += sign * push;
      b.position.z -= sign * push;
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
