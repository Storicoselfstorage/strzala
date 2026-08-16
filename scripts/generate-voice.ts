/**
 * Generator lektora (ElevenLabs TTS) dla linii dialogowych gry.
 *
 * Uruchomienie (lokalnie, NIGDY w CI — klucz API jest w .env.local poza repo):
 *   npx esbuild scripts/generate-voice.ts --bundle --platform=node \
 *     --format=esm --outfile=/tmp/gen-voice.mjs && node /tmp/gen-voice.mjs
 *
 * Idempotentny: plik = <id>.<sha1(voiceId|settings|tekst)[:8]>.mp3 — zmiana
 * tekstu, głosu lub ustawień daje nową nazwę, istniejące pliki są pomijane,
 * osierocone (po starej wersji) usuwane.
 * Wynik: public/assets/audio/voice/ + src/data/voiceFiles.ts (mapa id → plik).
 *
 * Obsada: każda postać ma własny głos z Voice Library (ID głosów publicznych
 * NIE są sekretami); NARRATOR (Babcia Bożenka) nadal z .env.local.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_LINES, VoiceSpeaker } from '../src/data/voiceLines';

// uruchamiać z katalogu projektu (~/strzala2)
const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public/assets/audio/voice');
const MODEL = 'eleven_multilingual_v2';

// Głosy postaci (ElevenLabs Voice Library, dodane do konta jako „STRZALA …").
const CHARACTER_VOICES: Record<Exclude<VoiceSpeaker, 'NARRATOR'>, string> = {
  TOSIA: 'C8ZVSJxcymeT86xT429O',   // Luiza - Crisp, Rich & Expressive
  VEGA: 'm6j9iSWdnSmguZuMqQjg',    // BJBJ - Professional & Energetic
  ECHO: 'ASTUQY0HwelFAKtXlaJ2',    // Weronika - Storyteller
  VABANK: 'C1DBnkwmDIzoLOPlBvSg',  // Ignacius - Sympathetic, Raspy, Friendly
};

type Settings = {
  stability: number; similarity_boost: number; style: number; speed: number;
};
// Postaci żywsze, narrator spokojny jak dotąd.
const CHARACTER_SETTINGS: Settings = {
  stability: 0.45, similarity_boost: 0.75, style: 0.5, speed: 1.0,
};
const NARRATOR_SETTINGS: Settings = {
  stability: 0.65, similarity_boost: 0.75, style: 0, speed: 0.95,
};

// Postać nie czyta własnego imienia — prefiks „Tosia: "/„Vega: "/„Vabank: "
// znika z tekstu TTS (tekst wyświetlany w grze zostaje bez zmian).
const stripSpeakerPrefix = (text: string) =>
  text.replace(/^(Tosia|Vega|Vabank):\s*/, '');

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

async function tts(
  key: string, voice: string, text: string, settings: Settings,
): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: settings }),
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
  const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: narratorVoice } = env();
  if (!key || !narratorVoice) throw new Error('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID nieustawione');
  mkdirSync(OUT_DIR, { recursive: true });

  interface Job { text: string; voice: string; settings: Settings }
  const wanted = new Map<string, Job>();     // nazwa pliku → zadanie TTS
  const fileOf: Record<string, string> = {}; // id → nazwa pliku
  for (const { id, text, speaker } of VOICE_LINES) {
    const voice = speaker === 'NARRATOR' ? narratorVoice : CHARACTER_VOICES[speaker];
    const settings = speaker === 'NARRATOR' ? NARRATOR_SETTINGS : CHARACTER_SETTINGS;
    const ttsText = speaker === 'NARRATOR' ? text : stripSpeakerPrefix(text);
    const name = `${id}.${sha8(`${voice}|${JSON.stringify(settings)}|${ttsText}`)}.mp3`;
    wanted.set(name, { text: ttsText, voice, settings });
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
  for (const [name, { text, voice, settings }] of wanted) {
    const path = join(OUT_DIR, name);
    if (existsSync(path)) continue;
    process.stdout.write(`→ ${name} (${text.length} zn.) ... `);
    writeFileSync(path, await tts(key, voice, text, settings));
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
    + `// Lektor: ElevenLabs (elevenlabs.io) — narrator wg .env.local, `
    + `postaci wg CHARACTER_VOICES.\n`
    + `export const VOICE_FILES: Record<string, string> = {\n${entries}\n};\n`,
  );
  console.log(`\nGotowe: ${made} nowych plików, ${chars} znaków zużytych, `
    + `${wanted.size} linii łącznie.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
