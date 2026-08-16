/**
 * Wspólna tabela wyników (playtest 3) — czyste funkcje mapowania
 * wpis ↔ dokument Firestore i walidacja limitów zgodnych z regułami
 * serwera (infra/firestore.rules). Sieci nie testujemy (DEV-gate).
 */
import { describe, expect, it } from 'vitest';
import {
  decodeEntry, encodeEntry, entryValid, NAME_MAX, NAME_MIN, SCORE_MAX,
} from '../src/core/globalScores';

const ENTRY = { name: 'TATA', score: 10800, stars: 21 };

describe('encodeEntry / decodeEntry', () => {
  it('round-trip zachowuje wpis (bez pola synced)', () => {
    const doc = encodeEntry({ ...ENTRY, synced: true }, 1755364000000);
    expect(doc.fields?.ts?.integerValue).toBe('1755364000000');
    expect(doc.fields && 'synced' in doc.fields).toBe(false);
    expect(decodeEntry(doc)).toEqual(ENTRY);
  });

  it('liczby jako stringi Firestore (integerValue)', () => {
    const doc = encodeEntry(ENTRY, 7);
    expect(doc.fields?.score).toEqual({ integerValue: '10800' });
    expect(doc.fields?.stars).toEqual({ integerValue: '21' });
  });

  it('decode odrzuca dokument spoza limitów lub bez pól', () => {
    expect(decodeEntry({})).toBeNull();
    expect(decodeEntry({ fields: {} })).toBeNull();
    expect(decodeEntry(encodeEntry({ ...ENTRY, name: 'AB' }, 1))).toBeNull();
    expect(decodeEntry(encodeEntry({ ...ENTRY, name: 'ZADLUGIE9' }, 1))).toBeNull();
    expect(decodeEntry(encodeEntry({ ...ENTRY, score: SCORE_MAX + 1 }, 1))).toBeNull();
    expect(decodeEntry({
      fields: { name: { stringValue: 'TATA' }, score: { stringValue: 'oops' },
        stars: { integerValue: '1' } },
    })).toBeNull();
  });
});

describe('entryValid — limity reguł serwera', () => {
  it('poprawny wpis przechodzi, graniczne wartości też', () => {
    expect(entryValid(ENTRY)).toBe(true);
    expect(entryValid({ name: 'ABC', score: 0, stars: 0 })).toBe(true);
    expect(entryValid({ name: 'OSIEMZNA'.slice(0, NAME_MAX), score: SCORE_MAX, stars: 30 }))
      .toBe(true);
  });

  it('odrzuca: złe imię, ujemny/ułamkowy/za duży wynik', () => {
    expect(entryValid({ name: 'AB', score: 1, stars: 1 })).toBe(false);
    expect(entryValid({ name: 'A'.repeat(NAME_MAX + 1), score: 1, stars: 1 })).toBe(false);
    expect(entryValid({ name: 'TATA', score: -1, stars: 1 })).toBe(false);
    expect(entryValid({ name: 'TATA', score: 1.5, stars: 1 })).toBe(false);
    expect(entryValid({ name: 'TATA', score: SCORE_MAX + 1, stars: 1 })).toBe(false);
    expect(entryValid({ name: 'TATA', score: 1, stars: 31 })).toBe(false);
  });

  it(`stałe zgodne z regułami: imię ${NAME_MIN}–${NAME_MAX} jak w Victory`, () => {
    expect(NAME_MIN).toBe(3);
    expect(NAME_MAX).toBe(8);
  });
});
