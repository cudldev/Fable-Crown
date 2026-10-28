import { describe, expect, it } from 'vitest';
import { calendarDate, chooseStrategy, createGame, reconcile, step, validateSave } from '../src/simulation';
import { BILL, TICK_MS, type GameState, type Resource, type Strategy } from '../src/types';

const NOW = Date.UTC(2026, 9, 29, 12);
function conservation(s: GameState): void {
  for (const r of ['timber', 'stone', 'iron'] as Resource[]) {
    const carried = s.people.reduce((n, p) => n + (p.carry?.resource === r ? p.carry.amount : 0), 0);
    expect(s.gathered[r]).toBe(s.stock[r] + s.spent[r] + carried);
    expect(s.stock[r]).toBeGreaterThanOrEqual(0);
  }
}

describe('autonomous settlement', () => {
  it.each([null, 'local', 'trade', 'careful'] as (Strategy | null)[])('finishes workshop and forges tools with %s intention', strategy => {
    const s = createGame(NOW);
    if (strategy) chooseStrategy(s, strategy);
    for (let i = 0; i < 200; i++) { step(s); conservation(s); }
    expect(s.people).toHaveLength(16);
    expect(s.workshop.complete).toBe(true);
    expect(s.workshop.timber).toBe(BILL.timber);
    expect(s.workshop.stone).toBe(BILL.stone);
    expect(s.workshop.forged).toBeGreaterThan(0);
    expect(s.people[0]!.xp).toBeGreaterThan(0);
    expect(s.people.some(p => p.role === 'smith')).toBe(true);
    expect(s.coins).toBe(strategy === 'trade' ? 16 : 40);
    expect(validateSave(s)).not.toBeNull();
  });
  it('works before a thought is answered and chooses automatically at 20.4 seconds', () => {
    const s = createGame(NOW);
    step(s, 33);
    expect(s.strategy).toBeNull();
    expect(s.gathered.timber).toBeGreaterThan(0);
    step(s);
    expect(s.strategy).toBe('local');
    expect(s.tick * TICK_MS).toBe(20_400);
    chooseStrategy(s, 'trade');
    expect(s.coins).toBe(40);
  });
  it('replays identically across save/load including simultaneous deliveries', () => {
    const first = createGame(NOW);
    step(first, 47);
    const second = validateSave(JSON.parse(JSON.stringify(first)))!;
    expect(second).not.toBeNull();
    step(first, 1000); step(second, 1000);
    expect(second).toEqual(first);
    conservation(second);
  });
});

describe('offline quarter-speed reconciliation', () => {
  it('uses the local calendar at midnight rather than the UTC date', () => {
    const beforeMidnight = new Date(2026, 9, 28, 23, 59).getTime();
    const afterMidnight = new Date(2026, 9, 29, 0, 1).getTime();
    expect(calendarDate(beforeMidnight)).toBe('2026-10-28');
    expect(calendarDate(afterMidnight)).toBe('2026-10-29');
    const s = createGame(beforeMidnight);
    expect(s.calendar).toBe('2026-10-28');
    reconcile(s, afterMidnight);
    expect(s.calendar).toBe('2026-10-29');
  });
  it.each([[0, 0], [1, 1500], [24, 36000], [72, 36000]])('caps %s hours to %s ticks and commits once', (hours, ticks) => {
    const s = createGame(NOW);
    const now = NOW + hours * 3_600_000;
    const result = reconcile(s, now);
    expect(result.ticks).toBe(ticks);
    expect(s.tick).toBe(ticks);
    const date = new Date(now);
    expect(s.calendar).toBe(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    const committed = JSON.stringify(s);
    expect(reconcile(s, now).ticks).toBe(0);
    expect(JSON.stringify(s)).toBe(committed);
    conservation(s);
    expect(validateSave(s)).not.toBeNull();
  });
  it('preserves fractional time and rejects clock regression duplication', () => {
    const s = createGame(NOW);
    expect(reconcile(s, NOW + 1200).ticks).toBe(0);
    expect(s.offlineRemainder).toBe(300);
    expect(reconcile(s, NOW + 2400).ticks).toBe(1);
    const committed = JSON.stringify(s);
    reconcile(s, NOW + 1200);
    expect(JSON.stringify(s)).toBe(committed);
  });
});

describe('import validation', () => {
  it.each([null, {}, [], 'save', { version: 2 }, { version: 1, people: [{}] }])('rejects malformed %s', value => expect(validateSave(value)).toBeNull());
  it('rejects corrupted resources, movement, and construction state', () => {
    const s = createGame(NOW);
    const forged = structuredClone(s); forged.stock.timber = 999;
    expect(validateSave(forged)).toBeNull();
    const badActor = structuredClone(s); badActor.people[0]!.duration = 0;
    expect(validateSave(badActor)).toBeNull();
    const badBuild = structuredClone(s); badBuild.workshop.complete = true;
    expect(validateSave(badBuild)).toBeNull();
  });
});
