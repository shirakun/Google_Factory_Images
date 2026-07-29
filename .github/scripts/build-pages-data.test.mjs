// .github/scripts/build-pages-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateKey, compareBuildIds, parseUrlFile, buildOutput, fetchPartUrlMap, FACTORY_RE, OTA_RE } from './build-pages-data.mjs';

// ── parseDateKey ─────────────────────────────────────────────────────────────

test('parseDateKey: returns key for modern build ID', () => {
  const k = parseDateKey('bp3a.251105.015');
  assert.equal(k.yymmdd, 251105);
  assert.equal(k.rev, 15);
  assert.equal(k.suffix, '');
});

test('parseDateKey: parses suffix like .b1', () => {
  const k = parseDateKey('ap4a.241205.013.b1');
  assert.equal(k.yymmdd, 241205);
  assert.equal(k.rev, 13);
  assert.equal(k.suffix, '.b1');
});

test('parseDateKey: returns null for legacy build ID', () => {
  assert.equal(parseDateKey('GRK39F'), null);
  assert.equal(parseDateKey('JZO54K'), null);
  assert.equal(parseDateKey('NOU'),    null);
});

// ── compareBuildIds ──────────────────────────────────────────────────────────

test('compareBuildIds: newer dated ID sorts first', () => {
  assert.ok(compareBuildIds('bp3a.251105.015', 'ap4a.241205.013') < 0);
});

test('compareBuildIds: higher revision sorts first (same date)', () => {
  assert.ok(compareBuildIds('bp1a.250305.019', 'bp1a.250305.007') < 0);
});

test('compareBuildIds: dated before legacy', () => {
  assert.ok(compareBuildIds('bp3a.251105.015', 'GRK39F') < 0);
});

test('compareBuildIds: two legacy IDs are ordered deterministically', () => {
  const result = compareBuildIds('JZO54K', 'GRK39F');
  assert.ok(typeof result === 'number');
  // reversed order is opposite sign
  assert.ok(compareBuildIds('GRK39F', 'JZO54K') === -result || result === 0);
});

test('compareBuildIds: suffix .b1 vs no suffix, same date+rev', () => {
  const r = compareBuildIds('ap4a.241205.013.b1', 'ap4a.241205.013');
  assert.ok(typeof r === 'number');
});

// ── parseUrlFile ─────────────────────────────────────────────────────────────

const F = (device, buildId) =>
  `https://dl.google.com/dl/android/aosp/${device}-${buildId}-factory-abcd1234.zip`;
const O = (device, buildId) =>
  `https://dl.google.com/dl/android/aosp/${device}-ota-${buildId}-abcd1234.zip`;

test('parseUrlFile: parses valid factory lines', () => {
  const content = [F('akita', 'bp3a.251105.015'), F('akita', 'ap4a.241205.013')].join('\n');
  // pad to meet MIN_COUNT
  const padded = Array.from({ length: 98 }, (_, i) => F(`dev${i}`, `bp1a.250101.00${i < 10 ? '0' : ''}${i}`)).join('\n');
  const entries = parseUrlFile(content + '\n' + padded, FACTORY_RE, 'factory');
  assert.ok(entries.some(e => e.device === 'akita' && e.buildId === 'bp3a.251105.015'));
});

test('parseUrlFile: skips malformed lines', () => {
  const valid   = Array.from({ length: 100 }, (_, i) => F(`dev${i}`, `bp1a.250101.001`)).join('\n');
  const entries = parseUrlFile('not-a-url\n' + valid, FACTORY_RE, 'factory');
  assert.ok(entries.every(e => e.url.startsWith('https://')));
});

test('parseUrlFile: strips CRLF', () => {
  const valid = Array.from({ length: 100 }, (_, i) => F(`dev${i}`, `bp1a.250101.001`)).join('\r\n');
  const entries = parseUrlFile(valid, FACTORY_RE, 'factory');
  assert.equal(entries.length, 100);
});

test('parseUrlFile: deduplicates exact URL duplicate with warning', () => {
  const url = F('akita', 'bp3a.251105.015');
  const base = Array.from({ length: 99 }, (_, i) => F(`dev${i}`, `bp1a.250101.001`)).join('\n');
  const entries = parseUrlFile(url + '\n' + url + '\n' + base, FACTORY_RE, 'factory');
  const akitaEntries = entries.filter(e => e.device === 'akita');
  assert.equal(akitaEntries.length, 1);
});

test('parseUrlFile: parses uppercase legacy build IDs verbatim', () => {
  const url = F('soju', 'GRK39F');
  const base = Array.from({ length: 99 }, (_, i) => F(`dev${i}`, `bp1a.250101.001`)).join('\n');
  const entries = parseUrlFile(url + '\n' + base, FACTORY_RE, 'factory');
  const e = entries.find(e => e.device === 'soju');
  assert.equal(e.buildId, 'GRK39F');
});

// ── buildOutput ──────────────────────────────────────────────────────────────

