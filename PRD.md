# PRD — STRZA/ŁA 2.0: Łowczynie Smoków

Wersja 2.0 · 2026-08-08 · Dokument wykonawczy dla agenta AI. Zastępuje realizację terminalową (v1.0).

> Werdykt zamawiającej (7–8 lat) po testach v1.0: gra w curses wygląda jak „skaczące litery w terminalu" — do kosza, robimy od nowa. **Fabuła i logika gry zostają. Technologia i oprawa — wymiana totalna.**

---

## 0. Dlaczego 2.0 i co jest czym

- **Zostaje bez zmian**: cała fabuła, postacie, światy, story beaty, statystyki bohaterek, bestiariusz (zachowania), artefakty, mechanika rdzenia (fizyka, runner, areny, złodzieje, Echo, ekonomia, trudności, scoring), układy poziomów, wszystkie polskie teksty. Źródłem tych treści jest **aneks `PRD-1.0-mechanika.md`** (kopia PRD 1.0 w tym katalogu) — sekcje 3, 5, 6, 7, 8, 10 (legenda + mapa 1-1), Załącznik A. Tam, gdzie ten dokument milczy, obowiązuje aneks.
- **Wylatuje**: wszystko związane z terminalem — curses, tabela glifów 9.1, `--ascii`, `wcwidth`, bell, nakładka „powiększ okno", sekcje 11–12 aneksu (architektura curses i ryzyka curses). Zastąpione sekcjami 5, 10, 13 tego dokumentu.
- **Cel jakościowy**: gra ma wyglądać i „czuć się" jak porządna pixel-artowa platformówka (poziom odniesienia: stare Mario + współczesne indie na itch.io), nie jak demo techniczne. Kryterium: 8-latka chce grać dalej sama z siebie.

## 1. Instrukcja dla agenta

1. Przeczytaj ten dokument ORAZ aneks `PRD-1.0-mechanika.md` przed pierwszą linijką kodu.
2. Priorytet konfliktów: **ten dokument > aneks**; wewnątrz aneksu: sekcja 8 > 10 > 9 > 3. Nazwy własne zawsze z sekcji 3 aneksu.
3. **Proces NIE jest one-shot.** Obowiązuje bramka wizualna **B1** (sekcja 14): najpierw pionowy wycinek (poziom 1-1 + walka z Mirażem w finalnej oprawie), zrzuty ekranu do akceptacji użytkownika, dopiero potem produkcja reszty. Lekcja z v1.0: wszystkie testy były zielone, a produkt odrzucono, bo nikt nie ocenił, jak gra WYGLĄDA.
4. Assety pobieraj z sekcji 4; reguła zamienników: jeśli dokładny sprite niedostępny/nie pasuje — najbliższy zamiennik **z tej samej paczki stylistycznej** + recolor; hitboksy i mechanika nigdy nie zmieniają się pod sprite.
5. Po każdej fazie z sekcji 15 gra ma być uruchamialna (`npm run dev`).

