# CNC CUT PRO

Lokalna desktop PWA na srpskom jeziku za pripremu CNC sečenja, kalkulacije, ponude, proizvodnju i evidenciju materijala.

## Pokretanje na Windows-u

U PowerShell-u, iz foldera projekta:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run preview
```

Otvorite [CNC CUT PRO na localhost-u](http://localhost:4173/) u običnom Chrome prozoru. Kliknite na ikonu instalacije u adresnoj traci ili iz menija sa tri tačke izaberite **Prebaci, sačuvaj i deli → Instaliraj stranicu kao aplikaciju**. Nazivi menija zavise od jezika Chrome-a. Posle instalacije potražite **CNC CUT PRO** u Windows Start meniju. [Chrome uputstvo za instalaciju](https://support.google.com/chrome/answer/9658361?hl=en)

Prvo otvaranje priprema lokalnu bazu i preuzima resurse u Chrome keš. Za offline rad koristite produkcioni build i istu adresu, port i Chrome profil. Adrese `localhost` i `127.0.0.1` imaju odvojene baze. **Podešavanja → Instalacija i rezervna kopija** sadrži uvoz, izvoz i zahtev za trajno čuvanje podataka. Uvoz kopije zamenjuje postojeću lokalnu bazu uz potvrdu.

## Tok rada

1. Dodajte kupca i posao, uvezite DXF fajlove ili izaberite modele iz biblioteke. Potvrdite jedinicu kod crteža sa nedefinisanim jedinicama.
2. Podesite tablu, marginu, razmak, rotacije i izvor materijala. Pokrenite optimizaciju. Svaka tabla ima svoj prikaz i DXF izvoz.
3. Po potrebi ručno pomerite ili rotirajte deo, zaključajte ga i sačuvajte raspored. Za pomeranje pogleda prevucite praznu površinu ili držite Alt preko dela.
4. U kalkulaciji proverite cenovnik, stvarnu količinu, sečenje, broj probijanja, maržu, popust i PDV. Kreirajte ponudu i preuzmite PDF. Sačuvane ponude mogu ponovo da se otvore.
5. Dodelite mašinu i radnika u radnom nalogu. Rezervišite materijal iz rasporeda i potvrdite utrošak nakon proizvodne operacije. Probni nesting ne menja stanje.

Početna baza ima 20 DXF modela, 15 kupaca, 22 posla i 12 ponuda. DXF i SVG fajlovi biblioteke su u `public/models`. SVG prikazi nastaju iz geometrije DXF kontura. U interfejsu se prikazi iscrtavaju iz lokalne geometrije.

## Projektovanje ograda

Otvorite **Projektovanje ograda → Novi projekat**. Uredite svetle otvore i visine, umetnite međustub ili kapiju i dodelite ispunu svakom panelu ili krilu. **Promeni dužinu** prikazuje preraspodelu pre potvrde. Kapije i zaključani segmenti zadržavaju svoje mere. Izaberite **Generiši DXF za sečenje**, pregledajte konture i količine, pa izaberite **Pošalji u nesting**. Odredište je novi posao ili pripremni posao istog kupca, materijala i debljine. Projekti i proizvodni DXF ulaze u lokalnu rezervnu kopiju.

Iz ALU Tim 012 prilagođeni su raspored deljenih stubova i razdvajanje osa od svetlih otvora iz `domain/geometry/layout.ts`, očuvanje otvora i ograničena preraspodela iz `operations.ts`, raspored ponovljenih elemenata iz `infill.ts`, kao i izbor elemenata, kote i fit prikaz iz `FrontView.tsx` i `EditorCanvas.tsx`. CNC CUT PRO dodaje sopstveni model panela, proveru DXF-a i postojeću IndexedDB transakciju za čuvanje projekta i povezivanje posla.

**Popuni ponavljanjem otvora** je podrazumevani režim za šablone sa jednom spoljnom konturom i zatvorenim otvorima. Prilagođava obod meri lima i raspoređuje cele otvore iz DXF-a uz očuvanje oblika i veličine. Stariji izbori šablona sa različitim merama automatski koriste isti režim. Fiksna mera se može izričito izabrati. Proporcionalni režim zadržava odnos stranica, centrira panel u raspoloživom prostoru i traži potvrdu. Parametarski režim podržava OG-001, OG-002, OG-003, OG-006, OG-007 i OG-013 sa podesivim otvorom, obodom i mostom. U DXF za sečenje ulazi samo limena ispuna. Stubovi i ramovi ostaju na konstrukcionom prikazu i u merama za kalkulaciju. Proizvodne uslove i najmanje bezbedne mostove treba proveriti u CAM postupku za konkretan materijal i mašinu.

## Geometrija i optimizacija

ASCII DXF parser koristi [dxf-parser](https://github.com/ehtick/dxf-parser) pod MIT licencom. Podržani su `LINE`, `LWPOLYLINE`, 2D `POLYLINE`, `CIRCLE`, `ARC`, `ELLIPSE` i neracionalni planarni `SPLINE` stepena 1–3 sa čvorovima i kontrolnim tačkama. Krive se poligonizuju sa tolerancijom iz podešavanja. Neophodna je konverzija za blokove, binarni DXF, nepodržane entitete i geometriju van XY ravni. [Autodesk DXF referenca za spline](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm)

Nesting je originalna deterministička heuristika u Web Worker-u. Kombinuje više redosleda delova, položaje izvedene iz ivica ograničavajućih pravougaonika i uzorkovane parove temena spoljašnjih kontura. Svaki položaj proverava presek, sadržavanje i minimalnu udaljenost između stvarnih kontura, dozvoljene uglove i granice zalihe. Prednost imaju potpuno raspoređeni rezultati, zatim manji broj tabli i manji otpad. [MIT licenca modula](src/geometry/LICENSE)

Deepnest Next je razmotren. Njegova ključna NFP komponenta koristi nativni Node modul, pa je za ovaj offline Chrome projekat izabrana implementacija u TypeScript-u. [Deepnest Next](https://github.com/deepnest-next/deepnest/blob/main/README.md)

Heuristika može propustiti bolji raspored u okviru zadanog vremena. Položaji unutar otvora su konzervativno blokirani. Trenutna verzija računa jedan posao po rasporedu, sa najviše 500 komada po optimizaciji. Podaci su vezani za jedan Chrome profil. Pre fizičkog sečenja operater treba da potvrdi širinu reza, mostove, kompenzaciju i tehnološke parametre u svom CAM postupku.

## Provere

```powershell
npm.cmd run catalog
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Playwright koristi instalirani Google Chrome. Testovi proveravaju tok od kupca do utroška, vraćanje kopije, Kanban, instalabilnost PWA i rad bez mreže. Snimci pet ključnih ekrana čuvaju se u `test-results/screenshots` za četiri zadate rezolucije i za 1448 × 1086. `python scripts/compare.py` pravi poređenja sa priloženim referencama kada su originalne slike u Windows folderu Downloads.


## Prijem terenskih merenja

U odeljku **Projektovanje ograda → Terenska merenja** uvezite JSON paket CNC CUT FIELD. Otvorite fotografije, napomene i mere, pa po potrebi kreirajte projekat ograde ili krilne kapije. Stepeništa, klizne kapije, različite kote i nesimetrični zazori dostupni su kao podloga za ručnu pripremu. Izmena uvezene revizije ne zamenjuje raniji proizvodni projekat.

Kancelarijski prijem preko Supabase-a je dostupan posle podešavanja `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY` u `.env.local` i ponovnog build-a. Koristite SQL migraciju iz CNC CUT FIELD i nalog pripreme proizvodnje ili administratora. Sadržaj koji otvorite iz kancelarijskog prijema sačuvan je u lokalnoj CNC CUT PRO bazi i ulazi u rezervnu kopiju.
