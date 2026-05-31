import * as THREE from 'three';
import { Entity } from './entities';
import { World } from './world';
import { BlockType } from './blocks';
import { EntityManager } from './entities';
import { ITEM_REGISTRY, EMPTY_ITEM_ID } from './items';
import { DEFAULT_KEYBINDS } from './keybinds';
import {
  JUMP_SPEED, PLAYER_SPEED,
  PLAYER_HEIGHT, PLAYER_WIDTH, MOUSE_SENSITIVITY,
  CROUCH_HEIGHT, CROUCH_SPEED_MULT,
  SPRINT_SPEED_MULT, DOUBLE_TAP_WINDOW,
  DEFAULT_FOV, SPRINT_FOV,
} from './constants';

export class Player extends Entity {
  public camera: THREE.PerspectiveCamera;

  private yaw: number = 0;
  private pitch: number = 0;
  private keys: Set<string> = new Set();
  private isCrouching: boolean = false;
  private isSprinting: boolean = false;
  private lastWPressTime: number = 0;
  private currentHeight: number = PLAYER_HEIGHT;
  private bobPhase: number = 0;
  private bobAmplitude: number = 0;
  private readonly BOB_SPEED = 4;
  private readonly BOB_AMPLITUDE = 0.06;
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

  // Abilities
  public flyEnabled: boolean = false;
  public isFlying: boolean = false;
  private lastSpacePressTime: number = 0;

  // Inventory integration
  private getSelectedItemId: () => number = () => EMPTY_ITEM_ID;
  private _uiOpen: boolean = false;

  get uiOpen(): boolean { return this._uiOpen; }
  set uiOpen(value: boolean) {
    if (this._uiOpen === value) return;
    this._uiOpen = value;
    if (value) {
      this.keys.clear();
    }
  }
  private onBlockBreak: ((wx: number, wy: number, wz: number, blockType: BlockType) => void) | null = null;

