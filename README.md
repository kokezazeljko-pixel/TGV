# Train Punctuality – kašnjenja TGV vozova i utisci putnika

Sajt koji pokazuje koliko kasne TGV vozovi u Francuskoj (INOUI, OUIGO, Lyria) i gde putnici iz voza ostavljaju komentar: zašto voz kasni i kakav je utisak o liniji.

## Kako je projekat složen

```
SNCF otvoreni podaci ──► skripte u ingest/ (GitHub Actions, na 5 min) ──► Supabase baza ◄── sajt (Next.js na Vercelu)
                                                                               ▲
                                                               putnici pišu komentare
```

| Deo | Šta radi | Gde živi | Cena |
|---|---|---|---|
| `app/`, `components/`, `lib/` | Sajt: tabla polazaka, stranica voza, komentari, prijava | Vercel | besplatno |
| `supabase/schema.sql` | Baza: vozovi, komentari, profili, pravila pristupa | Supabase | besplatno |
| `ingest/` | Preuzima red vožnje i kašnjenja od SNCF-a | GitHub Actions | besplatno (javni repo) |

Biće ti potrebni nalozi (svi besplatni): **GitHub**, **Supabase**, **Vercel**. Na računaru treba **Node.js 20 ili noviji** (nodejs.org).

---

## Korak 1 – Supabase baza

