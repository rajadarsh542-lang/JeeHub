"""Verify the complete bank without network requests or third-party dependencies."""
from pathlib import Path
from collections import Counter
import base64
import gzip
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "bank"


def read(path):
    return json.loads((BANK / path).read_text(encoding="utf-8"))


def verify():
    manifest = read("manifest.json")
    assert manifest["version"] == 1
    assert manifest["assets"], "This is still a text-only release"
    packs = {}
    for entry in manifest["files"]:
        payload = (BANK / entry["file"]).read_bytes()
        assert len(payload) == entry["bytes"], entry["file"]
        assert hashlib.sha256(payload).hexdigest() == entry["sha256"], entry["file"]
        packs[entry["file"]] = payload

    def member(entry, digest):
        filename, offset, size = entry[:3]
        assert 0 <= offset < offset + size <= len(packs[filename]), entry
        payload = packs[filename][offset:offset + size]
        assert hashlib.sha256(payload).hexdigest() == digest, entry
        return payload

    for name, entry in manifest["assets"].items():
        digest = entry[3] if name == "math/tex-glyphs.svg" else name.split("/")[1].split(".")[0]
        member(entry, digest)
    questions = {}
    for paper_id, entry in manifest["papers"].items():
        rows = json.loads(gzip.decompress(member(entry, entry[3])))
        catalog = read(f"catalog/papers/{paper_id}.json")
        assert {q["id"] for q in rows} == {q["id"] for q in catalog["rows"]}, paper_id
        for question in rows:
            assert question["id"] not in questions, question["id"]
            questions[question["id"]] = question
            html = " ".join([question.get("stemHtml", ""), question.get("solutionHtml", ""),
                             question.get("answerHtml", ""), *[o["html"] for o in question["options"]]])
            for asset in re.findall(r'data-asset="([^"]+)"', html):
                assert asset in manifest["assets"], (question["id"], asset)
    catalog, search = read("catalog/index.json"), read("catalog/search.json")
    assert len(questions) == len(search["rows"]) == catalog["counts"]["rows"]
    assert set(questions) == {q[2] for q in search["rows"]}
    assert len(manifest["papers"]) == len(catalog["papers"]) == catalog["counts"]["papers"]

    figures = read("licensed/figures/index.json")
    figure_packs = {name: read("licensed/figures/" + name) for name in figures["packs"]}
    for name, (pack, digest, mime) in figures["files"].items():
        assert mime in {"image/jpeg", "image/png"}
        payload = base64.b64decode(figure_packs[figures["packs"][pack]][name], validate=True)
        assert hashlib.sha256(payload).hexdigest() == digest, name
    licensed = []
    for file in sorted((BANK / "licensed").glob("q-*.json")):
        licensed.extend(json.loads(file.read_text()))
    for question in licensed:
        for image in question["questionImages"] + question["solutionImages"]:
            assert image.lstrip("/") in figures["files"], image
    assert len(licensed) == len(read("licensed/index.json")["rows"])
    pdfs = {}
    for paper in catalog.get("supplementalPapers", []):
        payload = (BANK / paper["pdfPath"]).read_bytes()
        assert payload.startswith(b"%PDF-"), paper["pdfPath"]
        pdfs[paper["pdfPath"]] = hashlib.sha256(payload).hexdigest()
    return {
        "archiveRecords": len(questions), "paperSets": len(manifest["papers"]),
        "archiveRecordsByExam": dict(sorted(Counter(catalog["papers"][q[0]]["exam"] for q in search["rows"]).items())),
        "gradeableArchiveRecords": sum(bool(q["gradeable"]) for q in questions.values()),
        "archiveRecordsStillFlaggedForMissingFigures": sum(any("figures are unavailable" in n for n in q["notices"]) for q in questions.values()),
        "archiveRecordsWithSolutionFigureWarnings": sum("Some source figures in the worked solution are unavailable." in q["solutionHtml"] for q in questions.values()),
        "archiveFigureAssets": len(manifest["assets"]) - 1,
        "licensedFigureAssets": len(figures["files"]),
        "practiceRecords": len(licensed) + len(read("questions.json")),
        "knownOverlappingArchiveRecords": catalog["counts"]["linkedForkRows"],
        "canonicalArchiveQuestions": catalog["counts"]["canonicalQuestions"],
        "supplementalPdfSha256": pdfs,
        "verifiedPacks": len(packs), "status": "PASS",
    }


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2))
