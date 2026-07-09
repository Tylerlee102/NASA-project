from __future__ import annotations

import os
import shutil
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


WORKBOOK = Path(
    r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation\v26_paper_calibrated_dirty_ice_v3_streamlined_plus.xlsx"
)

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS}

FRONT_ORDER = [
    "00_MAIN_GRAPHS",
    "01_GRAPH_GALLERY",
    "02_ALL_NUMBERS",
    "03_DETAILS_SOURCES",
]

VISIBLE_SHEETS = set(FRONT_ORDER)


def patch_workbook_xml(xml_bytes: bytes) -> bytes:
    ET.register_namespace("", MAIN_NS)
    ET.register_namespace("r", REL_NS)
    root = ET.fromstring(xml_bytes)
    sheets = root.find("m:sheets", NS)
    if sheets is None:
        raise RuntimeError("Could not find workbook sheets list.")

    sheet_nodes = list(sheets)
    old_index_by_name = {node.attrib["name"]: index for index, node in enumerate(sheet_nodes)}
    by_name = {node.attrib["name"]: node for node in sheet_nodes}

    ordered_names = [name for name in FRONT_ORDER if name in by_name]
    ordered_names.extend(name for name in old_index_by_name if name not in ordered_names)

    for node in sheet_nodes:
        sheets.remove(node)

    for name in ordered_names:
        node = by_name[name]
        if name in VISIBLE_SHEETS:
            node.attrib.pop("state", None)
        else:
            node.set("state", "hidden")
        sheets.append(node)

    new_index_by_old_index = {
        old_index_by_name[name]: new_index for new_index, name in enumerate(ordered_names)
    }

    defined_names = root.find("m:definedNames", NS)
    if defined_names is not None:
        for defined_name in defined_names.findall("m:definedName", NS):
            local_id = defined_name.attrib.get("localSheetId")
            if local_id is None:
                continue
            try:
                old_index = int(local_id)
            except ValueError:
                continue
            if old_index in new_index_by_old_index:
                defined_name.set("localSheetId", str(new_index_by_old_index[old_index]))

    book_views = root.find("m:bookViews", NS)
    if book_views is not None:
        for view in book_views.findall("m:workbookView", NS):
            view.set("activeTab", "0")
            view.set("firstSheet", "0")

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def rewrite_xlsx(path: Path) -> None:
    with zipfile.ZipFile(path, "r") as zin:
        patched_workbook_xml = patch_workbook_xml(zin.read("xl/workbook.xml"))
        fd, temp_name = tempfile.mkstemp(suffix=".xlsx", dir=str(path.parent))
        os.close(fd)
        temp_path = Path(temp_name)
        try:
            with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename == "xl/workbook.xml":
                        data = patched_workbook_xml
                    zout.writestr(item, data)
            shutil.move(str(temp_path), str(path))
        finally:
            if temp_path.exists():
                temp_path.unlink()


if __name__ == "__main__":
    rewrite_xlsx(WORKBOOK)
    print(f"Streamlined tab order and visibility in {WORKBOOK}")
