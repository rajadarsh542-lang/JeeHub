# JEE Practice question bank

The maintained practice application and data are on **jee-practice-bank**, not main.
The Next.js application is in `web/`; the question bank is in `bank/`.

| Material | Count |
| --- | ---: |
| Archive question records | 23,064 |
| Paper sets | 268 |
| JEE Main archive records | 12,720 |
| JEE Advanced archive records | 1,457 |
| Older IIT-JEE archive records | 600 |
| Additional practice records | 2,319 |
| Archive figures | 7,170 |
| Additional practice figures | 290 |
| Supplemental PDFs | 4 |

The archive also contains other entrance exams. These counts are records, not a claim of complete JEE coverage or independently verified answers. There are 987 linked overlaps between archive versions (22,077 canonical archive questions). Of the archive records, 22,947 have automatically gradeable keys; 29 retain missing-figure warnings from the underlying archive. Another 5,149 archive records retain warnings about missing worked-solution figures. Preserve all editorial and answer-key warnings. JEE Advanced 2024 and IIT-JEE 2007 are available as supplemental PDFs, not individually indexed questions.

## Run and verify

Use Node 24 and Python 3. From the repository root:

```sh
python3 scripts/verify_bank.py
cd web
npm ci
npm test
npm run build
npm run dev
```

The Python verifier checks every pack and figure checksum, paper/catalog ID correspondence, figure references, additional practice figures, and supplemental PDF signatures. `docs/bank-verification.json` records the recovered snapshot's results.

The reader uses an immutable Git commit in `web/public/assets/bank-release.json`. Publish that data commit before deploying its reader. A release with `textOnly: false` enables saved figures and supplemental PDFs. Student question content loads from this repository; there is no dependency on a third-party question website at runtime. Required software and content notices remain in `bank/NOTICES.txt` and `bank/notices/`.

## Deploy the existing Vercel project

Connect the existing **jee-practice-web** Vercel project to this repository, select production branch **jee-practice-bank**, and set Root Directory to **web**. Use Next.js, Node 24, install command `npm ci`, and build command `npm run build`. Keep the existing production domain. Alternatively deploy the `web/` directory with the Vercel CLI after linking it to that same project.

The guest bank does not require provider keys. The separate tutor API is only scaffolding for authenticated, quota-controlled use and requires its own database, verified solutions, and provider configuration. It is not enabled by publishing the question bank.

## Continue safely from the Mac

The existing folder `/Users/adarshraj/JEE_APP/jee-practice-web` may have uncommitted work. Do not overwrite it or run a hard reset. After the release is published, use a separate checkout:

```sh
cd /Users/adarshraj/JEE_APP
# Use a new destination if JeeHub-complete already exists.
git clone --branch jee-practice-bank --single-branch https://github.com/rajadarsh542-lang/JeeHub.git JeeHub-complete
cd JeeHub-complete
python3 scripts/verify_bank.py
cd web
npm ci
npm test
npm run build
```

## Data format

`bank/catalog/index.json` lists papers, dates, sessions, shifts and batches. `bank/catalog/search.json` holds the searchable question metadata. Each paper has a corresponding `bank/catalog/papers/<id>.json` file. `bank/manifest.json` maps paper IDs to gzip members inside the four `questions-*.bin` packs and maps figure IDs to byte ranges in the 22 `media-*.bin` packs. Each member and whole pack is checksum-verified by the reader. Hosts without byte-range support use the full verified pack. Additional practice content uses `bank/questions.json`, `bank/licensed/`, and `bank/licensed/figures/`.
