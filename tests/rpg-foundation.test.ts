import {describe,it,expect} from 'vitest';
import {createRpg,stepRpg,applyRpgCommand,reconcileRpg,validateRpgSave} from '../src/rpg/engine';
import {WORLD,findPath,canStep,tile} from '../src/rpg/world';
import {tileToScreen,screenToTile} from '../src/render/iso';
import {levelForXp,XP_THRESHOLDS} from '../src/rpg/skills';
const NOW=Date.UTC(2026,9,29,12);
describe('tile chapter foundation',()=>{
 it('starts fresh with 24 legal distinct actors and separate skill XP',()=>{const s=createRpg(NOW);expect(s.version).toBe(5);expect([s.player,...s.npcs]).toHaveLength(24);expect(new Set(WORLD.spawns.map(p=>`${p.x},${p.y}`)).size).toBe(24);expect(levelForXp(s.player.skills.hitpoints)).toBe(10);expect(levelForXp(s.player.skills.mining)).toBe(1);expect(XP_THRESHOLDS[1]).toBe(830);expect(XP_THRESHOLDS[98]).toBe(130344310);expect(validateRpgSave(s)).not.toBeNull();});
 it('moves at most two adjacent legal steps in a tick and honors Wait',()=>{const s=createRpg(NOW),from={...s.player.position},to=tile(60,100),path=findPath(from,to)!;expect(path).not.toBeNull();expect(applyRpgCommand(s,{type:'move',position:to}).ok).toBe(true);stepRpg(s);expect(s.player.position).toEqual(path[1]);expect(canStep(from,path[0]!)).toBe(true);expect(canStep(path[0]!,path[1]!)).toBe(true);applyRpgCommand(s,{type:'wait'});const held={...s.player.position};stepRpg(s,50);expect(s.player.position).toEqual(held);expect(s.control.waiting).toBe(true);expect(applyRpgCommand(s,{type:'move',position:tile(118,100)}).ok).toBe(false);});
 it('replays deterministically through a serialized save',()=>{const a=createRpg(NOW);applyRpgCommand(a,{type:'move',position:tile(151,43)});stepRpg(a,10);const b=validateRpgSave(JSON.parse(JSON.stringify(a)))!;expect(b).not.toBeNull();stepRpg(a,200);stepRpg(b,200);expect(b).toEqual(a);});
 it('retains fractional offline time and caps absence at 24 hours',()=>{const a=createRpg(NOW);expect(reconcileRpg(a,NOW+7).ticks).toBe(0);expect(a.offlineRemainder).toBe(1.75);expect(validateRpgSave(a)).not.toBeNull();const b=createRpg(NOW);expect(reconcileRpg(b,NOW+72*3600000).ticks).toBe(36000);const copy=JSON.stringify(b);expect(reconcileRpg(b,NOW+72*3600000).ticks).toBe(0);expect(JSON.stringify(b)).toBe(copy);});
 it('rejects a non-tile or illegal saved path',()=>{const s=createRpg(NOW);s.player.position.x+=.5;expect(validateRpgSave(s)).toBeNull();const t=createRpg(NOW);t.player.path=[tile(151,43)];expect(validateRpgSave(t)).toBeNull();expect(validateRpgSave({version:3})).toBeNull();});
 it('projects and selects the same logical tile independently of simulation',()=>{for(const p of [tile(0,0),tile(52,95),tile(255,191),tile(151,43)]){const q=screenToTile(tileToScreen(p));expect(q.x).toBe(p.x);expect(q.y).toBe(p.y);}});
});
