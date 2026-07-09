import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/manual-20260607-parameter-model/spreadsheets/parabolic-radar-model/output/parabolic-motion-radar-model-baseline-and-runs.xlsx";
const outputDir =
  "C:/Users/tyboy/OneDrive/Documents/Nasa project/outputs/codex-20260608-parabolic-radar-review";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const sheetName of ["Dashboard", "Inputs", "Model_Data", "Chart_Data", "Scenario_Data", "Checks"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/current-${sheetName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}
