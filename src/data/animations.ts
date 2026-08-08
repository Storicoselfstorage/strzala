/**
 * Definicje animacji STRZA/ŁA 2.0 (dane czyste — silnik tworzy z nich Phaser anims).
 *
 * ── ARKUSZ SMOKÓW (dragon-*: 1360×512, klatka 113×64, 12 kolumn × 8 wierszy) ──
 * Indeks klatki = wiersz*12 + kolumna. Każdy wiersz to kierunek/tryb,
 * w wierszu 3 podsekwencje: kolumny 0-5 / 6-8 / 9-11.
 *
 *  wiersz 0 (kl.  0-11): PRZÓD  — krok 0-5 · atak (ogień w dół) 6-8 · idle 9-11
 *  wiersz 1 (kl. 12-23): LEWO   — krok 12-17 · atak (zianie) 18-20 · przysiad/leżenie 21-23
 *  wiersz 2 (kl. 24-35): PRAWO  — krok 24-29 · atak (zianie) 30-32 · przysiad/leżenie 33-35
 *  wiersz 3 (kl. 36-47): TYŁ    — krok 36-41 · atak 42-44 · idle 45-47
 *  wiersz 4 (kl. 48-59): lot PRZÓD 48-50 · lot TYŁ 51-53 · zawis PRZÓD 54-56 · siad 57-59
 *  wiersz 5 (kl. 60-71): lot LEWO 60-62 · nurkowanie 63-65 · zawis 66-68 · SEN 69-71
 *  wiersz 6 (kl. 72-83): lot PRAWO 72-74 · nurkowanie 75-77 · zawis 78-80 · RYK/prezentacja 81-83
 *  wiersz 7 (kl. 84-95): lot TYŁ/pionowy 84-89 · zawis 90-92 · stanie przód 93-95
 *
 * Silnik używa wariantów PRAWO + flipX dla lewa (areny są side-view).
 */

export interface AnimDef {
  key: string;
  textureKey: string;
  frames: { start: number; end: number };
  frameRate: number;
  /** -1 = pętla, 0 = raz */
  repeat: number;
}

/** Wspólny zestaw animacji smoka — klucze `dragon-<imię>-<akcja>`. */
function dragonAnims(name: string): AnimDef[] {
  const t = `dragon-${name}`;
  return [
    // idle przodem (mapa świata / scenki)
    { key: `${t}-idle`, textureKey: t, frames: { start: 9, end: 11 }, frameRate: 6, repeat: -1 },
    // krok w prawo (arena — flipX dla lewa)
    { key: `${t}-walk`, textureKey: t, frames: { start: 24, end: 29 }, frameRate: 10, repeat: -1 },
    // zianie ogniem w prawo (klatki 30-32: ogień/pauza/ogień)
    { key: `${t}-attack`, textureKey: t, frames: { start: 30, end: 32 }, frameRate: 8, repeat: 0 },
    // lot w prawo (3 klatki machnięcia)
    { key: `${t}-fly`, textureKey: t, frames: { start: 72, end: 74 }, frameRate: 10, repeat: -1 },
    // sen (leży, oczy zamknięte — intro areny)
    { key: `${t}-sleep`, textureKey: t, frames: { start: 69, end: 71 }, frameRate: 4, repeat: -1 },
    // ryk / rozpostarte skrzydła przodem (telegraf ataku ≥ 0,7 s)
    { key: `${t}-roar`, textureKey: t, frames: { start: 81, end: 83 }, frameRate: 6, repeat: 0 },
    // przysiad / oberwanie (wiersz PRAWO kol. 9-11)
    { key: `${t}-hurt`, textureKey: t, frames: { start: 33, end: 35 }, frameRate: 8, repeat: 0 },
  ];
}

