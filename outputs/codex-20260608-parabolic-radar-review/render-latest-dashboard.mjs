import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/parabolic-motion-radar-model-baseline-and-runs-checked-generated-topography.xlsx";
const outputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review/latest-Dashboard.png";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const preview = await workbook.render({
  sheetName: "Dashboard",
  autoCrop: "all",
  scale: 1,
  format: "png",
});

await fs.writeFile(outputPath, new Uint8Array(await preview.arrayBuffer()));
console.log(outputPath);
