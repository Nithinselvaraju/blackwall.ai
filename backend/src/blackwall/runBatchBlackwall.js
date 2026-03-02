import "dotenv/config"
import fs from "fs"
import path from "path"
import axios from "axios"
import { BLACKWALL_BASE, blackwallHeaders } from "../config/blackwall.js"

// Utility
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Load locations
const locationsPath = path.join(process.cwd(), "data", "bengaluru_grid_final_retry.json")
const locationsData = JSON.parse(fs.readFileSync(locationsPath, "utf-8"))
const locations = locationsData.locations

// 2. Prepare final output
const finalResult = {
  meta: {
    city: "Bengaluru",
    total_locations: locations.length,
    generated_at: new Date().toISOString()
  },
  reports: []
}

async function run() {
  for (const loc of locations) {
    console.log(`Processing ${loc.name}...`)

    try {
      // 3. ANALYZE
      const analyzeRes = await axios.post(
        `${BLACKWALL_BASE}/api/v1/analyze`,
        {
          latitude: loc.lat,
          longitude: loc.lon,
          radius: loc.radius_km || 2,
          location_name: loc.name
        },
        { headers: blackwallHeaders }
      )

      const jobId = analyzeRes.data.job_id

        // 4. STATUS LOOP (with logs)
        while (true) {
        const statusRes = await axios.get(
            `${BLACKWALL_BASE}/api/v1/status/${jobId}`,
            { headers: blackwallHeaders }
        )

        const status = statusRes.data.status?.toLowerCase()

        console.log(`Point ${loc.grid} status:`, status)

        if (status === "completed") {
            break
        }

        if (status === "failed") {
            throw new Error("Blackwall job failed")
        }

        await sleep(3000)
        }


      // 5. REPORT
      const reportRes = await axios.get(
        `${BLACKWALL_BASE}/api/v1/report/${jobId}`,
        { headers: blackwallHeaders }
      )

      // 6. SAVE INDIVIDUAL RESULT
      finalResult.reports.push({
        grid: loc.grid,
        name: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        blackwall_job_id: jobId,
        blackwall_report: reportRes.data
      })

    } catch (err) {
      console.error(`⚠️ Error processing ${loc.name}`, err.message)
    }
  }

  // 7. WRITE FILE (ONCE)
  const outputPath = path.join(
    process.cwd(),
    "outputs",
    "blackwall_bengaluru_missing_5_to_10_reports.json"
  )

  fs.writeFileSync(
    outputPath,
    JSON.stringify(finalResult, null, 2),
    "utf-8"
  )

  console.log("✅ Blackwall batch completed")
}

run()
