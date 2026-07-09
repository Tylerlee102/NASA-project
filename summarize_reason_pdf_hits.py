from __future__ import annotations

import json


with open("paper_data/reason_paper_extracted_hits.json", encoding="utf-8") as handle:
    data = json.load(handle)

print("pages", data["page_count"])
for key, values in data["pattern_hits"].items():
    print(f"--- {key} ({len(values)} hits)")
    for item in values[:8]:
        text = f"{item['page']}: {item['snippet'][:700]}"
        print(text.encode("ascii", "ignore").decode())