1. Na [supabase.com](https://supabase.com) napravi nalog i klikni **New project**. Za region izaberi **Central EU (Frankfurt)** ili **West EU (Paris)**. Zapiši lozinku baze.
2. Kad se projekat napravi, otvori **SQL Editor → New query**.
3. Otvori fajl `supabase/schema.sql`, kopiraj ceo sadržaj, nalepi ga i klikni **Run**. Treba da piše „Success“.
4. Otvori **Authentication → Sign In / Providers** i proveri da je **Email** uključen (podrazumevano jeste).

> Supabase-ov „Security Advisor“ može da prijavi upozorenje za pogled `comments_feed` („security definer view“). To je namerno: taj pogled skriva ko je napisao anonimne komentare, a ostale podatke iz tabele `comments` vidi samo autor.

## Korak 2 – Ključevi

U Supabase-u otvori **Project Settings → API Keys** (ili **Data API**). Trebaju ti tri stvari:

| Vrednost | Gde je koristiš | Tajna? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | sajt i skripte | ne |
| **anon / publishable** ključ | sajt | ne, sme da bude javan |
| **service_role / secret** ključ | samo skripte (GitHub) | **DA – nikome ga ne daj i ne stavljaj u kod** |

Za probu na svom računaru: kopiraj `.env.example` u novi fajl `.env.local` i upiši vrednosti.

## Korak 3 – Kod na GitHub

1. Na GitHubu napravi **novi javni (Public) repozitorijum**, npr. `peron`.
   Javni zato što su GitHub Actions za javne repozitorijume besplatni bez ograničenja. Kod je javan, ali ključevi nisu, jer idu u „Secrets“.
2. Ubaci sve fajlove iz ovog foldera u repozitorijum. Najlakše preko **GitHub Desktop** aplikacije, ili iz terminala:
   ```bash
   git init
   git add .
   git commit -m "Prvi commit"
   git branch -M main
   git remote add origin https://github.com/TVOJE-IME/peron.git
   git push -u origin main
   ```
   Fajl `.env.local` se automatski preskače (naveden je u `.gitignore`), pa ključevi ne odlaze na GitHub.

## Korak 4 – Automatsko preuzimanje SNCF podataka

1. U repozitorijumu na GitHubu otvori **Settings → Secrets and variables → Actions → New repository secret** i dodaj dve tajne:
   - `SUPABASE_URL` = tvoj Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role / secret ključ
2. Otvori karticu **Actions**. Ako GitHub pita, klikni **I understand my workflows, go ahead and enable them**.

Fajl `.github/workflows/sync.yml` pokreće dve skripte:

- **Red vožnje** (`ingest/sync-schedule.mjs`), jednom dnevno. Preuzima SNCF GTFS fajl i upisuje sve TGV vozove za danas i sutra, sa stanicama i vremenima.
- **Kašnjenja** (`ingest/sync-realtime.mjs`), na svakih 5 minuta. Čita SNCF GTFS-RT feed i upisuje kašnjenje po stanicama i otkazane vozove.

## Korak 5 – Prvo pokretanje (važno)

Red vožnje se sam pokreće tek noću, pa ga prvi put pokreni ručno:

1. **Actions → SNCF podaci → Run workflow**, izaberi **oba** i klikni **Run workflow**.
2. Kad se završi (2–5 minuta), otvori pokretanje i pogledaj ispis koraka **red-voznje**. Treba da vidiš nešto ovako:
   ```
   Prepoznate vrste vozova: { 'TGV INOUI': 612, OUIGO: 98, 'TGV Lyria': 34, TER: 6890, ... }
   Vozova za upis: 1488
   ```
   Brojevi će biti drugačiji, ali **TGV INOUI, OUIGO i TGV Lyria ne smeju biti 0**. Ako jesu, pošalji mi taj ispis i podesiću prepoznavanje vozova (`detectType` u `ingest/lib/util.mjs`).
3. U koraku **kasnjenja** proveri red `Prepoznato TGV vozova u feedu: N`. Danju bi N trebalo da bude nekoliko stotina.
4. U Supabase-u, u **Table Editor → trains**, sada vidiš vozove.

> Skripte su testirane na probnim podacima (`npm run test:ingest`), ali ne i na pravom SNCF feedu, jer mu nisam mogao pristupiti iz svog okruženja. Zato je ovaj korak prava provera.

## Korak 6 – Sajt na internetu (Vercel)

1. Na [vercel.com](https://vercel.com) se prijavi preko GitHub naloga i klikni **Add New → Project**, pa izaberi repozitorijum `peron`.
2. Pre klika na **Deploy** otvori **Environment Variables** i dodaj:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon / publishable ključ
   (service ključ **ne** ide ovde)
3. Klikni **Deploy**. Za minut-dva dobijaš adresu, npr. `https://peron.vercel.app`.
4. Vrati se u Supabase: **Authentication → URL Configuration**.
   - **Site URL**: tvoja Vercel adresa
   - **Redirect URLs**: dodaj `https://peron.vercel.app/**` i `http://localhost:3000/**`

   Bez ovoga link za prijavu iz emaila neće raditi.

Svaki put kad pošalješ izmene na GitHub (`git push`), Vercel sam objavi novu verziju.

## Pokretanje na svom računaru

```bash
npm install          # jednom, instalira pakete
npm run dev          # sajt na http://localhost:3000
npm run test:ingest  # test skripti na probnim podacima (potreban i Python 3)
```

Skripte možeš pokrenuti i ručno. Prvo u terminalu postavi `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`, pa:

```bash
npm run sync:schedule
npm run sync:realtime
```

## Mapa fajlova

```
app/
  page.js            tabla polazaka (početna)
  voz/[id]/page.js   stranica jednog voza
  prijava/page.js    prijava emailom i promena imena
  layout.js          zaglavlje, fontovi
  globals.css        ceo izgled sajta
components/
  Board.js           filteri, pretraga, lista vozova
  TrainDetail.js     kašnjenje, stanice, razlozi, forma i lista komentara
  Header.js          logo, sat, link za prijavu
lib/
  format.js          vreme, statusi, lista razloga kašnjenja
  queries.js         upiti prema bazi
  supabase.js        povezivanje sa Supabase-om
ingest/
  sync-schedule.mjs  red vožnje → baza
  sync-realtime.mjs  kašnjenja → baza
  lib/               čitanje ZIP/CSV/GTFS-RT bez dodatnih paketa
  test/              probni podaci i test
supabase/schema.sql  tabele i pravila pristupa
```

## Česta pitanja

**Kako da promenim listu razloga kašnjenja?** U `lib/format.js`, niz `REASONS`.

**Kako da dodam Eurostar ili ICE?** U `.github/workflows/sync.yml` ukloni `#` ispred reda `TRAIN_TYPES` i upiši vrste koje želiš. Na sajtu ih dodaj i u `TRAIN_TYPES` u `lib/format.js`, da se pojave kao filteri.

**GitHub kaže da su zakazani poslovi isključeni?** GitHub gasi zakazane poslove ako u repozitorijumu nema aktivnosti 60 dana. Uključuješ ih jednim klikom u kartici Actions.

**Koliko košta?** Ništa, dok je sajt mali. Supabase-ov besplatni plan ima 500 MB baze. Besplatni projekat se pauzira posle 7 dana bez ikakve aktivnosti, ali skripta koja piše na 5 minuta ga drži aktivnim.

## Sledeći koraci

1. **Moderacija**: dugme „Prijavi komentar“ i stranica za brisanje neprikladnih komentara.
2. **Zvanični razlozi kašnjenja**: SNCF ima i feed sa obaveštenjima (`sncf-gtfs-rt-service-alerts`), pa uz kašnjenje može da stoji i zvanično objašnjenje.
3. **Mobilna aplikacija**: React Native (Expo) koristi istu Supabase bazu, pa se tabela, komentari i prijava ne prave ponovo.
4. **Jezici**: francuski i engleski, jer su putnici u TGV-u uglavnom odatle.

Izvori podataka: [SNCF GTFS-RT (transport.data.gouv.fr)](https://transport.data.gouv.fr/resources/83583), [Horaires SNCF (data.gouv.fr)](https://www.data.gouv.fr/datasets/horaires-sncf). Podaci su pod otvorenom licencom; na sajtu navedi SNCF kao izvor (već piše ispod pregleda).
