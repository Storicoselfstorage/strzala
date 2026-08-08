# PRD — STRZA/ŁA: Łowczynie Smoków

Wersja 1.0 · 2026-08-07 · Dokument wykonawczy dla agenta AI kodującego grę **one-shot**.

> Opis od pomysłodawczyni (7–8 lat, zamawiająca): *„Gra w terminalu gdzie na różnych poziomach trzeba zdobywać kryształy by pokonać smoki, smoki są na różnych etapach na poziomach, są też pułapki i kaktusy które resetują level i odbierają jedno życie. Możesz wybrać nastolatkę albo dorosłą panią. Są różne zagrożenia i mogą Ci coś ukraść jak placek a w plecaku masz różne strzały albo te diamenty które zbierasz, mogą być ukradzione, może małpa uciec albo smok i są wtedy pułapki. Trochę w stylu gry z dinozaurem w chrome i Mario pierwszych na komputer."*

Wszystkie elementy z tego opisu są obowiązkowe i mają swoje miejsce w specyfikacji.

---

## 0. Instrukcja dla agenta kodującego

1. **Przeczytaj cały dokument przed napisaniem pierwszej linijki.** Liczby w tabelach są wiążące; gdzie liczba nie została podana — wybierz najprostszą działającą wartość i trzymaj się jej konsekwentnie.
2. **Zakres one-shot**: wszystko poza sekcją 14 (Backlog) wchodzi do wersji 1.0.
3. **Kolejność implementacji** (każdy krok ma być uruchamialny): szkielet curses + pętla + `safe_addstr` → `InputState` → fizyka gracza + parser map + poziom 1-1 → HUD → encje (kaktus, pułapki, pickupy) → złodziej + Echo → runner → arena smoka → boss → ekrany (menu, mapa świata, podsumowania) → save → teksty i szlif.
4. **Konflikt w dokumencie?** Priorytet rozstrzygania: sekcja 8 (mechanika) > sekcja 10 (dane) > sekcja 9 (UI) > sekcja 3 (fabuła). Nazwy własne zawsze z sekcji 3.
5. Po ukończeniu wykonaj checklistę testów z sekcji 12.
6. Struktura projektu: katalog `~/strzala/`, pliki `game.py` (logika) i `levels.py` (dane). Uruchomienie: `python3 game.py` (opcjonalna flaga `--ascii`).

---

## 1. Wizja i gracz docelowy

- **Gatunek**: terminalowa komedia akcji — platformówka side-view (Mario) + sekcje runnera (dinozaur z Chrome) + walki ze smokami w arenach.
- **Gracz**: dziewczynka 7–8 lat (kalibracja Normalny); pełen zakres 5–12 lat pokryty trudnościami Łatwy/Trudny i Trybem Skrzat. Gracz ogląda „KPop Demon Hunters" — ton gry to łowczynie z pazurem, nie bajeczka: zero zdrobnień, epickie starcia, humor z przymrużeniem oka.
- **Sesja**: poziom 45–100 s + walka; cała kampania 30–45 min; postęp zapisywany.
- **Język gry**: polski. Komunikaty krótkie (dziecko czyta wolno), zawsze z symbolem przed tekstem.

## 2. Decyzje fundamentalne (wiążące)

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Język/stack | Python 3.9+, **`curses` ze stdlib** | zero zależności — `python3 game.py` działa na czystym macOS; API najlepiej znane, najmniej pułapek one-shot. Plan B: `blessed` (render przez buforowany string klatki + `inkey(timeout=0)`) tylko gdyby curses zawiódł w testach |
| Pliki | `game.py` (cała logika, ~2000–2400 linii) + `levels.py` (wyłącznie stałe danych) | brak importów cyklicznych; dane oddzielone od logiki |
| FPS | 30, stały timestep `DT = 1/30`, bez akumulatora | determinizm > płynność; brak spirali śmierci |
| Okno | min. **80×24** (twardy próg), projekt bazowy **100×30** z degradacją | sekcja 9.2 |
| Znaki | unicode single-width z zatwierdzonej tabeli (sekcja 9.1) + **fallback ASCII** (`--ascii` i auto przy nieudanym teście `wcwidth`) | 95% uroku emoji przy 0% ryzyka rozjechanej siatki; emoji bezwzględnie zakazane |
| Locale | `locale.setlocale(locale.LC_ALL, "")` **przed** `initscr()` | polskie znaki w tekstach UI |
| Zapis | `~/.strzala/save.json`, zapis atomowy | sekcja 11.4 |

---

## 3. FABUŁA

### 3.1 Tytuł

**STRZA/ŁA: Łowczynie Smoków** (ukośnik w tytule jest celowy — patrz finał). Alternatywy odrzucone: Neonowe Strzały, Ostatnia Wyspa Smoków, Łowczynie Kryształów.

### 3.2 Premisa

Smocza Wyspa była domem potężnych smoków — każdy nosił w piersi kryształowe serce. Szop **Vabank, Król Złodziei**, ukradł wszystkie serca w jedną noc, ale niósł je w dziurawym worku i rozsypał kryształy po całej wyspie. Smoki bez serc wpadły w zły czar: zieją ogniem, strzegą poziomów i słuchają rozkazów Vabanka. Na wyspę przybywa duet łowczyń: legendarna **Vega** i jej nowa uczennica **Tosia**. Zasada łowczyń jest prosta: **łowią czar, nie smoki** — zebrane kryształy ładują neonowe strzały światła, a trafiony smok odzyskuje serce i dołącza do **Smoczej Eskadry**.

### 3.3 Postacie (nazewnictwo kanoniczne)

- **Tosia (nastolatka)** — nowa rekrutka, 13 lat. Szybka, zadziorna, skacze wyżej niż ktokolwiek w historii łowu. Chce jednego: zasłużyć na własną ksywę łowczyni. Tekst firmowy: *„Patrz i ucz się."*
- **Vega (dorosła pani)** — legenda łowu, mentorka Tosi. Spokój weteranki, refleks żmii, plecak z zamkiem szyfrowym, którego nie rozgryzł żaden złodziej. Tekst firmowy: *„Plan B? Ja jestem planem B."*
- **Echo (małpa)** — zwiadowczyni z Dżungli Ech. Zna każdą ścieżkę, wskazuje ukryte kryształy i gwiżdże przed pułapkami. Nie pracuje za darmo — stawka: placek. Gdy placek zostanie ukradziony albo robi się zbyt gorąco — **znika**, i nikt już nie ostrzega przed pułapkami. Wraca tylko za placek.
- **Szop Vabank** — sprawca zamieszania. Nie straszny — bezczelny. Kocha błyskotki, ma gadane i armię **złodziejaszków** (szczury i szopy).
- **Smoki** — zaklęci strażnicy: **Miraż**, **Samum** (Pustynia), **Cierń**, **Monsun** (Dżungla), **Pira** (Góra) i Król Smoków **Obsydian** (finał). Trafione naładowaną strzałą odzyskują serce i dołączają do Smoczej Eskadry (kolekcja widoczna na mapie świata).
- **Legendarny Placek** — tajna broń łowczyń, receptura przekazywana od pokoleń. Nikt nie wie, co Vega do niego dodaje. Vega nie mówi. Żołd Echo, +1 życie za znaleziony kawałek, cel numer jeden każdego złodziejaszka — i klucz do finału.

### 3.4 Światy

1. **Pustynia Miraży** — rozgrzane wydmy, kaktusy wielkie jak słupy, powietrze drga i oszukuje wzrok. Neon świata: złoty.
2. **Dżungla Ech** — gęstwina lian, mosty z pnączy, ścieżki znane tylko Echo. Kryjówka złodziejaszków. Neon: zielony.
3. **Obsydianowa Góra** — wulkan pełen kryształowych jaskiń, gejzerów i lawowych kaktusów. Na szczycie skarbiec i śpiący Obsydian. Neon: czerwony.

### 3.5 Story beaty (numeracja kanoniczna poziomów)