## 2. Decyzje fundamentalne (wiążące)

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Silnik | **Phaser ^4.1** (npm), TypeScript, Vite | najlepszy stosunek jakości do nakładu; wbudowane: tilemapy, Arcade Physics, particles, tweeny, kamera (follow/shake/flash), audio; ogromna dokumentacja. Uwaga: API v4 ≈ v3, ale nie używać usuniętych elementów (Mesh, BitmapMask, setTintFill) |
| Grafika | pixel-art 16 px tile / 32 px postacie, pakiet „Pixel Adventure" i spójne dodatki (sekcja 4) | kompletny darmowy zestaw w słodkim stylu; zero rysowania od zera poza drobiazgami |
| Rozdzielczość | natywna **640×360** (40×22,5 kratki), `pixelArt: true`, `roundPixels: true`, skalowanie `FIT` + `autoCenter` | 16:9, ostre piksele przy ×2 (720p) i ×3 (1080p); mapa 20 kratek (320 px) + pasek HUD 40 px |
| Jednostka świata | **1 kratka = 16 px**; wszystkie liczby balansu z aneksu podane w kratkach obowiązują (przelicznik ×16 na piksele) | balans v1.0 był przetestowany — nie wymyślamy liczb od nowa |
| Fizyka | Arcade Physics; parametry z aneksu 8.2 ×16 (GRAVITY 640 px/s², MAX_FALL 400 px/s); **wysokość skoku strojona testem**, nie wzorem: Tosia 4,0 ± 0,2 kratki, Vega 3,2 ± 0,2 | Euler w Arcade da inną wysokość niż wyliczona — kalibrujemy `vy0` automatycznym testem |
| Poziomy | ASCII-mapy z v1.0 przeniesione 1:1 (ta sama legenda znaków, aneks sekcja 10), parsowane w locie do tilemap | poziomy były zaprojektowane i zwalidowane (ekonomia, wykonalność Vegą) — pełny reuse |
| Platforma gracza | przeglądarka: Mac (klawiatura) + iPad (dotyk); hosting **GitHub Pages**, PWA (ikona na ekranie iPada) | link/zakładka zamiast instalacji; aktualizacja = git push |
| Zapis | `localStorage`, klucz `strzala2.save`, schema JSON z aneksu 11.4 (bez zmian) | to samo, co v1.0, tylko inny nośnik |
| Zależności runtime | wyłącznie `phaser` | minimalizm; dev: vite, typescript, vitest, playwright |

## 3. Delta mechaniki 2.0 vs 1.0

Zmiany wynikające ze zmiany medium (wszystko inne — bez zmian, wg aneksu):

| Obszar | v1.0 (terminal) | v2.0 (Phaser) |
|---|---|---|
| Input | okno przytrzymania 0,45 s (brak key-release) | prawdziwe keydown/keyup — ruch trzymany naturalnie; skok/strzał edge-triggered (JustDown); coyote 0,10 s i jump buffer 0,15 s zostają |
| Kucanie/ślizg | zmiana wysokości sprite 2→1 wiersz | animacja ślizgu + `body.setSize` na 1 kratkę wysokości; te same warunki wejścia/wyjścia |
| Dźwięk | `curses.beep()` ×3 zdarzenia | pełny SFX + muzyka (sekcja 6); klawisz `M` = mute globalny (zapisywany) |
| Sygnalizacja złodzieja | `!` na krawędzi ekranu + bell | strzałka-wskaźnik na krawędzi ekranu w kolorze złodzieja + SFX; czasy bez zmian (1,5 s / 3 s z Echo) |
| „Za małe okno" | nakładka TOO_SMALL | niepotrzebne — skalowanie FIT; minimalna szerokość dotykowa obsłużona układem przycisków |
| Fajerwerki, migotania, A_REVERSE | znaki i atrybuty | particles (Kenney), tweeny (flash/scale), kamera shake/flash — mapping w sekcji 5.4 |
| Tryb `--ascii` | flaga CLI | usunięty bez zastępnika |
| Sprite'y 1×2 znaki | tabela 9.1 | sprite'y 32 px z animacjami (sekcja 4.2) |
| Timer klatki | stały DT=1/30 | pętla Phasera (60 FPS, delta); logika używa delty; **balans w kratkach/s pozostaje ten sam** |

Nowości (tanie w silniku, podnoszą odbiór — obowiązkowe):
- **Parallax**: 2–3 warstwy tła na świat (paczki mają gotowe tła).
- **Squash & stretch** bohaterki przy skoku/lądowaniu (tween skali 0,9/1,1, 100 ms).
- **Hit-stop** 60 ms przy trafieniu smoka i utracie serca.
- **Kamera**: follow z deadzone (bohaterka między 30–50% szerokości — jak v1.0), shake przy głazie/szarży bossa, flash przy utracie życia.
- **Kurz** przy sprincie/lądowaniu, iskry przy odbiciu od tarczy, rozpad smoka na cząsteczki.

## 4. ASSETY (pobrać w fazie F0, wgrać do `public/assets/`)

### 4.1 Paczki źródłowe

