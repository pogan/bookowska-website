require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../lib/format');
const { productDrawing } = require('../lib/drawing');

test('kwoty: całe złote bez groszy, reszta z dwoma miejscami', () => {
  assert.equal(f.money(22000), '220 zł');
  assert.equal(f.money(1699), '16,99 zł');
  assert.equal(f.parseMoney('16,99'), 1699);
  assert.equal(f.parseMoney('220'), 22000);
  assert.equal(f.parseMoney('12,5'), 1250);
  assert.equal(f.parseMoney('abc'), null);
});

test('odmiana liczebników', () => {
  const m = (n) => f.plural(n, 'miejsce', 'miejsca', 'miejsc');
  assert.deepEqual([1, 2, 4, 5, 12, 14, 22, 25].map(m), [
    'miejsce', 'miejsca', 'miejsca', 'miejsc', 'miejsc', 'miejsc', 'miejsca', 'miejsc',
  ]);
});

test('czas warszawski -> UTC także w dniu zmiany czasu', () => {
  assert.equal(f.warsawToUtc('2026-11-07 10:00'), '2026-11-07T09:00:00.000Z');
  assert.equal(f.warsawToUtc('2026-07-04 10:00'), '2026-07-04T08:00:00.000Z');
  assert.equal(f.warsawToUtc('2026-03-29 03:30'), '2026-03-29T01:30:00.000Z');
  assert.equal(f.isoWithOffset('2026-11-07T09:00:00.000Z'), '2026-11-07T10:00:00+01:00');
  assert.equal(f.dateNum('2026-11-07T09:00:00.000Z'), '07.11.2026');
  assert.equal(f.time('2026-11-07T09:00:00.000Z'), '10:00');
  assert.throws(() => f.warsawToUtc('7.11.2026'));
});

test('twarde spacje po jednoliterowych wyrazach, także w ciągu', () => {
  assert.equal(f.typo('notesy i w pracowni'), 'notesy i w pracowni');
  assert.equal(f.typo('Z chęcią'), 'Z chęcią');
});

test('rysunek wymiarowy zawiera wymiary i kreskowanie półpłótna', () => {
  const svg = productDrawing({ slug: 'x', width_mm: 148, height_mm: 210, depth_mm: 14, binding: 'półpłócienna' });
  assert.match(svg, /^<svg class="drawing"/);
  for (const label of ['>148<', '>210<', '>14<']) assert.ok(svg.includes(label), label);
  assert.match(svg, /fill="url\(#hatch-x\)"/);
  assert.equal(productDrawing({ slug: 'y', width_mm: null, height_mm: 10 }), '');
});
