import * as THREE from 'three';
import { BlockType, BLOCK_DATA, getBlockFaceTexture } from './blocks';

/** Context passed to Item.interactWithBlock() for polymorphic right-click behavior */
export interface InteractContext {
  world: { setBlock(x: number, y: number, z: number, type: BlockType): void };
  entityManager: { spawn(pos: THREE.Vector3): unknown } | null;
  hitBlockPos: THREE.Vector3;   // the block that was clicked
  hitNormal: THREE.Vector3;     // face normal of the hit
  playerPos: THREE.Vector3;
  playerHeight: number;
  playerWidth: number;
}

// ── Item base class ──

export abstract class Item {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly maxStack: number = 64,
  ) {}

  abstract isBlock(): boolean;
  abstract getBlockType(): BlockType | null;
  abstract getTexture(): string;
  abstract getFaceTexture(face: 'top' | 'bottom' | 'side'): string;

  /** Called when the player right-clicks a block. Returns true if the item should be consumed. */
  interactWithBlock(_ctx: InteractContext): boolean {
    return false;
  }
}

// ── BlockItem ──

export class BlockItem extends Item {
  constructor(id: number, public readonly blockType: BlockType) {
    const data = BLOCK_DATA[blockType];
    super(id, data.name, 64);
  }

  isBlock(): boolean { return true; }
  getBlockType(): BlockType { return this.blockType; }
  getTexture(): string { return BLOCK_DATA[this.blockType].texture; }
  getFaceTexture(face: 'top' | 'bottom' | 'side'): string {
    return getBlockFaceTexture(this.blockType, face);
  }

  override interactWithBlock(ctx: InteractContext): boolean {
    const placePos = ctx.hitBlockPos.clone().add(ctx.hitNormal);
    const halfW = ctx.playerWidth / 2;
    const overlaps =
      ctx.playerPos.x + halfW > placePos.x && ctx.playerPos.x - halfW < placePos.x + 1 &&
      ctx.playerPos.y + ctx.playerHeight > placePos.y && ctx.playerPos.y < placePos.y + 1 &&
      ctx.playerPos.z + halfW > placePos.z && ctx.playerPos.z - halfW < placePos.z + 1;
    if (overlaps) return false;
    ctx.world.setBlock(placePos.x, placePos.y, placePos.z, this.blockType);
    return true;
  }
}

// ── SimpleItem (non-block items) ──

export class SimpleItem extends Item {
  constructor(
    id: number,
    name: string,
    private texturePath: string,
    maxStack: number = 64,
  ) {
    super(id, name, maxStack);
  }

  isBlock(): boolean { return false; }
  getBlockType(): null { return null; }
  getTexture(): string { return this.texturePath; }
  getFaceTexture(): string { return this.texturePath; }
}

// ── SpawnEggItem ──

export class SpawnEggItem extends SimpleItem {
  constructor(id: number, name: string, texturePath: string) {
    super(id, name, texturePath, 64);
  }

  override interactWithBlock(ctx: InteractContext): boolean {
    if (!ctx.entityManager) return false;
    const spawnPos = new THREE.Vector3(
      ctx.hitBlockPos.x + 0.5,
      ctx.hitBlockPos.y + 1.01,
      ctx.hitBlockPos.z + 0.5,
    );
    ctx.entityManager.spawn(spawnPos);
    return true;
  }
}

// ── Item IDs ──

export const EMPTY_ITEM_ID = -1;
export const SPAWN_EGG_ID = 100;

// ── Registry ──

class ItemRegistry {
  readonly items = new Map<number, Item>();

  register(item: Item): void {
    this.items.set(item.id, item);
  }

  getById(id: number): Item | undefined {
    return this.items.get(id);
  }

  getBlockItems(): BlockItem[] {
    return [...this.items.values()].filter((i): i is BlockItem => i.isBlock());
  }

  get allItems(): Item[] {
    return [...this.items.values()];
  }
}

// ── Build registry ──

export const ITEM_REGISTRY = new ItemRegistry();

// Register block items (id = BlockType value)
for (const bt of Object.values(BlockType)) {
  if (typeof bt !== 'number' || bt === BlockType.AIR) continue;
  ITEM_REGISTRY.register(new BlockItem(bt, bt));
}

// Register non-block items
ITEM_REGISTRY.register(new SpawnEggItem(SPAWN_EGG_ID, 'Spawn Egg', '/assets/textures/block/snow.png'));

// ── Slot type (shared across all inventory UI) ──

export interface Slot {
  itemId: number;
  count: number;
}

export const EMPTY_SLOT: Slot = { itemId: EMPTY_ITEM_ID, count: 0 };
export const makeSlot = (itemId: number, count = 1): Slot => ({ itemId, count });

export function isSlotEmpty(slot: Slot): boolean {
  return slot.itemId === EMPTY_ITEM_ID || slot.count <= 0;
}

export function getItemTexture(itemId: number): string {
  return ITEM_REGISTRY.getById(itemId)?.getTexture() ?? '';
}

export function getItemName(itemId: number): string {
  return ITEM_REGISTRY.getById(itemId)?.name ?? '';
}