| Paczka | URL | Licencja | Do czego |
|---|---|---|---|
| Pixel Adventure 1 + 2 (PixelFrog) | pixelfrog-assets.itch.io/pixel-adventure-1 (i -2) | CC0 | teren, tła, 4 postacie, ~20 stworków, owoce, pułapki (piły, kolce, spadające platformy), świat 2 (dżungla) |
| Treasure Hunters (PixelFrog) | pixelfrog-assets.itch.io/treasure-hunters | darmowa (spr. przy pobraniu) | świat 1: piasek, palmy; skrzynie, diamenty |
| Ranger Girl (t3chdev) | t3chdev.itch.io/ranger-girl | free, zakaz odsprzedaży | **Tosia** (łuczniczka; ma idle+run — skok/strzał wg 4.2) |
| Huntress (LuizMelo) | luizmelo.itch.io/huntress | CC0 | **Vega** (starsza łowczyni) |
| Free Pixel Art Dragons (Magicae Games) | magicae-games.itch.io/free-pixel-art-dragons | free, zakaz odsprzedaży | 4 smoki żywiołowe × 11 animacji → 6 smoków przez recolory (4.3) |
| Kenney UI Pack Pixel Adventure | kenney.nl/assets/ui-pack-pixel-adventure | CC0 | HUD, serca, przyciski, ramki dymków |
| Kenney Particle Pack | kenney.nl/assets/particle-pack | CC0 | kurz, iskry, ogień, magia |
| Fonty: Pixelify Sans (UI) + Press Start 2P (tytuły) | Google Fonts | OFL | polskie znaki potwierdzone; ładowane lokalnie z `public/fonts/` (nie z CDN) |
| 512 Sound Effects (Juhani Junkala) | opengameart.org/content/512-sound-effects-8-bit-style | CC0 | wszystkie SFX |
| 5 Chiptunes Action + 4 Chiptunes Adventure (Junkala) | opengameart.org | CC0 | muzyka: menu, 3 światy, boss, finał |

Świat 3 (Obsydianowa Góra): brak gotowego tilesetu lawy w stylu PA → **recolor terenu Pixel Adventure** na ciemną skałę + czerwone akcenty i animowana lawa z Particle Packa. Placek: pojedynczy sprite 16 px — z darmowej paczki pixel-food z itch (licencję sprawdzić) albo narysowany ręcznie (10 minut, 16×16).

