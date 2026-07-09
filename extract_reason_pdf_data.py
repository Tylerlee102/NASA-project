from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from pypdf import PdfReader


PDF_PATH = Path(r"C:\Users\tyboy\Downloads\s11214-024-01072-3.pdf")
OUT_DIR = Path("paper_data")

TERMS = [
    "PRF",
    "pulse repetition",
    "compression",
    "bandwidth",
    "frequency",
    "60 MHz",
    "9 MHz",
    "altitude",
    "interferometry",
    "pulse",
    "sounding",
    "altimetry",
    "reflectometry",
    "ranging",
    "plasma",
    "science objectives",
    "measurement",
]

PARAMETER_PATTERNS = {
    "frequencies_mhz": r"\b(?:9|60)\s*MHz\b",
    "bandwidth": r"\b\d+(?:\.\d+)?\s*(?:MHz|kHz)\s+bandwidth\b|\bbandwidth\s+(?:of\s+)?\d+(?:\.\d+)?\s*(?:MHz|kHz)\b",
    "prf": r"\bPRF\b|\bpulse repetition frequency\b",
    "altitude": r"\b\d+(?:\.\d+)?\s*km\b[^.]{0,120}\b(?:altitude|closest approach|flyby)\b|\b(?:altitude|closest approach|flyby)\b[^.]{0,120}\b\d+(?:\.\d+)?\s*km\b",
    "pulse_compression": r"\bpulse compression\b|\bcompressed\b",
    "interferometry": r"\binterferometry\b|\binterferometric\b",
}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def snippet(text: str, start: int, end: int, pad: int = 260) -> str:
    return clean(text[max(0, start - pad) : min(len(text), end + pad)])


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(PDF_PATH))
    pages = []
    full_text_parts = []
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append(text)
        full_text_parts.append(f"\n\n--- PAGE {idx} ---\n{text}")

    full_text = "\n".join(full_text_parts)
    (OUT_DIR / "reason_paper_text.txt").write_text(full_text, encoding="utf-8")

    term_hits: list[dict[str, object]] = []
    for page_num, text in enumerate(pages, start=1):
        flat = clean(text)
        for term in TERMS:
            for match in re.finditer(re.escape(term), flat, flags=re.IGNORECASE):
                term_hits.append(
                    {
                        "page": page_num,
                        "term": term,
                        "snippet": snippet(flat, match.start(), match.end()),
                    }
                )

    with (OUT_DIR / "term_hits.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["page", "term", "snippet"])
        writer.writeheader()
        writer.writerows(term_hits)

    pattern_hits: dict[str, list[dict[str, object]]] = {}
    for name, pattern in PARAMETER_PATTERNS.items():
        hits = []
        for page_num, text in enumerate(pages, start=1):
            flat = clean(text)
            for match in re.finditer(pattern, flat, flags=re.IGNORECASE):
                hits.append(
                    {
                        "page": page_num,
                        "match": match.group(0),
                        "snippet": snippet(flat, match.start(), match.end()),
                    }
                )
        pattern_hits[name] = hits

    extracted = {
        "source_pdf": str(PDF_PATH),
        "page_count": len(reader.pages),
        "title": clean((reader.pages[0].extract_text() or "").split("Abstract", 1)[0]),
        "pattern_hits": pattern_hits,
    }
    (OUT_DIR / "reason_paper_extracted_hits.json").write_text(json.dumps(extracted, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_DIR / 'reason_paper_text.txt'}")
    print(f"Wrote {OUT_DIR / 'term_hits.csv'}")
    print(f"Wrote {OUT_DIR / 'reason_paper_extracted_hits.json'}")


if __name__ == "__main__":
    main()
