/**
 * Hi-res render (PRD: ostrość + płynność bez zmiany stylu).
 *
 * Bufor canvasa ma RENDER_SCALE× więcej pikseli niż logiczna przestrzeń gry
 * (640×360) — cała logika, współrzędne scen i fizyka zostają w 640×360,
 * a każda kamera dostaje zoom ×RENDER_SCALE, żeby pokazać ten sam kadr
 * na gęstszym buforze. Efekt: ruch/scroll z dokładnością ½ px logicznego,
 * ostrzejsze czcionki (Text resolution=RENDER_SCALE — patrz main.ts),
 * sprite'y pixel-art nadal 1:1 (2 px canvasa na 1 px tekstury, nearest).
 *
 * UWAGA (Phaser 4): zoom kamery skaluje wokół ŚRODKA viewportu, więc:
 *  - kamery statyczne wymagają centerOn(środek logiczny) — robi to applyHiRes;
 *  - kamery z follow/bounds ustawiają scroll same (semantyka midPoint);
 *  - scrollX/scrollY NIE jest już lewym-górnym rogiem kadru — używaj
 *    cam.worldView.x/y;
 *  - obiekty setScrollFactor(0) renderują się w zoom*(q-origin)+origin,
 *    czyli z przesunięciem o pół logicznego kadru — trzeba je przesunąć
 *    o +połowę logicznego widoku kamery (patrz Level.SF0_X/SF0_Y).
 */

/** krotność bufora renderowania względem logicznej przestrzeni 640×360 */
export const RENDER_SCALE = 2;

/** logiczna przestrzeń gry — wszystkie współrzędne scen żyją w tych granicach */
export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;

/**
 * Pełnoekranowa kamera sceny → zoom ×RENDER_SCALE wycentrowany na logicznym
 * kadrze 640×360. Wołać na POCZĄTKU create() każdej sceny bez własnej
 * konfiguracji kamery (Level ustawia viewport/follow sam).
 */
export function applyHiRes(scene: Phaser.Scene): void {
  scene.cameras.main
    .setZoom(RENDER_SCALE)
    .centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
}