**Kredyty (obowiązkowe)**: plik `CREDITS.md` + ekran „Autorzy" w menu z listą paczek i autorów. Niczego z tych paczek nie commitujemy do publicznego repo w formie „paczki do wyjęcia" — tylko przetworzone atlasy używane przez grę (wystarczy dla licencji „no resale").

### 4.2 Mapping bytów gry → sprite'y

| Byt (aneks) | Sprite | Uwagi |
|---|---|---|
| Tosia | Ranger Girl | brak klatek skoku/strzału: skok = klatka run z uniesionymi nogami (wycinek) lub dorobiona 1 klatka; strzał = idle + osobny sprite strzały; jeśli efekt słaby na B1 — fallback: postać z PA („Ninja Frog"→recolor róż) i Ranger Girl tylko na portretach |
| Vega | Huntress | pełny zestaw animacji w paczce |
| Echo (małpa) | darmowy sprite małpy 32 px z itch/OGA (idle/run/jump, licencja darmowa) — do wyszukania w F0; fallback: stworek PA2 przefarbowany na brąz | nieśmiertelna, więc nie potrzebuje klatek śmierci |
| Złodziejaszek | **Mask Dude** (postać z Pixel Adventure — nosi maskę) | idealny „bandzior"; ikona łupu nad głową jak v1.0 |
| Vabank (dekoracja na bossie + scenki) | Mask Dude recolor (szop: szaro-czarny) ×1,25 | tylko idle/taunt |
| Toczek | PA2: Snail / Slime (recolor per świat) | patrol jak w aneksie 6.3 |
| Machacz | PA2: Bat (świat 2/3) / FatBird (świat 1) | sinusoida jak w aneksie |
| Skoczka | PA2: Bunny (telegraf przysiadu = klatka crouch) | |
| Kaktus / kolczasty krzak / lawowy kaktus | PA: Spikes + recolor; świat 1: kaktus z Treasure Hunters/dorobiony | zawsze odróżnialny kolorem i kształtem od tła |
| Kolce, piły, spadające platformy, znikające platformy | pułapki PA 1:1 | znikająca platforma = PA „Falling Platform" z animacją migania |
| Głaz | PA „Rock Head" (statyczna klatka spadająca) | telegraf: trzęsienie sprite'a |
| Gejzer | Particle Pack (kolumna cząstek) + podstawka z tilesetu | cykl czasowy jak aneks 6.4 |
| Kryształ | diament/klejnot z Treasure Hunters, recolor cyjan | obrót/pulsowanie |
| Diament | jw., biel; większy błysk | |
| Strzała (pickup/lot) | sprite strzały z paczki Ranger Girl lub dorobiony 16×4 px | magiczna: cyjan + trail particle |
| Placek | wg 4.1 | złota poświata (glow tween) |
| Serce / tarcza / magnes | Kenney UI (serce) + PA fruits recolor | power-upy jak aneks 7 |
| Smoki | wg 4.3 | |

### 4.3 Smoki (recolory z 4 bazowych)

| Smok | Baza | Recolor |
|---|---|---|
| Miraż (1-2) | Air | złoty |
| Samum (1-3) | Air | piaskowo-rudy |
| Cierń (2-2) | Earth | zielony (bazowy) |
| Monsun (2-3) | Water | burzowy błękit (bazowy) |
| Pira (3-2) | Fire | pomarańcz (bazowy) |
| Obsydian (BOSS) | Fire | czarno-czerwony, skala ×1,5–2, złote rogi (dorysowane na klatkach lub overlay) |

Tarcza smoka: półprzezroczysty owal (grafika proceduralna lub Kenney) pulsujący wokół sprite'a; zbita → efekt szkła (particles).

## 5. PREZENTACJA

### 5.1 Scena i kamera
- Viewport 640×360: wiersz HUD (40 px, góra), pole gry 320 px. Kamera: `startFollow` + deadzone (30–50%), bounds = szerokość mapy; w arenie kamera zablokowana na 80 kratek (1280 px) z płynnym dojazdem.
- Parallax: `TileSprite` ×2–3 warstwy ze `scrollFactor` 0,2/0,5/0,8; zestawy teł per świat z paczek PixelFrog.

### 5.2 HUD (odpowiednik aneksu 9.3)
Górny pasek: serca (ikony Kenney) · plakietka `ŚWIAT 1-2` · kryształ+`04/10` · strzała+`12` i magiczna+`2` (cyjan) · diament+`0125` · przycisk pauzy (dotyk). W arenie zamiast kryształów — pasek HP smoka z portretem i imieniem; w runnerze — pasek postępu. Dolny pas plecaka z v1.0 → zwinięty do górnego HUD (mniej ekranu zajęte); zawartość plecaka w pauzie.

### 5.3 Ekrany
Przepływ stanów jak aneks 4.3 (SPLASH → MENU → bohaterka → trudność → mapa świata → poziom...). Każdy ekran w oprawie graficznej: tło z parallaxem, panele Kenney UI, animowane sprite'y bohaterek na kartach wyboru (statystyki nadal paskami symboli), mapa świata jako ścieżka węzłów na tle wyspy (węzły: gwiazdka/pulsujący/kłódka; Smocza Eskadra jako rządek portretów smoków). Scenki fabularne (intro, przejścia, finał): tekst z aneksu (Załącznik A) w dymku + portrety postaci (wycinki spritów ×3), litery pojawiają się po 1 (przewijalne SPACJĄ).

### 5.4 Feedback („juiciness") — mapping tabeli 9.5 aneksu

| Zdarzenie | Efekt 2.0 |
|---|---|
| kryształ/diament | sprite leci łukiem do licznika HUD + błysk licznika + `+10` unoszące się; SFX |
| komplet 5 kryształów | flash licznika magicznych + krótki jingle + komunikat |
| trafienie smoka | biały flash sprite'a (tint) 2 klatki, hit-stop 60 ms, `TRAF!` popup, segment HP gaśnie z opóźnieniem |
| odbicie od tarczy | iskry particle + SFX „brzdęk" |
| utrata serca/życia | kamera flash czerwony 100 ms + shake 150 ms, bohaterka miga (i-frames), serce pęka animacją |
| pokonanie smoka | slow-motion 0,5 s (timeScale 0,5), rozpad na particles, fanfara, portret wlatuje do Eskadry |
| kradzież | ikona łupu nad złodziejem, wskaźnik krawędziowy, SFX alarm |
| skok/lądowanie | kurz particle 2–4 cząstki |
| nowy rekord | konfetti particle + jingle |

### 5.5 Czytelność (zasady wiążące)
Każdy byt odróżnialny kształtem, nie tylko kolorem (daltonizm). Zagrożenia zawsze z czerwonym akcentem lub animacją ostrzegawczą. Telegrafy ataków — czasy z aneksu (≥ 0,7 s) + czytelna animacja (miganie, poświata). Tekst UI ≥ 8 px czcionki pixelowej przy skali ×1 (czytelny na iPadzie po FIT).

## 6. DŹWIĘK

- Muzyka (Junkala, CC0): menu/mapa · świat 1 · świat 2 · świat 3 · walka ze smokiem · boss · zwycięstwo. Loopy, crossfade 0,5 s między platformówką a areną.
- SFX (512 SFX pack): skok, lądowanie, kryształ, diament, strzał, magiczny strzał, trafienie, odbicie od tarczy, utrata serca, kradzież, gwizd Echo, ryk smoka (telegraf), eksplozja tarczy, fanfara, klik UI. Lekki pitch-random (±5%) na często granych (skok, kryształ).
- **iOS/Safari**: audio odblokowywane pierwszym dotknięciem (ekran splash „Dotknij, by zacząć" pełni tę rolę). Mute (`M` / przycisk) zapisywany w save.

## 7. STEROWANIE

- **Klawiatura** — keymap z aneksu 8.1 bez zmian (strzałki/WASD, SPACJA skok, ↓ ślizg, X strzał, Z magiczny, E placek, P/ESC pauza, M mute). Skok/strzał: `JustDown`.
- **Dotyk (iPad)**: lewy dolny róg — pad kierunkowy ←/→ (+↓ w runnerze jako osobny przycisk ślizgu), prawy dolny — przyciski SKOK, STRZAŁ, (Z) MAGIA; E kontekstowo pojawia się przy placku/kryjówce. Przyciski półprzezroczyste (Kenney UI), strefy dotyku ≥ 64 px, multi-touch (ruch + skok jednocześnie — obowiązkowo testowane). Wykrycie: `pointer` bez klawiatury → pokaż pady; pierwsze użycie klawiatury → schowaj.
- **Gamepad**: bonus, jeśli za darmo z Phasera (mapping standardowy); nie blokuje żadnej fazy.

## 8. MECHANIKA — obowiązuje aneks + przelicznik

Sekcje 5–8 aneksu obowiązują w całości (statystyki bohaterek, bestiariusz, artefakty, game loop logiczny, fizyka, runner, areny, smoki, boss 3-fazowy, życia/reset/snapshot, ekonomia 8.6, trudności 8.7, Tryb Skrzat, dynamiczne ułatwienie). Przelicznik: kratka=16 px; czasy bez zmian; prędkości ×16 px/s. Hitboksy: gracz 0,6×1,6 kratki (9,6×25,6 px), pickup radius 1,2 kratki — hojność na korzyść gracza zostaje. Kalibracja skoku: test automatyczny mierzy apex i dostraja `vy0` (sekcja 2).

## 9. POZIOMY I DANE

- Mapy ASCII z `~/strzala/levels.py` (v1.0) przenoszone mechanicznie do `src/data/levels.ts` — te same stringi, ta sama legenda (aneks sekcja 10), te same patterny runnerów i stałe. Parser: ASCII → warstwa kafli (autotiling proste: trawa-góra/ziemia-środek per świat) + lista spawnów.
- Areny 80 kratek, mapy 20 kratek wysokości — bez zmian.
- Walidator ekonomii (portem z v1.0 `mapgen.py` do testu vitest): liczby C/D/A/L/K/`!`/T/V per mapa muszą zgadzać się z tabelą 8.6 aneksu; test wykonalności Vegą (zasięgi skoku) — port testu geometrii z v1.0.

## 10. ARCHITEKTURA

```
~/strzala2/
  PRD.md, PRD-1.0-mechanika.md, CREDITS.md
  index.html, vite.config.ts, tsconfig.json, package.json
  public/assets/{sprites,tiles,bg,ui,audio,fonts}/
  src/
    main.ts                 // konfiguracja Phaser (640×360, pixelArt, FIT)
    scenes/  Boot, Preload, Splash, Menu, CharSelect, DiffSelect,
             WorldMap, Interlude, Level (fazy PLATFORM/ARENA/RUNNER),
             HUD (scena-nakładka), Pause, Summary, Victory, Scores
    core/    // czysta logika BEZ Phasera — testowalna w vitest:
             mapParser.ts, runnerPattern.ts, economy.ts, save.ts,
             combat.ts (FSM smoka), thief.ts, monkey.ts, balance.ts (stałe)
    entities/ Player, Dragon, Thief, Monkey, Enemy, pickups, traps (nakładki Phaser na core)
    data/    levels.ts, texts.ts (Załącznik A), animations.ts, sfxMap.ts
  tests/     // vitest: core + walidatory map
  e2e/       // playwright: smoke + zrzuty ekranu do bramek
  .github/workflows/deploy.yml
```

Zasada: **logika decyzyjna w `core/` (czyste funkcje, bez Phasera)** — porty algorytmów z v1.0 (złodziej, Echo, FSM smoka, runner, ekonomia) 1:1; sceny i encje Phasera tylko renderują i wołają core. Arena nadal fazą `Level`, nie osobną sceną.

## 11. ZAPIS

`localStorage["strzala2.save"]` — JSON wg schematu aneksu 11.4 (`version: 2`). Zapis po: ukończeniu poziomu, walce, zmianie ustawień, pauzie. Uszkodzony JSON → backup do `strzala2.save.bak` + start od domyślnych (nigdy crash). Przycisk „Wyczyść postęp" w menu (z potwierdzeniem). Uwaga: localStorage jest per-przeglądarka/urządzenie — brak synchronizacji Mac↔iPad w v2.0 (backlog).

## 12. DYSTRYBUCJA

- Repo git `~/strzala2` → GitHub (publiczne; assety tylko jako przetworzone atlasy — patrz 4.1). Deploy: GitHub Actions → `vite build` → GitHub Pages przy każdym pushu na main. `base` w vite ustawione pod ścieżkę Pages.
- **PWA-lite**: `manifest.json` (name STRZA/ŁA, `display: standalone`, orientacja landscape, ikona 512 px — portret Tosi), apple-touch-icon. Na iPadzie: Safari → Udostępnij → „Do ekranu początkowego" = ikonka jak apka, pełny ekran. Service worker/offline — backlog.
- Lokalne granie na Macu: `npm run dev` lub otwarcie URL Pages; instrukcja w README.

## 13. RYZYKA WEB (nakazy)

1. **Pomyłki API Phaser 3 vs 4** → pin `phaser@^4.1`; przy niepewności sprawdzać docs/przykłady v4, nie pisać z pamięci; zakaz elementów usuniętych w v4.
2. **Rozmyte piksele** → `pixelArt: true`, `roundPixels: true`, skala całkowita gdzie się da, CSS `image-rendering: pixelated` na canvasie.
3. **`file://` nie działa (CORS)** → gra zawsze przez serwer (dev: vite; prod: Pages). Nie obiecywać „dwukliku w index.html".
4. **Audio na iOS** → start dźwięku dopiero po pierwszym geście (splash-tap); obsłużyć `context.resume()`.
5. **Hitbox ≠ sprite** → `body.setSize/setOffset` wg hitboksów z aneksu; sprite to tylko obrazek. Test: przejście przez 1-kratkową szczelinę w ślizgu.
6. **Wycieki obiektów** (pociski, particles) → pooling lub `destroy()` poza ekranem; test: 5 minut areny bez wzrostu liczby obiektów.
7. **Licencje** → CREDITS.md kompletny zanim repo stanie się publiczne.
8. **Utrata postępu** → zapis defensywny (try/catch na localStorage — tryb prywatny Safari może rzucać).

## 14. TESTY I BRAMKI JAKOŚCI

- **Vitest (core)**: port zestawu v1.0 — fizyka (wysokości skoku po kalibracji), złodziej (priorytet łupu, reguła Vegi), Echo (ucieczka/powrót), FSM smoka + tarcza + timer ucieczki, checkpoint areny z zachowanym HP, runner (pattern, reset, LINA), brama 10 kryształów, boss 3 fazy, ekonomia wszystkich map, wykonalność Vegą, save (korupcja → bak).
- **Playwright (chromium + webkit)**: smoke boot każdej sceny; zrzuty ekranu: splash, menu, wybór bohaterki, mapa świata, gameplay 1-1 (3 momenty), arena Miraża, pauza. Viewport 1280×720 i 1024×768 (iPad landscape).
- **BRAMKA B1 (wizualna, po fazie F2)**: agent OGLĄDA zrzuty (Read na plikach PNG) i ocenia checklistą: parallax widoczny; animacje grają (nie statyczne klatki); zero placeholderów/prostokątów; HUD czytelny; particles obecne przy skoku/zbieraniu; paleta spójna. Potem zrzuty + link dev prezentowane użytkownikowi — **produkcja reszty poziomów dopiero po akceptacji**.
- **BRAMKA B2 (przed deployem)**: checklista manualna z aneksu sekcji 12 (pkt 1–9, bez punktów terminalowych) + test dotyku na iPadzie (lub webkit z emulacją touch) + pełne przejście kampanii obiema bohaterkami.

## 15. PLAN REALIZACJI I AKCEPTACJA

| Faza | Zakres | Wyjście |
|---|---|---|
| **F0** | scaffold (vite+ts+phaser), pobranie i przycięcie assetów, atlasy, fonty, CREDITS | `npm run dev` pokazuje splash z tytułem i muzyką |
| **F1** | core/ (porty z v1.0) + testy vitest zielone | logika gry udowodniona bez grafiki |
| **F2** | pionowy wycinek: 1-1 kompletny (parallax, Echo, złodziej, pułapki, HUD, juice) + arena Miraża + pauza/śmierć/podsumowanie | **BRAMKA B1** |
| **F3** | pozostałe platformówki + areny (Cierń, Pira), mapy z v1.0 | światy 1–3 typu A/B grywalne |
| **F4** | runnery 1-3/2-3/3-3 + Samum/Monsun + brama | pościgi kompletne |
| **F5** | BOSS Obsydian 3 fazy + Vabank + finał + tabela wyników | kampania przechodnia |
| **F6** | ekrany (mapa świata, scenki, Skrzat, trudności), dotyk iPad, PWA manifest | pełny przepływ |
| **F7** | deploy GH Pages + **BRAMKA B2** + playtest z córką | link produkcyjny |

**Kryteria akceptacji 2.0**:
1. Gra otwiera się z linku (Pages) na Macu i iPadzie; na iPadzie działa dotyk i ikona na ekranie początkowym.
2. Wszystkie elementy z opisu córki (aneks, nagłówek) obecne — jak kryteria aneksu 13, minus punkty terminalowe.
3. Kampania 1-1 → BOSS przechodnia obiema bohaterkami na Normalnym; 60 FPS na iPadzie bez spadków.
4. Bramki B1 i B2 zaliczone; B1 zaakceptowana przez użytkownika (i docelowo — przez zamawiającą).
5. Zero błędów w konsoli przez pełną sesję; brak placeholderowej grafiki gdziekolwiek.

## 16. BACKLOG 2.1

Synchronizacja zapisu Mac↔iPad (plik/eksport kodu) · service worker (offline na iPadzie) · gamepad w pełni · backlog aneksu sekcji 14 (podwójny skok, nieskończony runner, skórki) · nagrywanie GIF-a powtórki po rekordzie.