| Etap | Nazwa | Beat |
|---|---|---|
| **1-1** | Plaża Rozbitków | Łowczynie schodzą na ląd; Echo przyłącza się po negocjacjach (stawka: placek, płatne z góry). Trening: skok, kryształy, pierwsze kaktusy. Twist: dziurawy worek z monogramem „V" — trop prowadzi do Króla Złodziei. |
| **1-2** | Kaktusowy Kanion | Pierwsze złodziejaszki idą po placek. Na końcu kanionu smok **Miraż** — pierwszy łów: unik, strzał, czar zdjęty. Twist: uwolniony Miraż wypala ogonem na piasku mapę wyspy. |
| **1-3** | Pościg za Samumem | **Samum** nie podejmuje walki — odlatuje i sieje pułapki. Sprint przez wydmy jak w Chrome: kaktusy, doły, tempo rośnie; na końcu dogoniony Samum staje do walki. Twist: uwolniony przerzuca łowczynie na grzbiecie pod ścianę dżungli. |
| **2-1** | Mosty z Lian | Dżungla rusza się cała: huśtające liany, zapadające mosty, pułapki z pnączy. Echo u siebie, odkrywa skróty. Twist: złodziejaszki meldują Vabankowi, że łowczynie idą po serca. |
| **2-2** | Wielki Skok na Plecak | Zasadzka: placek skradziony, Echo znika w gęstwinie — koniec ostrzeżeń. Wytrop złodziei, odbij placek, ściągnij Echo. Na końcu **Cierń** za tarczą z lian — przebijają ją tylko naładowane strzały. |
| **2-3** | Gniew Monsuna | **Monsun** rusza w pogoń: runner pod gradem kokosów i pułapek, potem pełna walka. Twist: uwolniony Monsun zdradza, że wszystkie serca leżą w skarbcu na Obsydianowej Górze, i wskazuje tajne wejście. |
| **3-1** | Kryształowe Jaskinie | Wnętrze góry świeci od kryształów, ale gejzery parzą, a lawowe kaktusy kłują. Twist: w głębi śpią zaklęte smoki — chrapanie wskazuje drogę do skarbca. |
| **3-2** | Skarbiec Vabanka | Największa jaskinia wyspy wypchana łupami; najwięcej złodziejaszków w grze. W klatce smoczyca **Pira**. Twist: uwolniona Pira szepcze, że Obsydian nosi Vabanka na grzbiecie, a jego czar padnie dopiero od pełnego plecaka kryształów. |
| **3-3** | Sprint po Zboczu | Lawa idzie z dołu: runner w górę zbocza przez gejzery i lawowe kaktusy. Twist: w połowie drogi Echo przerzuca linę nad rzeką lawy — ale tylko jeśli jest z ekipą; bez niej dłuższa ścieżka najeżona pułapkami. |
| **BOSS** | Szczyt: Obsydian | Król Smoków, a na jego łbie Vabank dyrygujący ogniem. Walka w trzech fazach. Twist finałowy: uwolniony Obsydian nie chce zemsty, a Vega rozpoznaje w Vabanku byłego kandydata na łowcę, którego nikt nie przyjął do żadnej ekipy. Dostaje placek i etat: skarbnik wyspy, pod okiem Smoczej Eskadry. A Tosia dostaje ksywę: **STRZAŁA**. |

### 3.6 Ton

Komedia akcji dla 8-latki oglądającej KPop Demon Hunters: epickie starcia, neonowe strzały, krótkie dialogi z pazurem, zero zdrobnień i zero straszenia. Smoki są potężne, ale to ofiary czaru — wygrana to uwolnienie sojusznika. Vabank to bezczelny łobuz, nie mroczny lord. Przegrana brzmi jak trener, nie jak kara. Wszystkie gotowe teksty: **Załącznik A**.

---

## 4. Struktura gry

### 4.1 Typy poziomów

- **Typ A — platformówka** (1-1, 2-1, 3-1): eksploracja, zbieranie, przeciwnicy, Echo w drużynie.
- **Typ B — platformówka + arena** (1-2, 2-2, 3-2): jak A, a na końcu za ścianą arena smoka-strażnika (pełna mechanika areny, sekcja 8.4).
- **Typ C — runner** (1-3, 2-3, 3-3): autoscroll w stylu dinozaura z Chrome; w 1-3 i 2-3 kończy się areną smoka-uciekiniera; 3-3 to czysty sprint zakończony bramą bossa.
- **BOSS**: krótki korytarz + arena finałowa Obsydiana.

### 4.2 Odblokowania

Poziomy odblokowywane sekwencyjnie. **BOSS odblokowuje się, gdy ukończono 3-3 i pokonano wszystkich 5 smoków** (Miraż, Samum, Cierń, Monsun, Pira). Smok, który uciekł (sekcja 8.4), nie liczy się — poziom trzeba powtórzyć (replay zawsze dostępny z mapy świata; brak soft-locka).

### 4.3 Przepływ ekranów

```
SPLASH → MENU → WYBÓR BOHATERKI → WYBÓR TRUDNOŚCI → MAPA ŚWIATA
MAPA ŚWIATA → PLAYING ⇄ PAUZA (P);  PAUZA → MAPA ŚWIATA (Q, z zapisem)
PLAYING → LEVEL_COMPLETE → MAPA ŚWIATA
PLAYING → GAME_OVER → MAPA ŚWIATA
PLAYING (BOSS pokonany) → VICTORY → TABELA WYNIKÓW → MENU
każdy stan → [nakładka TOO_SMALL] → powrót
```

---

## 5. Bohaterki — statystyki (wiążące)

| Statystyka | **TOSIA** | **VEGA** |
|---|---|---|
| prędkość biegu | 16 kol/s | 13 kol/s |
| prędkość skoku `vy0` | −18 w/s | −16 w/s |
| wysokość skoku | ~4,0 wiersza | ~3,2 wiersza |
| zasięg skoku w dal | ~14 kolumn | ~10 kolumn |
| życia na poziom (Normalny) | 4 | 6 |
| serca w arenie (Normalny) | 3 | 4 |
| strzał: cooldown | 0,4 s | 0,8 s |
| obrażenia: zwykła / magiczna | 1 / 3 | 2 / 4 |
| plecak | zwykły | **chroniony**: złodziej ukradnie najwyżej 1 strzałę, nigdy placka ani diamentu |

Sprite 1 kolumna × 2 wiersze (głowa + tułów):

```
TOSIA (róż 213):   idle  o    bieg  o ↔ o    skok  o    strzał  o
                         A          A    Λ          Y           }
VEGA (błękit 45):  idle  Ω    bieg  Ω ↔ Ω    skok  Ω    strzał  Ω
                         M          M    W          Y           }
```

Fallback: `Λ`→`A`, `Ω`→`O`. Klatka strzału trwa 0,2 s; strzała wylatuje z wiersza głowy. **Twarda reguła projektowania map: każde obowiązkowe przejście wykonalne Vegą** (dziury ≤ 6 kolumn, stopnie ≤ 3 wiersze, kaktusy ≤ 2 wiersze). Sekrety (1 diament w 2-1 i 3-1) na wysokości 4 wierszy — tylko Tosia.

Nieaktywna bohaterka pojawia się w scenkach między światami i rzuca komentarze (Załącznik A).

---

## 6. BESTIARIUSZ

Reguły wspólne: obrażenia od przeciwników/ognia w arenie = −1 serce + i-frames; **kaktus, kolce, gejzer, dziura, pocisk poza areną = −1 życie + pełny reset poziomu** (reguła z opisu córki, sekcja 8.5). Każdy przeciwnik ma dokładnie jeden czytelny wzorzec zachowania; każdy atak smoka jest telegrafowany ≥ 0,7 s.

### 6.1 Echo (małpa-zwiadowczyni)

Sprite `ω` (fallback `m`), brąz 130. Obecna w poziomach typu A i B (w 1-1 dołącza przy znaku `M` po podejściu; dalej — od startu poziomu). W runnerach czeka na mecie. Nieśmiertelna.

- **Podąża** 3 kolumny za bohaterką (teleport, gdy dystans > 20), sama przeskakuje przeszkody.
- **Gwiżdże przed pułapkami**: gdy pułapka jest < 6 kolumn przed graczem — Echo skacze w miejscu z `!` nad głową (+ bell tylko przy pierwszym gwizdnięciu na poziomie).
- **Magnes**: zbiera kryształy i diamenty w promieniu 3 kratek od siebie.
- **Wydłuża ostrzeżenie o złodzieju** z 1,5 s do 3 s.
- **Ucieka**, gdy: (a) złodziej ukradnie placek, (b) gracz straci 2 życia w ciągu 20 s, (c) skrypt poziomu 2-2. Ucieczka: biegnie do kryjówki `m` i po drodze **aktywuje 2 najbliższe punkty `!`** (kolce wysuwają się z telegrafem: migają 1,5 s zanim zaczną ranić).
- **Powrót**: `E` z plackiem w promieniu 5 kolumn (placek zużyty, powrót natychmiastowy) LUB stanie 1 s przy kryjówce (bez placka).

### 6.2 Złodziejaszek (ekipa Vabanka)

Sprite `$` (fiolet 129), z łupem: ikona skradzionego przedmiotu nad głową. Algorytm (wiążący):

1. **Spawn** na punkcie `T`, gdy gracz zbliży się na < 25 kolumn LUB po 20 s poziomu (pierwsze z dwóch); po zniknięciu cooldown 30 s (Normalny); limity wg tabeli ekonomii.
2. Biegnie do gracza **10 kol/s** (wolniej niż obie bohaterki!), przeskakuje przeszkody ≤ 2 wierszy. Sygnalizacja nadejścia: `!` miga na krawędzi ekranu 1,5 s (z Echo: 3 s) + bell.
3. Dotknięcie gracza **nie rani** — kradnie wg priorytetu: **placek → 3 strzały → 1 diament** (Vega: najwyżej 1 strzałę). Plecak błyska, komunikat.
4. Ucieka do bliższej krawędzi mapy **14 kol/s** przez maks. 6 s, potem znika z łupem bezpowrotnie.
5. **Odzyskanie**: trafienie strzałą LUB dotknięcie w trakcie ucieczki → upuszcza łup (leży 10 s), znika w obłoczku `*`, +50 pkt.

### 6.3 Zwykli przeciwnicy (1 HP, dotyk = trafienie, wariant kolorystyczny na świat)

