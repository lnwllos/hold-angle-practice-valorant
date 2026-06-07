const { test } = require('node:test');
const assert = require('node:assert');
const { VALO, hfovToVfov } = require('../js/constants.js');

test('VALO holds Valorant reference values', () => {
  assert.strictEqual(VALO.RUN_SPEED, 5.4);
  assert.strictEqual(VALO.FIRE_RATE, 9.75);
  assert.strictEqual(VALO.FOV_H, 103);
  assert.strictEqual(VALO.YAW_CONST, 0.07);
  assert.deepStrictEqual(VALO.VANDAL, { head: 160, body: 40, legs: 33 });
  assert.strictEqual(VALO.ENEMY.hp + VALO.ENEMY.armor, 150);
  assert.strictEqual(VALO.RESPAWN_DELAY, 0.5);
  assert.deepStrictEqual(VALO.SPAWN_DELAY, { min: 0.2, max: 1.5 });
  assert.deepStrictEqual(VALO.TRACER, { life: 1.0, distance: 80 });
  assert.deepStrictEqual(VALO.AIM_FEEDBACK, { perfectHeadHalfWidth: 0.045 });
});

test('VALO.FLASH holds per-agent windup/blind/color/flight and tuning fields', () => {
  const f = VALO.FLASH;
  const keys = Object.keys(f).sort();
  assert.deepStrictEqual(keys,
    ['blindFullDeg', 'blindZeroDeg', 'breach', 'enemyPeekDelay', 'phoenix', 'rampUp', 'yoru']);
  for (const k of ['breach', 'phoenix', 'yoru']) {
    assert.ok(typeof f[k].windup === 'number' && f[k].windup > 0, `${k}.windup`);
    assert.ok(typeof f[k].blind === 'number' && f[k].blind > 0, `${k}.blind`);
    assert.strictEqual(typeof f[k].color, 'number', `${k}.color`);
    assert.ok(['wall', 'curve', 'float'].includes(f[k].flight), `${k}.flight`);
  }
  // Per-agent flight styles
  assert.strictEqual(f.breach.flight, 'wall');
  assert.strictEqual(f.phoenix.flight, 'curve');
  assert.strictEqual(f.yoru.flight, 'float');
  // Flight tuning: fixed-duration travel for wall/curve, speed for the float
  assert.ok(f.breach.travel > 0 && f.phoenix.travel > 0, 'fixed travel times');
  assert.ok(f.yoru.speed > 0, 'yoru float speed');
  assert.strictEqual(f.breach.windup, 0.5);
  assert.strictEqual(f.breach.blind, 2.0);
  assert.ok(f.blindFullDeg < f.blindZeroDeg);
});

test('hfovToVfov converts 103 H-FOV at 16:9 to ~71 V-FOV', () => {
  const v = hfovToVfov(103, 16 / 9);
  assert.ok(Math.abs(v - 70.5) < 1.0, `expected ~70.5, got ${v}`);
});

test('hfovToVfov keeps horizontal FOV constant across aspect ratios', () => {
  // Wider aspect -> smaller vertical FOV (since horizontal is fixed)
  const wide = hfovToVfov(103, 21 / 9);
  const std = hfovToVfov(103, 16 / 9);
  assert.ok(wide < std, `expected wider aspect to give smaller V-FOV: ${wide} < ${std}`);
});
