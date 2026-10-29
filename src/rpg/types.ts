/** Renderer-independent contracts. Distances and positions are logical tiles. */
export const TICK_MS = 600;
export const SKILLS = [
  "woodcutting",
  "mining",
  "smithing",
  "fishing",
  "cooking",
  "attack",
  "strength",
  "defence",
  "hitpoints",
  "ranged",
] as const;
export type SkillId = (typeof SKILLS)[number];
export type CombatStyle = "attack" | "strength" | "defence" | "accurate" | "rapid" | "longrange";
export type Terrain = "grass" | "dirt" | "stone" | "water" | "sand";
export type ItemId = string;
export type ResourceId =
  | "tree"
  | "oak"
  | "willow"
  | "copper"
  | "tin"
  | "iron"
  | "coal"
  | "shrimp"
  | "sardine"
  | "trout";
export type EquipmentSlot =
  "weapon" | "shield" | "head" | "body" | "legs" | "cape";
export interface TilePosition {
  worldId: string;
  x: number;
  y: number;
  plane: number;
}
export interface WorldObject {
  id: string;
  name: string;
  kind:
    | "tree"
    | "rock"
    | "fish"
    | "bank"
    | "furnace"
    | "anvil"
    | "range"
    | "shop"
    | "quest"
    | "building"
    | "landmark"
    | "bridge"
    | "clue"
    | "target"
    | "ferry";
  position: TilePosition;
  width: number;
  height: number;
  blocks: boolean;
  resourceId?: ResourceId;
  shopId?: string;
  questId?: string;
  art?: string;
  cutaway?: boolean;
  serviceId?: string;
}
export interface WorldDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  chunkSize: number;
  terrain: Terrain[];
  /** Bit0 blocks a cell; bits1/2/3/4 block N/E/S/W edges. */ collision: number[];
  objects: WorldObject[];
  spawns: TilePosition[];
  portals: {
    id: string;
    from: TilePosition;
    to: TilePosition;
    requiresQuest?: string;
  }[];
}
export interface ItemStack {
  itemId: ItemId;
  quantity: number;
}
export interface ItemDefinition {
  id: ItemId;
  name: string;
  stackable: boolean;
  value: number;
  weight: number;
  kind: "resource" | "tool" | "gear" | "food" | "currency" | "supply";
  tool?: "axe" | "pickaxe" | "net" | "rod" | "flyrod" | "hammer";
  tier?: number;
  skill?: SkillId;
  level?: number;
  slot?: EquipmentSlot;
  attackLevel?: number;
  defenceLevel?: number;
  attack?: number;
  strength?: number;
  defence?: number;
  attackTicks?: number;
  heals?: number;
  weaponType?: "melee" | "bow";
  rangedLevel?: number;
  range?: number;
  twoHanded?: boolean;
  rangedAttack?: number;
  rangedStrength?: number;
  ammoTier?: number;
}
export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  skill: SkillId;
  level: number;
  tool: NonNullable<ItemDefinition["tool"]>;
  itemId: ItemId;
  xp: number;
  /** XP is always integer tenths. */ ticks: number;
  respawnTicks: number;
  depletion: number;
  success: number;
  bait?: ItemId;
}
export interface Recipe {
  id: string;
  name: string;
  skill: SkillId;
  level: number;
  station: "furnace" | "anvil" | "range";
  inputs: ItemStack[];
  output: ItemStack;
  xp: number;
  ticks: number;
  success: number;
  tool?: ItemId;
}
export interface ResourceState {
  objectId: string;
  available: boolean;
  respawnAt: number;
}
export interface ActionState {
  kind:
    | "gather"
    | "craft"
    | "fight"
    | "bank"
    | "buy"
    | "sell"
    | "quest"
    | "recover"
    | "rest"
    | "eat"
    | "practice";
  targetId?: string;
  recipeId?: string;
  remaining: number;
  duration: number;
}
export interface ActorState {
  id: number;
  name: string;
  role: string;
  home: string;
  position: TilePosition;
  previousPosition: TilePosition;
  path: TilePosition[];
  skills: Record<SkillId, number>;
  inventory: ItemStack[];
  equipment: Partial<Record<EquipmentSlot, ItemId>>;
  ammo: ItemStack | null;
  health: number;
  runEnergy: number;
  action: ActionState | null;
  activity: string;
  completed: number;
  bank: ItemStack[];
}
export interface Ambition {
  id: string;
  title: string;
  kind: "skill" | "equipment" | "quest" | "explore" | "gather";
  /** Gather goals count held items across backpack and personal bank. */
  resourceId?: ResourceId;
  quantity?: number;
  skill?: SkillId;
  level?: number;
  itemId?: ItemId;
  questId?: string;
  targetId?: string;
}
export interface Thought {
  id: string;
  title: string;
  body: string;
  expiresAt: number;
  choices: { id: string; label: string; description: string; goal: Ambition }[];
}
export type RpgOrder =
  | { type: "move"; position: TilePosition }
  | { type: "gather"; objectId: string; quantity: number }
  | { type: "craft"; recipeId: string; quantity: number }
  | { type: "bank"; objectId?: string }
  | { type: "withdraw"; itemId: ItemId; quantity: number }
  | { type: "buy" | "sell"; shopId: string; itemId: ItemId; quantity: number }
  | { type: "equip"; itemId: ItemId }
  | { type: "unequip"; slot: EquipmentSlot }
  | { type: "unequip-ammo" }
  | { type: "eat"; itemId: ItemId }
  | { type: "attack"; enemyId: string }
  | { type: "loot"; dropId: string }
  | { type: "quest"; questId: string }
  | { type: "recover" }
  | {
      type: "interact";
      objectId: string;
      verb: "talk" | "inspect" | "use" | "practice";
      itemId?: string;
    }
  | { type: "travel-service"; objectId: string };
