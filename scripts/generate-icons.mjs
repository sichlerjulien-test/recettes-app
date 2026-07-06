#!/usr/bin/env node
// Génère les icônes PWA dans public/icons/ depuis un SVG inline.
// Re-run = output identique (déterministe).
// Dépendance : sharp (déjà dans devDependencies du projet).

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '../public/icons');

mkdirSync(ICONS_DIR, { recursive: true });

// Glyphe : fourchette blanche sur fond ambre #BB4D00.
// viewBox 100×100 — tout le glyphe est dans la safe-zone maskable (x/y 20–80).
// Symétrique autour de (50, 50).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#BB4D00"/>
  <path fill="white" d="
    M35,20 h5 v28 h-5 z
    M47,20 h6 v28 h-6 z
    M60,20 h5 v28 h-5 z
    M35,44 h30 v6 h-30 z
    M47,50 h6 v30 h-6 z
  "/>
</svg>`;

const SIZES = [
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon-180.png', size: 180 },
];

const svgBuffer = Buffer.from(SVG);

for (const { name, size } of SIZES) {
  const outPath = join(ICONS_DIR, name);
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`✓ ${name} (${size}×${size})`);
}