test('buildOutput: factory-only device has empty ota array', () => {
  const factory = [{ device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') }];
  const out = buildOutput(factory, [], { akita: 'Pixel 8a' }, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  assert.deepEqual(out.devices.akita.ota, []);
  assert.equal(out.devices.akita.factory.length, 1);
});

test('buildOutput: missing mapping falls back to codename', () => {
  const factory = [{ device: 'unknown42', buildId: 'bp1a.250101.001', url: F('unknown42','bp1a.250101.001') }];
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  assert.equal(out.devices.unknown42.name, 'unknown42');
});

test('buildOutput: known mapping produces "Name (codename)"', () => {
  const factory = [{ device: 'akita', buildId: 'bp1a.250101.001', url: F('akita','bp1a.250101.001') }];
  const out = buildOutput(factory, [], { akita: 'Pixel 8a' }, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  assert.equal(out.devices.akita.name, 'Pixel 8a (akita)');
});

test('buildOutput: counts match array lengths', () => {
  const factory = [
    { device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') },
    { device: 'akita', buildId: 'ap4a.241205.013', url: F('akita','ap4a.241205.013') },
  ];
  const ota = [{ device: 'akita', buildId: 'bp3a.251105.015', url: O('akita','bp3a.251105.015') }];
  const out = buildOutput(factory, ota, {}, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  assert.equal(out.counts.factory, 2);
  assert.equal(out.counts.ota, 1);
  assert.equal(out.counts.devices, 1);
});

test('buildOutput: versions are newest-first', () => {
  const factory = [
    { device: 'akita', buildId: 'ap4a.241205.013', url: F('akita','ap4a.241205.013') },
    { device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') },
  ];
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  assert.equal(out.devices.akita.factory[0][0], 'bp3a.251105.015');
});

// ── GitHub Release URL construction ──────────────────────────────────────────

test('buildOutput: constructs GitHub Release URL when repo is set', () => {
  const factory = [{ device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') }];
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, 'owner/repo', new Map());
  const [buildId, url] = out.devices.akita.factory[0];
  assert.equal(buildId, 'bp3a.251105.015');
  assert.ok(url.startsWith('https://github.com/owner/repo/releases/download/firmware-akita-factory/'));
  assert.ok(url.endsWith('.zip'));
});

test('buildOutput: falls back to Google URL when repo is empty', () => {
  const factory = [{ device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') }];
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, '', new Map());
  const [, url] = out.devices.akita.factory[0];
  assert.ok(url.startsWith('https://dl.google.com'));
});

test('buildOutput: sharded entry uses part URL array', () => {
  const factory = [{ device: 'tokay', buildId: 'ad1a.240530.030', url: F('tokay','ad1a.240530.030') }];
  const partMap = new Map([
    ['tokay:factory:ad1a.240530.030', [
      'https://github.com/owner/repo/releases/download/firmware-tokay-factory/tokay-ad1a.240530.030-factory-abcd1234.zip.part01',
      'https://github.com/owner/repo/releases/download/firmware-tokay-factory/tokay-ad1a.240530.030-factory-abcd1234.zip.part02',
      'https://github.com/owner/repo/releases/download/firmware-tokay-factory/tokay-ad1a.240530.030-factory-abcd1234.zip.sha256',
    ]],
  ]);
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, 'owner/repo', partMap);
  const entry = out.devices.tokay.factory[0];
  assert.equal(entry.length, 2);
  assert.equal(entry[0], 'ad1a.240530.030');
  assert.ok(Array.isArray(entry[1]));
  assert.equal(entry[1].length, 3);
  assert.ok(entry[1][2].endsWith('.sha256'));
  assert.equal(entry[2], undefined);
});

test('buildOutput: sharded array part URLs sorted numerically', () => {
  const factory = [{ device: 'tokay', buildId: 'ad1a.240530.030', url: F('tokay','ad1a.240530.030') }];
  const partMap = new Map([
    ['tokay:factory:ad1a.240530.030', [
      'https://github.com/r/releases/download/t/tokay.zip.part01',
      'https://github.com/r/releases/download/t/tokay.zip.part02',
      'https://github.com/r/releases/download/t/tokay.zip.sha256',
    ]],
  ]);
  const out = buildOutput(factory, [], {}, {}, 'owner/repo', partMap);
  const urls = out.devices.tokay.factory[0][1];
  assert.ok(urls[0].endsWith('.part01'));
  assert.ok(urls[1].endsWith('.part02'));
  assert.ok(urls[2].endsWith('.sha256'));
});

test('buildOutput: non-sharded entry has no third element', () => {
  const factory = [{ device: 'akita', buildId: 'bp3a.251105.015', url: F('akita','bp3a.251105.015') }];
  const out = buildOutput(factory, [], {}, { generatedAt: 'T', sourceRevision: 'abc' }, 'owner/repo', new Map());
  const entry = out.devices.akita.factory[0];
  assert.equal(entry.length, 2);
  assert.equal(typeof entry[1], 'string');
  assert.equal(entry[2], undefined);
});
