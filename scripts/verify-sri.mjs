#!/usr/bin/env node
/**
 * Fails the build if production index.html has script/link tags without integrity.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const indexPath = join(process.cwd(), 'www', 'index.html');

if (!existsSync(indexPath)) {
  console.error('verify-sri: missing www/index.html — run ng build first');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const tagPattern = /<(script|link)\b[^>]*>/gi;
const tags = [...html.matchAll(tagPattern)].map((m) => m[0]);

const externalAssetPattern = /\b(?:src|href)=["'][^"']+\.(?:js|mjs|css)["']/i;
const missingIntegrity = tags.filter(
  (tag) => externalAssetPattern.test(tag) && !/\bintegrity=/.test(tag),
);

if (missingIntegrity.length > 0) {
  console.error('verify-sri: tags without integrity attribute:');
  for (const tag of missingIntegrity) {
    console.error(`  ${tag}`);
  }
  process.exit(1);
}

console.log(`verify-sri: OK (${tags.filter((t) => /\bintegrity=/.test(t)).length} tagged assets with integrity)`);
