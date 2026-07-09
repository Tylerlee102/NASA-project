import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbookDir = path.resolve(__dirname, "..");
const outputDir = path.join(workbookDir, "output");
const qaDir = path.join(workbookDir, "qa");
const outputPath = path.join(outputDir, "parabolic-motion-radar-model-baseline-and-runs.xlsx");

const colors = {
  navy: "#0B2545",
  blue: "#2E74B5",
  slate: "#344054",
  muted: "#667085",
  lightBlue: "#EAF2FB",
  lightGray: "#F2F4F7",
  grid: "#D0D5DD",
  yellow: "#FFF2CC",
  good: "#DFF4E6",
  warn: "#FCEFD9",
  white: "#FFFFFF",
};

function ws(workbook, name, opts = {}) {
  return workbook.worksheets.getOrAdd(name, opts);
}

function setTitle(sheet, range, text) {
  sheet.getRange(range.split(":")[0]).values = [[text]];
  sheet.getRange(range).format = {
    fill: colors.navy,
    font: { name: "Calibri", size: 16, bold: true, color: colors.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
}

function sectionHeader(sheet, range, text) {
  sheet.getRange(range.split(":")[0]).values = [[text]];
  sheet.getRange(range).format = {
    fill: colors.lightBlue,
    font: { name: "Calibri", size: 12, bold: true, color: colors.navy },
    horizontalAlignment: "left",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };
}

function styleTable(sheet, range, headerRange) {
  sheet.getRange(range).format = {
    font: { name: "Calibri", size: 10, color: colors.slate },
    borders: { preset: "all", style: "thin", color: colors.grid },
    verticalAlignment: "center",
    wrapText: true,
  };
  sheet.getRange(headerRange).format = {
    fill: colors.lightGray,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.grid },
    wrapText: true,
  };
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
}

function topographyCoreExpr(xRef, yRef) {
  const projectRidge = `115*EXP(-(((${yRef})-25)^2)/(4.5^2))`;
  const projectScallop = `70*EXP(-(((${yRef})+38)^2)/(7^2))*(0.55+0.45*SIN(2*PI()*(${xRef})/45))`;
  const projectChaos = `24*SIN(2*PI()*(${yRef})/9+(${xRef})/18)*EXP(-(((${yRef})+5)^2)/(22^2))`;
  const projectAlongBulge = `18*SIN(2*PI()*(${xRef})/70)`;
  const projectDem = `Inputs!$C$51*(${projectRidge}+${projectScallop}+${projectChaos}+${projectAlongBulge})`;
  const ridge = `Inputs!$C$28*EXP(-(((${xRef})-Inputs!$C$29)^2)/(2*Inputs!$C$31^2))*EXP(-(((${yRef})-Inputs!$C$30)^2)/(2*Inputs!$C$32^2))`;
  const crater = `-Inputs!$C$33*EXP(-(((((${xRef})-Inputs!$C$34)^2)+(((${yRef})-Inputs!$C$35)^2))/(2*Inputs!$C$36^2)))`;
  const chaos = `Inputs!$C$37*(0.55*SIN(2*PI()*(${xRef})/Inputs!$C$39)+0.35*COS(2*PI()*(${yRef})/Inputs!$C$40)+0.2*SIN(2*PI()*((${xRef})+(${yRef}))/(0.5*(Inputs!$C$39+Inputs!$C$40))))`;
  const rough = `Inputs!$C$38*SIN(2*PI()*(${xRef})/Inputs!$C$39)*SIN(2*PI()*(${yRef})/Inputs!$C$40)`;
  const trough = `-Inputs!$C$41*EXP(-(((${yRef})-Inputs!$C$43)^2)/(2*Inputs!$C$44^2))*EXP(-(((${xRef})-Inputs!$C$42)^2)/(2*Inputs!$C$45^2))`;
  const seededSmooth = `0.45*SIN(2*PI()*(((${xRef})/Inputs!$C$49)+Inputs!$C$47*0.137))+0.35*COS(2*PI()*(((${yRef})/Inputs!$C$50)+Inputs!$C$47*0.173))+0.20*SIN(2*PI()*(((${xRef})+(${yRef}))/(0.5*(Inputs!$C$49+Inputs!$C$50))+Inputs!$C$47*0.097))`;
  const hashBase = `(SIN(((${xRef})*12.9898+(${yRef})*78.233+Inputs!$C$47*37.719))*43758.5453)`;
  const seededHash = `(2*(${hashBase}-INT(${hashBase}))-1)`;
  const seededTerrain = `Inputs!$C$48*(0.70*(${seededSmooth})+0.30*${seededHash})`;
  return `(${projectDem}+${ridge}+${crater}+${chaos}+${rough}+${trough}+${seededTerrain})`;
}

function topoExpr(xRef, yRef) {
  const topoOn = `OR(Inputs!$C$27=TRUE,Inputs!$C$27="TRUE",Inputs!$C$27=1)`;
  return `IF(${topoOn},1,0)*${topographyCoreExpr(xRef, yRef)}`;
}

function safeRender(workbook, sheetName, fileName, range = undefined) {
  return workbook
    .render({ sheetName, range, autoCrop: range ? undefined : "all", scale: 1, format: "png" })
    .then(async (blob) => {
      await fs.mkdir(qaDir, { recursive: true });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await fs.writeFile(path.join(qaDir, fileName), bytes);
      return true;
    })
    .catch((err) => {
      console.log(`Render skipped for ${sheetName}: ${err.message}`);
      return false;
    });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });

  const workbook = Workbook.create();
  const dashboard = ws(workbook, "Dashboard", { renameFirstIfOnlyNewSpreadsheet: true });
  const inputs = ws(workbook, "Inputs");
  const model = ws(workbook, "Model_Data");
  const chartData = ws(workbook, "Chart_Data");
  const scenarioData = ws(workbook, "Scenario_Data");
  const prf = ws(workbook, "PRF_Results");
  const guide = ws(workbook, "Formula_Guide");
  const topoGuide = ws(workbook, "Topography_Formulas");
  const checks = ws(workbook, "Checks");

  for (const sheet of [dashboard, inputs, model, chartData, scenarioData, prf, guide, topoGuide, checks]) {
    sheet.showGridLines = false;
  }

  buildInputs(inputs);
  buildModelData(model);
  buildChartData(chartData);
  buildScenarioData(scenarioData);
  buildPrf(prf);
  buildDashboard(dashboard, chartData, scenarioData);
  buildFormulaGuide(guide);
  buildTopographyFormulas(topoGuide);
  buildChecks(checks);

  const inspectDash = await workbook.inspect({
    kind: "table",
    range: "Dashboard!A1:H27",
    include: "values,formulas",
    tableMaxRows: 24,
    tableMaxCols: 8,
  });
  console.log(inspectDash.ndjson);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!",
    options: { useRegex: true, maxResults: 200 },
    summary: "formula error scan",
  });
  console.log(errors.ndjson);

  await safeRender(workbook, "Dashboard", "dashboard_preview.png", "A1:R116");
  await safeRender(workbook, "Dashboard", "dashboard_lower_preview.png", "A28:R116");
  await safeRender(workbook, "Inputs", "inputs_preview.png", "A1:N56");

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  try {
    await xlsx.save(outputPath);
    console.log(outputPath);
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EACCES") {
      const altPath = path.join(outputDir, "parabolic-motion-radar-model-paper-pass-scenarios-interactive.xlsx");
      console.log(`Resource busy. Saved to alternative path: ${altPath}`);
      await xlsx.save(altPath);
    } else {
      throw err;
    }
  }
}