| Przeciwnik | Sprite | Pustynia / Dżungla / Góra | Wzorzec (jedyny) | Pokonanie | Drop |
|---|---|---|---|---|---|
| **Toczek** (żuk) | `ʘ`↔`ʚ` (fallback `0`) | Skorpionik 178 / Żuk liściowy 40 / Żar-żuk 196 | patrol 8 kolumn tam-i-z-powrotem, 4 kol/s, zawraca na krawędzi platformy | skok na grzbiet lub 1 strzała; +20 pkt | 1 kryształ (30%) |
| **Machacz** (latający) | `v`↔`w` | Sęp 94 / Nietoperz 240 / Ognisty nietoperz 208 | przelot poziomy sinusoidą: 8 kol/s, amplituda 2 wiersze, okres 2 s; spawn na wyzwalaczu | 1 strzała; +30 pkt; w runnerze leci w wierszu wymuszającym ślizg | 1 diament (20%) |
| **Skoczka** | `q` (przysiad) ↔ `Q` (skok) | Pchła piaskowa 226 / Ropucha 46 / Lawowa żabka 203 | skok ku graczowi co 2 s: 3 wiersze w górę, 5 kolumn w przód; **telegraf: przysiad 0,5 s** | strzała lub skok na siedzącą; +30 pkt | 1 kryształ (30%) |

### 6.4 Kaktusy i pułapki (−1 życie + reset poziomu)

| Zagrożenie | Sprite | Zachowanie | Ominięcie |
|---|---|---|---|
| **Kaktus** (Pustynia) / Kolczasty krzak (Dżungla) / Lawowy kaktus (Góra) | `Ψ` nad `║` (fallback `Y`,`|`); 46 / 22 / 203 | statyczny, 1–2 wiersze wysokości, nigdy nie blokuje całej wysokości przejścia; strzały wbijają się w niego i przepadają | przeskok |
| **Dół z kolcami** | `▲▲▲` na dnie (fallback `^`), 88 | statyczny, szerokość 3–5 kolumn | przeskok |
| **Spadający głaz** | `O`, 245 | trigger: gracz w kolumnie ±2; **telegraf 0,8 s**: trzęsienie ±1 kolumnę + `!`; spada 20 w/s; leży 2 s; respawn po 4 s | nie zatrzymuj się pod półką / cofnij się w telegrafie |
| **Znikająca platforma** | `───`, cyjan 51 | po stanięciu miga 3× przez 1,2 s → znika na 2 s → wraca; sama nie rani (groźny upadek) | biegnij, nie stój |
| **Gejzer**: Piaskowy wir / Fontanna / Gejzer lawy | cykl: `.` → `~` (miga) → `║` erupcja; 226 / 40 / 196 | cykl stały 4 s: spoczynek 2 s → bulgot 1 s → erupcja 1 s (kolumna 4 wierszy) | przebiec w spoczynku — nauka rytmu |
| **Ukryty punkt `!`** | niewidoczny do aktywacji | aktywacja: ucieczka Echo (2 najbliższe) lub ucieczka smoka (wszystkie); wysuwają się kolce z telegrafem 1,5 s migania | jak kolce |

### 6.5 Smoki (walki w arenach — mechanika w sekcji 8.4)

| Smok | Etap | HP (Ł/N/T) | Tarcza | Ataki | Sprite/kolor |
|---|---|---|---|---|---|
| **Miraż** | 1-2 | 4/6/9 | nie | fireball `*` poziomy 18 kol/s | zieleń 40 |
| **Samum** | 1-3 | 4/6/9 | nie | jak Miraż + wcześniej: pościg (sekcja 8.3) | piasek 178 |
| **Cierń** | 2-2 | 6/9/13 | **tak** (z lian) | 2 fireballe: wiersz gracza i 2 wyżej (kucnięcie albo wysoki skok) | zieleń 46 |
| **Monsun** | 2-3 | 6/9/13 | tak | jak Cierń + wcześniej: pościg | błękit burzowy 39 |
| **Pira** | 3-2 | 9/12/18 | tak | fireball + zionięcie: pas ziemi 8 kolumn płonie 1,0 s (wejdź na platformę / odbiegnij) | pomarańcz 208 |
| **Obsydian** | BOSS | 12/18/26 | tak | 3 fazy — sekcja 8.4.3 | czerwień 196 + złote rogi 220 |

Sprite smoka: stała matryca 6×3 znaków w `levels.py`, np.:

```
 ,^^.
(O__O)≈≈>
 v  v
```

Z tarczą — otoczony nawiasami `(   )`. Wszystkie ataki telegrafowane (tabela stanów w 8.4.1). Smok pokonany = animacja 1,5 s (miga 6×, rozpada się na `* ▓ ·`), drop: 3 diamenty + 1 życie, +500 pkt, dołącza do Smoczej Eskadry.

---

## 7. ARTEFAKTY

| Przedmiot | Glif (fallback) | Kolor | Efekt | Kradzież |
|---|---|---|---|---|
| **Kryształ** | `◊` (`*`) | cyjan 51 | +10 pkt; **każde 5 kryształów zebranych w części poziomu = +1 strzała magiczna (maks. 3)**; brama bossa wymaga 10 w plecaku (sprawdzenie, nie zużycie); w arenie zbijają tarczę (8.4.2) | **nie** (reguła: kradzież kryształów mogłaby zablokować postęp) |
| **Diament** | `♦` (`+`) | biel 231 | +100 pkt; **co 5 diamentów łącznie = +1 życie** | tak (1 szt.) |
| **Strzała** (pęk ×3) | `»` (`>`) | żółty 226 | amunicja; start kampanii: 10, maks. 20 | tak (3 szt.) |
| **Strzała magiczna** | `>` migający + ślad `·` | cyjan 51 | osobny klawisz `Z`; obrażenia wg bohaterki; **przebija tarczę smoka zawsze**; ładowana kryształami, nie przenosi się między poziomami | — |
| **Legendarny Placek** | `⊙` (`@`) | złoty 220 | `E`: przy uciekłej Echo = zwabienie (zużyty); w innym wypadku = zjedzenie, +1 życie; maks. 1 w plecaku | **tak — priorytet nr 1 złodzieja** |
| **Serce** | `♥` (`*`) | czerwień 196 | +1 życie natychmiast; 1 ukryte na poziom platformowy | nie |
| **Tarcza** (power-up) | `Ø` (`0`) | niebieski 39 | pochłania 1 trafienie — **także kaktus/pułapkę, bez resetu poziomu**; 100% ochrony przed kradzieżą; 8 s lub 1 trafienie; od świata 2 | nie |
| **Magnes** (power-up) | `∩` (`n`) | srebrny 203 | przyciąga kryształy i diamenty w promieniu 5 kolumn; 12 s; od świata 2 | nie |

Power-upy: aktywny maks. 1 (nowy nadpisuje), pasek czasu w HUD, sprite gracza miga w ostatnich 2 s. Strzały w locie: `>`/`<`, 30 kol/s, zasięg 40 kolumn.

---

## 8. MECHANIKA RDZENIA

### 8.1 Game loop i input

```python
FPS = 30
DT  = 1.0 / FPS   # stała delta do WSZYSTKICH update(); nigdy realny czas
```

Klatka: (1) `t0 = time.perf_counter()` → (2) drenaż inputu: `while (ch := stdscr.getch()) != -1: input.feed(ch)` (wymaga `nodelay(True)` + `keypad(True)`) → (3) `game.update(DT)` → (4) render: `erase()` (nigdy `clear()`) → kafle → encje → HUD → `noutrefresh()` → `curses.doupdate()` → (5) `time.sleep(max(0, DT - (perf_counter() - t0)))`.

**Terminal nie ma zdarzeń puszczenia klawisza** — obowiązuje model okna przytrzymania:

- `InputState.last_press[akcja] = now`; `is_held(akcja)` = `now - last_press < 0.45 s` (pokrywa opóźnienie autorepeat macOS ~0,4 s → ciągły ruch bez zacięcia; pojedynczy tap przesuwa ~0,45 s — dla dziecka zaleta).
- `was_pressed(akcja)` — świeże wciśnięcie w tej klatce; czyszczone po updacie. **Skok i strzały wyłącznie edge-triggered. Zakaz mechanik „przytrzymaj, by naładować".**

**Keymap** (WASD i strzałki zawsze równolegle, zero kombinacji):

| Klawisz | Akcja |
|---|---|
| `←`/`→` (`A`/`D`) | ruch |
| `SPACJA` / `↑` / `W` | skok; w menu: zatwierdź |
| `↓` / `S` | kucanie / ślizg (runner) |
| `X` | strzał zwykły |
| `Z` | strzał magiczny |
| `E` | placek (zjedz / zwab Echo) |
| `P` / `ESC` | pauza; `Q` w pauzie → mapa świata (z zapisem) |
| `ENTER` | zatwierdź |
| `M` | wycisz dzwonek terminala |

Nieznane klawisze ignorowane bez komunikatu.

### 8.2 Fizyka platformówki

Pozycje jako float, render po `int()`. Semi-implicit Euler, osie rozdzielone (ruch X + kolizje X, potem Y + kolizje Y).

```python
GRAVITY     = 40.0   # wiersze/s^2
MAX_FALL    = 25.0   # wiersze/s
COYOTE_TIME = 0.10   # skok dozwolony do 0.10 s po zejściu z krawędzi  (obowiązkowe)
JUMP_BUFFER = 0.15   # skok wciśnięty przed lądowaniem wykona się przy lądowaniu (obowiązkowe)
```

- Kolizje AABB: gracz 1 kolumna × 2 wiersze; kafle stałe `=`, `#`, `|` pełne ze wszystkich stron (map projektujemy bez platform przenikalnych).
- **Hojne hitboksy na korzyść gracza**: wrogowie i pociski trafiają tylko przy nachodzeniu na AABB gracza pomniejszony do 0,6×1,6; pickupy zbierane przy dystansie środków ≤ 1,2 kratki.
- Upadek poza dolną krawędź mapy = jak kaktus (−1 życie + reset).

