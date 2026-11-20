# Render saved equations offline

The live paper HTML contains SVG equations. Some equations draw symbols with references such as `<use href="#MJX-TEX-N-2212"/>`. This folder supplies the matching vector outlines for the saved question bank.

For a web page or a video renderer that takes an HTML document, read `tex-glyphs.svg` from the extracted package and **inline its entire SVG element once in the same document** as the question, options and explanation. Place it before the first question. When rendering inside an iframe or shadow root, include it inside that rendering context. An `<img>` tag creates a separate document whose glyph IDs cannot be resolved by the question HTML.

For an individual formula exported as an SVG image, copy the contents of the supplied `<defs>` element into a `<defs>` element in the formula's own SVG. Keep each source `<use>` element and its transforms. SVG 2 renderers support the source's `href` attributes. Older SVG 1.1 renderers may need the equivalent `xlink:href` attribute and namespace.

The 253 raw live papers contain 445 distinct symbol IDs across 2,823 questions. At least one symbol definition is missing from its own source field in 2,385 questions. The supplied file resolves every observed ID, including italic, bold, large operator, stretchy delimiter, and chemical arrow forms. U+2061 FUNCTION APPLICATION is an intentionally invisible, zero-width mathematical operator. External diagram URLs are accounted for separately in the live media manifest.

## Attribution

This file contains a subset of the original vector outlines from MathJax's published version 4.1.3 packages. The named glyphs were assembled into a new SVG definitions file for offline rendering. The packages' JavaScript is distributed under Apache 2.0. Font-specific notices and license texts are included in this folder. The 293 symbol IDs for which an outline was also present in the source HTML were checked against the original outline bounds. An offline raster test produced visible output for all 444 visible symbols.

- [MathJax TeX font package, version 4.1.3](https://registry.npmjs.org/@mathjax/mathjax-tex-font/-/mathjax-tex-font-4.1.3.tgz)
- [MathJax mhchem font extension, version 4.1.3](https://registry.npmjs.org/@mathjax/mathjax-mhchem-font-extension/-/mathjax-mhchem-font-extension-4.1.3.tgz)
- Font copyrights are recorded in [FONT-NOTICES.txt](FONT-NOTICES.txt). License texts are in [Apache-2.0.txt](Apache-2.0.txt), [OFL-1.1.txt](OFL-1.1.txt), [GUST-FONT-LICENSE.txt](GUST-FONT-LICENSE.txt), and [LPPL-1.3c.txt](LPPL-1.3c.txt).
