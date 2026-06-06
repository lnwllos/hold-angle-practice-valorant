const { test } = require('node:test');
const assert = require('node:assert');
const { VALO, hfovToVfov } = require('../js/constants.js');

test('VALO holds Valorant reference values', () => {
  assert.strictEqual(VALO.RUN_SPEED, 6.75);
  assert.strictEqual(VALO.FIRE_RATE, 9.75);
  assert.strictEqual(VALO.FOV_H, 103);
  assert.strictEqual(VALO.YAW_CONST, 0.07);
  assert.deepStrictEqual(VALO.VANDAL, { head: 160, body: 40, legs: 33 });
  assert.strictEqual(VALO.ENEMY.hp + VALO.ENEMY.armor, 150);
  assert.strictEqual(VALO.RESPAWN_DELAY, 0.5);
  assert.deepStrictEqual(VALO.SPAWN_DELAY, { min: 0.2, max: 1.5 });
  assert.deepStrictEqual(VALO.SHOT_TIMING, { fastMs: 75, slowMs: 300 });
  assert.deepStrictEqual(VALO.TRACER, { life: 1.0, distance: 80 });
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
