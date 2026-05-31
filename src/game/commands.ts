import { ITEM_REGISTRY, type Slot } from './items';

export interface CommandContext {
  addMessage: (sender: string, text: string) => void;
  giveItem: (itemId: number, count: number) => void;
  teleport: (x: number, y: number, z: number) => void;
  clearInventory: () => void;
  killEntities: () => void;
  getPlayerPos: () => { x: number; y: number; z: number };
  setWireframe: (enabled: boolean) => void;
  setAbility: (name: string, enabled: boolean) => void;
}

interface Command {
  name: string;
  description: string;
  usage: string;
  execute: (args: string[], ctx: CommandContext) => void;
}

function findItemByName(name: string): number | null {
  const lower = name.toLowerCase();
  for (const item of ITEM_REGISTRY.allItems) {
    if (item.name.toLowerCase() === lower || item.name.toLowerCase().replace(/ /g, '_') === lower) {
      return item.id;
    }
  }
  // Try numeric ID
  const id = parseInt(name);
  if (!isNaN(id) && ITEM_REGISTRY.getById(id)) return id;
  return null;
}

const commands: Command[] = [
  {
    name: 'help',
    description: 'List all available commands',
    usage: '/help',
    execute: (_args, ctx) => {
      ctx.addMessage('System', 'Available commands:');
      for (const cmd of commands) {
        ctx.addMessage('System', `  ${cmd.usage} - ${cmd.description}`);
      }
    },
  },
  {
    name: 'give',
    description: 'Give items to the player',
    usage: '/give <item> [count]',
    execute: (args, ctx) => {
      if (args.length < 1) {
        ctx.addMessage('System', 'Usage: /give <item> [count]');
        return;
      }
      const itemId = findItemByName(args[0]);
      if (itemId === null) {
        ctx.addMessage('System', `Unknown item: ${args[0]}`);
        return;
      }
      const count = args.length > 1 ? Math.min(Math.max(1, parseInt(args[1]) || 1), 64) : 1;
      ctx.giveItem(itemId, count);
      const item = ITEM_REGISTRY.getById(itemId);
      ctx.addMessage('System', `Gave ${count}x ${item?.name ?? args[0]}`);
    },
  },
  {
    name: 'tp',
    description: 'Teleport to coordinates',
    usage: '/tp <x> <y> <z>',
    execute: (args, ctx) => {
      if (args.length < 3) {
        ctx.addMessage('System', 'Usage: /tp <x> <y> <z>');
        return;
      }
      const x = parseFloat(args[0]);
      const y = parseFloat(args[1]);
      const z = parseFloat(args[2]);
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        ctx.addMessage('System', 'Invalid coordinates');
        return;
      }
      ctx.teleport(x, y, z);
      ctx.addMessage('System', `Teleported to ${x}, ${y}, ${z}`);
    },
  },
  {
    name: 'pos',
    description: 'Show current position',
    usage: '/pos',
    execute: (_args, ctx) => {
      const pos = ctx.getPlayerPos();
      ctx.addMessage('System', `Position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`);
    },
  },
  {
    name: 'clear',
    description: 'Clear inventory',
    usage: '/clear',
    execute: (_args, ctx) => {
      ctx.clearInventory();
      ctx.addMessage('System', 'Inventory cleared');
    },
  },
  {
    name: 'kill',
    description: 'Kill all entities',
    usage: '/kill',
    execute: (_args, ctx) => {
      ctx.killEntities();
      ctx.addMessage('System', 'All entities killed');
    },
  },
  {
    name: 'debug',
    description: 'Set render mode',
    usage: '/debug rendermode <0|1>  (0=filled, 1=wireframe)',
    execute: (args, ctx) => {
      if (args.length < 2 || args[0].toLowerCase() !== 'rendermode') {
        ctx.addMessage('System', 'Usage: /debug rendermode <0|1>');
        return;
      }
      const mode = parseInt(args[1]);
      if (mode === 0) {
        ctx.setWireframe(false);
        ctx.addMessage('System', 'Render mode: filled');
      } else if (mode === 1) {
        ctx.setWireframe(true);
        ctx.addMessage('System', 'Render mode: wireframe');
      } else {
        ctx.addMessage('System', 'Value must be 0 (filled) or 1 (wireframe)');
      }
    },
  },
  {
    name: 'ability',
    description: 'Toggle a player ability',
    usage: '/ability <fly> <0|1>',
    execute: (args, ctx) => {
      if (args.length < 2) {
        ctx.addMessage('System', 'Usage: /ability <fly> <0|1>');
        return;
      }
      const abilityName = args[0].toLowerCase();
      const value = parseInt(args[1]);
      if (value !== 0 && value !== 1) {
        ctx.addMessage('System', 'Value must be 0 (off) or 1 (on)');
        return;
      }
      if (abilityName !== 'fly' && abilityName !== 'infitem' && abilityName !== 'instbreak') {
        ctx.addMessage('System', `Unknown ability: ${args[0]}`);
        return;
      }
      ctx.setAbility(abilityName, value === 1);
      ctx.addMessage('System', `${abilityName} ${value === 1 ? 'enabled' : 'disabled'}.`);
    },
  },
];

export function executeCommand(input: string, ctx: CommandContext): void {
  const parts = input.trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase().replace(/^\//, '');
  const args = parts.slice(1);

  const cmd = commands.find(c => c.name === cmdName);
  if (cmd) {
    cmd.execute(args, ctx);
  } else {
    ctx.addMessage('System', `Unknown command: /${cmdName}. Type /help for a list.`);
  }
}
