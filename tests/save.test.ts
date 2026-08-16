/**
 * Zapis (aneks 11.4, version 2; PRD 2.0 §11): defaulty, roundtrip,
 * korupcja → kopia do strzala2.save.bak + defaulty, NIGDY wyjątek
 * (tryb prywatny Safari). Testowane przez wstrzykniętą sztuczną Storage.
 */
import { describe, expect, it } from 'vitest';
import { ARROWS_START } from '../src/core/balance';
import {
  defaultSave, loadSave, resetCampaign, SAVE_BAK_KEY, SAVE_KEY, StorageLike,
  writeSave,
} from '../src/core/save';

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('defaulty', () => {
  it('brak zapisu → domyślne (Tosia, Normalny, 10 strzał, placek, 1-1)', () => {
    const d = loadSave(new FakeStorage());
    expect(d.version).toBe(2);
    expect(d.character).toBe('TOSIA');
    expect(d.difficulty).toBe('NORMALNY');
    expect(d.arrows).toBe(ARROWS_START);
    expect(d.has_cake).toBe(true);
    expect(d.unlocked).toEqual(['1-1']);
    expect(d.muted).toBe(false);
  });
});

describe('roundtrip', () => {
  it('zapis i odczyt zachowują stan', () => {
    const st = new FakeStorage();
    const d = defaultSave();
    d.character = 'VEGA';
    d.unlocked = ['1-1', '1-2', '1-3'];
    d.dragons_defeated = ['1-2'];
    d.levels['1-1'] = { completed: true, best_score: 1240, best_time: 61.2, stars: 3 };
    d.echo_lina = true;
    d.total_diamonds = 11;
    d.highscores = [{ name: 'ZOSIA', score: 1250, stars: 21 }];
    expect(writeSave(st, d)).toBe(true);
    const back = loadSave(st);
    expect(back).toEqual(d);
  });

  it('brakujące pola uzupełniane defaultami (jak v1 base.update)', () => {
    const st = new FakeStorage();
    st.setItem(SAVE_KEY, JSON.stringify({ version: 2, character: 'VEGA' }));
    const d = loadSave(st);
    expect(d.character).toBe('VEGA');
    expect(d.arrows).toBe(ARROWS_START);
    expect(d.unlocked).toEqual(['1-1']);
  });
});

describe('korupcja → strzala2.save.bak + defaulty, nigdy wyjątek', () => {
  it('uszkodzony JSON: kopia do .bak, defaulty', () => {
    const st = new FakeStorage();
    st.setItem(SAVE_KEY, '{"version": 2, "chara');
    const d = loadSave(st);
    expect(d).toEqual(defaultSave());
    expect(st.getItem(SAVE_BAK_KEY)).toBe('{"version": 2, "chara');
  });

  it('zła wersja traktowana jak korupcja', () => {
    const st = new FakeStorage();
    const v1 = JSON.stringify({ version: 1, character: 'VEGA' });
    st.setItem(SAVE_KEY, v1);
    const d = loadSave(st);
    expect(d).toEqual(defaultSave());
    expect(st.getItem(SAVE_BAK_KEY)).toBe(v1);
  });

  it('JSON nie-obiekt (tablica / null / liczba) → defaulty + bak', () => {
    for (const raw of ['[1,2]', 'null', '42', '"tekst"']) {
      const st = new FakeStorage();
      st.setItem(SAVE_KEY, raw);
      expect(loadSave(st)).toEqual(defaultSave());
      expect(st.getItem(SAVE_BAK_KEY)).toBe(raw);
    }
  });

  it('getItem rzuca (tryb prywatny) → defaulty bez wyjątku', () => {
    const st: StorageLike = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    expect(() => loadSave(st)).not.toThrow();
    expect(loadSave(st)).toEqual(defaultSave());
  });

  it('setItem rzuca przy backupie → defaulty bez wyjątku', () => {
    const st = new FakeStorage();
    st.setItem(SAVE_KEY, 'zepsute{');
    st.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => loadSave(st)).not.toThrow();
    expect(loadSave(st)).toEqual(defaultSave());
  });

  it('writeSave przy pełnym storage zwraca false, nie rzuca', () => {
    const st: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(writeSave(st, defaultSave())).toBe(false);
  });
});

// NOWA GRA (menu): kampania od zera, dorobek rodziny zostaje
describe('resetCampaign', () => {
  function finishedSave() {
    const s = defaultSave();
    s.character = 'VEGA';
    s.difficulty = 'TRUDNY';
    s.skrzat = true;
    s.muted = true;
    s.unlocked = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', 'BOSS'];
    s.levels = { '1-1': { completed: true, best_score: 900, best_time: 61, stars: 3 } };
    s.dragons_defeated = ['1-2', '1-3', '2-2', '2-3', '3-2'];
    s.echo_lina = true;
    s.total_diamonds = 44;
    s.arrows = 9;
    s.has_cake = false;
    s.campaign_score = 10800;
    s.highscores = [{ name: 'TATA', score: 10800, stars: 21 }];
    s.seen_tutorials = ['jump'];
    s.interludes_seen = ['intro', 'after-1-3', 'after-2-3', 'finale'];
    return s;
  }

  it('kampania wraca do defaultów (postęp, plecak, scenki, wynik)', () => {
    const fresh = resetCampaign(finishedSave());
    const base = defaultSave();
    expect(fresh.unlocked).toEqual(base.unlocked);
    expect(fresh.levels).toEqual({});
    expect(fresh.dragons_defeated).toEqual([]);
    expect(fresh.campaign_score).toBe(0);
    expect(fresh.arrows).toBe(ARROWS_START);
    expect(fresh.has_cake).toBe(true);
    expect(fresh.total_diamonds).toBe(0);
    expect(fresh.echo_lina).toBe(false);
    expect(fresh.interludes_seen).toEqual([]);   // intro zagra od nowa
    expect(fresh.seen_tutorials).toEqual([]);
  });

  it('tabela wyników, tryb Skrzat i mute przeżywają reset', () => {
    const fresh = resetCampaign(finishedSave());
    expect(fresh.highscores).toEqual([{ name: 'TATA', score: 10800, stars: 21 }]);
    expect(fresh.skrzat).toBe(true);
    expect(fresh.muted).toBe(true);
  });

  it('reset → zapis → odczyt daje grywalny świeży stan', () => {
    const st = new FakeStorage();
    writeSave(st, resetCampaign(finishedSave()));
    const loaded = loadSave(st);
    expect(loaded.unlocked).toEqual(['1-1']);
    expect(loaded.highscores.length).toBe(1);
  });
});