export type RpgCommand =
  | RpgOrder
  | { type: "enqueue"; order: RpgOrder }
  | { type: "goal"; goal: Ambition }
  | { type: "style"; skill: CombatStyle }
  | { type: "run"; enabled: boolean }
  | { type: "dialogue-choice"; choiceId: string }
  | { type: "cancel-order"; index: number }
  | { type: "reorder-order"; index: number; direction: -1 | 1 }
  | { type: "wait" | "resume" };
export interface EnemyDefinition {
  id: string;
  name: string;
  health: number;
  attack: number;
  strength: number;
  defence: number;
  attackTicks: number;
  maxHit: number;
  aggressive: boolean;
  respawnTicks: number;
  loot: ItemStack[];
  combatType?: "melee" | "ranged";
  range?: number;
}
export interface EnemyState {
  id: string;
  definitionId: string;
  position: TilePosition;
  home: TilePosition;
  health: number;
  respawnAt: number;
  cooldown: number;
  engagedUntil: number;
}
export interface ShopState {
  id: string;
  stock: Record<ItemId, number>;
  restockAt: number;
}
export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  giverId: string;
  requirements?: Partial<Record<SkillId, number>>;
  items: ItemStack[];
  kills?: { enemyId: string; quantity: number };
  prerequisites?: string[];
  stages?: QuestStage[];
  reward: {
    coins: number;
    xp: Partial<Record<SkillId, number>>;
    unlock: string;
  };
}
export interface QuestStage {
  id: string;
  description: string;
  kind:
    | "talk"
    | "inspect"
    | "visit"
    | "gather"
    | "craft"
    | "deliver"
    | "kill"
    | "practice"
    | "choice";
  targetId?: string;
  items?: ItemStack[];
  recipeId?: string;
  enemyId?: string;
  quantity?: number;
  next?: string;
  choices?: { id: string; label: string; next: string }[];
}
export interface QuestProgress {
  accepted: boolean;
  complete: boolean;
  kills: number;
  stageId?: string;
  counters?: Record<string, number>;
  choices?: Record<string, string>;
}
export interface DialogueState {
  id: string;
  questId: string;
  targetId: string;
  text: string;
  choices: { id: string; label: string }[];
  expiresAt: number;
}
export interface RpgState {
  version: 4;
  tick: number;
  savedAt: number;
  calendar: string;
  offlineRemainder: number;
  seed: number;
  player: ActorState;
  npcs: ActorState[];
  resources: Record<string, ResourceState>;
  bank: ItemStack[];
  shops: ShopState[];
  enemies: EnemyState[];
  drops: {
    id: string;
    position: TilePosition;
    items: ItemStack[];
    expiresAt: number;
  }[];
  quests: Record<string, QuestProgress>;
  grave: {
    position: TilePosition;
    items: ItemStack[];
    attempts: number;
    retryAt: number;
  } | null;
  control: {
    /** Older V3 saves default to running when energy permits. */
    running?: boolean;
    waiting: boolean;
    active: RpgOrder | null;
    source?: "player" | "autonomous" | null;
    queue: RpgOrder[];
    goal: Ambition | null;
    thinkingUntil: number;
    eatReadyAt: number;
    reason: string;
    steps: string[];
    style: CombatStyle;
    visited: string[];
    thought: Thought | null;
    lastThought: number;
    /** Objective progress watchdog; absent in migrated saves until the first autonomous plan. */
    progress?: { goalId: string; fingerprint: string; tick: number; failures: number; blockedUntil: number };
  };
  journal: string[];
  /** Bounded, deterministic player rewards. Older V3 saves may omit this log. */
  rewards?: RewardEvent[];
  dialogue?: DialogueState | null;
}
export interface RewardEvent {
  id: string;
  tick: number;
  items: ItemStack[];
  xp: Partial<Record<SkillId, number>>;
}
