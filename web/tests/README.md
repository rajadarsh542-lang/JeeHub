# Part 5 interface review

Scope: F01 accessible archive math (partial), F02 changed-answer feedback.
No bank data, keys, data pin, production settings, F03–F05 or tutor behavior changes.

## Automated checks

Use Node 24. From `web/`:

```sh
npm ci
npm test
npm run build
```

`npm test` includes the 19 existing tutor tests and 22 interface tests.
`npm run test:interface` runs just the latter. These use jsdom and the
dom-accessibility-api accessible-name algorithm, **not a real browser or screen
reader**. The harness evaluates the production rendering functions, stubs only
data retrieval/hydration and holds catalog bootstrap pending. Fixtures exercise
all three answer types on both rendering paths. The four named bank records
are read from the actual local gzip packs, without changing their answers.

Baseline reproduction and visual-markup invariance tests read original source
with `git show d078778fea8f1d2488ad57ba0b6a34db6cf9602e:...`; keep that commit
available. They establish the original stale feedback and letter-only option
names, then compare the unchanged visual DOM, SVG geometry and solution markup.
This does **not** establish pixel equivalence or browser accessibility support.

## Local browser checks still required

Start the local-only harness (not part of the deployed app):

```sh
node tests/review-server.cjs
```

Open `http://127.0.0.1:4173/__review`. The question selector includes all four
required IDs, and the viewport selector provides a true 390 × 844 CSS-pixel
iframe and a 1363 × 936 desktop iframe. This is a layout viewport, **not touch
device emulation**. To test a full top-level mobile viewport, open the iframe's
`/practice/<encoded ID>` URL in browser device emulation at 390 × 844.

The harness serves the unchanged production static assets and locally mirrors
only requests for the exact pinned bank. The real pack loader and checksum
validation run. A test-only fetch substitution in the served HTML avoids remote
data requests; no production file/config is modified. Do not deploy this server.

For an A/B comparison in another terminal:

```sh
REVIEW_BASELINE=1 PORT=4174 node tests/review-server.cjs
```

Open `http://127.0.0.1:4174/__review` at the same size and question.

Check each viewport and record results:

- Main Physics `aa5d3dbb-b62c-5121-bb8a-603af75e4027:51`: stem alpha symbols,
  four visually unchanged formulas; computed radio names A 200α, B 400α,
  C 300α, D 500α. Select B and submit; the key is unchanged.
- Main Maths `aa5d3dbb-b62c-5121-bb8a-603af75e4027:46`: 2 → submit → 0.
  Expect “Answer changed — check again.” Resubmit → incorrect. The complex
  logarithmic equation is explicitly untranscribed; the blank alone has text.
- Advanced Chemistry `d31bce6a-5f49-5939-ac9b-d5f9357d96f6:2`: C → submit →
  ArrowDown to D. Check invalidation before resubmitting. Four option graphs
  must still load. Simple reaction/concentration runs have text; four structured
  expressions and the actual meanings of the graph curves remain unresolved.
- Advanced Physics `d31bce6a-5f49-5939-ac9b-d5f9357d96f6:37`: A+C → submit →
  uncheck C with Space. Expect invalidation, then incorrect on resubmission.
- Repeat after incorrect submissions, then resubmit the correct answer. Show
  and hide solutions before edits: an edit must not change solution visibility.
- Test practice records too: radio, checkbox and numerical fixtures have DOM
  coverage, but browser integration of both paths still needs sign-off.
- Inspect actual browser accessible names and full math context, including
  solution content. Ensure successful alternatives are announced once. Unsupported
  SVGs remain exposed with the explicit transcription-unavailable label, not
  falsely treated as decorative. This label is not equivalent math content.
- Compare visual formulas, figures, spacing and horizontal overflow with the
  baseline. Exercise keyboard focus and scrolling, then use an actual screen
  reader. Do not certify F01 from DOM/name-algorithm tests alone.

## F01 content contract and limits

The archive contains glyph IDs/geometry, not TeX/MathML/ARIA semantic source.
`archive-math.js` accepts only a small unambiguous baseline grammar. It rejects
vertical transforms, scaling below the root, fractions, paths, nested SVG,
unknown fonts, coincident glyph origins, reordering and styling that could conceal glyphs.
Original markup is inspected before the existing sanitizer removes attributes.
Only validated text is inserted via `textContent`; no stored ARIA or executable
attributes are admitted. A decorative SVG is paired with exactly one text span.

To finish F01, supply reviewed TeX/MathML or equivalent text, keyed to the
question, field, option and expression ordinal, for complex expressions. Supply
reviewed graph/diagram descriptions separately. Do not infer structural math
from glyph order or silently substitute an answer-key derivation for source
content. Data recovery/authoring and changing the immutable pin are outside Part 5.
