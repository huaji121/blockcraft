import * as THREE from 'three';
import { World } from './world';
import { BlockType } from './blocks';
import { EntityManager } from './entities';
import { ITEM_REGISTRY, SPAWN_EGG_ID, EMPTY_ITEM_ID } from './items';
import { DEFAULT_KEYBINDS } from './keybinds';
import {
  GRAVITY, JUMP_SPEED, PLAYER_SPEED,
  PLAYER_HEIGHT, PLAYER_WIDTH, MOUSE_SENSITIVITY
} from './constants';

export class Player {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public camera: THREE.PerspectiveCamera;

  private yaw: number = 0;
  private pitch: number = 0;
  private keys: Set<string> = new Set();
  private isGrounded: boolean = false;
  private world: World;
  private isPointerLocked: boolean = false;

  // Mouse input buffering & smoothing
  private rawDeltaX: number = 0;
  private rawDeltaY: number = 0;
  private smoothDeltaX: number = 0;
  private smoothDeltaY: number = 0;
  private readonly MAX_DELTA = 80;
  private readonly SMOOTH = 0.5;

  // Block interaction
  private leftMouseDown: boolean = false;
  private rightMouseDown: boolean = false;
  private lastBreakTime: number = 0;
  private lastPlaceTime: number = 0;
  private breakCooldown: number = 200;
  private placeCooldown: number = 200;

  // Highlight
  private highlightMesh: THREE.LineSegments;

  // Inventory integration
  private getSelectedItemId: () => number = () => EMPTY_ITEM_ID;
  private _uiOpen: boolean = false;

  get uiOpen(): boolean { return this._uiOpen; }
  set uiOpen(value: boolean) {
    if (this._uiOpen === value) return;
    this._uiOpen = value;
    if (value) {
      // Clear all held keys when UI opens to stop movement
      this.keys.clear();
    }
  }
  private onBlockBreak: ((wx: number, wy: number, wz: number, blockType: BlockType) => void) | null = null;

  // Entity interaction
  private entityManager: EntityManager | null = null;

