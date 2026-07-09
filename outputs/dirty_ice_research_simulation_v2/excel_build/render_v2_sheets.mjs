import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const projectRoot = "C:/Users/tyboy/OneDrive/Documents/Nasa project";
const workbookPath = path.join(projectRoot, "outputs/europa_ice_subsurface_simulation/v20_paper_calibrated_dirty_ice_with_clutter.xlsx");
const previewDir = path.join(projectRoot, "outputs/dirty_ice_research_simulation_v2/excel_build/previews");

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
await fs.mkdir(previewDir, { recursive: true });

for (const item of [
  { sheetName: "V2_Track_Examples", range: "A1:L30" },
  { sheetName: "V2_Sensitivity", range: "A1:M40" },
  { sheetName: "V2_Sources", range: "A1:G41" },
]) {
  const png = await workbook.render({ sheetName: item.sheetName, range: item.range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${item.sheetName}.png`), new Uint8Array(await png.arrayBuffer()));
  console.log(`${item.sheetName} rendered`);
}
