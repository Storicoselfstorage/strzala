/**
 * Manifest linii pod lektora (TTS) — jedno źródło prawdy: data/texts.ts.
 * Teksty NIE są tu duplikowane, tylko importowane, więc każda redakcja
 * w texts.ts automatycznie aktualizuje manifest. Id deterministyczne:
 *   intro-N            — INTRO_LINES (kolejność ekranowa)
 *   tr-1-3-N / tr-2-3-N — WORLD_TRANSITIONS['after-1-3' / 'after-2-3']
 *   finale-N           — FINALE_LINES
 *   li-<poziom>        — LEVEL_INTROS (li-1-1 … li-3-3, li-boss)
 *   loss-N-header/-line — LOSS_MESSAGES (nagłówek i linia osobno)
 *   win-N              — WIN_MESSAGES
 *   ev-<klucz>         — EVENT_MESSAGES (np. ev-theftPlacek)
 *   taunt-p2/p3/after  — VABANK_TAUNTS
 *   gameover-header/-line — GAME_OVER (bez `button` — etykieta przycisku,
 *                           nie kwestia mówiona)
 */
import {
  EVENT_MESSAGES, FINALE_LINES, GAME_OVER, INTRO_LINES, LEVEL_INTROS,
  LOSS_MESSAGES, MENU_MESSAGES, SCENE_MESSAGES, THIEF_MESSAGES,
  VABANK_TAUNTS, WIN_MESSAGES, WORLD_TRANSITIONS,
} from './texts';

export type VoiceSpeaker = 'TOSIA' | 'VEGA' | 'ECHO' | 'VABANK' | 'NARRATOR';

export interface VoiceLine {
  id: string;
  text: string;
  kind: 'intro' | 'interlude' | 'level-intro' | 'event' | 'taunt'
    | 'finale' | 'loss' | 'win' | 'gameover';
  speaker: VoiceSpeaker;
}

/** Mapa prefiks → postać, spójna ze speakerOf() w scenes/Interlude.ts. */
function speakerOf(line: string): VoiceSpeaker {
  if (line.startsWith('Vega:')) return 'VEGA';
  if (line.startsWith('Tosia:')) return 'TOSIA';
  if (line.startsWith('Vabank')) return 'VABANK';
  return 'ECHO'; // narratorka-zwiadowczyni scenek
}

export const VOICE_LINES: VoiceLine[] = [
  ...INTRO_LINES.map((text, i): VoiceLine => (
    { id: `intro-${i + 1}`, text, kind: 'intro', speaker: speakerOf(text) }
  )),
  ...Object.entries(WORLD_TRANSITIONS).flatMap(([tid, lines]) =>
    lines.map((text, i): VoiceLine => ({
      id: `tr-${tid.replace('after-', '')}-${i + 1}`, text,
      kind: 'interlude', speaker: speakerOf(text),
    }))),
  ...FINALE_LINES.map((text, i): VoiceLine => (
    { id: `finale-${i + 1}`, text, kind: 'finale', speaker: speakerOf(text) }
  )),
  ...Object.entries(LEVEL_INTROS).map(([lvl, text]): VoiceLine => (
    { id: `li-${lvl.toLowerCase()}`, text, kind: 'level-intro', speaker: 'NARRATOR' }
  )),
  ...LOSS_MESSAGES.flatMap((m, i): VoiceLine[] => [
    { id: `loss-${i + 1}-header`, text: m.header, kind: 'loss', speaker: 'NARRATOR' },
    { id: `loss-${i + 1}-line`, text: m.line, kind: 'loss', speaker: 'NARRATOR' },
  ]),
  ...WIN_MESSAGES.map((text, i): VoiceLine => (
    { id: `win-${i + 1}`, text, kind: 'win', speaker: 'NARRATOR' }
  )),
  ...Object.entries(EVENT_MESSAGES).map(([key, text]): VoiceLine => (
    { id: `ev-${key}`, text, kind: 'event', speaker: 'NARRATOR' }
  )),
  { id: 'taunt-p2', text: VABANK_TAUNTS.phase2, kind: 'taunt', speaker: 'VABANK' },
  { id: 'taunt-p3', text: VABANK_TAUNTS.phase3, kind: 'taunt', speaker: 'VABANK' },
  { id: 'taunt-after', text: VABANK_TAUNTS.afterFight, kind: 'taunt', speaker: 'VABANK' },
  { id: 'gameover-header', text: GAME_OVER.header, kind: 'gameover', speaker: 'NARRATOR' },
  { id: 'gameover-line', text: GAME_OVER.line, kind: 'gameover', speaker: 'NARRATOR' },
  // Złodziej 2.0 + komunikaty scen (playtest 10.08)
  ...Object.entries(THIEF_MESSAGES).map(([k, text]): VoiceLine => (
    { id: `th-${k}`, text, kind: 'event', speaker: 'NARRATOR' }
  )),
  ...Object.entries(SCENE_MESSAGES).map(([k, text]): VoiceLine => (
    { id: `sc-${k}`, text, kind: 'event', speaker: 'NARRATOR' }
  )),
  // Menu — NOWA GRA (restart kampanii)
  ...Object.entries(MENU_MESSAGES).map(([k, text]): VoiceLine => (
    { id: `mn-${k}`, text, kind: 'event', speaker: 'NARRATOR' }
  )),
];