  constructor(camera: THREE.PerspectiveCamera, world: World) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, 80, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);

    const highlightGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
    this.highlightMesh = new THREE.LineSegments(
      highlightEdges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    );
    this.highlightMesh.visible = false;

    this.setupControls();
  }

  setGetSelectedItemId(fn: () => number): void {
    this.getSelectedItemId = fn;
  }

  setOnBlockBreak(fn: (wx: number, wy: number, wz: number, blockType: BlockType) => void): void {
    this.onBlockBreak = fn;
  }

  setEntityManager(em: EntityManager): void {
    this.entityManager = em;
  }

  getHighlightMesh(): THREE.LineSegments {
    return this.highlightMesh;
  }

  private setupControls(): void {
    document.addEventListener('keydown', (e) => {
      if (this.uiOpen) return;
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || this.uiOpen) return;
      this.rawDeltaX += e.movementX;
      this.rawDeltaY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked || this.uiOpen) return;
      if (e.button === 0) this.leftMouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftMouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement !== null;
    });
  }

  requestPointerLock(element: HTMLElement): void {
    element.requestPointerLock();
  }

  update(dt: number): void {
    // Skip mouse look when UI is open
    if (!this.uiOpen) {
      // ── Mouse input: cap spikes, smooth, then apply ──
      let dx = this.rawDeltaX;
      let dy = this.rawDeltaY;
      this.rawDeltaX = 0;
      this.rawDeltaY = 0;

      dx = Math.max(-this.MAX_DELTA, Math.min(this.MAX_DELTA, dx));
      dy = Math.max(-this.MAX_DELTA, Math.min(this.MAX_DELTA, dy));

      this.smoothDeltaX += (dx - this.smoothDeltaX) * (1 - this.SMOOTH);
      this.smoothDeltaY += (dy - this.smoothDeltaY) * (1 - this.SMOOTH);

      this.yaw -= this.smoothDeltaX * MOUSE_SENSITIVITY;
      this.pitch -= this.smoothDeltaY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    } else {
      this.rawDeltaX = 0;
      this.rawDeltaY = 0;
      this.smoothDeltaX = 0;
      this.smoothDeltaY = 0;
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const kb = DEFAULT_KEYBINDS;
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys.has(kb.moveForward)) moveDir.add(forward);
    if (this.keys.has(kb.moveBackward)) moveDir.sub(forward);
    if (this.keys.has(kb.moveLeft)) moveDir.sub(right);
    if (this.keys.has(kb.moveRight)) moveDir.add(right);

    if (moveDir.length() > 0) {
      moveDir.normalize().multiplyScalar(PLAYER_SPEED);
    }

    this.velocity.x = moveDir.x;
    this.velocity.z = moveDir.z;

    if (this.keys.has(kb.jump) && this.isGrounded) {
      this.velocity.y = JUMP_SPEED;
      this.isGrounded = false;
    }

    this.velocity.y -= GRAVITY * dt;

    this.moveWithCollision(dt);

    this.camera.position.copy(this.position);
    this.camera.position.y += PLAYER_HEIGHT * 0.9;

    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(lookDir));

    if (!this.uiOpen) {
      this.updateHighlight();
      this.handleBlockInteraction();
    } else {
      this.highlightMesh.visible = false;
      this.leftMouseDown = false;
      this.rightMouseDown = false;
    }
  }

  private collidesAt(pos: THREE.Vector3): boolean {
    const halfW = PLAYER_WIDTH / 2;
    const minX = Math.floor(pos.x - halfW);
    const maxX = Math.floor(pos.x + halfW);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + PLAYER_HEIGHT - 0.001);
    const minZ = Math.floor(pos.z - halfW);
    const maxZ = Math.floor(pos.z + halfW);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.getBlock(x, y, z) !== BlockType.AIR) {
            if (
              pos.x + halfW > x && pos.x - halfW < x + 1 &&
              pos.y + PLAYER_HEIGHT > y && pos.y < y + 1 &&
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

  private moveWithCollision(dt: number): void {
    this.position.x += this.velocity.x * dt;
    if (this.collidesAt(this.position)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    this.position.z += this.velocity.z * dt;
    if (this.collidesAt(this.position)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    this.isGrounded = false;
    this.position.y += this.velocity.y * dt;
    if (this.collidesAt(this.position)) {
      if (this.velocity.y <= 0) {
        this.position.y = Math.floor(this.position.y - 0.001) + 1;
        this.isGrounded = true;
      } else {
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    if (!this.isGrounded && this.velocity.y === 0) {
      const testPos = this.position.clone();
      testPos.y -= 0.05;
      if (this.collidesAt(testPos)) {
        this.isGrounded = true;
      }
    }
  }

  private updateHighlight(): void {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);

    const hit = this.world.raycast(this.camera.position, dir, 7);
    if (hit) {
      this.highlightMesh.position.set(
        hit.blockPos.x + 0.5,
        hit.blockPos.y + 0.5,
        hit.blockPos.z + 0.5
      );
      this.highlightMesh.visible = true;
    } else {
      this.highlightMesh.visible = false;
    }
  }

  private handleBlockInteraction(): void {
    const now = performance.now();
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);

    // Left click: damage entity or break block
    if (this.leftMouseDown && now - this.lastBreakTime > this.breakCooldown) {
      // Check entity hit first
      if (this.entityManager) {
        const entityHit = this.entityManager.raycastEntities(this.camera.position, dir, 7);
        if (entityHit) {
          const knockbackDir = new THREE.Vector3(
            -Math.sin(this.yaw),
            0,
            -Math.cos(this.yaw)
          ).normalize();
          entityHit.entity.takeDamage(5, knockbackDir);
          this.lastBreakTime = now;
          return;
        }
      }

      // No entity hit: break block
      const hit = this.world.raycast(this.camera.position, dir, 7);
      if (hit && hit.blockType !== BlockType.AIR) {
        this.world.setBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, BlockType.AIR);
        this.onBlockBreak?.(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, hit.blockType);
        this.lastBreakTime = now;
      }
    }

    // Right click: spawn entity or place block
    if (this.rightMouseDown && now - this.lastPlaceTime > this.placeCooldown) {
      const selectedItemId = this.getSelectedItemId();
      if (selectedItemId === EMPTY_ITEM_ID) return;

      // Spawn egg: spawn entity at crosshair hit point
      if (selectedItemId === SPAWN_EGG_ID && this.entityManager) {
        const hit = this.world.raycast(this.camera.position, dir, 7);
        if (hit) {
          // Spawn on top of the hit block surface
          const spawnPos = new THREE.Vector3(
            hit.blockPos.x + 0.5,
            hit.blockPos.y + 1.01,
            hit.blockPos.z + 0.5,
          );
          this.entityManager.spawn(spawnPos);
          this.lastPlaceTime = now;
        }
        return;
      }

      // Normal block placement
      const item = ITEM_REGISTRY.getById(selectedItemId);
      const blockType = item?.getBlockType();
      if (blockType == null) return;

      const hit = this.world.raycast(this.camera.position, dir, 7);
      if (hit) {
        const placePos = hit.blockPos.clone().add(hit.normal);
        const halfW = PLAYER_WIDTH / 2;
        const overlaps =
          this.position.x + halfW > placePos.x && this.position.x - halfW < placePos.x + 1 &&
          this.position.y + PLAYER_HEIGHT > placePos.y && this.position.y < placePos.y + 1 &&
          this.position.z + halfW > placePos.z && this.position.z - halfW < placePos.z + 1;

        if (!overlaps) {
          this.world.setBlock(placePos.x, placePos.y, placePos.z, blockType);
          this.lastPlaceTime = now;
        }
      }
    }
  }
}
