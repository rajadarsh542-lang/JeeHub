# Question bank recovery — 20 November 2026

## Verified state before recovery

- Production: https://jee-practice-web.vercel.app/
- Repository: https://github.com/rajadarsh542-lang/JeeHub
- Maintained branch: `jee-practice-bank`; remote HEAD was `b24b130484418f01c82ac4e3bd99115b67825c2a`.
- Live website uses data commit `2c1a88262cac731b253f182c50a0fa4867261e6e` and `textOnly: true`.
- Browser checks confirmed JEE Advanced results, subject-specific Physics chapter/topic choices, and date/year/batch/paper filters. Selecting JEE Advanced, 2026, Paper 2 and Physics returned 18 records.
- The Mac checkout at `/Users/adarshraj/JEE_APP/jee-practice-web` was not accessed or modified.

## Prepared recovery

- Local data commit: `b3a96e2a8d74eb8d6fbc8cf24fde5641790f0cd9`.
- Added 22 media packs, seven licensed-figure index/pack files and four PDFs: 106,002,209 bytes, plus the complete manifest and verification files.
- Every pre-existing bank file is byte-identical except `bank/manifest.json`, which now includes the recovered assets.
- The reader's release configuration now points to that data commit with `textOnly: false`.
- Read `bank-verification.json` for exact counts and checksums. README includes setup, deployment, and safe Mac continuation instructions.

## Verification

- Full offline bank verification passed: all 26 pack hashes, all 7,171 archive asset hashes (7,170 figures and one font), all 290 licensed figure hashes, question/catalog references, and PDF signatures.
- Existing automated tests: 19/19 passed without paid provider calls.
- Production build passed with the completed release configuration.
- Browser preview used the same reader and bank files, with the bank URL temporarily resolving to local files because the new data commit is not public yet. This does not verify delivery of the new files from GitHub.
- Preview: recovered Chemistry and JEE Advanced Physics diagrams decoded into loaded local Blob images; expected MCQ answers scored Correct.
- Numerical range example rejected 1.44 and accepted 1.450.
- Multiple-choice example accepted both recorded answers together.
- JEE Advanced 2024 filters exposed links to both supplemental PDFs.

## Remaining boundaries

- Publishing the media/PDF payload was rejected by automatic approval review: explicit approval to publish these recovered files to the public GitHub repository is required. No workaround or alternate publication was attempted. The remote remained at `b24b130` after rejection.
- Vercel connection was confirmed by the user during recovery. Its methods were not yet exposed in the active tool registry, so account settings have not been inspected. Deployment must use the existing project and wait until the data commit is published. Do not deploy the new pin while it is unavailable remotely.
- The archive is not a complete, independently corrected JEE corpus: 987 known overlaps remain, 29 records have missing question/option figure warnings, and 5,149 records have worked-solution figure warnings. The latter counts existing warnings; it does not mean every such solution is unusable. Preserve them for targeted content cleanup.
- JEE Advanced 2024 and IIT-JEE 2007 are supplemental PDF papers, not indexed question sets.
- The tutor API is present and tested with mocks; live authenticated tutoring/database/provider setup is not verified or enabled by this bank recovery.

## Authorized continuation after explicit publication approval

1. Check that the remote branch is still at the expected HEAD; reconcile any new work without overwriting it.
2. Publish the two prepared local commits to `jee-practice-bank` without force.
3. Verify remote commit/tree and fetch representative manifest/media content from the pinned data commit.
4. Inspect the connected Vercel project. Retain the production domain; use branch `jee-practice-bank`, project Root Directory `web`, Node 24, `npm ci`, `npm run build`.
5. Deploy only after the immutable data pin resolves. Verify production release configuration, an image question, answer checking, subject filters, date/batch/paper filters, and PDF links.
