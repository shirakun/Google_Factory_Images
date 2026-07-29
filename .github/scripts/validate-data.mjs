// Validates site/data.json after the build step.
// Called from build-pages.yml; exits nonzero on failure.
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('site/data.json', 'utf8'));
const fail = (msg) => { console.error('[FATAL]', msg); process.exit(1); };

if (d.schemaVersion !== 1)  fail('schemaVersion !== 1');
if (d.counts.devices === 0) fail('counts.devices === 0');
if (d.counts.factory < 100) fail('counts.factory too low: ' + d.counts.factory);
if (d.counts.ota < 100)     fail('counts.ota too low: ' + d.counts.ota);

const repo = process.env.GITHUB_REPOSITORY ?? '';
const GH_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//;
let googleCount = 0;

for (const [k, v] of Object.entries(d.devices)) {
  if (!Array.isArray(v.factory) || !Array.isArray(v.ota))
    fail('device ' + k + ' missing factory or ota array');
  for (const entry of [...v.factory, ...v.ota]) {
    if (entry[2] !== undefined) fail('device ' + k + ': entry has unexpected third element (old schema)');
    const urlOrParts = entry[1];
    if (Array.isArray(urlOrParts)) {
      // sharded entry
      if (urlOrParts.length < 2) fail('device ' + k + ': sharded entry has fewer than 2 URLs');
      const manifest = urlOrParts[urlOrParts.length - 1];
      if (!manifest.endsWith('.sha256')) fail('device ' + k + ': last sharded URL must end with .sha256, got: ' + manifest);
      if (repo) {
        for (const u of urlOrParts) {
          if (u.includes('dl.google.com')) googleCount++;
          if (!GH_URL_RE.test(u)) fail('device ' + k + ': expected GitHub Release URL in sharded array, got: ' + u);
        }
      }
    } else {
      // non-sharded entry
      if (typeof urlOrParts !== 'string') fail('device ' + k + ': entry[1] must be string or array');
      if (urlOrParts.includes('dl.google.com')) googleCount++;
      if (repo && !GH_URL_RE.test(urlOrParts))
        fail('device ' + k + ': expected GitHub Release URL, got: ' + urlOrParts);
    }
  }
}

if (repo && googleCount > 0) fail(`${googleCount} dl.google.com URLs found — all URLs must use GitHub Release`);

console.log('[OK]', d.counts.devices, 'devices,', d.counts.factory, 'factory,', d.counts.ota, 'OTA');
