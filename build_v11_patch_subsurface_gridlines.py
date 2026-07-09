from __future__ import annotations

import copy
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


BASE_XLSX = Path(r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v10.xlsx")
OUT_XLSX = Path(r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v11.xlsx")

C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

ET.register_namespace("c", C_NS)
ET.register_namespace("a", A_NS)
ET.register_namespace("r", R_NS)

NS = {"c": C_NS, "a": A_NS}


def chart_number(path: str) -> int:
    return int(re.search(r"chart(\d+)\.xml$", path).group(1))


def chart_title(root: ET.Element) -> str:
    title = root.find(".//c:chart/c:title//a:t", NS)
    return re.sub(r"\s+", " ", title.text if title is not None and title.text else "").strip()


def dashboard_gridline_templates() -> list[ET.Element]:
    with zipfile.ZipFile(BASE_XLSX) as archive:
        root = ET.fromstring(archive.read("xl/charts/chart1.xml"))
    templates = root.findall(".//c:majorGridlines", NS)
    if len(templates) < 2:
        raise RuntimeError("Could not find the Dashboard gridline style to copy.")
    return [copy.deepcopy(templates[0]), copy.deepcopy(templates[1])]


def patch_gridlines(xml_bytes: bytes, templates: list[ET.Element]) -> tuple[bytes, bool]:
    root = ET.fromstring(xml_bytes)
    if not chart_title(root).startswith(
        (
            "Subsurface",
            "Scenario Comparison",
            "Boundary Uncertainty",
            "Ocean Model",
            "Radargram-Style",
            "Detectability",
            "Reflection Strength",
            "Cross-Instrument",
        )
    ):
        return xml_bytes, False

    axes = root.findall(".//c:catAx", NS) + root.findall(".//c:valAx", NS)
    template_index = 0
    changed = False
    for axis in axes:
        grid = axis.find("c:majorGridlines", NS)
        if grid is None:
            continue
        insert_at = list(axis).index(grid)
        axis.remove(grid)
        axis.insert(insert_at, copy.deepcopy(templates[min(template_index, len(templates) - 1)]))
        template_index += 1
        changed = True
    return ET.tostring(root, encoding="utf-8", xml_declaration=False), changed


def main() -> None:
    templates = dashboard_gridline_templates()
    patched = 0
    with zipfile.ZipFile(BASE_XLSX, "r") as src, zipfile.ZipFile(OUT_XLSX, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename.startswith("xl/charts/chart") and item.filename.endswith(".xml") and chart_number(item.filename) >= 9:
                data, did_patch = patch_gridlines(data, templates)
                if did_patch:
                    patched += 1
            dst.writestr(item, data)
    if patched != 8:
        raise RuntimeError(f"Expected 8 subsurface charts to be patched, got {patched}.")
    print(OUT_XLSX)


if __name__ == "__main__":
    main()