function buildInputs(sheet) {
  setTitle(sheet, "A1:N1", "Parabolic Motion Radar Model - Editable Inputs");
  sheet.mergeCells("A1:N1");
  sheet.getRange("A2").values = [["Change the yellow cells in column C for the custom model. Use the TRUE/FALSE scenario toggles at the right to overlay paper-derived pass cases on the Dashboard charts."]];
  sheet.mergeCells("A2:N2");
  sheet.getRange("A2:N2").format = {
    fill: colors.lightGray,
    font: { name: "Calibri", size: 10, italic: true, color: colors.slate },
    wrapText: true,
  };

  const rows = [
    ["Parameter", "Symbol", "Value", "Unit", "Notes"],
    ["Closest altitude", "z0", 400, "km", "Altitude at closest approach. Change this to test other flyby heights."],
    ["Side/cross-track offset", "y", 25, "km", "Horizontal offset of the modeled target from nadir."],
    ["Along-track minimum", "x_min", -60, "km", "Left/start side of the modeled pass."],
    ["Along-track maximum", "x_max", 60, "km", "Right/end side of the modeled pass."],
    ["Altitude rise at edge", "Delta_z_edge", 4, "km", "How much altitude rises at +/- x_edge."],
    ["Parabola edge location", "x_edge", 60, "km", "Controls curvature together with Delta_z_edge."],
    ["Along-track speed", "v", 4, "km/s", "Used for range rate, Doppler, and pulse spacing."],
    ["Ice refractive index", "n", 1.78, "", "Used to convert extra slant path into apparent depth."],
    ["VHF wavelength", "lambda_vhf", 5, "m", "REASON-like VHF wavelength."],
    ["HF wavelength", "lambda_hf", 33.3, "m", "REASON-like HF wavelength."],
    ["Interferometer baseline", "b", 5, "m", "Used for VHF phase estimate."],
    ["VHF range resolution", "res_vhf", 30, "m", "Used for VHF apparent-depth uncertainty band."],
    ["HF range resolution", "res_hf", 300, "m", "Used for HF apparent-depth uncertainty band."],
    ["PRF choice 1", "PRF_1", 50, "Hz", "Example low PRF."],
    ["PRF choice 2", "PRF_2", 500, "Hz", "Example medium PRF."],
    ["PRF choice 3", "PRF_3", 3000, "Hz", "Example high PRF."],
    ["Speed of light", "c", 299792458, "m/s", "Physical constant used for delay and timing."],
  ];
  sheet.getRange("A4:E21").values = rows;
  styleTable(sheet, "A4:E21", "A4:E4");
  sheet.getRange("C5:C21").format = {
    fill: colors.yellow,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    numberFormat: "0.00",
    horizontalAlignment: "right",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("C21").format.numberFormat = "0";
  sheet.getRange("A23:E23").values = [["Model note", "The parabola is a simplified local path, not a real mission trajectory. Use it to see how geometry changes radar outputs.", "", "", ""]];
  sheet.mergeCells("B23:E23");
  sheet.getRange("A23:E23").format = {
    fill: colors.warn,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };

  sectionHeader(sheet, "F4:N4", "Paper-Derived Pass Scenario Overlays");
  sheet.mergeCells("F4:N4");
  const scenarioRows = [
    ["Show", "Scenario", "z0", "x_min", "x_max", "x_edge", "Delta_z_edge", "Edge altitude", "Paper basis / meaning"],
    ["TRUE", "Current custom inputs", "=C5", "=C7", "=C8", "=C10", "=C9", "=C5+C9", "Your editable custom case from the left table. It remains the main model used by the topography dashboard."],
    ["TRUE", "Paper low-altitude 800-km pass", 35, -400, 400, 400, 365, 400, "Paper coverage requirement: groundtrack segments at least 800 km long below 400 km for most REASON datasets. This model makes that a parabola."],
    ["TRUE", "Paper ice-ocean 1600-km pass", 35, -800, 800, 800, 965, 1000, "Paper ice-ocean interface requirement: at least 1600 km below 1000 km. This model makes that a parabola."],
    ["TRUE", "Paper operating 25-to-1000-km pass", 25, -800, 800, 800, 975, 1000, "Paper instrument table lists operational altitudes of 25 km to 1000 km. This shows the lower-bound closest-approach case."],
  ];
  sheet.getRange("F5:N9").values = scenarioRows;
  sheet.getRange("H6:M6").formulas = [["=C5", "=C7", "=C8", "=C10", "=C9", "=C5+C9"]];
  sheet.getRange("F6:F9").formulas = [["=Dashboard!B59"], ["=Dashboard!B60"], ["=Dashboard!B61"], ["=Dashboard!B62"]];
  styleTable(sheet, "F5:N9", "F5:N5");
  sheet.getRange("F6:F9").format = {
    fill: colors.lightBlue,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    numberFormat: "General",
    horizontalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("H6:M9").format = {
    fill: colors.lightBlue,
    font: { name: "Calibri", size: 10, color: colors.navy },
    numberFormat: "0.00",
    horizontalAlignment: "right",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("F11:N11").values = [["Scenario note", "The paper gives altitude ranges and required groundtrack lengths, not exact parabolic equations. These rows convert those paper values into the same simplified parabola equation so outcomes can be compared on one dashboard.", "", "", "", "", "", "", ""]];
  sheet.mergeCells("G11:N11");
  sheet.getRange("F11:N11").format = {
    fill: colors.warn,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };

  sectionHeader(sheet, "A25:E25", "Representative Europa Topography Controls");
  sheet.mergeCells("A25:E25");
  const topoRows = [
    ["Parameter", "Symbol", "Value", "Unit", "Notes"],
    ["Topography enabled", "topography_on", "TRUE", "", "Dropdown-style toggle. TRUE adds terrain height to the radar geometry; FALSE returns to flat surface."],
    ["Ridge height", "A_ridge", 350, "m", "Positive height for a representative double-ridge / raised band."],
    ["Ridge center x", "ridge_x0", 0, "km", "Along-track center of the ridge."],
    ["Ridge center y", "ridge_y0", 25, "km", "Cross-track center of the ridge."],
    ["Ridge length sigma", "ridge_sigma_x", 24, "km", "Long direction of the ridge feature."],
    ["Ridge width sigma", "ridge_sigma_y", 3.5, "km", "Narrow cross-track width of the ridge."],
    ["Crater/depression depth", "D_crater", 180, "m", "Positive number becomes a negative depression in the surface model."],
    ["Crater center x", "crater_x0", -18, "km", "Along-track center of depression."],
    ["Crater center y", "crater_y0", 8, "km", "Cross-track center of depression."],
    ["Crater width sigma", "crater_sigma", 8, "km", "Controls how broad the depression is."],
    ["Chaos amplitude", "A_chaos", 65, "m", "Mixed sinusoidal terrain term for irregular chaos-like height variation."],
    ["Fine roughness amplitude", "A_rough", 35, "m", "Smaller surface roughness term."],
    ["Roughness wavelength x", "Lx", 18, "km", "Along-track roughness wavelength."],
    ["Roughness wavelength y", "Ly", 12, "km", "Cross-track roughness wavelength."],
    ["Trough depth", "D_trough", 120, "m", "Negative linear feature, like a fracture/trough."],
    ["Trough center x", "trough_x0", 12, "km", "Along-track center of trough."],
    ["Trough center y", "trough_y0", -6, "km", "Cross-track center of trough."],
    ["Trough width sigma", "trough_sigma_y", 2.5, "km", "Narrow width of trough."],
    ["Trough length sigma", "trough_sigma_x", 38, "km", "Long direction of trough."],
    ["Terrain vertical uncertainty", "sigma_h", 75, "m", "Representative uncertainty band for the topographic height model."],
    ["Terrain seed", "terrain_seed", 7, "", "Change this number to generate a different repeatable random-looking surface. Same seed gives the same graphs."],
    ["Seeded random amplitude", "A_seeded", 45, "m", "Strength of the generated terrain added on top of the DEM-style surface."],
    ["Seeded random scale x", "L_seed_x", 12, "km", "Along-track scale for seeded terrain waves."],
    ["Seeded random scale y", "L_seed_y", 9, "km", "Cross-track scale for seeded terrain waves."],
    ["Existing DEM-style scale", "S_dem", 1, "", "Multiplier for the project synthetic DEM pattern from reason_common.py."],
    ["Europa radius", "R_e", 1560.8, "km", "Europa mean radius used for spherical slant-range geometry."],
  ];
  sheet.getRange("A26:E52").values = topoRows;
  styleTable(sheet, "A26:E52", "A26:E26");
  sheet.getRange("C27:C52").format = {
    fill: colors.yellow,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    numberFormat: "0.00",
    horizontalAlignment: "right",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("C27").dataValidation = { rule: { type: "list", values: ["TRUE", "FALSE"] } };
  sheet.getRange("C27").format = {
    fill: colors.yellow,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    numberFormat: "General",
    horizontalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("C47").format.numberFormat = "0";
  sheet.getRange("A54:E54").values = [["Topography note", "This is a detailed representative terrain model, not a real imported Europa DEM. It now combines the local project synthetic DEM shape with a seed-controlled random terrain term so you can test multiple possible surfaces.", "", "", ""]];
  sheet.mergeCells("B54:E54");
  sheet.getRange("A54:E54").format = {
    fill: colors.warn,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };
  setWidths(sheet, { A: 26, B: 18, C: 12, D: 10, E: 58, F: 12, G: 30, H: 10, I: 10, J: 10, K: 11, L: 15, M: 14, N: 72 });
  sheet.freezePanes.freezeRows(4);
}

function buildModelData(sheet) {
  const headers = [
    "x_km",
    "z_km",
    "R_nadir_km",
    "R_off_km",
    "Delta_R_m",
    "apparent_depth_m",
    "extra_delay_us",
    "horizontal_offset_km",
    "look_angle_deg",
    "vhf_phase_deg",
    "relative_power",
    "power_dB",
    "dz_dx",
    "dz_dt_km_s",
    "range_rate_m_s",
    "vhf_doppler_hz",
    "hf_doppler_hz",
    "vhf_band_low_m",
    "vhf_band_high_m",
    "hf_band_low_m",
    "hf_band_high_m",
    "abs_vhf_doppler_hz",
    "abs_hf_doppler_hz",
    "h_nadir_m",
    "h_target_m",
    "R_nadir_topo_km",
    "R_off_topo_km",
    "Delta_R_topo_m",
    "apparent_depth_topo_m",
    "extra_delay_topo_us",
    "look_angle_topo_deg",
    "vhf_phase_topo_deg",
    "relative_power_topo",
    "power_dB_topo",
    "depth_change_topo_minus_flat_m",
    "delay_change_topo_minus_flat_us",
    "target_minus_nadir_height_m",
    "range_rate_topo_m_s",
    "vhf_doppler_topo_hz",
    "hf_doppler_topo_hz",
    "abs_vhf_doppler_topo_hz",
    "abs_hf_doppler_topo_hz",
    "topo_depth_uncertainty_m",
    "topo_depth_low_m",
    "topo_depth_high_m",
  ];
  sheet.getRange("A1:AS1").values = [headers];
  const formulas = [];
  for (let i = 0; i <= 240; i += 1) {
    const r = i + 2;
    const flatTheta = `SQRT(A${r}^2+Inputs!$C$6^2)/Inputs!$C$52`;
    const flatRoff = `SQRT((Inputs!$C$52+B${r})^2+Inputs!$C$52^2-2*(Inputs!$C$52+B${r})*Inputs!$C$52*COS(${flatTheta}))`;
    const topoTheta = flatTheta;
    const topoRoff = `SQRT((Inputs!$C$52+B${r})^2+(Inputs!$C$52+Y${r}/1000)^2-2*(Inputs!$C$52+B${r})*(Inputs!$C$52+Y${r}/1000)*COS(${topoTheta}))`;
    const topoRangeRate =
      r === 2
        ? `=1000*(AA3-AA2)/(A3-A2)*Inputs!$C$11`
        : r === 242
          ? `=1000*(AA242-AA241)/(A242-A241)*Inputs!$C$11`
          : `=1000*(AA${r + 1}-AA${r - 1})/(A${r + 1}-A${r - 1})*Inputs!$C$11`;
    const flatRangeRate =
      r === 2
        ? `=1000*(D3-D2)/(A3-A2)*Inputs!$C$11`
        : r === 242
          ? `=1000*(D242-D241)/(A242-A241)*Inputs!$C$11`
          : `=1000*(D${r + 1}-D${r - 1})/(A${r + 1}-A${r - 1})*Inputs!$C$11`;
    formulas.push([
      `=Inputs!$C$7+${i}*(Inputs!$C$8-Inputs!$C$7)/240`,
      `=Inputs!$C$5+Inputs!$C$9*(A${r}/Inputs!$C$10)^2`,
      `=B${r}`,
      `=${flatRoff}`,
      `=(D${r}-C${r})*1000`,
      `=E${r}/Inputs!$C$12`,
      `=2*E${r}/Inputs!$C$21*1000000`,
      `=SQRT(A${r}^2+Inputs!$C$6^2)`,
      `=DEGREES(ATAN(H${r}/B${r}))`,
      `=DEGREES((2*PI()/Inputs!$C$13)*Inputs!$C$15*SIN(RADIANS(I${r})))`,
      `=(C${r}/D${r})^4`,
      `=10*LOG10(K${r})`,
      `=2*(Inputs!$C$9/(Inputs!$C$10^2))*A${r}`,
      `=M${r}*Inputs!$C$11`,
      flatRangeRate,
      `=-2*O${r}/Inputs!$C$13`,
      `=-2*O${r}/Inputs!$C$14`,
      `=F${r}-Inputs!$C$16/2`,
      `=F${r}+Inputs!$C$16/2`,
      `=F${r}-Inputs!$C$17/2`,
      `=F${r}+Inputs!$C$17/2`,
      `=ABS(P${r})`,
      `=ABS(Q${r})`,
      `=${topoExpr(`A${r}`, "0")}`,
      `=${topoExpr(`A${r}`, "Inputs!$C$6")}`,
      `=B${r}-X${r}/1000`,
      `=${topoRoff}`,
      `=(AA${r}-Z${r})*1000`,
      `=AB${r}/Inputs!$C$12`,
      `=2*AB${r}/Inputs!$C$21*1000000`,
      `=DEGREES(ATAN(H${r}/(B${r}-Y${r}/1000)))`,
      `=DEGREES((2*PI()/Inputs!$C$13)*Inputs!$C$15*SIN(RADIANS(AE${r})))`,
      `=(Z${r}/AA${r})^4`,
      `=10*LOG10(AG${r})`,
      `=AC${r}-F${r}`,
      `=AD${r}-G${r}`,
      `=Y${r}-X${r}`,
      topoRangeRate,
      `=-2*AL${r}/Inputs!$C$13`,
      `=-2*AL${r}/Inputs!$C$14`,
      `=ABS(AM${r})`,
      `=ABS(AN${r})`,
      `=IF(OR(Inputs!$C$27=TRUE,Inputs!$C$27="TRUE",Inputs!$C$27=1),Inputs!$C$46/Inputs!$C$12,0)`,
      `=AC${r}-AQ${r}`,
      `=AC${r}+AQ${r}`,
    ]);
  }
  sheet.getRange("A2:AS242").formulas = formulas;
  styleTable(sheet, "A1:AS242", "A1:AS1");
  sheet.tables.add("A1:AS242", true, "ModelDataTable");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, {
    A: 10,
    B: 10,
    C: 12,
    D: 12,
    E: 12,
    F: 16,
    G: 14,
    H: 16,
    I: 14,
    J: 14,
    K: 14,
    L: 11,
    M: 10,
    N: 12,
    O: 14,
    P: 14,
    Q: 14,
    R: 13,
    S: 13,
    T: 13,
    U: 13,
    V: 16,
    W: 16,
    X: 13,
    Y: 13,
    Z: 15,
    AA: 15,
    AB: 15,
    AC: 18,
    AD: 18,
    AE: 16,
    AF: 16,
    AG: 16,
    AH: 14,
    AI: 20,
    AJ: 20,
    AK: 18,
    AL: 18,
    AM: 18,
    AN: 18,
    AO: 18,
    AP: 18,
    AQ: 18,
    AR: 16,
    AS: 16,
  });
  sheet.getRange("A2:AS242").format.numberFormat = "0.000";
}

function buildChartData(sheet) {
  sheet.getRange("A1:E1").values = [["x (km)", "Nadir reference reading (m)", "Constant-altitude off-nadir reading (m)", "Parabolic off-nadir reading (m)", "Parabolic with planet surface reading (m)"]];
  sheet.getRange("G1:J1").values = [["x (km)", "Flat floor baseline (0 m)", "Off-nadir target topography height (m)", "Nadir topography height (m)"]];
  sheet.getRange("K1:N1").values = [["x (km)", "Off-nadir target surface height (m)", "Nadir surface height (m)", "Off-nadir satellite apparent surface height equivalent (m)"]];
  sheet.getRange("P1:T1").values = [["x (km)", "Flat VHF Doppler (Hz)", "Topography-adjusted VHF Doppler (Hz)", "Flat HF Doppler (Hz)", "Topography-adjusted HF Doppler (Hz)"]];
  sheet.getRange("V1:W1").values = [["x (km)", "Altitude rise above z0 (km)"]];
  sheet.getRange("Y1:AB1").values = [["x (km)", "Nadir reference reading (m)", "Constant-altitude off-nadir reading (m)", "Parabolic off-nadir reading (m)"]];
  const depth = [];
  const topoHeight = [];
  const topoDelta = [];
  const doppler = [];
  const altitude = [];
  const delay = [];
  for (let r = 2; r <= 242; r += 1) {
    const xRef = `Model_Data!A${r}`;
    const constantTheta = `SQRT((${xRef})^2+Inputs!$C$6^2)/Inputs!$C$52`;
    const constantFlatRange = `SQRT((Inputs!$C$52+Inputs!$C$5)^2+Inputs!$C$52^2-2*(Inputs!$C$52+Inputs!$C$5)*Inputs!$C$52*COS(${constantTheta}))`;
    const constantFlatDepth = `((${constantFlatRange}-Inputs!$C$5)*1000/Inputs!$C$12)`;
    const appliedHeightEquivalent = `-(Model_Data!AC${r}-Model_Data!F${r})*Inputs!$C$12`;
    depth.push([`=Model_Data!A${r}`, "=0", `=${constantFlatDepth}`, `=Model_Data!F${r}`, `=Model_Data!AC${r}`]);
    topoHeight.push([`=Model_Data!A${r}`, "=0", `=Model_Data!Y${r}`, `=Model_Data!X${r}`]);
    topoDelta.push([`=Model_Data!A${r}`, `=Model_Data!Y${r}`, `=Model_Data!X${r}`, `=${appliedHeightEquivalent}`]);
    doppler.push([`=Model_Data!A${r}`, `=Model_Data!P${r}`, `=Model_Data!AM${r}`, `=Model_Data!Q${r}`, `=Model_Data!AN${r}`]);
    altitude.push([`=Model_Data!A${r}`, `=Model_Data!B${r}-Inputs!$C$5`]);
    delay.push([`=Model_Data!A${r}`, "=0", `=${constantFlatDepth}`, `=Model_Data!F${r}`]);
  }
  sheet.getRange("A2:E242").formulas = depth;
  sheet.getRange("G2:J242").formulas = topoHeight;
  sheet.getRange("K2:N242").formulas = topoDelta;
  sheet.getRange("P2:T242").formulas = doppler;
  sheet.getRange("V2:W242").formulas = altitude;
  sheet.getRange("Y2:AB242").formulas = delay;
  styleTable(sheet, "A1:E242", "A1:E1");
  styleTable(sheet, "G1:J242", "G1:J1");
  styleTable(sheet, "K1:N242", "K1:N1");
  styleTable(sheet, "P1:T242", "P1:T1");
  styleTable(sheet, "V1:W242", "V1:W1");
  styleTable(sheet, "Y1:AB242", "Y1:AB1");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, { A: 12, B: 24, C: 36, D: 32, E: 38, F: 4, G: 12, H: 24, I: 30, J: 30, K: 12, L: 32, M: 32, N: 44, O: 4, P: 12, Q: 20, R: 28, S: 20, T: 28, U: 4, V: 12, W: 22, X: 4, Y: 12, Z: 24, AA: 36, AB: 32 });
  sheet.getRange("A2:AB242").format.numberFormat = "0.000";
}

function scenarioOn(row) {
  return `OR(Inputs!$F$${row}=TRUE,Inputs!$F$${row}="TRUE",Inputs!$F$${row}=1)`;
}

function scenarioExprs(inputRow, tRef) {
  const x = `(Inputs!$I$${inputRow}+(((${tRef})+1)/2)*(Inputs!$J$${inputRow}-Inputs!$I$${inputRow}))`;
  const z = `(Inputs!$H$${inputRow}+Inputs!$L$${inputRow}*((${x})/Inputs!$K$${inputRow})^2)`;
  const ground = `SQRT((${x})^2+Inputs!$C$6^2)`;
  const theta = `SQRT((${x})^2+Inputs!$C$6^2)/Inputs!$C$52`;
  const range = `SQRT((Inputs!$C$52+(${z}))^2+Inputs!$C$52^2-2*(Inputs!$C$52+(${z}))*Inputs!$C$52*COS(${theta}))`;
  const depth = `(((${range})-(${z}))*1000/Inputs!$C$12)`;
  const dzdx = `(2*Inputs!$L$${inputRow}*(${x})/(Inputs!$K$${inputRow}^2))`;
  const dThetaDx = `((${x})/(Inputs!$C$52*(${ground})))`;
  const dRdx = `(((${dzdx})*((Inputs!$C$52+(${z}))-Inputs!$C$52*COS(${theta}))+Inputs!$C$52*(Inputs!$C$52+(${z}))*SIN(${theta})*(${dThetaDx}))/(${range}))`;
  const rangeRate = `(1000*(${dRdx})*Inputs!$C$11)`;
  const vhfDoppler = `(-2*(${rangeRate})/Inputs!$C$13)`;
  return { x, z, depth, vhfDoppler };
}

function showScenario(inputRow, expr) {
  return `=IF(${scenarioOn(inputRow)},${expr},NA())`;
}

function buildScenarioData(sheet) {
  const names = [
    "Current custom inputs",
    "Paper low-altitude 800-km pass",
    "Paper ice-ocean 1600-km pass",
    "Paper operating 25-to-1000-km pass",
  ];
  sheet.getRange("A1:E1").values = [["pass fraction", ...names.map((name) => `${name} altitude (km)`)]];
  sheet.getRange("G1:K1").values = [["pass fraction", ...names.map((name) => `${name} apparent depth (m)`)]];
  sheet.getRange("M1:Q1").values = [["pass fraction", ...names.map((name) => `${name} VHF Doppler (Hz)`)]];
  sheet.getRange("S1:W1").values = [["pass fraction", ...names.map((name) => `${name} x (km)`)]];
  sheet.getRange("Y1:AC1").values = [["pass fraction", ...names.map((name) => `${name} raw altitude (km)`)]];
  sheet.getRange("AE1:AI1").values = [["pass fraction", ...names.map((name) => `${name} raw apparent depth (m)`)]];
  sheet.getRange("AK1:AO1").values = [["pass fraction", ...names.map((name) => `${name} raw VHF Doppler (Hz)`)]];
  sheet.getRange("AQ1:AV1").values = [["pass fraction", "Flat floor baseline (0 m)", ...names.map((name) => `${name} off-nadir surface (m)`)]];
  sheet.getRange("AX1:BC1").values = [["pass fraction", "Surface floor baseline (0 km)", ...names.map((name) => `${name} altitude (km)`)]];
  sheet.getRange("BE1:BJ1").values = [["pass fraction", "Nadir depth baseline (0 m)", ...names.map((name) => `${name} apparent depth (m)`)]];

  const altitudeRows = [];
  const depthRows = [];
  const dopplerRows = [];
  const rawXRows = [];
  const rawAltitudeRows = [];
  const rawDepthRows = [];
  const rawDopplerRows = [];
  const surfaceRows = [];
  const altitudeChartRows = [];
  const depthChartRows = [];
  for (let i = 0; i <= 240; i += 1) {
    const r = i + 2;
    const t = `=ROUND(-1+${i}*2/240,3)`;
    const chartT = `A${r}`;
    const rawT = `A${r}`;
    const exprs = [6, 7, 8, 9].map((inputRow) => scenarioExprs(inputRow, chartT));
    const rawExprs = [6, 7, 8, 9].map((inputRow) => scenarioExprs(inputRow, rawT));
    altitudeRows.push([t, ...exprs.map((parts, idx) => showScenario(6 + idx, parts.z))]);
    depthRows.push([`=A${r}`, ...exprs.map((parts, idx) => showScenario(6 + idx, parts.depth))]);
    dopplerRows.push([`=A${r}`, ...exprs.map((parts, idx) => showScenario(6 + idx, parts.vhfDoppler))]);
    rawXRows.push([`=A${r}`, ...rawExprs.map((parts) => `=${parts.x}`)]);
    rawAltitudeRows.push([`=A${r}`, ...rawExprs.map((parts) => `=${parts.z}`)]);
    rawDepthRows.push([`=A${r}`, ...rawExprs.map((parts) => `=${parts.depth}`)]);
    rawDopplerRows.push([`=A${r}`, ...rawExprs.map((parts) => `=${parts.vhfDoppler}`)]);
    surfaceRows.push([`=A${r}`, "=0", ...exprs.map((parts, idx) => showScenario(6 + idx, topoExpr(parts.x, "Inputs!$C$6")))]);
    altitudeChartRows.push([`=A${r}`, "=0", ...exprs.map((parts, idx) => showScenario(6 + idx, parts.z))]);
    depthChartRows.push([`=A${r}`, "=0", ...exprs.map((parts, idx) => showScenario(6 + idx, parts.depth))]);
  }
  sheet.getRange("A2:E242").formulas = altitudeRows;
  sheet.getRange("G2:K242").formulas = depthRows;
  sheet.getRange("M2:Q242").formulas = dopplerRows;
  sheet.getRange("S2:W242").formulas = rawXRows;
  sheet.getRange("Y2:AC242").formulas = rawAltitudeRows;
  sheet.getRange("AE2:AI242").formulas = rawDepthRows;
  sheet.getRange("AK2:AO242").formulas = rawDopplerRows;
  sheet.getRange("AQ2:AV242").formulas = surfaceRows;
  sheet.getRange("AX2:BC242").formulas = altitudeChartRows;
  sheet.getRange("BE2:BJ242").formulas = depthChartRows;

  styleTable(sheet, "A1:E242", "A1:E1");
  styleTable(sheet, "G1:K242", "G1:K1");
  styleTable(sheet, "M1:Q242", "M1:Q1");
  styleTable(sheet, "S1:W242", "S1:W1");
  styleTable(sheet, "Y1:AC242", "Y1:AC1");
  styleTable(sheet, "AE1:AI242", "AE1:AI1");
  styleTable(sheet, "AK1:AO242", "AK1:AO1");
  styleTable(sheet, "AQ1:AV242", "AQ1:AV1");
  styleTable(sheet, "AX1:BC242", "AX1:BC1");
  styleTable(sheet, "BE1:BJ242", "BE1:BJ1");
  sheet.freezePanes.freezeRows(1);
  setWidths(sheet, {
    A: 12,
    B: 24,
    C: 30,
    D: 30,
    E: 32,
    F: 4,
    G: 12,
    H: 30,
    I: 34,
    J: 34,
    K: 36,
    L: 4,
    M: 12,
    N: 30,
    O: 34,
    P: 34,
    Q: 36,
    R: 4,
    S: 12,
    T: 24,
    U: 30,
    V: 30,
    W: 32,
    Y: 12,
    Z: 24,
    AA: 30,
    AB: 30,
    AC: 32,
    AE: 12,
    AF: 30,
    AG: 34,
    AH: 34,
    AI: 36,
    AK: 12,
    AL: 30,
    AM: 34,
    AN: 34,
    AO: 36,
    AQ: 12,
    AR: 24,
    AS: 32,
    AT: 36,
    AU: 36,
    AV: 38,
    AX: 12,
    AY: 28,
    AZ: 24,
    BA: 30,
    BB: 30,
    BC: 32,
    BE: 12,
    BF: 28,
    BG: 30,
    BH: 34,
    BI: 34,
    BJ: 36,
  });
  sheet.getRange("A2:BJ242").format.numberFormat = "0.000";
}

function buildPrf(sheet) {
  setTitle(sheet, "A1:F1", "PRF and Pulse Timing Results");
  sheet.mergeCells("A1:F1");
  sheet.getRange("A3:F3").values = [["PRF (Hz)", "Pulse interval (ms)", "Along-track spacing (m)", "Unambiguous range (km)", "Pulses in air at z0", "Doppler sampling status"]];
  const prfRows = [];
  for (let i = 0; i < 3; i += 1) {
    const inputRow = 18 + i;
    const outRow = 4 + i;
    prfRows.push([
      `=Inputs!$C$${inputRow}`,
      `=1000/A${outRow}`,
      `=Inputs!$C$11*1000/A${outRow}`,
      `=Inputs!$C$21/(2*A${outRow})/1000`,
      `=A${outRow}*(2*Inputs!$C$5*1000/Inputs!$C$21)`,
      `=IF(A${outRow}>=Dashboard!$B$16,"OK for modeled topo VHF Doppler","Below simple Doppler floor")`,
    ]);
  }
  sheet.getRange("A4:F6").formulas = prfRows;
  styleTable(sheet, "A3:F6", "A3:F3");
  setWidths(sheet, { A: 12, B: 18, C: 22, D: 22, E: 20, F: 30 });
  sheet.getRange("A4:E6").format.numberFormat = "0.000";
}

function buildDashboard(sheet, chartData, scenarioData) {
  setTitle(sheet, "A1:H1", "Parabolic Motion Radar + Topography Parameter Model");
  sheet.mergeCells("A1:H1");
  sheet.getRange("A2").values = [["Use Inputs!C27 to apply/remove topography from the main outputs and charts. Inputs!C47 changes the terrain seed. Long-pass scenario ranges use Europa spherical curvature instead of flat Cartesian range. Off-nadir means the side-looking target at Inputs!C6, while nadir means straight below the spacecraft."]];
  sheet.mergeCells("A2:H2");
  sheet.getRange("A2:H2").format = {
    fill: colors.lightGray,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
  };

  sectionHeader(sheet, "A4:D4", "Key Output Results");
  sheet.mergeCells("A4:D4");
  sheet.getRange("A5:D17").values = [
    ["Output", "Value", "Unit", "What it means"],
    ["Topography toggle", "", "", "Set Inputs!C27 to TRUE to include terrain, or FALSE to return to a flat surface. Change Inputs!C47 to test a new terrain case."],
    ["Flat apparent depth at mid-pass", "", "m", "Original flat-surface result."],
    ["Topo apparent depth at mid-pass", "", "m", "Apparent depth after terrain height changes the range geometry."],
    ["Depth change from topography", "", "m", "Topo apparent depth minus flat apparent depth."],
    ["Topo extra two-way delay", "", "us", "Two-way delay after topography is included."],
    ["Topo VHF interferometric phase", "", "deg", "VHF phase after topography changes the look geometry."],
    ["Max target terrain height", "", "m", "Highest modeled terrain at the side-offset target path."],
    ["Min target terrain height", "", "m", "Lowest modeled terrain at the side-offset target path."],
    ["Max absolute topo depth change", "", "m", "Largest magnitude of topography-driven apparent-depth change."],
    ["Max topo VHF Doppler magnitude", "", "Hz", "Largest VHF Doppler after topography is included."],
    ["Simple minimum PRF with topo", "", "Hz", "Twice max topo VHF Doppler, a simple no-alias floor."],
    ["Topo depth uncertainty band", "", "m", "Representative vertical uncertainty converted to apparent-depth uncertainty."],
  ];
  sheet.getRange("B6:B17").formulas = [
    ['=IF(OR(Inputs!$C$27=TRUE,Inputs!$C$27="TRUE",Inputs!$C$27=1),"Topography ON","Topography OFF")'],
    ["=Model_Data!F122"],
    ["=Model_Data!AC122"],
    ["=Model_Data!AI122"],
    ["=Model_Data!AD122"],
    ["=Model_Data!AF122"],
    ["=MAX(Model_Data!Y2:Y242)"],
    ["=MIN(Model_Data!Y2:Y242)"],
    ["=MAX(MAX(Model_Data!AI2:AI242),-MIN(Model_Data!AI2:AI242))"],
    ["=MAX(Model_Data!AO2:AO242)"],
    ["=2*B15"],
    ["=Model_Data!AQ122"],
  ];
  styleTable(sheet, "A5:D17", "A5:D5");
  sheet.getRange("B6:B17").format = {
    fill: colors.lightBlue,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    horizontalAlignment: "right",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("B6").format.horizontalAlignment = "center";
  sheet.getRange("B7:B17").format.numberFormat = "0.000";

  sectionHeader(sheet, "A19:F19", "PRF Choices");
  sheet.mergeCells("A19:F19");
  sheet.getRange("A20:F23").values = [
    ["PRF (Hz)", "Pulse interval (ms)", "Along-track spacing (m)", "Unambiguous range (km)", "Pulses in air at z0", "Status"],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""],
  ];
  sheet.getRange("A21:F23").formulas = [
    ["=PRF_Results!A4", "=PRF_Results!B4", "=PRF_Results!C4", "=PRF_Results!D4", "=PRF_Results!E4", "=PRF_Results!F4"],
    ["=PRF_Results!A5", "=PRF_Results!B5", "=PRF_Results!C5", "=PRF_Results!D5", "=PRF_Results!E5", "=PRF_Results!F5"],
    ["=PRF_Results!A6", "=PRF_Results!B6", "=PRF_Results!C6", "=PRF_Results!D6", "=PRF_Results!E6", "=PRF_Results!F6"],
  ];
  styleTable(sheet, "A20:F23", "A20:F20");
  sheet.getRange("A21:E23").format.numberFormat = "0.000";

  sectionHeader(sheet, "A25:H25", "How to read this model");
  sheet.mergeCells("A25:H25");
  sheet.getRange("A26").values = [["The chain is: parabolic motion changes z(x); topography adds h(x,y); the radar then turns that real surface pattern into an apparent range/depth shift. The off-nadir target is the side-looking point at y = Inputs!C6; nadir is the straight-down reference. Flat means flat surface, not straight spacecraft motion."]];
  sheet.mergeCells("A26:H26");
  sheet.getRange("A26:H26").format = {
    fill: colors.warn,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };

  setWidths(sheet, { A: 31, B: 13, C: 9, D: 34, E: 14, F: 18, G: 14, H: 14, I: 28, J: 16, K: 16, L: 16, M: 16, N: 16, O: 16, P: 16, Q: 16, R: 16 });
  sheet.freezePanes.freezeRows(4);

  const depthChart = sheet.charts.add("line", chartData.getRange("A1:E242"));
  depthChart.title = "Combined Satellite Apparent Readings";
  depthChart.hasLegend = true;
  depthChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  depthChart.yAxis = { numberFormatCode: "0" };
  depthChart.setPosition("J2", "R18");

  const topographyChart = sheet.charts.add("line", chartData.getRange("G1:J242"));
  topographyChart.title = "Current Run Surface: Flat Floor, Off-Nadir, Nadir";
  topographyChart.hasLegend = true;
  topographyChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  topographyChart.yAxis = { numberFormatCode: "0" };
  topographyChart.setPosition("A28", "H45");

  const dopplerChart = sheet.charts.add("line", chartData.getRange("P1:T242"));
  dopplerChart.title = "Flat vs Topography-Adjusted Doppler";
  dopplerChart.hasLegend = true;
  dopplerChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  dopplerChart.yAxis = { numberFormatCode: "0" };
  dopplerChart.setPosition("J20", "R36");

  sectionHeader(sheet, "A57:I57", "Paper Pass Scenario Comparison");
  sheet.mergeCells("A57:I57");
  sheet.getRange("A58:I62").values = [
    ["Scenario", "Show", "z0 (km)", "Length (km)", "Edge alt (km)", "Mid depth (m)", "Max VHF (Hz)", "PRF floor (Hz)", "Basis"],
    ["", "TRUE", "", "", "", "", "", "", ""],
    ["", "TRUE", "", "", "", "", "", "", ""],
    ["", "TRUE", "", "", "", "", "", "", ""],
    ["", "TRUE", "", "", "", "", "", "", ""],
  ];
  sheet.getRange("A59:A62").formulas = [
    ["=Inputs!G6"],
    ["=Inputs!G7"],
    ["=Inputs!G8"],
    ["=Inputs!G9"],
  ];
  sheet.getRange("C59:H62").formulas = [
    ["=Inputs!H6", "=Inputs!J6-Inputs!I6", "=Inputs!M6", "=Scenario_Data!AF122", "=MAX(MAX(Scenario_Data!AL2:AL242),-MIN(Scenario_Data!AL2:AL242))", "=2*G59"],
    ["=Inputs!H7", "=Inputs!J7-Inputs!I7", "=Inputs!M7", "=Scenario_Data!AG122", "=MAX(MAX(Scenario_Data!AM2:AM242),-MIN(Scenario_Data!AM2:AM242))", "=2*G60"],
    ["=Inputs!H8", "=Inputs!J8-Inputs!I8", "=Inputs!M8", "=Scenario_Data!AH122", "=MAX(MAX(Scenario_Data!AN2:AN242),-MIN(Scenario_Data!AN2:AN242))", "=2*G61"],
    ["=Inputs!H9", "=Inputs!J9-Inputs!I9", "=Inputs!M9", "=Scenario_Data!AI122", "=MAX(MAX(Scenario_Data!AO2:AO242),-MIN(Scenario_Data!AO2:AO242))", "=2*G62"],
  ];
  sheet.getRange("I59:I62").values = [
    ["Current editable"],
    ["800 km below 400"],
    ["1600 km below 1000"],
    ["25-1000 km range"],
  ];
  styleTable(sheet, "A58:I62", "A58:I58");
  sheet.getRange("C59:H62").format.numberFormat = "0.000";
  sheet.getRange("B59:B62").dataValidation = { rule: { type: "list", values: ["TRUE", "FALSE"] } };
  sheet.getRange("B59:B62").format = {
    fill: colors.yellow,
    font: { name: "Calibri", size: 10, bold: true, color: colors.navy },
    horizontalAlignment: "center",
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  sheet.getRange("A63:I63").values = [["Scenario note", "Paper numbers are converted into this workbook's simplified parabola so the outcomes can be compared. The paper states altitude ranges and groundtrack requirements, not an exact parabolic spacecraft trajectory.", "", "", "", "", "", "", ""]];
  sheet.mergeCells("B63:I63");
  sheet.getRange("A63:I63").format = {
    fill: colors.warn,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: colors.grid },
  };

  const scenarioAltitudeChart = sheet.charts.add("line", scenarioData.getRange("AX1:BC242"));
  scenarioAltitudeChart.title = "Checked Paper Pass Altitude Profiles";
  scenarioAltitudeChart.hasLegend = true;
  scenarioAltitudeChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  scenarioAltitudeChart.yAxis = { numberFormatCode: "0" };
  scenarioAltitudeChart.setPosition("A94", "I112");

  const motionShiftChart = sheet.charts.add("line", chartData.getRange("Y1:AB242"));
  motionShiftChart.title = "Motion Only: Constant vs Parabolic Reading";
  motionShiftChart.hasLegend = true;
  motionShiftChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  motionShiftChart.yAxis = { numberFormatCode: "0" };
  motionShiftChart.setPosition("J38", "R55");

  const scenarioDepthChart = sheet.charts.add("line", scenarioData.getRange("BE1:BJ242"));
  scenarioDepthChart.title = "Checked Paper Pass Apparent-Depth Outcomes";
  scenarioDepthChart.hasLegend = true;
  scenarioDepthChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  scenarioDepthChart.yAxis = { numberFormatCode: "0" };
  scenarioDepthChart.setPosition("J74", "R92");

  const scenarioSurfaceChart = sheet.charts.add("line", scenarioData.getRange("AQ1:AV242"));
  scenarioSurfaceChart.title = "Expected Off-Nadir Surface by Checked Run";
  scenarioSurfaceChart.hasLegend = true;
  scenarioSurfaceChart.xAxis = { axisType: "textAxis", tickLabelInterval: 24 };
  scenarioSurfaceChart.yAxis = { numberFormatCode: "0" };
  scenarioSurfaceChart.setPosition("A73", "I91");
}

function buildFormulaGuide(sheet) {
  setTitle(sheet, "A1:D1", "Formula Guide");
  sheet.mergeCells("A1:D1");
  const rows = [
    ["Formula", "Meaning", "Inputs used", "Output produced"],
    ["z(x) = z0 + Delta_z_edge*(x/x_edge)^2", "Parabolic altitude path.", "z0, Delta_z_edge, x, x_edge", "altitude z"],
    ["Paper pass scenario = paper altitude/length values inserted into z(x)", "The paper gives altitude ranges and groundtrack lengths; this workbook converts them into comparable parabolic cases.", "Inputs F6:N9", "scenario overlays"],
    ["scenario_show = TRUE/FALSE", "Controls whether a scenario line appears in the paper-pass charts. The summary table still calculates all scenarios.", "Inputs F6:F9", "visible chart series"],
    ["theta = sqrt(x^2 + y^2) / R_e", "Angular surface separation on Europa.", "x, y, Europa radius", "central angle"],
    ["R_off = sqrt((R_e+z)^2 + R_e^2 - 2*(R_e+z)*R_e*cos(theta))", "Curvature-corrected slant range from spacecraft to flat surface target.", "x, y, z, R_e", "off-nadir range"],
    ["R_nadir = z", "Range to target directly below platform.", "z", "nadir range"],
    ["Delta_R = R_off - R_nadir", "Extra one-way path from side offset.", "R_off, R_nadir", "extra range"],
    ["d_app = Delta_R / n", "Maps extra range onto apparent in-ice depth.", "Delta_R, n", "apparent depth"],
    ["Delta_t = 2*Delta_R/c", "Two-way extra echo delay.", "Delta_R, c", "extra delay"],
    ["theta = atan(horizontal/z)", "Look angle away from nadir.", "x, y, z", "look angle"],
    ["phi = (2*pi/lambda)*b*sin(theta)", "Interferometric phase for VHF baseline.", "lambda, b, theta", "phase"],
    ["P_rel = (R_nadir/R_off)^4", "Simple geometry-only two-way range-power ratio.", "R_nadir, R_off", "relative power"],
    ["dz/dx = 2*a*x", "Slope of parabolic altitude path.", "a, x", "vertical slope"],
    ["dz/dt = dz/dx * v", "Vertical speed caused by moving along the parabola.", "dz/dx, v", "vertical speed"],
    ["dR/dt = (x*v + z*dz/dt)/R", "Range rate from chain rule.", "x, v, z, dz/dt, R", "range rate"],
    ["f_D = -2*(dR/dt)/lambda", "Two-way Doppler shift.", "range rate, lambda", "Doppler"],
    ["PRF_min = 2*max(abs(f_D))", "Simple Doppler sampling floor.", "Doppler", "minimum PRF"],
    ["h_project = S_dem*(ridge + scallop + chaos + along_bulge)", "Project synthetic DEM-style terrain from reason_common.py, rewritten in Excel formulas.", "S_dem, x, y", "baseline representative surface"],
    ["h_seeded = A_seeded*(smooth waves + deterministic hash)", "Seed-controlled random-looking terrain. Same seed repeats the same surface; changing the seed changes the surface.", "terrain_seed, A_seeded, L_seed_x, L_seed_y", "dynamic terrain variation"],
    ["h_total = h_project + h_ridge + h_crater + h_chaos + h_rough + h_trough + h_seeded", "Representative Europa topography model.", "topography controls and seed controls", "surface height"],
    ["h_ridge = A*exp(-(x-x0)^2/(2*sx^2))*exp(-(y-y0)^2/(2*sy^2))", "Raised ridge / band feature.", "ridge height, center, length, width", "ridge height"],
    ["h_crater = -D*exp(-((x-x0)^2+(y-y0)^2)/(2*sigma^2))", "Depression or crater-like low area.", "crater depth, center, width", "depression height"],
    ["h_rough = A*sin(2*pi*x/Lx)*sin(2*pi*y/Ly)", "Fine roughness variation.", "roughness amplitude and wavelength", "roughness height"],
    ["R_off_topo = sqrt((R_e+z)^2 + (R_e+h_target/1000)^2 - 2*(R_e+z)*(R_e+h_target/1000)*cos(theta))", "Curvature-corrected slant range to the topographic target.", "x, y, z, h_target, R_e", "topographic range"],
    ["R_nadir_topo = z - h_nadir/1000", "Nadir range after local surface elevation is included.", "z, nadir height", "topographic nadir range"],
    ["d_app_topo = (R_off_topo - R_nadir_topo)/n", "Topography-adjusted apparent depth.", "topographic ranges, n", "apparent depth with topography"],
    ["surface_signal = h_target - h_nadir", "The original modeled surface/topography difference between the target path and nadir path.", "h_target, h_nadir", "true surface signal"],
    ["apparent_surface_height = -n*(d_app_topo - d_app_flat)", "Converts the topography-caused apparent-depth change back into surface-height-equivalent meters for comparison with h_target and h_nadir.", "d_app_topo, d_app_flat, n", "radar apparent surface height"],
    ["constant-altitude shift", "Same topography shift calculation, but with z held constant at z0 instead of using the parabola.", "z0, h_target, h_nadir", "path-motion comparison"],
  ];
  sheet.getRange(`A3:D${rows.length + 2}`).values = rows;
  styleTable(sheet, `A3:D${rows.length + 2}`, "A3:D3");
  setWidths(sheet, { A: 45, B: 55, C: 36, D: 24 });
  sheet.freezePanes.freezeRows(3);
}

function buildTopographyFormulas(sheet) {
  setTitle(sheet, "A1:E1", "Topography Formula Explanation");
  sheet.mergeCells("A1:E1");
  sheet.getRange("A2").values = [["This sheet explains the representative Europa topography model used when Inputs!C27 is TRUE. It is not a real imported DEM; it combines the project's synthetic DEM-style terrain with a seed-controlled random terrain term for testing multiple possible surfaces."]];
  sheet.mergeCells("A2:E2");
  sheet.getRange("A2:E2").format = {
    fill: colors.lightGray,
    font: { name: "Calibri", size: 10, color: colors.slate },
    wrapText: true,
  };

  const rows = [
    ["Piece", "Formula", "What it represents", "Changeable inputs", "Effect on radar output"],
    [
      "Checkbox / toggle",
      "topography_factor = IF(OR(Inputs!C27=TRUE, Inputs!C27=\"TRUE\", Inputs!C27=1), 1, 0)",
      "Turns all terrain terms on or off.",
      "Inputs!C27",
      "TRUE includes terrain height; FALSE makes all h(x,y) terms equal 0.",
    ],
    [
      "Project DEM-style surface",
      "h_project = S_dem*(115*EXP(-((y-25)^2)/(4.5^2)) + 70*EXP(-((y+38)^2)/(7^2))*(0.55+0.45*SIN(2*PI()*x/45)) + 24*SIN(2*PI()*y/9+x/18)*EXP(-((y+5)^2)/(22^2)) + 18*SIN(2*PI()*x/70))",
      "The same style as the existing local make_synthetic_dem model: an off-nadir ridge, scalloped terrain, chaos-like variation, and along-track bulge.",
      "S_dem, x, y",
      "Provides a repeatable baseline terrain pattern based on the existing project model.",
    ],
    [
      "Seeded dynamic terrain",
      "h_seeded = A_seeded*(0.70*smooth_seeded_waves + 0.30*deterministic_hash(x,y,seed))",
      "A random-looking but repeatable terrain term. It avoids volatile RAND(), so the graph stays stable until the seed is changed.",
      "terrain_seed, A_seeded, L_seed_x, L_seed_y",
      "Changing the seed tests a different possible topographic case.",
    ],
    [
      "Raised ridge",
      "h_ridge = A_ridge*EXP(-((x-ridge_x0)^2)/(2*ridge_sigma_x^2))*EXP(-((y-ridge_y0)^2)/(2*ridge_sigma_y^2))",
      "A long, narrow positive-height ridge or band, similar to a simplified Europa lineament/ridge.",
      "A_ridge, ridge_x0, ridge_y0, ridge_sigma_x, ridge_sigma_y",
      "A raised target usually shortens the target range and can pull apparent depth upward/shallower.",
    ],
    [
      "Crater/depression",
      "h_crater = -D_crater*EXP(-(((x-crater_x0)^2+(y-crater_y0)^2)/(2*crater_sigma^2)))",
      "A negative-height circular depression.",
      "D_crater, crater_x0, crater_y0, crater_sigma",
      "A depression usually lengthens the target range and can push apparent depth deeper.",
    ],
    [
      "Chaos terrain",
      "h_chaos = A_chaos*(0.55*SIN(2*PI()*x/Lx)+0.35*COS(2*PI()*y/Ly)+0.2*SIN(2*PI()*(x+y)/(0.5*(Lx+Ly))))",
      "A mixed wave term that gives irregular terrain instead of a single smooth hill.",
      "A_chaos, Lx, Ly",
      "Adds broad, uneven changes to terrain height along the pass.",
    ],
    [
      "Fine roughness",
      "h_rough = A_rough*SIN(2*PI()*x/Lx)*SIN(2*PI()*y/Ly)",
      "Smaller oscillating roughness on top of the larger terrain terms.",
      "A_rough, Lx, Ly",
      "Creates smaller-scale wiggles in topography-adjusted range/depth.",
    ],
    [
      "Trough/fracture",
      "h_trough = -D_trough*EXP(-((y-trough_y0)^2)/(2*trough_sigma_y^2))*EXP(-((x-trough_x0)^2)/(2*trough_sigma_x^2))",
      "A long negative-height trough or fracture-like feature.",
      "D_trough, trough_x0, trough_y0, trough_sigma_y, trough_sigma_x",
      "Can create a localized deeper apparent-depth shift.",
    ],
    [
      "Total surface height",
      "h_total(x,y) = topography_factor*(h_project + h_ridge + h_crater + h_chaos + h_rough + h_trough + h_seeded)",
      "The combined representative terrain surface used by the model.",
      "All topography and seed controls",
      "This is the terrain height used in the range equations.",
    ],
    [
      "Nadir topographic height",
      "h_nadir = h_total(x, 0)",
      "Surface height directly below the spacecraft path.",
      "x plus all topography controls",
      "Changes the reference/nadir range.",
    ],
    [
      "Target topographic height",
      "h_target = h_total(x, y)",
      "Surface height at the side-offset target path.",
      "x, y plus all topography controls",
      "Changes the off-nadir slant range.",
    ],
    [
      "Topographic nadir range",
      "R_nadir_topo = z(x) - h_nadir/1000",
      "Distance from spacecraft to the raised/lowered nadir surface.",
      "z(x), h_nadir",
      "Raised nadir terrain shortens the reference range.",
    ],
    [
      "Topographic off-nadir range",
      "theta = SQRT(x^2+y^2)/R_e; R_off_topo = SQRT((R_e+z)^2+(R_e+h_target/1000)^2-2*(R_e+z)*(R_e+h_target/1000)*COS(theta))",
      "Curvature-corrected slant range to the side-offset target after terrain height is included.",
      "x, y, z(x), h_target, R_e",
      "Raised target terrain changes the spherical slant range.",
    ],
    [
      "Topographic apparent depth",
      "d_app_topo = (R_off_topo - R_nadir_topo)*1000/n",
      "The apparent depth after topography changes both reference and target ranges.",
      "R_off_topo, R_nadir_topo, n",
      "This is the main output compared against flat apparent depth.",
    ],
    [
      "Topography depth difference",
      "depth_change = d_app_topo - d_app_flat",
      "How much terrain changes the apparent-depth result.",
      "d_app_topo, d_app_flat",
      "Negative means topography makes the echo appear shallower; positive means deeper.",
    ],
  ];
  sheet.getRange(`A4:E${rows.length + 3}`).values = rows;
  styleTable(sheet, `A4:E${rows.length + 3}`, "A4:E4");
  sheet.getRange(`B5:B${rows.length + 3}`).format = {
    font: { name: "Consolas", size: 9, color: colors.navy },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.grid },
  };
  setWidths(sheet, { A: 24, B: 74, C: 44, D: 40, E: 48 });
  sheet.freezePanes.freezeRows(4);
}

function buildChecks(sheet) {
  setTitle(sheet, "A1:C1", "Workbook Checks");
  sheet.mergeCells("A1:C1");
  sheet.getRange("A3:C3").values = [["Check", "Status", "Formula"]];
  sheet.getRange("A4:C23").values = [
    ["x_min < x_max", "", "Inputs!C7 must be less than Inputs!C8"],
    ["z0 positive", "", "Closest altitude must be positive"],
    ["x_edge positive", "", "Parabola edge must be positive"],
    ["ice refractive index positive", "", "n must be positive"],
    ["wavelengths positive", "", "HF and VHF wavelengths must be positive"],
    ["baseline positive", "", "Interferometry baseline must be positive"],
    ["topography toggle valid", "", "Inputs!C27 must be TRUE or FALSE"],
    ["topography widths positive", "", "Terrain sigma/width/wavelength values must be positive"],
    ["terrain uncertainty nonnegative", "", "Representative vertical uncertainty should be >= 0"],
    ["seeded terrain scales positive", "", "Seeded random terrain scales must be positive"],
    ["seeded random amplitude nonnegative", "", "Seeded random terrain amplitude should be >= 0"],
    ["project DEM scale nonnegative", "", "Existing DEM-style scale should be >= 0"],
    ["Europa radius positive", "", "Europa radius must be positive for spherical geometry"],
    ["scenario toggles valid", "", "Inputs!F6:F9 must be TRUE or FALSE"],
    ["scenario lengths positive", "", "Each scenario must have x_min < x_max and x_edge > 0"],
    ["PRF high vs simple PRF floor", "", "PRF_3 should exceed Dashboard topo minimum PRF for the default check"],
    ["model rows available", "", "Model_Data contains 241 plotted positions"],
    ["chart off-nadir surface link", "", "Chart_Data off-nadir surface line must reference Model_Data h_target"],
    ["chart nadir surface link", "", "Chart_Data nadir surface line must reference Model_Data h_nadir"],
    ["chart apparent-height conversion", "", "Chart apparent surface height must equal -n*(topo depth - flat depth)"],
  ];
  sheet.getRange("B4:B23").formulas = [
    ['=IF(Inputs!C7<Inputs!C8,"OK","Fix x_min/x_max")'],
    ['=IF(Inputs!C5>0,"OK","Fix z0")'],
    ['=IF(Inputs!C10>0,"OK","Fix x_edge")'],
    ['=IF(Inputs!C12>0,"OK","Fix n")'],
    ['=IF(AND(Inputs!C13>0,Inputs!C14>0),"OK","Fix wavelengths")'],
    ['=IF(Inputs!C15>0,"OK","Fix baseline")'],
    ['=IF(OR(Inputs!C27=TRUE,Inputs!C27=FALSE,Inputs!C27="TRUE",Inputs!C27="FALSE",Inputs!C27=1,Inputs!C27=0),"OK","Fix topography toggle")'],
    ['=IF(AND(Inputs!C31>0,Inputs!C32>0,Inputs!C36>0,Inputs!C39>0,Inputs!C40>0,Inputs!C44>0,Inputs!C45>0),"OK","Fix topography width")'],
    ['=IF(Inputs!C46>=0,"OK","Fix terrain uncertainty")'],
    ['=IF(AND(Inputs!C49>0,Inputs!C50>0),"OK","Fix seeded terrain scale")'],
    ['=IF(Inputs!C48>=0,"OK","Fix seeded amplitude")'],
    ['=IF(Inputs!C51>=0,"OK","Fix DEM scale")'],
    ['=IF(Inputs!C52>0,"OK","Fix Europa radius")'],
    ['=IF(AND(OR(Inputs!F6=TRUE,Inputs!F6=FALSE,Inputs!F6="TRUE",Inputs!F6="FALSE",Inputs!F6=1,Inputs!F6=0),OR(Inputs!F7=TRUE,Inputs!F7=FALSE,Inputs!F7="TRUE",Inputs!F7="FALSE",Inputs!F7=1,Inputs!F7=0),OR(Inputs!F8=TRUE,Inputs!F8=FALSE,Inputs!F8="TRUE",Inputs!F8="FALSE",Inputs!F8=1,Inputs!F8=0),OR(Inputs!F9=TRUE,Inputs!F9=FALSE,Inputs!F9="TRUE",Inputs!F9="FALSE",Inputs!F9=1,Inputs!F9=0)),"OK","Fix scenario toggles")'],
    ['=IF(AND(Inputs!I6<Inputs!J6,Inputs!K6>0,Inputs!I7<Inputs!J7,Inputs!K7>0,Inputs!I8<Inputs!J8,Inputs!K8>0,Inputs!I9<Inputs!J9,Inputs!K9>0),"OK","Fix scenario length")'],
    ['=IF(Inputs!C20>=Dashboard!B16,"OK","High PRF below simple floor")'],
    ['=IF(COUNTA(Model_Data!A2:A242)=241,"OK","Missing rows")'],
    ['=IF(Chart_Data!L122=Model_Data!Y122,"OK","Fix off-nadir chart link")'],
    ['=IF(Chart_Data!M122=Model_Data!X122,"OK","Fix nadir chart link")'],
    ['=IF(ABS(Chart_Data!N122+Model_Data!AI122*Inputs!C12)<0.001,"OK","Fix apparent-height conversion")'],
  ];
  styleTable(sheet, "A3:C23", "A3:C3");
  sheet.getRange("B4:B23").conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: colors.good, font: { bold: true, color: colors.navy } },
  });
  sheet.getRange("B4:B23").conditionalFormats.add("notContainsText", {
    text: "OK",
    format: { fill: colors.warn, font: { bold: true, color: colors.navy } },
  });
  setWidths(sheet, { A: 34, B: 28, C: 56 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
