/**
 * Generator lektora (ElevenLabs TTS) dla linii dialogowych gry.
 *
 * Uruchomienie (lokalnie, NIGDY w CI — klucz API jest w .env.local poza repo):
 *   npx esbuild scripts/generate-voice.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/gen-voice.mjs && node /tmp/gen-voice.mjs
 *
 * Idempotentny: plik = <id>.<sha1(tekst)[:8]>.mp3 — zmiana tekstu daje nową
 * nazwę, istniejące pliki są pomijane, osierocone (po starym tekście) usuwane.
 * Wynik: public/assets/audio/voice/ + src/data/voiceFiles.ts (mapa id → plik).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_LINES } from '../src/data/voiceLines';

// uruchamiać z katalogu projektu (~/strzala2)
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public/assets/audio/voice');
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.65, similarity_boost: 0.75, style: 0, speed: 0.95 };

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) throw new Error('brak .env.local z ELEVENLABS_API_KEY');
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const sha8 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tts(key: string, voice: string, text: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 && attempt < 6) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function main() {
  const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice } = env();
  if (!key || !voice) throw new Error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID nieustawione');
  mkdirSync(OUT_DIR, { recursive: true });

  const wanted = new Map<string, string>();  // nazwa pliku → tekst
  const fileOf: Record<string, string> = {}; // id → nazwa pliku
  for (const { id, text } of VOICE_LINES) {
    const name = `${id}.${sha8(text)}.mp3`;
    wanted.set(name, text);
    fileOf[id] = name;
  }

  // sprzątanie osieroconych wersji
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith('.mp3') && !wanted.has(f)) {
      rmSync(join(OUT_DIR, f));
      console.log('usunięto stare:', f);
    }
  }

  let made = 0;
  let chars = 0;
  for (const [name, text] of wanted) {
    const path = join(OUT_DIR, name);
    if (existsSync(path)) continue;
    process.stdout.write(`→ ${name} (${text.length} zn.) ... `);
    writeFileSync(path, await tts(key, voice, text));
    made++;
    chars += text.length;
    console.log('OK');
    await sleep(500); // Free tier: concurrency 2 — sekwencyjnie z odstępem
  }

  const entries = Object.entries(fileOf)
    .map(([id, f]) => `  '${id}': '${f}',`)
    .sort()
    .join('\n');
  writeFileSync(
    join(ROOT, 'src/data/voiceFiles.ts'),
    `// WYGENEROWANE przez scripts/generate-voice.ts — nie edytować ręcznie.\n`
    + `// Lektor: ElevenLabs (elevenlabs.io), głos wg .env.local.\n`
    + `export const VOICE_FILES: Record<string, string> = {\n${entries}\n};\n`,
  );
  console.log(`\nGotowe: ${made} nowych plików, ${chars} znaków zużytych, `
    + `${wanted.size} linii łącznie.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
