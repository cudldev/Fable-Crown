import { BILL, LOCATIONS, TICK_MS, type GameState, type Person, type Resource, type Role, type Strategy } from './types';

const RESOURCES: Resource[] = ['timber', 'stone', 'iron'];
const ROLES: Role[] = ['prince', 'woodcutter', 'miner', 'builder', 'smith'];
const NAMES = ['Alden', 'Mira', 'Toma', 'Jun', 'Hana', 'Ren', 'Edda', 'Bram', 'Iori', 'Nell', 'Orin', 'Sora', 'Ada', 'Fenn', 'Lio', 'Yuna'];
const TRAITS = ['Hopeful and cooperative', 'Patient and precise', 'Bold and curious', 'Practical and kind'];
const ACTIONS = ['Walking to forest', 'Walking to mine', 'Gathering timber', 'Gathering stone', 'Gathering iron', 'Carrying supplies', 'Fetching materials', 'Delivering materials', 'Building workshop', 'Waiting for supplies', 'Walking to forge', 'Forging tools', 'Resting by the square'];

/** Calendar follows the player's local day; ticks remain independent of timezone. */
export function calendarDate(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function note(s: GameState, text: string): void {
  s.journal.unshift(text);
  s.journal.length = Math.min(s.journal.length, 12);
}

function begin(p: Person, action: string, duration: number, target?: { x: number; y: number }): void {
  p.action = action;
  p.remaining = p.duration = duration;
  p.fromX = p.x;
  p.fromY = p.y;
  p.targetX = target ? target.x + ((p.id % 3) - 1) * 14 : p.x;
  p.targetY = target ? target.y + ((p.id % 4) - 1) * 12 : p.y;
}

function walk(p: Person, action: string, target: { x: number; y: number }): void {
  begin(p, action, Math.max(3, Math.ceil(Math.hypot(p.x - target.x, p.y - target.y) / 36)), target);
}

function carried(s: GameState, resource: Resource): number {
  return s.people.reduce((n, p) => n + (p.carry?.resource === resource ? p.carry.amount : 0), 0);
}

function nextGather(s: GameState, p: Person): void {
  const resource: Resource = p.role === 'woodcutter' ? 'timber' : s.workshop.stone + carried(s, 'stone') >= BILL.stone ? 'iron' : 'stone';
  const limit = resource === 'timber' ? 64 : resource === 'stone' ? 48 : 24;
  if (s.stock[resource] + carried(s, resource) >= limit) {
    begin(p, 'Resting by the square', 8);
    return;
  }
  walk(p, resource === 'timber' ? 'Walking to forest' : 'Walking to mine', resource === 'timber' ? LOCATIONS.forest : LOCATIONS.mine);
}

function nextBuilder(s: GameState, p: Person): void {
  if (s.workshop.complete) {
    if (p.id === 11) { p.role = 'smith'; walk(p, 'Fetching materials', LOCATIONS.storage); }
    else walk(p, 'Resting by the square', LOCATIONS.square);
    return;
  }
  if (s.workshop.timber >= BILL.timber && s.workshop.stone >= BILL.stone) {
    walk(p, 'Building workshop', LOCATIONS.workshop);
  } else walk(p, 'Fetching materials', LOCATIONS.storage);
}

function finish(s: GameState, p: Person): void {
  const slower = s.strategy === 'careful' ? 2 : 0;
  if (p.action === 'Walking to forest' || p.action === 'Walking to mine') {
    const resource = p.role === 'woodcutter' ? 'timber' : s.workshop.stone + carried(s, 'stone') >= BILL.stone ? 'iron' : 'stone';
    begin(p, `Gathering ${resource}`, 5 + slower + (p.id % 3));
  } else if (p.action.startsWith('Gathering ')) {
    const resource = p.action.slice(10) as Resource;
    p.carry = { resource, amount: 2 };
    s.gathered[resource] += 2;
    p.xp += 8;
    p.completed++;
    walk(p, 'Carrying supplies', LOCATIONS.storage);
  } else if (p.action === 'Carrying supplies') {
    if (p.carry) { s.stock[p.carry.resource] += p.carry.amount; p.carry = null; }
    nextGather(s, p);
  } else if (p.action === 'Fetching materials') {
    if (p.role === 'smith') {
      if (s.stock.iron >= 2) {
        s.stock.iron -= 2;
        p.carry = { resource: 'iron', amount: 2 };
        walk(p, 'Delivering materials', LOCATIONS.workshop);
      } else begin(p, 'Fetching materials', 4);
      return;
    }
    const resource = (['timber', 'stone'] as const).find(r => s.workshop[r] + s.people.reduce((sum, other) => sum + (other.action === 'Delivering materials' && other.carry?.resource === r ? other.carry.amount : 0), 0) < BILL[r] && s.stock[r] > 0);
    if (resource) {
      const reserved = s.people.reduce((sum, other) => sum + (other.action === 'Delivering materials' && other.carry?.resource === resource ? other.carry.amount : 0), 0);
      const amount = Math.min(2, s.stock[resource], BILL[resource] - s.workshop[resource] - reserved);
      s.stock[resource] -= amount;
      p.carry = { resource, amount };
      walk(p, 'Delivering materials', LOCATIONS.workshop);
    } else if (s.workshop.timber >= BILL.timber && s.workshop.stone >= BILL.stone) nextBuilder(s, p);
    else begin(p, 'Waiting for supplies', 3);
  } else if (p.action === 'Delivering materials') {
    if (p.role === 'smith' && p.carry?.resource === 'iron') { begin(p, 'Forging tools', 12); return; }
    if (p.carry && p.carry.resource !== 'iron') {
      s.workshop[p.carry.resource] += p.carry.amount;
      s.spent[p.carry.resource] += p.carry.amount;
      p.carry = null;
      p.xp += 6;
      p.completed++;
    }
    nextBuilder(s, p);
  } else if (p.action === 'Building workshop') {
    if (!s.workshop.complete && s.workshop.timber >= BILL.timber && s.workshop.stone >= BILL.stone) {
      s.workshop.labor = Math.min(BILL.labor, s.workshop.labor + 1);
      p.xp += 3;
      if (s.workshop.labor === BILL.labor) {
        s.workshop.complete = true;
        note(s, 'The blacksmith workshop is open. Yuna tends the hearth; Sora takes up the smith’s hammer.');
      }
    }
    if (s.workshop.complete) nextBuilder(s, p);
    else begin(p, 'Building workshop', 2 + slower);
  } else if (p.action === 'Walking to forge' || p.action === 'Forging tools') {
    if (p.action === 'Forging tools' && p.carry) {
      s.spent.iron += p.carry.amount;
      p.carry = null;
      s.workshop.forged++;
      p.xp += 12;
      p.completed++;
      if (s.workshop.forged === 1) note(s, 'Our first iron tools are ready. Oakrest has a working forge.');
    }
    walk(p, 'Fetching materials', LOCATIONS.storage);
  } else if (p.action === 'Waiting for supplies') nextBuilder(s, p);
  else if (p.role === 'woodcutter' || p.role === 'miner') nextGather(s, p);
  else if (p.role === 'smith') walk(p, 'Fetching materials', LOCATIONS.storage);
  else if (!s.workshop.complete) nextBuilder(s, p);
  else begin(p, 'Resting by the square', 10);
}

export function createGame(now: number): GameState {
  const state: GameState = {
    version: 1, tick: 0, savedAt: now, calendar: calendarDate(now), offlineRemainder: 0,
    strategy: null, decisionAt: 34, decisionReason: 'Local timber and stone are within reach. Alden will choose local gathering if you leave the thought unanswered.',
    people: NAMES.map((name, id): Person => {
      const role: Role = id === 0 ? 'prince' : id < 7 ? 'woodcutter' : id < 11 ? 'miner' : 'builder';
      const x = LOCATIONS.square.x + ((id % 4) - 2) * 20;
      const y = LOCATIONS.square.y + Math.floor(id / 4) * 14;
      return { id, name, role, personality: TRAITS[id % TRAITS.length]!, x, y, fromX: x, fromY: y, targetX: x, targetY: y, action: 'Waiting for supplies', remaining: 1 + id % 4, duration: 1 + id % 4, carry: null, xp: 0, completed: 0 };
    }),
    stock: { timber: 0, stone: 0, iron: 0 }, gathered: { timber: 0, stone: 0, iron: 0 }, spent: { timber: 0, stone: 0, iron: 0 }, coins: 40,
    workshop: { timber: 0, stone: 0, labor: 0, complete: false, forged: 0 }, journal: ['Alden’s ambition: build a blacksmith workshop for Oakrest.'],
  };
  state.people.forEach(p => p.role === 'woodcutter' || p.role === 'miner' ? nextGather(state, p) : nextBuilder(state, p));
  return state;
}

export function chooseStrategy(s: GameState, strategy: Strategy): void {
  if (s.strategy !== null || !['local', 'trade', 'careful'].includes(strategy)) return;
  if (strategy === 'trade' && s.coins < 24) return;
  s.strategy = strategy;
  if (strategy === 'trade') {
    s.coins -= 24;
    for (const r of ['timber', 'stone'] as const) { s.stock[r] += 8; s.gathered[r] += 8; }
    s.decisionReason = 'Spent 24 of 40 coins on 8 timber and 8 stone from the local merchant. Villagers deliver the remaining materials.';
  } else if (strategy === 'careful') s.decisionReason = 'Alden chose measured work: longer gathering and building actions keep a steady pace while the workshop remains the goal.';
  else s.decisionReason = 'Alden chose local gathering: six woodcutters and four miners can supply the bill without spending the settlement’s 40 coins.';
  note(s, s.decisionReason);
}

export function step(s: GameState, count = 1): GameState {
  if (!Number.isInteger(count) || count < 0 || count > 36_000) throw new RangeError('Tick count must be between 0 and 36000.');
  for (let i = 0; i < count; i++) {
    s.tick++;
    if (s.strategy === null && s.tick >= s.decisionAt) chooseStrategy(s, 'local');
    for (const p of s.people) {
      p.remaining--;
      const progress = 1 - p.remaining / p.duration;
      p.x = p.fromX + (p.targetX - p.fromX) * progress;
      p.y = p.fromY + (p.targetY - p.fromY) * progress;
      if (p.remaining <= 0) finish(s, p);
    }
  }
  return s;
}

export function reconcile(s: GameState, now: number): { state: GameState; ticks: number; elapsed: number } {
  if (!Number.isFinite(now) || now < 0 || now > 8.64e15) throw new RangeError('Invalid wall time.');
  const elapsed = Math.max(0, now - s.savedAt);
  const effective = Math.min(elapsed, 86_400_000) * 0.25 + s.offlineRemainder;
  const ticks = Math.floor(effective / TICK_MS);
  s.offlineRemainder = effective % TICK_MS;
  step(s, ticks);
  s.savedAt = Math.max(s.savedAt, now);
  s.calendar = calendarDate(s.savedAt);
  if (ticks > 0) note(s, `While you were away: ${ticks} ticks of work at quarter speed. Calendar: ${s.calendar}.`);
  return { state: s, ticks, elapsed };
}

function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function integer(v: unknown, max = 1e12): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max; }
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.length <= max; }

