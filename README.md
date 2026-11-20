# JEE practice question bank · text checkpoint

This checkpoint contains 23,064 archive question records from 268 paper records. It preserves question wording, choices, recorded answers, and available worked explanations. The catalog identifies 987 overlaps between source versions. Both versions retain their own IDs. Of the 23,064 archive records, 22,947 have a key suitable for automatic scoring.

Another 2,319 practice records are available in `bank/questions.json` (12 original questions and 3 licensed adaptations) and `bank/licensed/` (2,304 additional licensed records). The 362 project-written worked explanations in `bank/authored/` supplement existing archive entries. Attribution and license terms are in `bank/NOTICES.txt` and `bank/notices/`.

**Diagrams and paper PDFs are pending.** Question and solution text are available in this revision. Records retain identifiers for their figures. The text release manifest lists only the four question packs. Some problems require a figure to solve.

## Read a question

Use `bank/catalog/index.json` to find a paper, `bank/catalog/search.json` to search the question metadata, or `bank/catalog/papers/<paper-id>.json` to find individual question IDs. In `bank/manifest.json`, each entry in `papers` supplies the question pack filename, byte offset, length, and SHA-256 checksum of one compressed paper. The four `bank/questions-*.bin` files hold consecutive gzip members. Each member expands into a JSON array.

Run this Python example from the repository root to read the original first Chemistry question in JEE Advanced 2026 Paper 1.

```python
from pathlib import Path
import gzip
import hashlib
import json

bank = Path("bank")
manifest = json.loads((bank / "manifest.json").read_text(encoding="utf-8"))
paper_id = "d31bce6a-5f49-5939-ac9b-d5f9357d96f6"
filename, offset, length, checksum = manifest["papers"][paper_id]

with (bank / filename).open("rb") as stream:
    stream.seek(offset)
    member = stream.read(length)
if hashlib.sha256(member).hexdigest() != checksum:
    raise ValueError("Question pack checksum mismatch")

rows = json.loads(gzip.decompress(member))
question = next(row for row in rows if row["id"] == f"{paper_id}:1")
print(question["stemHtml"])
print(question["answer"])  # ['B']
```

`gradeable` identifies records that support automatic scoring. Inspect the question's `notices` for missing material, bonus questions, or conflicting keys.