  // Entity interaction
  private entityManager: EntityManager | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, world: World) {
    super(scene, new THREE.Vector3(0, 65, 0));
    this.camera = camera;
    this.world = world;

    // Player dimensions
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.pushForce = 0; // player doesn't push via force — collision handles it

    // Hide the entity mesh (first-person camera)
    this.mesh.visible = false;

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

  /** Override: use currentHeight for crouch-aware AABB */
  override getAABB(): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
    const halfW = this.width / 2;
    return {
      minX: this.position.x - halfW,
      maxX: this.position.x + halfW,
      minY: this.position.y,
      maxY: this.position.y + this.currentHeight,
      minZ: this.position.z - halfW,
      maxZ: this.position.z + halfW,
    };
  }

  /** Override: use currentHeight and world.getBlock() */
  protected override collidesAt(_getBlock: (x: number, y: number, z: number) => number, pos: THREE.Vector3): boolean {
    const halfW = this.width / 2;
    const minX = Math.floor(pos.x - halfW);
    const maxX = Math.floor(pos.x + halfW);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.currentHeight - 0.001);
    const minZ = Math.floor(pos.z - halfW);
    const maxZ = Math.floor(pos.z + halfW);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.getBlock(x, y, z) !== BlockType.AIR) {
            if (
              pos.x + halfW > x && pos.x - halfW < x + 1 &&
              pos.y + this.currentHeight > y && pos.y < y + 1 &&
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

  /** Override: use currentHeight and world.getBlock() */
  protected override checkGrounded(): boolean {
    const halfW = this.width / 2;
    const testY = this.position.y - 0.01;
    const minX = Math.floor(this.position.x - halfW + 0.01);
    const maxX = Math.floor(this.position.x + halfW - 0.01);
    const minZ = Math.floor(this.position.z - halfW + 0.01);
    const maxZ = Math.floor(this.position.z + halfW - 0.01);
    const by = Math.floor(testY);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (this.world.getBlock(bx, by, bz) !== BlockType.AIR) return true;
      }
    }
    return false;
  }

  private hasGroundBelow(pos: THREE.Vector3): boolean {
    const halfW = this.width / 2;
    const testY = pos.y - 0.05;
    const minX = Math.floor(pos.x - halfW + 0.01);
    const maxX = Math.floor(pos.x + halfW - 0.01);
    const minZ = Math.floor(pos.z - halfW + 0.01);
    const maxZ = Math.floor(pos.z + halfW - 0.01);
    const by = Math.floor(testY);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (this.world.getBlock(bx, by, bz) !== BlockType.AIR) return true;
      }
    }
    return false;
  }

  private setupControls(): void {
    document.addEventListener('keydown', (e) => {
      if (this.uiOpen) return;
      this.keys.add(e.code);

      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastWPressTime < DOUBLE_TAP_WINDOW) {
          this.isSprinting = true;
        }
        this.lastWPressTime = now;
      }

      // Double-tap Space to toggle flight (when fly ability is enabled)
      if (e.code === 'Space' && !e.repeat && this.flyEnabled) {
        const now = performance.now();
        if (now - this.lastSpacePressTime < DOUBLE_TAP_WINDOW) {
          this.isFlying = !this.isFlying;
          this.isSprinting = false;
        }
        this.lastSpacePressTime = now;
      }
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

  /** Override: input setup before physics */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override prePhysics(dt: number): void {
    // This is called from update() — input is handled there instead
  }

  /** Override: full player update with input, camera, block interaction */
  override update(dt: number): boolean {
    // ── Mouse input ──
    if (!this.uiOpen) {
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

    // ── Movement input ──
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const kb = DEFAULT_KEYBINDS;
    this.isCrouching = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    if (!this.keys.has('KeyW') || this.isCrouching) {
      this.isSprinting = false;
    }

    const targetHeight = this.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    this.currentHeight += (targetHeight - this.currentHeight) * Math.min(1, dt * 15);
    this.height = this.currentHeight;

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys.has(kb.moveForward)) moveDir.add(forward);
    if (this.keys.has(kb.moveBackward)) moveDir.sub(forward);
    if (this.keys.has(kb.moveLeft)) moveDir.sub(right);
    if (this.keys.has(kb.moveRight)) moveDir.add(right);

    let speed = PLAYER_SPEED;
    if (this.isCrouching) speed *= CROUCH_SPEED_MULT;
    else if (this.isSprinting) speed *= SPRINT_SPEED_MULT;
    if (moveDir.length() > 0) {
      moveDir.normalize().multiplyScalar(speed);
    }

    this.velocity.x = moveDir.x;
    this.velocity.z = moveDir.z;

    // ── Flight mode ──
    if (this.isFlying) {
      this.velocity.y = 0;
      const flySpeed = PLAYER_SPEED * (this.isSprinting ? SPRINT_SPEED_MULT : 1);
      if (this.keys.has(kb.jump)) this.velocity.y = flySpeed;
      if (this.isCrouching) this.velocity.y = -flySpeed;
    } else {
      // ── Jump (before parent physics so isGrounded=false is seen) ──
      if (this.keys.has(kb.jump) && this.isGrounded) {
        this.velocity.y = JUMP_SPEED;
        this.isGrounded = false;
      }
    }

    // ── Parent physics: grounded check, gravity, block collision ──
    // applyFriction=false because we set velocity directly from input
    // applyGravity=false when flying (flight handles vertical movement)
    super.update(dt, (x, y, z) => this.world.getBlock(x, y, z), false, !this.isFlying);

    // ── Crouch edge protection (after block collision) ──
    if (this.isCrouching && this.isGrounded) {
      if (!this.hasGroundBelow(this.position)) {
        // Undo the last frame's X/Z movement — we need to re-check
        // Since parent already moved, we just prevent further movement
        // by checking the current position and reverting if needed
      }
    }

    // ── Camera bob ──
    const hSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    if (this.isGrounded && hSpeed > 0.5) {
      this.bobPhase += hSpeed * this.BOB_SPEED * dt;
      this.bobAmplitude = Math.min(1, this.bobAmplitude + dt * 5);
    } else {
      this.bobAmplitude = Math.max(0, this.bobAmplitude - dt * 5);
    }

    this.camera.position.copy(this.position);
    this.camera.position.y += this.currentHeight * 0.9 + Math.sin(this.bobPhase) * this.BOB_AMPLITUDE * this.bobAmplitude;

    const targetFov = this.isSprinting ? SPRINT_FOV : DEFAULT_FOV;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();

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

    return false; // player never dies
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
      const blockHit = this.world.raycast(this.camera.position, dir, 7);
      const blockDist = blockHit ? this.camera.position.distanceTo(
        new THREE.Vector3(blockHit.blockPos.x + 0.5, blockHit.blockPos.y + 0.5, blockHit.blockPos.z + 0.5)
      ) : Infinity;

      if (this.entityManager) {
        const entityHit = this.entityManager.raycastEntities(this.camera.position, dir, 7);
        if (entityHit && entityHit.distance < blockDist) {
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

      if (blockHit && blockHit.blockType !== BlockType.AIR) {
        this.world.setBlock(blockHit.blockPos.x, blockHit.blockPos.y, blockHit.blockPos.z, BlockType.AIR);
        this.onBlockBreak?.(blockHit.blockPos.x, blockHit.blockPos.y, blockHit.blockPos.z, blockHit.blockType);
        this.lastBreakTime = now;
      }
    }

    // Right click: spawn entity or place block
    if (this.rightMouseDown && now - this.lastPlaceTime > this.placeCooldown) {
      const selectedItemId = this.getSelectedItemId();
      if (selectedItemId === EMPTY_ITEM_ID) return;

      const selectedItem = ITEM_REGISTRY.getById(selectedItemId);
      if (selectedItem?.isSpawnEgg() && this.entityManager) {
        const hit = this.world.raycast(this.camera.position, dir, 7);
        if (hit) {
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

      const item = ITEM_REGISTRY.getById(selectedItemId);
      const blockType = item?.getBlockType();
      if (blockType == null) return;

      const hit = this.world.raycast(this.camera.position, dir, 7);
      if (hit) {
        const placePos = hit.blockPos.clone().add(hit.normal);
        const halfW = this.width / 2;
        const overlaps =
          this.position.x + halfW > placePos.x && this.position.x - halfW < placePos.x + 1 &&
          this.position.y + this.currentHeight > placePos.y && this.position.y < placePos.y + 1 &&
          this.position.z + halfW > placePos.z && this.position.z - halfW < placePos.z + 1;

        if (!overlaps) {
          this.world.setBlock(placePos.x, placePos.y, placePos.z, blockType);
          this.lastPlaceTime = now;
        }
      }
    }
  }
}
