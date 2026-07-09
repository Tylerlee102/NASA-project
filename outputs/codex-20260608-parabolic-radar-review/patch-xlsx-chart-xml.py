from __future__ import annotations

import copy
import shutil
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

path = Path(
    r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\codex-20260608-parabolic-radar-review\parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx"
)
tmp = path.with_suffix(".tmp.xlsx")

NS = {
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

ET.register_namespace("c", NS["c"])
ET.register_namespace("a", NS["a"])
ET.register_namespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")


def q(ns: str, tag: str) -> str:
    return f"{{{NS[ns]}}}{tag}"


BASELINE = "8A8F98"
BLUE = "2563EB"
ORANGE = "F97316"
GREEN = "16A34A"
CYAN = "0EA5E9"
PURPLE = "7C3AED"

PATCHES_BY_TITLE: dict[str, list[tuple[str, str, bool]]] = {
    "Apparent Depth: Motion vs Topography": [
        ("Flat-Nadir Reference Line", BASELINE, True),
        ("Parabolic flat-surface reading (m)", BLUE, False),
        ("Parabolic topography-adjusted reading (m)", GREEN, False),
    ],
    "Generated Ground Topography: Target and Nadir": [
        ("0 m Base Datum", BASELINE, True),
        ("Off-nadir target topography height (m)", ORANGE, False),
        ("Nadir topography height (m)", GREEN, False),
    ],
    "VHF Doppler: Smooth Flyby vs Terrain-Distorted": [
        ("VHF Smooth Flyby (Flat) (Hz)", BLUE, False),
        ("VHF Terrain-Distorted (Topo) (Hz)", ORANGE, False),
    ],
    "HF Doppler: Smooth Flyby vs Terrain-Distorted": [
        ("HF Smooth Flyby (Flat) (Hz)", BLUE, False),
        ("HF Terrain-Distorted (Topo) (Hz)", ORANGE, False),
    ],
    "Scenario Altitude Profiles": [
        ("Current custom altitude (km)", ORANGE, False),
        ("Paper 800-km low-altitude altitude (km)", GREEN, False),
        ("Paper 1600-km ice-ocean altitude (km)", CYAN, False),
        ("Paper 25-to-1000-km operating altitude (km)", PURPLE, False),
    ],
    "Plan View: Nadir Track and Off-Nadir Target Path": [
        ("Satellite/nadir track y=0 km", BLUE, False),
        ("Off-nadir target path y=Inputs!C6 km", ORANGE, False),
    ],
    "Dual-Scale Geometry: Terrain Height and Satellite Altitude": [
        ("Generated off-nadir topography h_target (m)", ORANGE, False),
        ("Generated nadir topography h_nadir (m)", GREEN, False),
        ("Satellite parabolic altitude z(x) (km)", BLUE, False),
    ],
    "Generated Ground Topography (Zoomed)": [
        ("Generated off-nadir topography h_target (m)", ORANGE, False),
        ("Generated nadir topography h_nadir (m)", GREEN, False),
        ("0 m Base Datum", BASELINE, True),
    ],
    "Generated Ground vs Radar Reading Change": [
        ("Generated off-nadir topography h_target (m)", ORANGE, False),
        ("Generated nadir topography h_nadir (m)", GREEN, False),
        ("Radar apparent-depth change caused by topography (m)", PURPLE, False),
    ],
}


def remove_children(parent: ET.Element, tags: set[str]) -> None:
    for child in list(parent):
        if child.tag in tags:
            parent.remove(child)


def ensure_child(parent: ET.Element, tag: str) -> ET.Element:
    child = parent.find(tag)
    if child is None:
        child = ET.SubElement(parent, tag)
    return child


def chart_title(root: ET.Element) -> str:
    chart = root.find(q("c", "chart"))
    title = chart.find(q("c", "title")) if chart is not None else None
    if title is None:
        return ""
    return " ".join(node.text for node in title.findall(f".//{q('a', 't')}") if node.text).strip()


def set_text(node: ET.Element | None, text: str) -> None:
    if node is None:
        return
    text_nodes = node.findall(f".//{q('a', 't')}")
    if not text_nodes:
        return
    text_nodes[0].text = text
    for extra in text_nodes[1:]:
        extra.text = ""


def set_axis_title(axis: ET.Element, text: str) -> None:
    set_text(axis.find(q("c", "title")), text)


def set_axis_num_format(axis: ET.Element, fmt: str) -> None:
    num_fmt = ensure_child(axis, q("c", "numFmt"))
    num_fmt.set("formatCode", fmt)
    num_fmt.set("sourceLinked", "0")


def set_axis_scaling(axis: ET.Element, minimum: float, maximum: float) -> None:
    scaling = ensure_child(axis, q("c", "scaling"))
    remove_children(scaling, {q("c", "min"), q("c", "max")})
    children = list(scaling)
    insert_at = 0
    for idx, child in enumerate(children):
        if child.tag == q("c", "orientation"):
            insert_at = idx + 1
            break
    max_el = ET.Element(q("c", "max"), {"val": str(maximum)})
    min_el = ET.Element(q("c", "min"), {"val": str(minimum)})
    scaling.insert(insert_at, max_el)
    scaling.insert(insert_at + 1, min_el)


def set_axis_id(axis: ET.Element, axis_id: str) -> None:
    ensure_child(axis, q("c", "axId")).set("val", axis_id)


def set_axis_position(axis: ET.Element, position: str) -> None:
    ensure_child(axis, q("c", "axPos")).set("val", position)


def set_cross_axis(axis: ET.Element, cross_axis_id: str, crosses: str | None = None) -> None:
    ensure_child(axis, q("c", "crossAx")).set("val", cross_axis_id)
    if crosses is not None:
        ensure_child(axis, q("c", "crosses")).set("val", crosses)


def set_line_chart_series(line_chart: ET.Element, series_nodes: list[ET.Element]) -> None:
    for ser in list(line_chart.findall(q("c", "ser"))):
        line_chart.remove(ser)
    insert_at = 0
    for idx, child in enumerate(list(line_chart)):
        if child.tag == q("c", "grouping"):
            insert_at = idx + 1
            break
    for offset, ser in enumerate(series_nodes):
        line_chart.insert(insert_at + offset, ser)


def set_line_chart_axes(line_chart: ET.Element, cat_axis_id: str, value_axis_id: str) -> None:
    for ax_id in list(line_chart.findall(q("c", "axId"))):
        line_chart.remove(ax_id)
    ET.SubElement(line_chart, q("c", "axId"), {"val": cat_axis_id})
    ET.SubElement(line_chart, q("c", "axId"), {"val": value_axis_id})


def set_series_label(ser: ET.Element, label: str) -> None:
    tx = ser.find(q("c", "tx"))
    if tx is None:
        return

    direct_v = tx.find(q("c", "v"))
    if direct_v is not None:
        direct_v.text = label

    for node in tx.findall(f".//{q('c', 'strCache')}/{q('c', 'pt')}/{q('c', 'v')}"):
        node.text = label


def style_series(ser: ET.Element, color: str, dashed: bool) -> None:
    sppr = ensure_child(ser, q("c", "spPr"))
    line = ensure_child(sppr, q("a", "ln"))
    line.set("w", "15240" if dashed else "19050")
    remove_children(
        line,
        {
            q("a", "solidFill"),
            q("a", "noFill"),
            q("a", "gradFill"),
            q("a", "pattFill"),
            q("a", "prstDash"),
        },
    )
    solid = ET.SubElement(line, q("a", "solidFill"))
    ET.SubElement(solid, q("a", "srgbClr"), {"val": color})
    if dashed:
        ET.SubElement(line, q("a", "prstDash"), {"val": "dash"})

    marker = ensure_child(ser, q("c", "marker"))
    ensure_child(marker, q("c", "symbol")).set("val", "none")


def patch_series(root: ET.Element, patches: list[tuple[str, str, bool]]) -> None:
    series_nodes = root.findall(".//c:ser", NS)
    if len(series_nodes) < len(patches):
        raise RuntimeError(f"Expected at least {len(patches)} series, found {len(series_nodes)}")
    for ser, (label, color, dashed) in zip(series_nodes, patches):
        set_series_label(ser, label)
        style_series(ser, color, dashed)


def patch_dual_axis_geometry(root: ET.Element) -> None:
    plot_area = root.find(".//c:plotArea", NS)
    if plot_area is None:
        return
    line_chart = plot_area.find(q("c", "lineChart"))
    cat_axis = plot_area.find(q("c", "catAx"))
    primary_axis = plot_area.find(q("c", "valAx"))
    if line_chart is None or cat_axis is None or primary_axis is None:
        return

    original_series = [copy.deepcopy(ser) for ser in line_chart.findall(q("c", "ser"))]
    if len(original_series) < 3:
        return

    cat_axis_id = cat_axis.find(q("c", "axId")).get("val")
    primary_axis_id = primary_axis.find(q("c", "axId")).get("val")
    try:
        secondary_axis_id = str(int(primary_axis_id) + 1000000)
    except ValueError:
        secondary_axis_id = "900000000"

    set_line_chart_series(line_chart, original_series[:2])
    set_line_chart_axes(line_chart, cat_axis_id, primary_axis_id)

    secondary_chart = copy.deepcopy(line_chart)
    set_line_chart_series(secondary_chart, [original_series[2]])
    set_line_chart_axes(secondary_chart, cat_axis_id, secondary_axis_id)
    plot_area.insert(list(plot_area).index(line_chart) + 1, secondary_chart)

    set_axis_title(primary_axis, "Generated surface height (m)")
    set_axis_num_format(primary_axis, "0")
    set_axis_scaling(primary_axis, -200, 800)
    set_cross_axis(primary_axis, cat_axis_id)

    secondary_axis = copy.deepcopy(primary_axis)
    set_axis_id(secondary_axis, secondary_axis_id)
    set_axis_position(secondary_axis, "r")
    set_axis_title(secondary_axis, "Satellite altitude (km)")
    set_axis_num_format(secondary_axis, "0")
    set_axis_scaling(secondary_axis, 380, 420)
    set_cross_axis(secondary_axis, cat_axis_id, "max")
    remove_children(secondary_axis, {q("c", "majorGridlines")})
    plot_area.insert(list(plot_area).index(primary_axis) + 1, secondary_axis)


def patch_chart(xml: bytes) -> bytes:
    root = ET.fromstring(xml)
    title = chart_title(root)
    patches = PATCHES_BY_TITLE.get(title)
    if patches:
        patch_series(root, patches)
    if title == "Dual-Scale Geometry: Terrain Height and Satellite Altitude":
        patch_dual_axis_geometry(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.startswith("xl/drawings/charts/chart") and item.filename.endswith(".xml"):
            data = patch_chart(data)
        zout.writestr(item, data)

shutil.move(str(tmp), str(path))
print(path)
