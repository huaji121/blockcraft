import * as THREE from 'three';
import { World } from './world';
import { BlockType } from './blocks';
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

  // Block interaction
  private leftMouseDown: boolean = false;
  private rightMouseDown: boolean = false;
  private lastBreakTime: number = 0;
  private lastPlaceTime: number = 0;
  private breakCooldown: number = 200;
  private placeCooldown: number = 200;

  // Highlight
  private highlightMesh: THREE.LineSegments;

  constructor(camera: THREE.PerspectiveCamera, world: World) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, 20, 0);
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

  getHighlightMesh(): THREE.LineSegments {
    return this.highlightMesh;
  }

  private setupControls(): void {
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
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
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys.has('KeyW')) moveDir.add(forward);
    if (this.keys.has('KeyS')) moveDir.sub(forward);
    if (this.keys.has('KeyA')) moveDir.sub(right);
    if (this.keys.has('KeyD')) moveDir.add(right);

    if (moveDir.length() > 0) {
      moveDir.normalize().multiplyScalar(PLAYER_SPEED);
    }

    this.velocity.x = moveDir.x;
    this.velocity.z = moveDir.z;

    if (this.keys.has('Space') && this.isGrounded) {
      this.velocity.y = JUMP_SPEED;
      this.isGrounded = false;
    }

    this.velocity.y -= GRAVITY * dt;

    this.moveWithCollision(dt);

    this.camera.position.copy(this.position);
    this.camera.position.y += PLAYER_HEIGHT * 0.9;

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    this.updateHighlight();
    this.handleBlockInteraction();
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
    // Move and resolve each axis independently

    // X axis
    this.position.x += this.velocity.x * dt;
    if (this.collidesAt(this.position)) {
      this.position.x -= this.velocity.x * dt;
      this.velocity.x = 0;
    }

    // Z axis
    this.position.z += this.velocity.z * dt;
    if (this.collidesAt(this.position)) {
      this.position.z -= this.velocity.z * dt;
      this.velocity.z = 0;
    }

    // Y axis
    this.isGrounded = false;
    this.position.y += this.velocity.y * dt;
    if (this.collidesAt(this.position)) {
      if (this.velocity.y <= 0) {
        // Falling: snap to top of the solid block we landed on
        this.position.y = Math.floor(this.position.y - 0.001) + 1;
        this.isGrounded = true;
      } else {
        // Rising: hit ceiling, undo
        this.position.y -= this.velocity.y * dt;
      }
      this.velocity.y = 0;
    }

    // Ground check: if not moving down, verify we're still on ground
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

    if (this.leftMouseDown && now - this.lastBreakTime > this.breakCooldown) {
      const hit = this.world.raycast(this.camera.position, dir, 7);
      if (hit && hit.blockType !== BlockType.AIR) {
        this.world.setBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, BlockType.AIR);
        this.lastBreakTime = now;
      }
    }

    if (this.rightMouseDown && now - this.lastPlaceTime > this.placeCooldown) {
      const hit = this.world.raycast(this.camera.position, dir, 7);
      if (hit) {
        const placePos = hit.blockPos.clone().add(hit.normal);
        const halfW = PLAYER_WIDTH / 2;
        const overlaps =
          this.position.x + halfW > placePos.x && this.position.x - halfW < placePos.x + 1 &&
          this.position.y + PLAYER_HEIGHT > placePos.y && this.position.y < placePos.y + 1 &&
          this.position.z + halfW > placePos.z && this.position.z - halfW < placePos.z + 1;

        if (!overlaps) {
          this.world.setBlock(placePos.x, placePos.y, placePos.z, BlockType.DIRT);
          this.lastPlaceTime = now;
        }
      }
    }
  }
}