/** Reject malformed imports before they can reach authoritative simulation code. */
export function validateSave(value: unknown): GameState | null {
  try {
    if (!object(value) || value.version !== 1 || !integer(value.tick) || !integer(value.savedAt, 8.64e15) || !text(value.calendar, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value.calendar) || !Number.isFinite(Date.parse(value.calendar))) return null;
    if (typeof value.offlineRemainder !== 'number' || !Number.isFinite(value.offlineRemainder) || value.offlineRemainder < 0 || value.offlineRemainder >= TICK_MS || !integer(value.decisionAt) || !text(value.decisionReason, 1000) || !integer(value.coins, 40)) return null;
    if (value.strategy !== null && !['local', 'trade', 'careful'].includes(String(value.strategy))) return null;
    if (!Array.isArray(value.journal) || value.journal.length > 12 || !value.journal.every(v => text(v, 1000))) return null;
    if (!Array.isArray(value.people) || value.people.length !== 16) return null;
    for (const [id, p] of value.people.entries()) {
      if (!object(p) || p.id !== id || !text(p.name, 40) || !text(p.personality, 100) || !ROLES.includes(p.role as Role) || !ACTIONS.includes(String(p.action)) || !integer(p.duration, 100) || p.duration < 1 || !integer(p.remaining, p.duration) || p.remaining < 1 || !integer(p.xp) || !integer(p.completed)) return null;
      if (!['x', 'y', 'fromX', 'fromY', 'targetX', 'targetY'].every(key => typeof p[key] === 'number' && Number.isFinite(p[key]) && (p[key] as number) >= 0 && (p[key] as number) <= 1200)) return null;
      if (p.carry !== null && (!object(p.carry) || !RESOURCES.includes(p.carry.resource as Resource) || !integer(p.carry.amount, 2) || p.carry.amount < 1)) return null;
    }
    for (const ledger of ['stock', 'gathered', 'spent'] as const) {
      const record = value[ledger];
      if (!object(record) || !RESOURCES.every(r => integer(record[r]))) return null;
    }
    const w = value.workshop;
    if (!object(w) || !integer(w.timber, BILL.timber) || !integer(w.stone, BILL.stone) || !integer(w.labor, BILL.labor) || typeof w.complete !== 'boolean' || !integer(w.forged) || w.complete !== (w.labor === BILL.labor) || (w.labor > 0 && (w.timber !== BILL.timber || w.stone !== BILL.stone))) return null;
    const s = value as unknown as GameState;
    if (s.spent.timber !== w.timber || s.spent.stone !== w.stone || s.spent.iron !== w.forged * 2 || !RESOURCES.every(r => s.gathered[r] === s.stock[r] + s.spent[r] + carried(s, r))) return null;
    if (s.people[0]?.role !== 'prince' || s.people.some(p => p.role === 'smith' && !w.complete)) return null;
    return JSON.parse(JSON.stringify(s)) as GameState;
  } catch { return null; }
}
