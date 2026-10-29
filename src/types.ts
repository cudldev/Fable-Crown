export type Role = "prince" | "woodcutter" | "miner" | "builder" | "smith";
export type Strategy = "local" | "trade" | "careful";
export type Resource = "timber" | "stone" | "iron";
export interface Person {
  id: number;
  name: string;
  role: Role;
  personality: string;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  action: string;
  remaining: number;
  duration: number;
  carry: { resource: Resource; amount: number } | null;
  xp: number;
  completed: number;
}
export interface GameState {
  version: 1;
  tick: number;
  savedAt: number;
  calendar: string;
  offlineRemainder: number;
  strategy: Strategy | null;
  decisionAt: number;
  decisionReason: string;
  people: Person[];
  stock: Record<Resource, number>;
  gathered: Record<Resource, number>;
  spent: Record<Resource, number>;
  coins: number;
  workshop: {
    timber: number;
    stone: number;
    labor: number;
    complete: boolean;
    forged: number;
  };
  journal: string[];
}
export const TICK_MS = 600;
export const LOCATIONS = {
  manor: { x: 520, y: 230 },
  storage: { x: 615, y: 470 },
  forest: { x: 220, y: 350 },
  mine: { x: 850, y: 260 },
  workshop: { x: 815, y: 530 },
  square: { x: 510, y: 410 },
};
export const BILL = { timber: 24, stone: 16, labor: 48 };