### 8.3 Sekcje runnera (1-3, 2-3, 3-3)

Gracz na stałej kolumnie ekranu 10, świat scrolluje w lewo. Fizyka skoku jak w platformówce; `↓` = ślizg (hitbox 1 wiersz, sprite `⌐Y`, trwa póki `is_held`).

| Parametr (Normalny) | Wartość |
|---|---|
| prędkość startowa → maks. | 12 → 18 kol/s |
| przyspieszenie | +1 kol/s co 8 s |
| minimalny odstęp przeszkód | 24 kolumny (≥ 1,3 s reakcji przy vmax) |

Przeszkody **deterministycznie z patternu** (zero RNG): string tokenów — liczba = puste kolumny, `K` kaktus, `KK` podwójny, `n` Machacz na wysokości głowy (ślizg przechodzi), `G4`/`G5` dziura 4/5 kolumn, `C3` linia 3 kryształów w wierszu skoku, `A` strzały +3. Długość poziomu = suma tokenów + 40 kolumn wybiegu. Można strzelać (Machacz 1 HP, +20 pkt). Kolizja = −1 życie + **reset sekcji od początku** (prędkość wraca do startowej). Pasek postępu w HUD.

Patterny w `levels.py` (Normalny; wpis do przerywnika przed startem — sekcja 9.7):

```
RUNNER_1_3 = "40 K 30 C3 25 K 28 A 24 G4 30 K 26 C3 24 KK 30 G4 28 K 24 C3 26 K 30 A 24 KK 28 G5 30 C3 20"
RUNNER_2_3 = "40 K 28 n 26 C3 24 KK 26 G4 28 n 24 K 26 A 24 n 26 KK 28 G5 26 C3 24 K 24 n 26 G4 28 KK 24 C3 26 n 24 K 28 G5 26 A 24 n 26 C3 20"
RUNNER_3_3_FULL = "36 K 24 n 24 G4 24 KK 24 C3 24 n 24 G5 26 K 24 n 24 KK 24 C3 24 G4 24 n 24 K 24 A 24 KK 24 G5 24 n 24 C3 24 K 24 n 24 G4 24 KK 24 C3 24 A 20"
RUNNER_3_3_LINA = RUNNER_3_3_FULL skrócony o tokeny 15–24  # gdy Echo z ekipą po 3-2 („Echo przerzuca linę")
```

