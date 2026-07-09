import { Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
console.log(
  workbook.help("*", {
    search: "chart|series|line|marker|color",
    include: "index,examples,notes",
    maxChars: 9000,
  }).ndjson,
);
