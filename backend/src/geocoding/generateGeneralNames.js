import fs from "fs";
import path from "path";
import axios from "axios";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paths
const inputPath = path.join(process.cwd(), "data", "delhi_complete_coverage.json");
const outputPath = path.join(
  process.cwd(),
  "outputs",
  "delhi_general_names.json"
);

// Load grid data
const gridData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const locations = gridData.locations;

async function reverseGeocode(lat, lon) {
  const url = "https://nominatim.openstreetmap.org/reverse";

  const res = await axios.get(url, {
    params: {
        lat,
        lon,
        format: "json",
        zoom: 14,
        addressdetails: 1,
    },
    headers: {
        "User-Agent": "blackwall-backend-location-enrichment",
    },
    timeout: 15000, // ⬅️ ADD THIS (15 seconds)
    });

  
  
  const addr = res.data.address || {};

  // Priority order for "general name"
  return (
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.town ||
    addr.village ||
    "Unknown Area"
  );
}

async function run() {
  const results = [];

  for (const loc of locations) {
    console.log(`Resolving Point ${loc.grid} (${loc.lat}, ${loc.lon})`);


    try {
      const generalName = await reverseGeocode(loc.lat, loc.lon);

      results.push({
        grid: loc.grid,
        name: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        general_name: generalName,
        city: "Delhi",
      });

      // Respect Nominatim rate limits
      await sleep(1200);
    } catch (err) {
      console.error(
        `Failed for Point ${loc.grid}:`,
        err.message
      );

      results.push({
        grid: loc.grid,
        name: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        general_name: "Lookup Failed",
        city: "Delhi",
      });
    }
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        meta: {
          total_locations: results.length,
          generated_at: new Date().toISOString(),
        },
        reports: results,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("✅ General names generation completed");
}

run();
