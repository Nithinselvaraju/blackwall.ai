import fs from "fs"
import path from "path"

// Paths
const basePath = process.cwd()

const mainFilePath = path.join(
  basePath,
  "outputs",
  "blackwall_bengaluru_final_merged_reports.json"
)

const retryFilePath = path.join(
  basePath,
  "outputs",
  "blackwall_bengaluru_missing_5_to_10_reports.json"
)

const outputFilePath = path.join(
  basePath,
  "outputs",
  "blackwall_bengaluru_final_merged_reports.json"
)

// Read files
const mainData = JSON.parse(fs.readFileSync(mainFilePath, "utf-8"))
const retryData = JSON.parse(fs.readFileSync(retryFilePath, "utf-8"))

// Merge reports (avoid duplicates by grid)
const mergedReportsMap = new Map()

for (const report of mainData.reports) {
  mergedReportsMap.set(report.grid, report)
}

for (const report of retryData.reports) {
  mergedReportsMap.set(report.grid, report) // overwrite if exists
}

// Final merged result
const mergedResult = {
  meta: {
    ...mainData.meta,
    merged_at: new Date().toISOString(),
    total_locations: mergedReportsMap.size
  },
  reports: Array.from(mergedReportsMap.values()).sort(
    (a, b) => a.grid - b.grid
  )
}

// Write merged file
fs.writeFileSync(
  outputFilePath,
  JSON.stringify(mergedResult, null, 2),
  "utf-8"
)

console.log(
  `✅ Merge completed. Total reports: ${mergedReportsMap.size}`
)
