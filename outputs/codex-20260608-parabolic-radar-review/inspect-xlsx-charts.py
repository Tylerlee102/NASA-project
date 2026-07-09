from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

path = Path(
    r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\codex-20260608-parabolic-radar-review\parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx"
)

ns = {"c": "http://schemas.openxmlformats.org/drawingml/2006/chart"}

with zipfile.ZipFile(path) as zf:
    chart_names = sorted(
        [n for n in zf.namelist() if re.match(r"xl/(?:drawings/)?charts/chart\d+\.xml$", n)],
        key=lambda n: int(re.search(r"chart(\d+)\.xml", n).group(1)),
    )
    for name in chart_names:
        root = ET.fromstring(zf.read(name))
        titles = [
            node.text
            for node in root.findall(".//c:title//c:tx//c:rich//a:t", {"c": ns["c"], "a": "http://schemas.openxmlformats.org/drawingml/2006/main"})
            if node.text
        ]
        series = []
        for ser in root.findall(".//c:ser", ns):
            tx = ser.find(".//c:tx/c:strRef/c:strCache/c:pt/c:v", ns)
            if tx is None:
                tx = ser.find(".//c:tx/c:v", ns)
            formula = ser.find(".//c:val/c:numRef/c:f", ns)
            series.append((tx.text if tx is not None else "", formula.text if formula is not None else ""))
        print(name)
        print("  title:", " ".join(titles))
        for idx, (label, formula) in enumerate(series):
            print(f"  {idx}: {label} | {formula}")
