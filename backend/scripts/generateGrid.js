import axios from "axios";
import * as turf from "@turf/turf";
import fs from "fs";
import { exec } from "child_process";

export async function generateCityGrid(city, radiusKm = 2) {
  const headers = { "User-Agent": "grid-generator" };

  // 1️⃣ Search city
  const searchRes = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: { q: city, format: "json", limit: 1 },
      headers,
    }
  );

  if (!searchRes.data.length) throw new Error("City not found");

  const place = searchRes.data[0];
  const prefix =
    place.osm_type === "relation"
      ? "R"
      : place.osm_type === "way"
      ? "W"
      : "N";

  const osmId = `${prefix}${place.osm_id}`;

  // 2️⃣ Lookup boundary as geojson
  const lookupRes = await axios.get(
    "https://nominatim.openstreetmap.org/lookup",
    {
      params: {
        osm_ids: osmId,
        format: "geojson",
        polygon_geojson: 1,
      },
      headers,
    }
  );

  const boundaryGeoJSON = lookupRes.data;
  const polygon = boundaryGeoJSON.features[0];
  const boundaryPath = `./data/${city}_boundary.geojson`;
fs.writeFileSync(boundaryPath, JSON.stringify(boundaryGeoJSON, null, 2));


  const bbox = turf.bbox(polygon);

  // 3️⃣ Generate strict grid inside boundary
  const grid = turf.pointGrid(bbox, radiusKm * 2, {
    units: "kilometers",
  });

  const insidePoints = grid.features.filter((pt) =>
    turf.booleanPointInPolygon(pt, polygon)
  );

  // 4️⃣ Reverse geocode for generic names
  const results = [];

  for (let i = 0; i < insidePoints.length; i++) {
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let i = 0; i < insidePoints.length; i++) {
    const [lon, lat] = insidePoints[i].geometry.coordinates;

    try {
        const reverseRes = await axios.get(
        "https://nominatim.openstreetmap.org/reverse",
        {
            params: { lat, lon, format: "json" },
            headers,
        }
        );

        const address = reverseRes.data.address || {};

        const area =
        address.suburb ||
        address.neighbourhood ||
        address.city_district ||
        address.city ||
        "Unknown Area";

        results.push({
        area_name: area,
        latitude: lat,
        longitude: lon,
        radius_km: radiusKm,
        });

        await sleep(1000); // 1 second delay (IMPORTANT)

    } catch (err) {
        console.log("Reverse geocode failed, skipping...");
    }
    }

  }

  // 5️⃣ Save JSON
  const jsonPath = `./data/${city}_grid.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // 6️⃣ Trigger Python image generation
  exec(
    `python python/generate_map.py "${jsonPath}" "${boundaryPath}" "${city}"`,
    (err) => {
      if (err) console.error("Python error:", err);
    }
  );

  return {
    total_grids: results.length,
    grid_file: `/data/${city}_grid.json`,
    boundary_image: `/data/${city}_boundary.png`,
    grid_image: `/data/${city}_grid.png`,
  };
}
