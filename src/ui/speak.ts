/**
 * Lektor (Babcia Bożenka, ElevenLabs) — odtwarzanie nagranych kwestii.
 * Klucze audio ładuje Preload ('voice:<id>' wg data/voiceFiles.ts).
 * Nowa kwestia przerywa poprzednią (jeden głos naraz); mute (M) obejmuje
 * lektora automatycznie przez globalny sound manager.
 */
import Phaser from 'phaser';
import { VOICE_LINES } from '../data/voiceLines';

const ID_BY_TEXT = new Map(VOICE_LINES.map((l) => [l.text, l.id]));

let current: Phaser.Sound.BaseSound | null = null;

export function stopSpeech(): void {
  if (current) {
    current.stop();
    current.destroy();
    current = null;
  }
}

export function speak(scene: Phaser.Scene, id: string, onDone?: () => void): void {
  const key = `voice:${id}`;
  if (!scene.cache.audio.exists(key)) {
    onDone?.();
    return;
  }
  stopSpeech();
  const snd = scene.sound.add(key, { volume: 1 });
  current = snd;
  snd.once('complete', () => {
    if (current === snd) current = null;
    snd.destroy();
    onDone?.();
  });
  snd.play();
}

/** kwestia po tekście wyświetlanym (toasty/nakładki) — cicho pomija nieznane */
export function speakText(scene: Phaser.Scene, text: string): void {
  const id = ID_BY_TEXT.get(text);
  if (id) speak(scene, id);
}

/** sekwencja kwestii (np. nagłówek + linia nakładki) */
export function speakTexts(scene: Phaser.Scene, texts: string[]): void {
  const ids = texts
    .map((t) => ID_BY_TEXT.get(t))
    .filter((x): x is string => Boolean(x));
  const next = (i: number): void => {
    if (i >= ids.length) return;
    speak(scene, ids[i], () => next(i + 1));
  };
  next(0);
}