export const ANIMS: AnimDef[] = [
  // ── Tosia wariant A (Ranger Girl): 0-11 idle (pozy ×2 klatki), 12-17 run ──
  { key: 'tosia-idle', textureKey: 'tosia-ranger', frames: { start: 0, end: 11 }, frameRate: 8, repeat: -1 },
  { key: 'tosia-run', textureKey: 'tosia-ranger', frames: { start: 12, end: 17 }, frameRate: 12, repeat: -1 },
  // brak klatek skoku — silnik: zamrożona klatka 14 (nogi w wykroku) wg PRD 4.2

  // ── Tosia wariant B (Ninja Frog malinowy — fallback bramki B1) ──
  { key: 'tosia-frog-idle', textureKey: 'tosia-frog-idle', frames: { start: 0, end: 10 }, frameRate: 8, repeat: -1 },
  { key: 'tosia-frog-run', textureKey: 'tosia-frog-run', frames: { start: 0, end: 11 }, frameRate: 12, repeat: -1 },
  { key: 'tosia-frog-jump', textureKey: 'tosia-frog-jump', frames: { start: 0, end: 0 }, frameRate: 1, repeat: 0 },
  { key: 'tosia-frog-fall', textureKey: 'tosia-frog-fall', frames: { start: 0, end: 0 }, frameRate: 1, repeat: 0 },
  { key: 'tosia-frog-hit', textureKey: 'tosia-frog-hit', frames: { start: 0, end: 6 }, frameRate: 14, repeat: 0 },

  // ── Vega (Huntress, klatka 100×68, stopy na y=67) ──
  { key: 'vega-idle', textureKey: 'vega-idle', frames: { start: 0, end: 7 }, frameRate: 7, repeat: -1 },
  { key: 'vega-run', textureKey: 'vega-run', frames: { start: 0, end: 7 }, frameRate: 11, repeat: -1 },
  { key: 'vega-jump', textureKey: 'vega-jump', frames: { start: 0, end: 1 }, frameRate: 6, repeat: 0 },
  { key: 'vega-fall', textureKey: 'vega-fall', frames: { start: 0, end: 1 }, frameRate: 6, repeat: -1 },
  { key: 'vega-attack', textureKey: 'vega-attack1', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },
  { key: 'vega-hit', textureKey: 'vega-hit', frames: { start: 0, end: 2 }, frameRate: 10, repeat: 0 },

  // ── Złodziejaszek (Mask Dude) ──
  { key: 'thief-idle', textureKey: 'thief-idle', frames: { start: 0, end: 10 }, frameRate: 8, repeat: -1 },
  { key: 'thief-run', textureKey: 'thief-run', frames: { start: 0, end: 11 }, frameRate: 12, repeat: -1 },
  { key: 'thief-hit', textureKey: 'thief-hit', frames: { start: 0, end: 6 }, frameRate: 14, repeat: 0 },

  // ── Vabank (szop — tylko idle/taunt) ──
  { key: 'vabank-idle', textureKey: 'vabank-idle', frames: { start: 0, end: 10 }, frameRate: 8, repeat: -1 },

  // ── Echo (małpa) ──
  { key: 'echo-idle', textureKey: 'echo-idle', frames: { start: 0, end: 17 }, frameRate: 8, repeat: -1 },
  { key: 'echo-run', textureKey: 'echo-run', frames: { start: 0, end: 7 }, frameRate: 10, repeat: -1 },
  { key: 'echo-jump', textureKey: 'echo-jump', frames: { start: 0, end: 3 }, frameRate: 8, repeat: 0 },

  // ── Wrogowie (PA2) ──
  { key: 'snail-walk', textureKey: 'enemy-snail-walk', frames: { start: 0, end: 9 }, frameRate: 8, repeat: -1 },
  { key: 'snail-idle', textureKey: 'enemy-snail-idle', frames: { start: 0, end: 14 }, frameRate: 8, repeat: -1 },
  { key: 'snail-hit', textureKey: 'enemy-snail-hit', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },
  // Toczek (slime)
  { key: 'slime-move', textureKey: 'enemy-slime-idle-run', frames: { start: 0, end: 9 }, frameRate: 8, repeat: -1 },
  { key: 'slime-hit', textureKey: 'enemy-slime-hit', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },
  // Machacz (bat — światy 2/3)
  { key: 'bat-fly', textureKey: 'enemy-bat-flying', frames: { start: 0, end: 6 }, frameRate: 10, repeat: -1 },
  { key: 'bat-hit', textureKey: 'enemy-bat-hit', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },
  // Machacz (fatbird — świat 1)
  { key: 'fatbird-fly', textureKey: 'enemy-fatbird-idle', frames: { start: 0, end: 7 }, frameRate: 10, repeat: -1 },
  { key: 'fatbird-fall', textureKey: 'enemy-fatbird-fall', frames: { start: 0, end: 3 }, frameRate: 12, repeat: 0 },
  { key: 'fatbird-hit', textureKey: 'enemy-fatbird-hit', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },
  // Skoczka (bunny — idle zawiera przysiad-telegraf)
  { key: 'bunny-idle', textureKey: 'enemy-bunny-idle', frames: { start: 0, end: 7 }, frameRate: 8, repeat: -1 },
  { key: 'bunny-run', textureKey: 'enemy-bunny-run', frames: { start: 0, end: 11 }, frameRate: 12, repeat: -1 },
  { key: 'bunny-hit', textureKey: 'enemy-bunny-hit', frames: { start: 0, end: 4 }, frameRate: 12, repeat: 0 },

  // ── Pickupy ──
  { key: 'crystal-spin', textureKey: 'crystal', frames: { start: 0, end: 3 }, frameRate: 6, repeat: -1 },
  { key: 'diamond-spin', textureKey: 'diamond', frames: { start: 0, end: 3 }, frameRate: 8, repeat: -1 },

  // ── Pułapki ──
  { key: 'saw-spin', textureKey: 'saw', frames: { start: 0, end: 7 }, frameRate: 20, repeat: -1 },
  { key: 'platform-falling-on', textureKey: 'platform-falling', frames: { start: 0, end: 3 }, frameRate: 8, repeat: -1 },

  // ── Dekoracje ──
  { key: 'palm-sway', textureKey: 'palms', frames: { start: 0, end: 3 }, frameRate: 6, repeat: -1 },

  // ── Smoki (6 × 7 animacji; mapa wierszy arkusza — patrz nagłówek pliku) ──
  ...dragonAnims('miraz'),
  ...dragonAnims('samum'),
  ...dragonAnims('ciern'),
  ...dragonAnims('monsun'),
  ...dragonAnims('pira'),
  ...dragonAnims('obsydian'),
];
