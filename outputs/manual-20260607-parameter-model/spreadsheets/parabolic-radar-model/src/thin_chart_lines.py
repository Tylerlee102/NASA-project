from __future__ import annotations

import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


NS = {
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def ensure(parent: ET.Element, tag: str) -> ET.Element:
    node = parent.find(tag, NS)
    if node is None:
        node = ET.SubElement(parent, f"{{{NS[tag.split(':', 1)[0]]}}}{tag.split(':', 1)[1]}")
    return node


AXIS_TITLES = {
    "Flat vs Topography-Adjusted Apparent Depth": (
        "Along-track position x (km)",
        "Apparent depth (m)",
    ),
    "Flat vs Topography-Preview Apparent Depth": (
        "Along-track position x (km)",
        "Apparent depth (m)",
    ),
    "Combined Satellite Apparent Readings": (
        "Along-track position x (km)",
        "Apparent depth / satellite reading (m)",
    ),
    "Seeded Europa Topography Along the Pass": (
        "Along-track position x (km)",
        "Surface height (m)",
    ),
    "Seeded Europa Topography: Off-Nadir vs Nadir": (
        "Along-track position x (km)",
        "Surface height (m)",
    ),
    "Expected Europa Surface: Off-Nadir vs Nadir": (
        "Along-track position x (km)",
        "Surface height (m)",
    ),
    "Current Run Surface: Flat Floor, Off-Nadir, Nadir": (
        "Along-track position x (km)",
        "Surface height (m)",
    ),
    "Expected Off-Nadir Surface by Checked Run": (
        "Normalized pass position (-1 to +1)",
        "Surface height (m)",
    ),
    "Original Surface Signal vs Radar-Apparent Shift": (
        "Along-track position x (km)",
        "Original surface height / apparent shift (m)",
    ),
    "Planet Surface vs Satellite Apparent Reading": (
        "Along-track position x (km)",
        "Surface height / apparent reading (m)",
    ),
    "Off-Nadir Surface vs Nadir Surface vs Satellite Reading": (
        "Along-track position x (km)",
        "Surface height / apparent surface height (m)",
    ),
    "Flat vs Topography-Adjusted Doppler": (
        "Along-track position x (km)",
        "Doppler shift (Hz)",
    ),
    "Flat vs Topography-Preview Doppler": (
        "Along-track position x (km)",
        "Doppler shift (Hz)",
    ),
    "Checked Paper Pass Altitude Profiles": (
        "Normalized pass position (-1 to +1)",
        "Altitude (km)",
    ),
    "Path-Motion Effect on Topography Shift": (
        "Along-track position x (km)",
        "Extra apparent shift from path motion (m)",
    ),
    "Motion Only: Constant vs Parabolic Reading": (
        "Along-track position x (km)",
        "Apparent depth / satellite reading (m)",
    ),
    "Checked Paper Pass Apparent-Depth Outcomes": (
        "Normalized pass position (-1 to +1)",
        "Apparent depth (m)",
    ),
}


def qname(tag: str) -> str:
    prefix, local = tag.split(":", 1)
    return f"{{{NS[prefix]}}}{local}"


def text_from_chart_title(root: ET.Element) -> str:
    title = root.find(".//c:chart/c:title", NS)
    if title is None:
        return ""
    parts = [node.text or "" for node in title.findall(".//a:t", NS)]
    return "".join(parts).strip()


def make_axis_title(text: str, rotate: bool = False) -> ET.Element:
    title = ET.Element(qname("c:title"))
    tx = ET.SubElement(title, qname("c:tx"))
    rich = ET.SubElement(tx, qname("c:rich"))
    body_pr = ET.SubElement(rich, qname("a:bodyPr"))
    if rotate:
        body_pr.set("rot", "-5400000")
    ET.SubElement(rich, qname("a:lstStyle"))
    p = ET.SubElement(rich, qname("a:p"))
    r = ET.SubElement(p, qname("a:r"))
    r_pr = ET.SubElement(r, qname("a:rPr"))
    r_pr.set("lang", "en-US")
    r_pr.set("sz", "900")
    t = ET.SubElement(r, qname("a:t"))
    t.text = text
    ET.SubElement(title, qname("c:layout"))
    overlay = ET.SubElement(title, qname("c:overlay"))
    overlay.set("val", "0")
    return title


def set_axis_title(axis: ET.Element, text: str, rotate: bool = False) -> None:
    existing = axis.find("c:title", NS)
    if existing is not None:
        axis.remove(existing)

    insert_after = None
    for candidate in ("c:majorGridlines", "c:axPos", "c:scaling", "c:axId"):
        found = axis.find(candidate, NS)
        if found is not None:
            insert_after = list(axis).index(found)
            break
    axis.insert((insert_after + 1) if insert_after is not None else 0, make_axis_title(text, rotate))


def patch_axis_titles(root: ET.Element) -> None:
    chart_title = text_from_chart_title(root)
    if chart_title not in AXIS_TITLES:
        return
    x_title, y_title = AXIS_TITLES[chart_title]
    for axis in root.findall(".//c:catAx", NS):
        set_axis_title(axis, x_title)
    for axis in root.findall(".//c:valAx", NS):
        set_axis_title(axis, y_title, rotate=True)


def patch_chart_xml(xml_bytes: bytes, width_emu: str = "9000") -> bytes:
    root = ET.fromstring(xml_bytes)
    for ser in root.findall(".//c:ser", NS):
        sp_pr = ser.find("c:spPr", NS)
        if sp_pr is None:
            sp_pr = ET.SubElement(ser, f"{{{NS['c']}}}spPr")
        ln = sp_pr.find("a:ln", NS)
        if ln is None:
            ln = ET.SubElement(sp_pr, f"{{{NS['a']}}}ln")
        ln.set("w", width_emu)
    patch_axis_titles(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def patch_xlsx(path: Path) -> None:
    handle, temp_name = tempfile.mkstemp(suffix=".xlsx")
    os.close(handle)
    temp = Path(temp_name)
    try:
        with ZipFile(path, "r") as zin, ZipFile(temp, "w", ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                is_chart_xml = (
                    item.filename.startswith("xl/charts/chart")
                    or item.filename.startswith("xl/drawings/charts/chart")
                ) and item.filename.endswith(".xml")
                if is_chart_xml:
                    data = patch_chart_xml(data)
                zout.writestr(item, data)
        shutil.move(str(temp), str(path))
    finally:
        if temp.exists():
            temp.unlink()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: thin_chart_lines.py workbook.xlsx")
    patch_xlsx(Path(sys.argv[1]).resolve())
