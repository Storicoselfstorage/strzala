/**
 * Lektor (Babcia Bożenka, ElevenLabs) — odtwarzanie nagranych kwestii.
 * Klucze audio ładuje Preload ('voice:<id>' wg data/voiceFiles.ts).
 * Nowa kwestia przerywa poprzednią (jeden głos naraz); mute (M) obejmuje
 * lektora automatycznie przez globalny sound manager.
 */
import Phaser from 'phaser';
import { VOICE_LINES } from '../data/voiceLines';

const ID_BY_TEXT = new Map(VOICE_LINES.map((l) => [l.text, l.id]));

/** lektor ponad muzyką (playtest 3): głos wyraźnie głośniej… */
const VOICE_VOLUME = 1.25;
/** …a muzyka pod nim przyciszona do ułamka swojej głośności */
const DUCK_FACTOR = 0.22;

let current: Phaser.Sound.BaseSound | null = null;
/** muzyka przyciszona na czas kwestii: [dźwięk, głośność wyjściowa] */
let ducked: Array<[Phaser.Sound.WebAudioSound, number]> = [];

function duckMusic(scene: Phaser.Scene): void {
  if (ducked.length > 0) return;   // już przyciszona (sekwencja kwestii)
  const sounds = (scene.sound as Phaser.Sound.WebAudioSoundManager)
    .getAllPlaying?.() ?? [];
  for (const snd of sounds) {
    if (!snd.key.startsWith('music')) continue;
    const s = snd as Phaser.Sound.WebAudioSound;
    ducked.push([s, s.volume]);
    s.setVolume(s.volume * DUCK_FACTOR);
  }
}

function restoreMusic(): void {
  for (const [snd, vol] of ducked) {
    try {
      snd.setVolume(vol);
    } catch {
      // dźwięk mógł zostać zniszczony przy zmianie sceny — nic do zrobienia
    }
  }
  ducked = [];
}

export function stopSpeech(): void {
  if (current) {
    current.stop();
    current.destroy();
    current = null;
  }
  restoreMusic();
}

export function speak(scene: Phaser.Scene, id: string, onDone?: () => void): void {
  const key = `voice:${id}`;
  if (!scene.cache.audio.exists(key)) {
    onDone?.();
    return;
  }
  stopSpeech();
  duckMusic(scene);
  const snd = scene.sound.add(key, { volume: VOICE_VOLUME });
  current = snd;
  snd.once('complete', () => {
    if (current === snd) {
      current = null;
      restoreMusic();
    }
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
