#!/usr/bin/env node
/**
 * Registra una nueva versión en versions.json (posición [0]).
 * Sin dependencias externas. Uso:
 *   node scripts/release.mjs --version "1.2.0" --code 4 \
 *     --driveUrl "https://drive.google.com/file/d/1XYZ.../view?usp=sharing" \
 *     --size "118 MB" --changes "Cambio 1|Cambio 2" [--channel Estable] [--minAndroid "Android 8.0+"] [--critical]
 * Sin argumentos obligatorios, pregunta de forma interactiva.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'versions.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export function extractDriveId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : null;
}

function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const needsPrompt = !(args.version && args.code && args.driveUrl);

  if (needsPrompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    args.version ||= await rl.question('Versión (ej. 1.2.0): ');
    args.code ||= await rl.question('versionCode (entero): ');
    args.driveUrl ||= await rl.question('URL de Google Drive o ID: ');
    args.size ||= await rl.question('Peso (ej. 118 MB): ');
    args.changes ||= await rl.question('Cambios separados por "|": ');
    args.channel ||= (await rl.question('Canal [Estable]: ')) || 'Estable';
    if (args.critical === undefined) args.critical = /^(s|si|sí|y|yes)$/i.test((await rl.question('¿Crítica? [s/N]: ')).trim());
    rl.close();
  }

  const version = String(args.version).trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+([-+][\w.]+)?$/.test(version)) fail(`Versión inválida: "${version}"`);

  const code = Number(args.code);
  if (!Number.isInteger(code) || code <= 0) fail(`versionCode inválido: "${args.code}"`);

  const driveId = extractDriveId(args.driveUrl);
  if (!driveId) fail('No se pudo extraer el driveId de: ' + args.driveUrl);

  let size = String(args.size || '').trim();
  if (!size) fail('Falta el peso (--size).');
  if (/^\d+(\.\d+)?$/.test(size)) size += ' MB';

  const changes = String(args.changes || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!changes.length) fail('Indica al menos un cambio (--changes "A|B").');

  let list = [];
  try {
    list = JSON.parse(await readFile(FILE, 'utf8'));
    if (!Array.isArray(list)) throw new Error('no es un arreglo');
  } catch (e) {
    if (e.code !== 'ENOENT') fail('versions.json inválido: ' + e.message);
  }

  if (list.some(v => v.versionCode === code)) fail(`El versionCode ${code} ya existe.`);
  if (list.some(v => v.version === version)) fail(`La versión ${version} ya existe.`);
  if (list.length && code < list[0].versionCode) console.warn(`⚠ versionCode ${code} es menor al vigente (${list[0].versionCode}).`);

  const entry = {
    version,
    versionCode: code,
    releaseDate: new Date().toISOString().slice(0, 10),
    driveId,
    fileSize: size,
    minAndroid: typeof args.minAndroid === 'string' ? args.minAndroid : 'Android 8.0+',
    channel: typeof args.channel === 'string' ? args.channel : 'Estable',
    critical: args.critical === true || args.critical === 'true',
    changes
  };

  list.unshift(entry);
  await writeFile(FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log(`✔ Versión ${version} (build ${code}) agregada. driveId: ${driveId}`);
}

main().catch(e => fail(e.message));

