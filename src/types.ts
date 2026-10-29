export type Role = "prince" | "woodcutter" | "miner" | "builder" | "smith";
export type Strategy = "local" | "trade" | "careful";
export type Resource = "timber" | "stone" | "iron";
export type SettlementId = "oakrest" | "briarford" | "stonehaven";
export interface Point {
  x: number;
  y: number;
}
export interface WorldTarget extends Point {
  id: string;
  name: string;
  kind:
    | "settlement"
    | "forest"
    | "mine"
    | "store"
    | "workshop"
    | "manor"
    | "landmark";
  settlementId: SettlementId;
  description: string;
  resources?: Resource[];
}
export interface Settlement extends Point {
  id: SettlementId;
  name: string;
  description: string;
}
export interface Region {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
}
export type IntentKind =
  "move" | "gather" | "deposit" | "withdraw" | "build" | "forge";
export interface IntentDraft {
  kind: IntentKind;
  targetId?: string;
  point?: Point;
  resource?: Resource;
  quantity?: number;
  repeat?: boolean;
}
export interface Intent extends IntentDraft {
  id: string;
  quantity: number;
  remaining: number;
  repeat: boolean;
  source: "player" | "autonomous";
  label: string;
}
export interface ControlState {
  active: Intent | null;
  queue: Intent[];
  thinkingUntil: number;
  waiting: boolean;
  reason: string;
  nextId: number;
}
export type PlayerCommand =
  | { type: "order"; intent: IntentDraft; mode: "now" | "next" }
  | { type: "cancel"; id: string }
  | { type: "reorder"; id: string; direction: -1 | 1 }
  | { type: "wait" }
  | { type: "autonomy" };
export interface Person extends Point {
  id: number;
  name: string;
  role: Role;
  personality: string;
  homeId: SettlementId;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  path: Point[];
  action: string;
  remaining: number;
  duration: number;
  taskResource?: Resource;
  carry: { resource: Resource; amount: number } | null;
  xp: number;
  completed: number;
}
export interface GameState {
  version: 2;
  tick: number;
  savedAt: number;
  calendar: string;
  offlineRemainder: number;
  strategy: Strategy | null;
  decisionAt: number;
  decisionReason: string;
  people: Person[];
  stores: Record<SettlementId, Record<Resource, number>>;
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
  control: ControlState;
  journal: string[];
}
export const TICK_MS = 600;
export const BILL = { timber: 24, stone: 16, labor: 48 };
