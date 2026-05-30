import { ITEM_REGISTRY, type Slot } from './items';

export interface CommandContext {
  addMessage: (sender: string, text: string) => void;
  giveItem: (itemId: number, count: number) => void;
  teleport: (x: number, y: number, z: number) => void;
  clearInventory: () => void;
  killEntities: () => void;
  getPlayerPos: () => { x: number; y: number; z: number };
  setWireframe: (enabled: boolean) => void;
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
    description: 'Toggle debug rendering modes',
    usage: '/debug enablePolygonMode true|false',
    execute: (args, ctx) => {
      if (args.length < 2) {
        ctx.addMessage('System', 'Usage: /debug enablePolygonMode true|false');
        return;
      }
      const key = args[0].toLowerCase();
      const value = args[1].toLowerCase();
      if (key === 'enablepolygonmode') {
        if (value === 'true' || value === 'false') {
          ctx.setWireframe(value === 'true');
          ctx.addMessage('System', `Wireframe mode: ${value}`);
        } else {
          ctx.addMessage('System', 'Value must be true or false');
        }
      } else {
        ctx.addMessage('System', `Unknown debug option: ${key}`);
      }
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
