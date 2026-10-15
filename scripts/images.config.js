// Lista zdjęć publikowanych na stronie: plik źródłowy (względem input_data/,
// katalogu z materiałami od klientki - poza repo), kadr i opis alternatywny.
// `npm run images` przetwarza je do public/images/photos i zapisuje
// lib/imageManifest.json, z którego korzysta helper `img()` w widokach.
//
// Kadr: `aspect` ('4:5', '3:2', ...) wycina z pełnej klatki prostokąt o zadanych
// proporcjach, `focusX`/`focusY` (0-1) wskazują środek kadru. `region`
// (left/top/width/height w pikselach źródła) wycina wprost - dla produktów
// wyciętych z jednego zdjęcia.

const PL = 'fot. Paweł Lęcki';

module.exports = [
  // --- Karina / pracownia ---
  {
    key: 'karina-portret', og: true,
    src: 'zdjęcia/JA/2018-12-29 09.45.57 1.jpg',
    aspect: '4:5',
    focusX: 0.66,
    alt: 'Karina Lewandowska pochylona nad pracą',
  },
  {
    key: 'karina-profil',
    src: 'zdjęcia/JA/2018-12-29 09.39.04 1.jpg',
    aspect: '4:5',
    focusX: 0.6,
    alt: 'Karina Lewandowska z profilu',
  },
  {
    key: 'karina-ramka',
    src: 'zdjęcia/JA/PSX_20190120_212241 copy.jpg',
    alt: 'Karina zasłania twarz oprawioną grafiką z pracy dyplomowej',
    credit: PL,
  },
  {
    key: 'nozyczki',
    src: 'zdjęcia/MIX/2018-12-29 09.44.44 1 copy.jpg',
    alt: 'Dłonie przycinające arkusz papieru nożycami introligatorskimi',
  },

  // --- Sklep: notesy w oprawie półpłóciennej z papierem marmurkowym ---
  {
    key: 'notesy-marmurkowe', og: true,
    src: 'zdjęcia/MIX/WhatsApp Image 2026-03-03 at 19.51.24.jpeg',
    alt: 'Trzy notesy w oprawie półpłóciennej z papierem marmurkowym na stole w pracowni',
  },
  {
    key: 'notes-granat', og: true,
    src: 'zdjęcia/MIX/WhatsApp Image 2026-03-03 at 19.51.24.jpeg',
    region: { left: 540, top: 250, width: 640, height: 800 },
    alt: 'Notes z czerwonym płóciennym grzbietem i granatowo-czerwonym papierem marmurkowym',
  },
  {
    key: 'notes-zolty', og: true,
    src: 'zdjęcia/MIX/WhatsApp Image 2026-03-03 at 19.51.24.jpeg',
    region: { left: 900, top: 220, width: 720, height: 900 },
    alt: 'Notes z żółtym płóciennym grzbietem i szaro-żółtym papierem marmurkowym',
  },
  {
    key: 'notes-bordo', og: true,
    src: 'zdjęcia/MIX/WhatsApp Image 2026-03-03 at 19.51.24.jpeg',
    region: { left: 140, top: 430, width: 740, height: 925 },
    alt: 'Notes z bordowym płóciennym grzbietem i różowo-szarym papierem marmurkowym',
  },

  // --- Książki dyplomowe (2018), wystawa „Najlepsze dyplomy 2018” ---
  { key: 'dyplom-ciecia', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_191749.jpg', alt: 'Ażurowe karty książki dyplomowej rzucające cień', credit: PL },
  { key: 'dyplom-harmonijka', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_192238.jpg', alt: 'Rozłożona harmonijkowo książka z wycinanymi kartami', credit: PL },
  { key: 'dyplom-lektura', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_212719.jpg', alt: 'Dłoń trzymająca otwartą książkę z wycinanymi kartami', credit: PL },
  { key: 'dyplom-ekspozycja', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_210712.jpg', alt: 'Książka dyplomowa na stole wystawowym', credit: PL },
  { key: 'dyplom-stojak', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_184731.jpg', alt: 'Książka-obiekt rozpięta na metalowym stojaku', credit: PL },
  { key: 'dyplom-pudlo', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_182508.jpg', alt: 'Dłonie przeglądające karty w czarnym pudle', credit: PL },
  { key: 'dyplom-stol', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_184440.jpg', alt: 'Obiekty z cyklu dyplomowego rozłożone na stole', credit: PL },
  { key: 'dyplom-faktura', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_211930.jpg', alt: 'Oprawiona faktura obok ażurowej książki', credit: PL },
  { key: 'dyplom-rekawiczka', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_182742.jpg', alt: 'Biała rękawiczka archiwisty obok obiektu', credit: PL },
  { key: 'dyplom-zbrojownia', src: 'zdjęcia/Dyplom Książka Artystyczna/PSX_20190120_212046.jpg', alt: 'Ekspozycja książki dyplomowej w Wielkiej Zbrojowni w Gdańsku', credit: PL },

  // --- Warsztaty ---
  { key: 'warsztaty-pomiar', og: true, src: 'zdjęcia/WARSZTATY/GDD25_Janek_25062025_web_109 copy.JPG', alt: 'Uczestniczka warsztatów mierzy grzbiet szytego bloku' },
  { key: 'warsztaty-szycie', src: 'zdjęcia/WARSZTATY/GDD25_Janek_25062025_web_108.JPG', alt: 'Dłonie z linijką przy bloku książki w prasie' },
  { key: 'warsztaty-klejenie', src: 'zdjęcia/WARSZTATY/GDD25_Janek_25062025_web_112 copy.JPG', alt: 'Uczestniczka smaruje klejem grzbiet bloku w drewnianej prasie' },
  { key: 'warsztaty-prasa-stol', src: 'zdjęcia/WARSZTATY/GDD25_Janek_25062025_web_117 copy.JPG', alt: 'Drewniana prasa introligatorska z blokiem na stole warsztatowym' },
  { key: 'warsztaty-prasa', src: 'zdjęcia/WARSZTATY/FB_IMG_1575627587721.jpg', alt: 'Dłoń dokręcająca śrubę prasy introligatorskiej' },
  { key: 'warsztaty-prelekcja', src: 'zdjęcia/WARSZTATY/FB_IMG_1575627596032.jpg', alt: 'Karina prowadzi prelekcję o historii książki' },
  { key: 'warsztaty-sala', src: 'zdjęcia/WARSZTATY/FB_IMG_1575627583402.jpg', alt: 'Uczestnicy warsztatów przy wspólnym stole, slajd o książce w Chinach, Japonii i Indiach' },
  { key: 'warsztaty-praca', src: 'zdjęcia/WARSZTATY/FB_IMG_1575627669493.jpg', alt: 'Karina składa okładkę na macie do cięcia' },
  { key: 'warsztaty-wspolnie', src: 'zdjęcia/WARSZTATY/79152076_485677085403735_5983888658879479808_n.jpg', alt: 'Dwie osoby wspólnie oprawiają książkę' },
];
