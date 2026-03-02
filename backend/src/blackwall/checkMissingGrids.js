import fs from "fs"
import path from "path"

const filePath = path.join(
  process.cwd(),
  "outputs",
  "blackwall_bengaluru_final_merged_reports.json"
)

const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))

const presentGrids = new Set(data.reports.map(r => r.grid))

const missing = []
for (let i = 1; i <= 57; i++) {
  if (!presentGrids.has(i)) {
    missing.push(i)
  }
}

console.log("Missing grids:", missing)
console.log("Total present:", presentGrids.size)
