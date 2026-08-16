/**
 * Globalna tabela wyników (playtest 3): Firestore REST w projekcie GCP
 * `strzala-wyniki` — wspólna dla wszystkich urządzeń rodziny.
 * Klucz API jest JAWNY z założenia (model Firebase Web). UWAGA (audyt
 * 16.08.2026): restrykcja referrer NIE jest egzekwowana przez Firestore
 * REST — klucz traktować jak w pełni publiczny. JEDYNĄ bramką są reguły
 * serwera (infra/firestore.rules: publiczny odczyt, CREATE tylko
 * zwalidowanego wpisu, zero update/delete) — audyt potwierdził empirycznie
 * (PATCH/DELETE/batchWrite/inne kolekcje → 403).
 * Gra MUSI działać offline: każda funkcja ma timeout i cicho zwraca
 * porażkę — UI wtedy zostaje przy lokalnym zapisie.
 * W DEV (vite/e2e) sieć jest wyłączona: deterministyczne testy i zero
 * śmieci w prawdziwej tabeli z przebiegów playwrighta.
 */
import { HighscoreEntry, loadSave, StorageLike, writeSave } from './save';

const PROJECT = 'strzala-wyniki';
const API_KEY = 'AIzaSyBBF_WgpCZJV0Fad9eV2yjIi1JOMe4B1A8';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}`
  + '/databases/(default)/documents';
const TIMEOUT_MS = 5000;

/** limity zgodne z regułami serwera — odrzucamy lokalnie zamiast dostać 403 */
export const NAME_MIN = 3;
export const NAME_MAX = 8;
export const SCORE_MAX = 999_999;
export const STARS_MAX = 30;

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
}

interface FirestoreDoc {
  fields?: Record<string, FirestoreValue>;
}

/** wpis → dokument Firestore (pure, testowalne w vitest) */
export function encodeEntry(e: HighscoreEntry, ts: number): FirestoreDoc {
  return {
    fields: {
      name: { stringValue: e.name },
      score: { integerValue: String(e.score) },
      stars: { integerValue: String(e.stars) },
      ts: { integerValue: String(ts) },
    },
  };
}

/** dokument Firestore → wpis; null gdy dokument nie przypomina wyniku */
export function decodeEntry(doc: FirestoreDoc): HighscoreEntry | null {
  const f = doc.fields;
  const name = f?.name?.stringValue;
  const score = Number(f?.score?.integerValue);
  const stars = Number(f?.stars?.integerValue);
  if (typeof name !== 'string' || name.length < NAME_MIN || name.length > NAME_MAX
    || !Number.isFinite(score) || score < 0 || score > SCORE_MAX
    || !Number.isFinite(stars) || stars < 0 || stars > STARS_MAX) {
    return null;
  }
  return { name, score, stars };
}

/** wpis spełnia limity reguł serwera (wysyłka bez sensu, gdy nie) */
export function entryValid(e: HighscoreEntry): boolean {
  return e.name.length >= NAME_MIN && e.name.length <= NAME_MAX
    && Number.isInteger(e.score) && e.score >= 0 && e.score <= SCORE_MAX
    && Number.isInteger(e.stars) && e.stars >= 0 && e.stars <= STARS_MAX;
}

function online(): boolean {
  return import.meta.env.PROD && typeof fetch !== 'undefined';
}

async function post(url: string, body: unknown): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** wysyłka wyniku; true = przyjęty. Nigdy nie rzuca. */
export async function submitGlobalScore(e: HighscoreEntry): Promise<boolean> {
  if (!online() || !entryValid(e)) return false;
  try {
    const out = await post(`${BASE}/wyniki?key=${API_KEY}`, encodeEntry(e, Date.now()));
    return out !== null;
  } catch {
    return false;
  }
}

/**
 * Dosyłka zaległych wpisów (sprzed tej funkcji lub z gry offline):
 * wysyła lokalne wpisy bez znacznika `synced`, oznacza wysłane i zapisuje.
 * Wywoływana przy wejściu w WYNIKI; nigdy nie rzuca.
 */
export async function syncPendingScores(storage: StorageLike): Promise<void> {
  if (!online()) return;
  const save = loadSave(storage);
  const pending = save.highscores.filter((e) => !e.synced && entryValid(e));
  if (pending.length === 0) return;
  let changed = false;
  for (const e of pending) {
    if (await submitGlobalScore(e)) {
      e.synced = true;
      changed = true;
    }
  }
  if (changed) writeSave(storage, save);
}

/** top N ze wspólnej tabeli; null = offline/błąd (UI zostaje przy lokalnych) */
export async function fetchGlobalTop(limit = 5): Promise<HighscoreEntry[] | null> {
  if (!online()) return null;
  try {
    const rows = await post(`${BASE}:runQuery?key=${API_KEY}`, {
      structuredQuery: {
        from: [{ collectionId: 'wyniki' }],
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        limit,
      },
    });
    if (!Array.isArray(rows)) return null;
    return rows
      .map((r: { document?: FirestoreDoc }) => r.document ? decodeEntry(r.document) : null)
      .filter((x): x is HighscoreEntry => x !== null);
  } catch {
    return null;
  }
}