Koniec sekcji: scroll wytraca prędkość do 0 w 2 s; w 1-3 i 2-3 otwiera się **arena smoka** (Samum/Monsun — smok „dogoniony"); w 3-3 pojawia się **brama bossa** (wymaga 10 kryształów w plecaku — komunikat, gdy brak; kryształów w 3-3 jest 15).

### 8.4 Walka ze smokiem (arena)

Poziomy typu B: część platformowa + arena za ścianą `|`; przekroczenie triggera `>` blokuje kamerę (arena 80 kolumn), spawnuje smoka na `S` i ustawia **checkpoint**. Po runnerze (1-3, 2-3) arena zaczyna się bezpośrednio.

#### 8.4.1 Maszyna stanów smoka

| Stan | Czas (N) | Zachowanie | Przejście |
|---|---|---|---|
| `IDLE` | 1,5 s | patrol poziomy w wierszach 4–8, 8 kol/s | → TELEGRAPH |
| `TELEGRAPH` | 1,0 s (Ł 1,4 / T 0,7) | smok miga (bold/kolor), `!` nad głową; atak naziemny: pas ziemi miga `~` | → ATTACK |
| `ATTACK` | do zniknięcia pocisków | wystrzeliwuje wzorzec (tabela 6.5); pociski celują w pozycję gracza z chwili końca telegrafu | → COOLDOWN |
| `COOLDOWN` | 2,0 s | patrol, brak ataków | → IDLE |
| `STUNNED` | 2 s | po zbiciu tarczy: opada nisko, nie atakuje | → IDLE |
| `FLEE` | 1,5 s | odlatuje w górę, znika | koniec walki |

#### 8.4.2 Rola kryształów (dwa systemy — sedno „zdobywaj kryształy, by pokonać smoki")

1. **Tarcza** (smoki od świata 2 + Obsydian): render — nawiasy `( )` wokół sprite'a; zwykłe strzały odbijają się z iskrą `*` (0 obrażeń). W arenie są 3 punkty `o`, na których pojawiają się kryształy — zebranie wszystkich 3 → **tarcza pada na 8 s** (pierwsze 2 s smok `STUNNED`). Po 8 s tarcza wraca; 1 s później spawnuje się nowa fala 3 kryształów. Cykl do końca walki.
2. **Strzały magiczne**: ładowane kryształami z części poziomu (5 kryształów = 1 strzała, maks. 3); zadają pełne obrażenia i **przebijają tarczę zawsze**.

Smoki świata 1 (Miraż, Samum) walczą bez tarczy — pierwsza walka to lekcja: unik + zwykły strzał. Kryształy w ich arenach się nie spawnują.

#### 8.4.3 Obsydian — 3 fazy (HP 18 na Normalnym; progi 100–66–33%)

Vabank siedzi na łbie smoka (dekoracja; rzuca docinki przy zmianie fazy — Załącznik A). Tarcza standardowa od startu. **Bez timera ucieczki.**

- **Faza 1 „Lekcja" (18–13 HP)**: smok na ziemi po prawej. Atak A: co 3 s poziomy płomień przy ziemi przez całą arenę (telegraf 1,2 s: pierś jaśnieje + `!`; unik: przeskok). Atak B: co 10 s głaz `O` nad kolumną gracza (telegraf głazu 0,8 s).
- **Faza 2 „Pogoń" (12–7 HP)**: lot sinusoidą (amplituda 4 wiersze, okres 3 s). Co 2,5 s dwie kule ognia po parabolach (telegraf 1,0 s: iskry `*` przy pysku). Wysuwają się 3 znikające platformy — z nich strzela się do latającego smoka.
- **Faza 3 „Furia" (6–0 HP)**: ląduje, oczy migają; cooldowny ×0,7. Szarża przez arenę co 4 s, 20 kol/s (telegraf 1,2 s: grzebie łapą + `!!`; unik: przeskok) + fala uderzeniowa `^` po ziemi w obie strony 20 kol/s (przeskok). Po każdej szarży 2 s dyszenia z odsłoniętym słabym punktem: `♦` miga na sprite — trafienie magiczną liczy się **podwójnie**. Kryształy tarczowe spawnują się co 3 s.

Zwycięstwo: +1000 pkt → stan `VICTORY`.

#### 8.4.4 Serca, porażka, ucieczka smoka

- Gracz w arenie ma **serca** (tabela trudności): trafienie = −1 serce + **i-frames 1,5 s** (miga, nietykalny) + odrzut 2 kolumny. 0 serc = −1 życie i **restart od checkpointu areny** z pełnymi sercami; **HP smoka NIE resetuje się** (kluczowa wybaczalność), timer ucieczki startuje od nowa. Utrata wszystkich żyć = `GAME_OVER` → mapa świata.
- **Smok ucieka** (wszyscy poza Obsydianem), gdy łączny czas walki w bieżącej próbie osiągnie **120 s** (N). 30 s przed: HUD „SMOK ZARAZ UCIEKNIE!" + smok miga na żółto. Ucieczka = stan `FLEE`, potem **aktywują się wszystkie punkty `!` w całym poziomie** (kolce z telegrafem 1,5 s), pojawia się wyjście. Poziom można ukończyć, ale bez flagi `dragon_defeated` i bez +500 pkt; mapa świata pokazuje „smok uciekł — zagraj ponownie". Zbiegły smok nie wraca w tej wizycie i nie zostawia dropu.

### 8.5 Życia, śmierć, reset

- **Reguła córki, dosłownie**: kaktus, kolce, gejzer, dziura, pocisk (poza areną) = **−1 życie i pełny reset poziomu**. Życia per poziom: wejście = refill do wartości z tabeli trudności. Balans przez krótkie poziomy (45–100 s), nie miękkie trafienia.
- **Snapshot**: przy wejściu do poziomu zapisywany jest stan plecaka i mapy. Śmierć przywraca snapshot: pickupy wracają, liczniki poziomu zerują się, złodziej znika, Echo wraca na pozycję, pułapki `!` się ukrywają. Zostają: rekordy, odblokowania, HP smoka w arenie, stan „smok uciekł" (pułapki wtedy pozostają aktywne).
- **Bank**: ukończenie poziomu przenosi zawartość plecaka (diamenty, strzały, placek) do stanu trwałego.
- **Checkpoint wyłącznie na wejściu do areny.** Pełny reset krótkiego poziomu jest dla 7-latki czytelny i zgodny z jej projektem; boss to wyjątek, bo powtarzanie 90 s platformówki przed każdą próbą to gwarantowana frustracja.
- Wyjątek Łatwy/Skrzat: sekcja 8.7.

### 8.6 Ekonomia — wszystkie 10 etapów (Normalny)

| Etap | Typ | Długość (kol.) | ◊ Kryształy | ♦ Diamenty | » Pęki strzał | ⊙ Placek | Kaktusy/kolce | `!` | Złodziej maks. | Echo | Par time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1-1 | platforma | 100 | 10 | 2 | 1 | 1 | 3 / 0 | 2 | 1 | dołącza przy `M` | 75 s |
| 1-2 | platforma+Miraż | 140+arena | 15 | 2 | 2 | 1 | 4 / 0 | 3 | 1 | tak | 150 s |
| 1-3 | runner+Samum | ~500 | 9 | 0 | 1 | 0 | 7 / 0 | 0 | 0 | nie | 60 s + walka |
| 2-1 | platforma | 160 | 14 | 3 (1 sekret) | 2 | 1 | 4 / 2 | 3 | 2 | tak | 90 s |
| 2-2 | platforma+Cierń | 160+arena | 18 | 3 | 2 | 1 (do odbicia) | 5 / 2 | 4 (aktywne od startu) | 3 | od startu NIEOBECNA — wraca po odbiciu placka | 170 s |
| 2-3 | runner+Monsun | ~650 | 12 | 0 | 1 | 0 | 9 / 0 + 8 Machaczy | 0 | 0 | nie | 70 s + walka |
| 3-1 | platforma | 180 | 16 | 3 (1 sekret) | 2 | 1 | 5 / 4 | 4 | 2 | tak | 100 s |
| 3-2 | platforma+Pira | 180+arena | 20 | 3 | 3 | 1 | 6 / 4 | 5 | 2 (cooldown 20 s) | tak | 190 s |
| 3-3 | runner | ~800 (LINA: ~600) | 15 | 0 | 2 | 0 | 10 / 0 + 9 Machaczy | 0 | 0 | flaga liny | 75 s |
| BOSS | arena | korytarz 60+arena | tarczowe co 5 s (faza 3: co 3 s) + 15 w korytarzu | 0 | 3 w korytarzu | 0 | 0 / 2 | 2 | 0 | nie | — |

Skrypt 2-2: poziom startuje bez Echo (fabularnie: uciekła za skradzionym plackiem), pułapki `!` aktywne od startu; placek `⊙` leży w gnieździe złodziei w połowie poziomu — podniesienie go przywraca Echo (scenka 1-liniowa).

**Scoring**: kryształ 10 · diament 100 · pęk strzał 5 · Toczek 20 · Machacz 20 · Skoczka 30 · złodziej złapany 50 · smok 500 · Obsydian 1000 · ukończenie poziomu 100 · bonus czasu `max(0, par_time − czas) × 5`. Rekord per poziom + wynik kampanii + tabela najlepszych (top 5, imię 8 znaków).

### 8.7 Trudność

| Parametr | **ŁATWY** (5–6) | **NORMALNY** (7–9) | **TRUDNY** (10–12) |
|---|---|---|---|
| życia na poziom (Tosia / Vega) | 6 / 8 | 4 / 6 | 3 / 4 |
| model trafień poza areną | 3 serca; trafienie = −1 serce + i-frames + odrzut; 0 serc = −1 życie + reset | one-touch: −1 życie + reset | one-touch |
| serca w arenie (Tosia / Vega) | 4 / 5 | 3 / 4 | 2 / 3 |
| i-frames | 2,0 s | 1,5 s | 1,0 s |
| telegraf smoka | 1,4 s | 1,0 s | 0,7 s |
| HP smoków (Ś1 / Ś2 / Pira / Obsydian) | 4 / 6 / 9 / 12 | 6 / 9 / 12 / 18 | 9 / 13 / 18 / 26 |
| prędkość fireballi | 14 kol/s | 18 kol/s | 22 kol/s |
| smok ucieka po | 150 s | 120 s | 90 s |
| złodziej: cooldown | 45 s | 30 s | 20 s |
| runner: v0 → vmax | 10 → 14 | 12 → 18 | 14 → 22 |
| runner: przyspieszenie | +1 co 10 s | +1 co 8 s | +1 co 6 s |

**Tryb Skrzat** (przełącznik w menu, niezależny od trudności — dla 5-latka, który nie czyta): baza Łatwy + prędkość gry −30%, życia nieskończone (śmierć = powrót na start poziomu, bez licznika), auto-strzał w arenie (wystarczy uciekać), wymagane kryształy −50%, dymki tutorialu w każdym przejściu, bell wyłączony.

**Dynamiczne ułatwienie**: po 3 utratach życia na tym samym poziomie ekran śmierci dodaje linię `Chcesz łatwiej?  ♥ ♥  [T] tak  [N] nie` — `T` daje +2 życia i −20% prędkości do końca poziomu. Bez oceniania, bez napisu „tryb łatwy".

---

## 9. UI/UX

### 9.1 Znaki i sprite'y (tabela wiążąca)

Dozwolone w polu gry wyłącznie: ASCII + znaki z tabeli + box-drawing (`─│┌┐└┘├┤═║╔╗╚╝`) + bloki (`█▓▒░▀▄`). Na starcie test `wcwidth(znak) == 1` dla całego zestawu (pakiet `wcwidth` jeśli dostępny; inaczej wbudowana lista) — niepowodzenie lub flaga `--ascii` → kolumna fallback. **Emoji, CJK i U+FE0F bezwzględnie zakazane.**

| Element | Glif | Fallback | Kolor 256 / 16 |
|---|---|---|---|
| Tosia | `o`+`A` | — | 213 róż / magenta, BOLD |
| Vega | `Ω`+`M` | `O`+`M` | 45 błękit / cyan, BOLD |
| Echo | `ω` | `m` | 130 brąz / yellow, BOLD |
| Złodziejaszek | `$` | — | 129 fiolet / magenta, BOLD |
| Kryształ | `◊` | `*` | 51 cyjan / cyan, BOLD |
| Diament | `♦` | `+` | 231 biel / white, BOLD |
| Strzała (pickup / lot) | `»` / `>` `<` | `>` | 226 żółty (magiczna: 51 cyjan, miga) |
| Placek | `⊙` | `@` | 220 złoto / yellow, BOLD |
| Kaktus | `Ψ`+`║` | `Y`+`|` | wg świata (6.4), BOLD |
| Kolce | `▲` | `^` | 196 czerwień / red, BOLD |
| Głaz | `O` | — | 245 szary / white |
| Serce pełne / puste | `♥` / `♡` | `*` / `.` | 196 / 240 |
| Życie w HUD | `♥` | `*` | 196, BOLD |
| Lawa / płomień naziemny | `≈` / `~` | `~` | 208 na tle 52 |
| Fireball | `*` | — | 208/226 naprzemiennie co klatkę |
| Fala uderzeniowa | `^` | — | 208, BOLD |
| Gejzer | `.`→`~`→`║` | `|` | wg świata |
| Wyjście z poziomu | `Π` | `E` | 226, BOLD, miga |
| Grunt / platformy | `█ ▀ ▄ ▓` | `# = -` | wg świata |
| Słońce (dekoracja) | `☼` | `o` | 226 |

Zasada czytelności (wiążąca): sprite'y i wartości HUD zawsze BOLD + kolor jaskrawy; tła i dekoracje nigdy BOLD, kolory przygaszone; każdy byt ma unikatowy znak (rozróżnienie nigdy samym kolorem — daltonizm). `start_color()` + `use_default_colors()` tylko po `has_colors()`; sprawdzenie `COLORS >= 256` z fallbackiem do palety 16; pełny fallback monochromatyczny (gra działa bez kolorów).

**Palety światów:**

| Świat | Grunt | Dekoracje | Neon świata (ramki, akcenty) |
|---|---|---|---|
| 1 Pustynia Miraży | `█` 180 piasek | wydmy `░` 136, słońce `☼` 226 | złoty 220 |
| 2 Dżungla Ech | `█` 28 zieleń | liście `░` 22, pnącza `▒` 65 | zielony 46 |
| 3 Obsydianowa Góra | `█` 240 skała | cegły `▓` 238, lawa `≈` 208 na 52, pochodnie `†` 208 | czerwony 196 |

Reguła: w danym świecie żaden kolor tła nie powtarza koloru sprite'a (lawa nigdy nie sąsiaduje ze smokiem).

### 9.2 Siatka ekranu

Projekt bazowy **100×30**; twardy próg **80×24**. Silnik rysuje względem `LINIA_GRUNTU = wysokość − 4` — oba rozmiary to ten sam kod.

| Wiersz (100×30) | Zawartość |
|---|---|
| 0 | HUD górny |
| 1 | separator `─`; podczas walki: pasek HP smoka |
| 2–26 | pole gry (mapa 20 wierszy dolna krawędź przy gruncie; nad mapą niebo) |
| 27 | separator `─` |
| 28 | plecak |
| 29 | linia kontekstowa (podpowiedzi `► tekst [KLAWISZ]`, żółte na tle 236) |

W 80×24: pole gry wiersze 2–20, plecak 22, podpowiedzi 23, HUD skraca etykiety (`1-2` zamiast `ŚWIAT 1-2`). Terminal < 80×24 → nakładka na żywo:

```
                    ┌──────────────────────────────────┐
                    │      Powiększ okno!   ← □ →      │
                    │         teraz: 62 x 20           │
                    │       potrzeba: 80 x 24          │
                    └──────────────────────────────────┘
```

Kamera: scroll tylko poziomy, `cam_x = clamp(player.x - 30, 0, level_width - viewport_w)`; bohaterka trzymana między 30% a 50% szerokości ekranu.

### 9.3 HUD (rozmieszczenie wiążące, 100×30)

```
 ♥ ♥ ♡   ŚWIAT 1-2   ◊ 04/10   » 12  »M 2   ♦ 0125                                    [P] pauza
```

| Pozycja w. 0 | Zawartość | Format |
|---|---|---|
| kol. 1–8 | życia | `♥ ♥ ♡` pełne czerwone BOLD / puste szare DIM |
| kol. 10–18 | etap | `ŚWIAT 1-2` |
| kol. 22–29 | kryształy | `◊ 04/10` (zebrane/na poziomie); przy komplecie zielone BOLD; w arenie `◊ --/--` |
| kol. 33–43 | strzały | `» 12` żółte + `»M 2` cyjan (magiczne) |
| kol. 47–53 | diamenty | `♦ 0125` |
| kol. 86–95 | pauza | `[P] pauza`, DIM |

Wiersz 1 podczas walki — pasek HP smoka, wyśrodkowany: `PIRA  ██████████████░░░░░░  14/20` (`█` czerwone, ubytek `░`; trafienie: segment gaśnie `█`→`▒`→`░` w 3 klatkach; poniżej 25% pasek miga). W runnerze wiersz 1 = pasek postępu `[####......]`.

Wiersz 28 — plecak: `PLECAK:  ◊ x4   » x12   ⊙ x1   ω` (pary ikona+licznik co 7 kolumn; `ω` na końcu, gdy Echo w drużynie; pasek power-upu `[Ø ■■■□□]` po prawej).

### 9.4 Ekrany (makiety poglądowe, layout wiążący)

**Splash**: tytuł `S T R Z A / Ł A` dużymi literami z bloków `█` (ukośnik `/` w neonowym cyjanie 51, litery 226), podtytuł `Łowczynie Smoków`, rząd `◊ ♦ ◊ ♦` migający co 500 ms, `► NACIŚNIJ [SPACJA] ◄` pulsujące (BOLD↔DIM co 600 ms). Po 10 s bezczynności animacja: smok zieje `~` w stronę sylwetki łowczyni.

**Menu główne** (4 pozycje, ikona przed słowem, wybrana = `►` + A_REVERSE całej linii):

```
                              ╔══════════════════════════════╗
                              ║   ►  ▶  GRAJ                 ║
                              ║      ♥  TRYB SKRZAT          ║
                              ║      ★  WYNIKI               ║
                              ║      □  WYJDŹ                ║
                              ╚══════════════════════════════╝
                              [↑↓] wybierz      [SPACJA] start
```

`ESC` w menu = wyjście z pytaniem `Na pewno? [T/N]`.

**Wybór bohaterki** — dwie karty obok siebie; statystyki wyłącznie paskami symboli (czyta je i 5-latek); wybrana karta: podwójna ramka w kolorze bohaterki, sprite podskakuje co 800 ms:

```
              ╔═══════════════════════════╗        ┌───────────────────────────┐
              ║          TOSIA            ║        │           VEGA            │
              ║            o              ║        │            Ω              │
              ║            A              ║        │            M              │
              ║   szybkość  ►►►►►         ║        │   szybkość  ►►►           │
              ║   skok      ▲▲▲▲          ║        │   skok      ▲▲▲           │
              ║   życia     ♥♥♥♥          ║        │   życia     ♥♥♥♥♥♥        ║
              ║   plecak    zwykły        ║        │   plecak    z zamkiem 🅧  ║
              ╚═══════════════════════════╝        └───────────────────────────┘
                             [←→] wybierz        [SPACJA] gotowe
```

(ikonę zamka renderuj znakiem `Θ`, nie emoji). Potem ekran trudności: `ŁATWY / NORMALNY / TRUDNY` z opisem jednym zdaniem.

**Mapa świata** — węzły `★` (ukończony, złoty) / `►` (dostępny, miga) / `▒` (zamknięty, DIM); węzeł BOSS podwójny; sprite bohaterki stoi pod podświetlonym węzłem i przesuwa się 3-klatkową animacją; przy poziomach z pokonanym smokiem mini-głowa `(O_` w Smoczej Eskadrze u dołu; legenda symboli na stałe (jedyne „słownictwo" gry w jednym miejscu):

```
  ŚWIAT: 1 PUSTYNIA MIRAŻY          ♦ 0125          ♥ ♥ ♥
      ★ ──── ★ ──── ►  ─────── ▒ ──── ▒ ──── ▒ ─────── ▒ ──── ▒ ──── ▒ ──── ▒▒
     1-1    1-2    1-3        2-1    2-2    2-3       3-1    3-2    3-3   OBSYDIAN
                    o
                    A
   SMOCZA ESKADRA: (O_ MIRAŻ                ★ zrobione   ► jesteś tu   ▒ zamknięte
                          [←→] wybierz      [SPACJA] graj      [ESC] menu
```

**Pauza** — nakładka na grę w DIM (dziecko widzi, że gra „czeka"): `▶ GRAJ DALEJ / ↺ OD NOWA POZIOM / □ MAPA ŚWIATA`; `P`/`ESC` = natychmiastowy powrót.

**Utrata życia** — sekwencja: 2× inwersja pola gry → bohaterka miga 6 klatek → serce pęka w HUD (`♥`→`*`→`♡`) → po 0,5 s nakładka; `SPACJA` lub auto-restart po 2 s. Komunikat losowany z puli (Załącznik A) — nigdy słowo „przegrana":

```
                              ┌──────────────────────────────┐
                              │       KAKTUS: 1, TY: 0       │
                              │           ♥ ♥ ♡              │
                              │         Wyrównaj.            │
                              │       ► [SPACJA] ◄           │
                              └──────────────────────────────┘
```

**Koniec poziomu** — gwiazdki 1–3 (ukończenie / wszystkie kryształy / bez utraty życia) wpadają kolejno animacją `·`→`☆`→`★` co 400 ms; liczniki nabijają się od 0 przez ~1 s; `▶ DALEJ / ↺ JESZCZE RAZ`. Po pokonaniu smoka dodatkowy wiersz: `(O_  CIERŃ dołącza do Eskadry`.

**Game over (0 żyć)** — zero czerwieni, nagłówek `ALE AKCJA!`, podsumowanie zdobyczy, `► ↺ JESZCZE RAZ ♥♥♥♥` (domyślnie podświetlone — 1× SPACJA i gra trwa), `□ MAPA ŚWIATA`. Postęp mapy nigdy nie przepada.

**Zwycięstwo** — fajerwerki `* ★ ·` losowo w górnej połowie (kolory 213/226/51, pętla 5 s), Echo obok bohaterki, tekst finałowy (Załącznik A), bell 2× (fanfara), przejście do wpisu do tabeli.

**Tabela wyników** — top 5 (`IMIĘ ♦ wynik ★ gwiazdki`), wpis imienia maks. 8 znaków (backspace działa, kursor `_` miga), nowy rekord miga A_REVERSE 3 s + bell 1×.

### 9.5 Feedback („juiciness") — tabela wiążąca

| Zdarzenie | Efekt | Czas | Bell |
|---|---|---|---|
| zebranie kryształu | znak →`*`→`·`→ znika; `+1` unosi się nad głową 3 klatki; licznik HUD miga BOLD | 0,2 s | nie |
| zebranie diamentu | jw., `+100` białe | 0,2 s | nie |
| strzała/placek do plecaka | ikona „wskakuje" po skosie do wiersza plecaka; slot miga | 0,3 s | nie |
| komplet kryształów do magicznej | licznik `»M` błyska cyjanem + w linii 29: `► Strzała naładowana. Neon w górę.` | 2 s | nie |
| trafienie smoka | smok A_REVERSE 2 klatki; `TRAF!` unosi się 3 klatki; segment HP gaśnie | 0,3 s | nie |
| odbicie od tarczy | iskra `*` w miejscu trafienia + brzdęk (wizualny, bez bell) | 0,2 s | nie |
| utrata życia / serca | sekwencja z 9.4 | 0,8 s | TAK 1× |
| kradzież | ikona łupu nad `$`; linia 29: `► ŁAP GO!`; odzyskanie = błysk plecaka | do ucieczki | nie |
| skok / lądowanie z wysoka | 1 klatka `'` kurzu / `. .` rozchodzące się od stóp | 1–2 klatki | nie |
| pokonanie smoka | miga 6×, rozpada się na `* ▓ ·` opadające 10 klatek | 1,5 s | TAK 2× |
| nowy rekord | wiersz tabeli miga A_REVERSE | 3 s | TAK 1× |

`curses.beep()` wyłącznie w 3 oznaczonych zdarzeniach + gwizd Echo (pierwszy na poziomie) + sygnał złodzieja; `M` wycisza globalnie.

### 9.6 Onboarding — tutorial wpleciony w rozgrywkę

Zasady: gra ZATRZYMUJE się na czas dymka; dymek = JEDEN klawisz w `[nawiasie]` + maks. 6 słów; znika w chwili wykonania akcji; pokazuje się raz na profil (Tryb Skrzat: zawsze). Dymek w dolnej-środkowej części pola gry, ramka pojedyncza (ostrzegawczy: czerwona).

| Trigger | Dymek | Etap |
|---|---|---|
| start 1-1 | `► Idź! [→]` | 1-1 |
| 3 kolumny przed pierwszą platformą | `▲ Skacz! [SPACJA]` | 1-1 |
| pierwszy kryształ widoczny | `◊ Zbieraj kryształy!` | 1-1 |
| 3 kolumny przed pierwszym kaktusem | `Ψ Nie dotykaj! Przeskocz!` (czerwona ramka) | 1-1 |
| pierwsza strzała w plecaku | `» Strzał: [X]` | 1-1 |
| pierwszy złodziej | `$ Złodziej! Goń go albo strzelaj!` | 1-1 |
| spotkanie Echo | `ω Echo z tobą. Gwiżdże przed pułapkami.` | 1-1 |
| wejście do pierwszej areny | `Uważaj na ogień [← →], strzelaj [X]!` | 1-2 |
| pierwszy runner | plansza-przerywnik (2 s): `► ► ►  PĘDZIMY!   [SPACJA]=skok  [↓]=ślizg` | 1-3 |
| pierwsza magiczna strzała | `»M Magiczna strzała: [Z]. Przebija tarczę.` | 2-2 |

Poza tutorialem linia 29 zawsze podpowiada najbliższą sensowną akcję — dziecko nieczytające i tak widzi symbol klawisza.

### 9.7 Obsługa frustracji (zasady wiążące)

- Restart w ≤ 2 s od śmierci (nakładka + auto-start).
- Język zawsze pozytywno-zadziorny; zakaz słów „przegrana / koniec / porażka".
- Brak kar globalnych: game over nie cofa mapy; diamenty zbankowane nie przepadają; replay bez limitu.
- Dynamiczne ułatwienie po 3 śmierciach (8.7).
- **Zero timerów widocznych dla gracza** (par time liczony w tle, pokazywany dopiero w podsumowaniu; timer ucieczki smoka komunikowany tylko ostrzeżeniem na 30 s przed).

---

## 10. FORMAT DANYCH POZIOMÓW

Mapy jako listy stringów w `levels.py`. Wysokość **dokładnie 20 wierszy**; szerokość 100–200 kolumn (runnery nie mają map — mają patterny 8.3). Parser: `width = max(len(line))`, każda linia dopełniana spacjami (odporność na obcięte spacje); asserty przy starcie: wysokość 20, dokładnie jeden `P` i jeden `Π`-exit (`E` w danych) na mapę.

**Legenda znaków mapy** (dane ASCII; render = glif z tabeli 9.1):

| Znak | Znaczenie | Widoczny |
|---|---|---|
| `=` | ziemia (solidna) | tak |
| `#` | platforma (solidna ze wszystkich stron) | tak |
| `\|` | ściana areny | tak |
| `>` | trigger areny (checkpoint) | nie |
| `P` | start gracza | nie |
| `E` | wyjście (render `Π`) | tak |
| `C` | kryształ | tak |
| `D` | diament | tak |
| `A` | pęk strzał +3 | tak |
| `L` | placek | tak |
| `K` | kaktus | tak |
| `^` | kolce aktywne od startu | tak |
| `!` | ukryty punkt pułapki | nie, do aktywacji |
| `T` | spawn złodzieja | nie |
| `M` | Echo (start w 1-1) | tak |
| `m` | kryjówka Echo | nie |
| `S` | pozycja startowa smoka | nie (spawn przy triggerze) |
| `o` | punkt spawnu kryształów tarczowych w arenie | nie (kryształ widoczny po spawnie) |
| `g` | gejzer | tak |
| `G` | głaz (na półce) | tak |
| `z` | znikająca platforma (segment) | tak |
| `1`/`2`/`3` | spawny: Toczek / Machacz-wyzwalacz / Skoczka | nie |
| `V` | serce ukryte | tak |
| `t` / `u` | power-up: Tarcza / Magnes | tak |

**Kompletny poziom 1-1 „Plaża Rozbitków"** (100×20; puste wiersze nieba są pełnoprawnymi liniami):

```
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                       D                                            
                                 D                    ###                                           
                                                                                                    
            C                  C C C          V                          M            C C           
          #####               #######             ###                 #######        #####          
                                                                                                    
  P  mCCC         K            1        A    K !          C T       L         ! K               E   
====================    ===============================    =========================================
```

Sekwencja dydaktyczna: bieg i kryształy → pierwsza platforma → kaktus (skok) → dziura 4 kolumny → platformy z kryształami, Toczek i diament w skoku → serce ukryte → schodki z diamentem → spawn złodzieja → druga dziura → placek i Echo → kaktus przy `!` → finałowe kryształy → wyjście. Wszystko wykonalne Vegą.

Pozostałe mapy (1-2, 2-1, 2-2, 3-1, 3-2, korytarz BOSS) generuje agent kodujący wg: ekonomii 8.6, story beatów 3.5, reguły wykonalności Vegą, sekwencji „nowa mechanika najpierw w bezpiecznym kontekście". Areny: szerokość 80 kolumn, płaska podłoga + 2–3 platformy, 3 punkty `o` (od świata 2), ściana `|` za triggerem `>`.

---

## 11. ARCHITEKTURA KODU

### 11.1 Klasy i odpowiedzialności

| Klasa | Odpowiedzialność | Kluczowe metody |
|---|---|---|
| `Game` | maszyna stanów, pętla główna, przejścia | `run()`, `update()`, `change_state()`, `start_level(id)` |
| `InputState` | drenaż klawiszy, okna przytrzymania, edge | `poll(stdscr)`, `is_held(a)`, `was_pressed(a)`, `clear_frame()` |
| `Renderer` | rysowanie klatki, kamera, kolory, bezpieczny addstr, tabela glifów+fallback | `draw(game)`, `safe_addstr(y,x,s,attr)`, `init_colors()`, `glyph(name)` |
| `Level` | parsowanie mapy, kafle, spawny, snapshot/reset, fazy `PLATFORM`/`ARENA` | `parse(lines)`, `solid_at(r,c)`, `reset_to_snapshot()` |
| `RunnerState` | scroll, parser patternu, spawn przeszkód, pasek postępu | `update(dt)`, `speed()`, `finished()` |
| `Entity` (baza) | x, y, vx, vy, w, h, alive, glif | `update(dt, level)`, `aabb()` |
| `Player(Entity)` | fizyka, koyote/buffer, serca, i-frames, plecak | `update()`, `jump()`, `shoot(magic=False)`, `hurt()`, `use_cake()` |
| `Dragon(Entity)` | FSM 8.4.1, ataki, tarcza, fazy bossa, timer ucieczki | `update()`, `take_hit(dmg, magic)`, `flee()` |
| `Thief(Entity)` | algorytm 6.2 | `update()`, `steal(player)`, `drop_loot()` |
| `Monkey(Entity)` | podążanie, magnes, gwizd, panika, kryjówka | `update()`, `flee_to_hideout()`, `retame()` |
| `Arrow` / `Fireball` / `Shockwave` / `Trap` / `Geyser` / `Boulder` (Entity) | pociski i pułapki | `update()` |
| `SaveManager` | JSON, zapis atomowy, walidacja | `load()`, `save(state)` |

Arena NIE jest osobnym stanem gry — to faza `Level` (upraszcza pauzę i render).

### 11.2 Resize i minimalny rozmiar

`getch()` zwraca `curses.KEY_RESIZE` → `curses.update_lines_cols()`; gdy `COLS < 80 or LINES < 24` → nakładka `TOO_SMALL` (9.2), logika wstrzymana; powrót automatyczny po powiększeniu.

### 11.3 Czyste wyjście

Całość w `curses.wrapper(main)` (przywraca terminal nawet po wyjątku); w pętli `try/except KeyboardInterrupt` → `save()` → zwykły `return`. `curs_set(0)` w `try/except curses.error`.

### 11.4 Zapis

`~/.strzala/save.json` (katalog tworzony przy starcie). Zapis atomowy: `save.json.tmp` → `os.replace()`. Brak pliku → domyślne. Uszkodzony JSON → zmiana nazwy na `save.bak` + start od domyślnych (nigdy crash). Zapis po: ukończeniu poziomu, walce (wygranej/ucieczce smoka), zmianie postaci/trudności, każdym wyjściu (także Ctrl+C).

```json
{
  "version": 1,
  "character": "VEGA",
  "difficulty": "NORMAL",
  "skrzat": false,
  "unlocked": ["1-1", "1-2", "1-3", "2-1"],
  "levels": {
    "1-1": {"completed": true, "best_score": 1240, "best_time": 61.2, "stars": 3}
  },
  "dragons_defeated": ["1-2", "1-3"],
  "echo_lina": false,
  "total_diamonds": 11,
  "arrows": 14,
  "has_cake": true,
  "campaign_score": 4830,
  "highscores": [{"name": "ZOSIA", "score": 1250, "stars": 21}]
}
```

---

## 12. RYZYKA ONE-SHOT (nakazy) + testy

Nakazy bezwzględne (najczęstsze błędy gier curses):

1. **Blokujący `getch()`** → nakaz: `nodelay(True)` + drenaż pętlą do `-1` w każdej klatce.
2. **Brak key-release w terminalu** → nakaz: okno przytrzymania 0,45 s; skok/strzał edge-triggered; zakaz „przytrzymaj i ładuj".
3. **`addstr` w prawym dolnym rogu rzuca `curses.error`** → nakaz: WSZYSTKIE operacje rysowania przez jedną funkcję `safe_addstr` z clippingiem do `(LINES-1, COLS-1)` i `try/except curses.error`; zero bezpośrednich `addstr`/`addch` poza nią.
4. **Migotanie** → nakaz: `erase()` + jedno `noutrefresh()` + `doupdate()` na klatkę; nigdy `clear()`.
5. **`curs_set` / kolory rzucają na części terminali** → nakaz: try/except; kolory tylko po `has_colors()`; fallback 16 kolorów i mono.
6. **Znaki wielokolumnowe rozjeżdżają siatkę** → nakaz: tylko zatwierdzona tabela 9.1 + test `wcwidth==1` na starcie + `--ascii`; `locale.setlocale` przed initscr; polskie znaki tylko w tekstach UI.
7. **Rozsypany terminal po wyjątku/Ctrl+C** → nakaz: `curses.wrapper` + `except KeyboardInterrupt` z zapisem; nigdy `sys.exit()` w środku pętli.
8. **Spirala śmierci pętli czasu** → nakaz: stały `DT = 1/30` bez akumulatora; `sleep(max(0, ...))`; `KEY_RESIZE` jako zwykły klawisz.

**Checklista testów manualnych („zagraj i sprawdź"):**

1. Przejdź 1-1 obiema bohaterkami — wszystkie kryształy i oba diamenty osiągalne również Vegą.
2. Przytrzymaj `→` 5 s — ruch ciągły bez zacięcia; pojedynczy tap przesuwa o kilka kolumn.
3. Zbiegnij z krawędzi i skocz po 2–3 klatkach (koyote); wciśnij skok tuż przed lądowaniem (buffer).
4. Dotknij kaktusa — −1 życie, pełny reset poziomu, plecak wraca do snapshotu.
5. Złodziej: daj się okraść i złap go (łup wraca, +50 pkt); pozwól drugiemu uciec (łup przepada); Vega traci maks. 1 strzałę.
6. Echo: spraw, by uciekła — 2 punkty `!` migają 1,5 s i wysuwają kolce; odzyskaj ją plackiem (`E`).
7. Runner 1-3: przegraj (reset od początku, prędkość startowa) i wygraj; w 2-3 ślizgiem pod Machaczem; po runnerze walka z Samumem startuje poprawnie.
8. Arena 2-2: tarcza Ciernia odbija zwykłe strzały; 3 kryształy zbijają tarczę na 8 s; magiczna (`Z`) przebija tarczę; zgiń w arenie — restart w arenie, HP smoka zachowane; odczekaj do timera — smok ucieka, pułapki `!` w poziomie aktywują się, wyjście dostępne, BOSS pozostaje zablokowany.
9. `P` pauzuje w platformówce, runnerze i arenie; Ctrl+C w trakcie gry — terminal czysty, `save.json` istnieje; restart wczytuje postęp; `--ascii` uruchamia grę w czystym ASCII bez crasha.
10. Zwęź okno poniżej 80×24 w trakcie gry — komunikat zamiast crasha, po powiększeniu gra wraca; doprowadź kamerę do prawej krawędzi ostatniej kolumny mapy — brak crasha w rogu ekranu.

---

## 13. KRYTERIA AKCEPTACJI

- `python3 game.py` startuje na czystym macOS (bez `pip install`) i dochodzi do menu w < 2 s.
- Cała kampania 1-1 → BOSS przechodnia obiema bohaterkami na Normalnym.
- Wszystkie elementy z opisu córki obecne i działające: kryształy→pokonywanie smoków, smoki na różnych etapach poziomów, kaktusy i pułapki (−1 życie + reset), wybór nastolatki/dorosłej pani, kradzieże z plecaka (placek/strzały/diamenty), ucieczka małpy, ucieczka smoka + pułapki, styl dino-Chrome (runnery) i Mario (platformówka).
- Checklista z sekcji 12 zaliczona w całości.
- Zero traceback​ów w całej sesji gry; wyjście zawsze zostawia czysty terminal.

## 14. BACKLOG v1.1 (poza zakresem one-shot)

- Power-upy Buty szybkości i Piórko (podwójny skok); Duża kieszeń (+sloty plecaka).
- Kamyki Echo w walce (auto-atak co 10 s).
- Tryb nieskończonego runnera z rekordami (odblokowany po finale).
- Sekretne poziomy bonusowe; skórki bohaterek.

---

## ZAŁĄCZNIK A — GOTOWE TEKSTY (PL, wiążące)

### Intro (ekran po NOWA GRA, maks. 6 linijek)

```
Smocza Wyspa. Każdy smok miał kryształowe serce.
Jednej nocy Szop Vabank ukradł WSZYSTKIE.
Ale niósł je w dziurawym worku...
Smoki bez serc wpadły w zły czar.
Kryształy ładują twoje neonowe strzały.
Zasada łowczyń: łowimy czar, nie smoki. Do roboty.
```

### Przejścia między światami

Po 1-3: `Samum kołuje nad wydmami. Eskadra rośnie.` / `Przed wami Dżungla Ech — teren Echo. I złodziei.` / `Vega: „Pilnuj plecaka. Mówię poważnie."`

Po 2-3: `Monsun pokazał tajne wejście do wulkanu.` / `Wszystkie smocze serca leżą w skarbcu Vabanka.` / `Tosia: „To idziemy po wszystkie."`

### Finał (po pokonaniu Obsydiana)

```
Obsydian otwiera oczy. Czar pękł.
Wszystkie serca wróciły. Smocza Eskadra w komplecie.
Vabank? Dostał placek i etat: skarbnik wyspy.
Pod okiem sześciu smoków. Powodzenia, Vabank.
Vega: „Masz swoją ksywę, mała. STRZAŁA."
Misja wykonana. Wyspa jest wasza.
```

### Wprowadzenia do poziomów (1 zdanie, na starcie poziomu)

1-1 `Trening łowczyń: zbierz kryształy i nie dotknij kaktusa.` · 1-2 `Złodzieje idą po twój placek — a na końcu kanionu czeka smok Miraż.` · 1-3 `Samum ucieka i sieje pułapki — doganiaj!` · 2-1 `Mosty z lian się zapadają — Echo zna skróty.` · 2-2 `Ukradli placek i Echo zniknęła — odbij łup i ściągnij ją z powrotem.` · 2-3 `Monsun rusza w pogoń — biegnij, potem walcz!` · 3-1 `Jaskinie pełne kryształów — gejzery parzą, kaktusy lawowe kłują.` · 3-2 `Skarbiec Vabanka: odbij skarby i uwolnij Pirę.` · 3-3 `Lawa idzie w górę — sprint na sam szczyt!` · BOSS `Obsydian, Król Smoków — zdejmij czar i zakończ misję.`

### Komunikaty przegranej (losowane; nagłówek + linia)

- `WSTAWAJ.` / `Łowczynie nie odpuszczają.`
- `KAKTUS: 1, TY: 0` / `Wyrównaj.`
- `ZNASZ JUŻ TRASĘ.` / `Teraz ją przebiegnij.`

### Komunikaty wygranej poziomu

`Czar zdjęty. Smok dołącza do Eskadry.` · `Poziom zaliczony. Plecak pełny.` · `Czysta robota, łowczyni.`

### Komunikaty zdarzeń (linia 29)

`$ Złodziej z twoim plackiem! Za nim!` · `ω Echo zniknęła. Ściągnie ją tylko placek.` · `Smok ucieka i sieje pułapki — pościg!` · `⊙ Kawałek Legendarnego Placka: +1 życie.` · `»M Strzały naładowane. Neon w górę.` · `SMOK ZARAZ UCIEKNIE!` · `Brama wymaga 10 kryształów.`

### Docinki Vabanka (zmiana fazy bossa)

Faza 2: `Vabank: „Serio? Łuk? Ja mam SMOKA."` · Faza 3: `Vabank: „Dobra, teraz się zdenerwował."` · Po walce: `Vabank: „...nikt mi nigdy nic nie dał. — To masz placek."`

### Game over

Nagłówek: `ALE AKCJA!` · `Smok już wie, że po niego idziesz.` · przycisk: `↺ JESZCZE RAZ`

---

## ZAŁĄCZNIK B — Rozstrzygnięcia redakcyjne

Konflikty między sekcjami roboczymi czterech projektantów rozstrzygnięto następująco (dla przejrzystości przy przyszłych zmianach):

1. **Nazewnictwo**: kanon z fabuły v2 (Tosia, Vega, Echo, Vabank, Miraż/Samum/Cierń/Monsun/Pira/Obsydian, Pustynia Miraży/Dżungla Ech/Obsydianowa Góra). Robocze nazwy z innych sekcji (Iga/Maja, „SMOCZY SKARB", „Zielona Łąka", Figa/Chapczap) — nieobowiązujące.
2. **Układ poziomów**: scalono strukturę mechaniki (platforma/runner/arena) ze story beatami — smoki-strażnicy w X-2, pościgi w X-3 (1-3, 2-3), czysty runner 3-3. Pięć smoków + boss zamiast trzech.
3. **Znaki**: unicode single-width z testem `wcwidth` i fallbackiem `--ascii` (projekt UI) wygrał z „tylko ASCII w polu gry" (mechanika) — tabela 9.1 jest zamknięta i przetestowana na szerokość 1.
4. **Statystyki fizyki bohaterek**: liczby z sekcji mechaniki (spójne z regułami projektowania map); obrażenia strzał zróżnicowane per bohaterka (z projektu postaci).
5. **Kradzież**: deterministyczny priorytet łupu zamiast procentowej szansy obrony; ochrona plecaka Vegi = twardy limit (maks. 1 strzała), nie rzut kością. Kryształy nigdy nie są kradzione (ochrona postępu).
6. **Diamenty**: +1 życie co 5 sztuk (zamiast 100 — w całej grze jest ich ~18).
7. **Power-upy**: Tarcza i Magnes w v1.0; Buty i Piórko w backlogu (ochrona zakresu one-shot).
8. **HP smoków i model walki**: arena z tarczą/checkpointem/timerem ucieczki (mechanika) + telegrafy, fazy i flavor (postacie); HP wg tabeli trudności 8.7.
