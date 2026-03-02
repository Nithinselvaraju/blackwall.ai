import axios from "axios";
import * as turf from "@turf/turf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* Resolve __dirname */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Load India Land GeoJSON */
const indiaLandPath = path.join(__dirname, "../data/land.geojson");
const indiaGeo = JSON.parse(
  fs.readFileSync(indiaLandPath, "utf-8")
);

/* Create FeatureCollection once */
const indiaLandFC = turf.featureCollection(
  indiaGeo.features
);

/* Merge land once */
let indiaLandMerged = indiaLandFC.features[0];

for (let i = 1; i < indiaLandFC.features.length; i++) {
  try {
    indiaLandMerged = turf.union(
      indiaLandMerged,
      indiaLandFC.features[i]
    );
  } catch {}
}

export async function generateGeoGrid(region) {

  let response;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: region,
            format: "json",
            polygon_geojson: 1,
            addressdetails: 1,
            limit: 1
          },
          headers: { "User-Agent": "GeoAI-App/1.0" }
        }
      );
      break;
    } catch (err) {
      if (err.response?.status === 429) {
        await new Promise(r => setTimeout(r, 1500));
      } else {
        throw err;
      }
    }
  }

  if (!response?.data || response.data.length === 0) {
  throw new Error("Region not found or rate-limited");
  }

  let geojson = response.data[0].geojson;


  if (!geojson || !geojson.coordinates) {

    const lon = parseFloat(response.data[0].lon);
    const lat = parseFloat(response.data[0].lat);

    geojson = turf.circle([lon, lat], 30, {
      units: "kilometers"
    }).geometry;
  }

  const cacheDir = path.join(__dirname, "../cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
  }

  const safeName = region.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const cachePath = path.join(cacheDir, `${safeName}_v2.json`);

  if (fs.existsSync(cachePath)) {
    console.log("Using cached region data");
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }
  
  if (geojson.type === "Point") {
    const [lon, lat] = geojson.coordinates;
    geojson = turf.circle([lon, lat], 25, {
      units: "kilometers"
    }).geometry;
  }

  const regionPolygon = turf.feature(geojson);

    const bbox = turf.bbox(regionPolygon);

    // Calculate region width in km
    const widthKm = turf.distance(
      turf.point([bbox[0], bbox[1]]),
      turf.point([bbox[2], bbox[1]]),
      { units: "kilometers" }
    );

    const areaSqKm = turf.area(regionPolygon) / 1_000_000;

    let radiusKm;
    let spacingKm;

    // City/District focused logic
    if (areaSqKm <= 3000) {
      radiusKm = 2;        // Normal city
    } else {
      radiusKm = 4;        // Large district / big metro
    }

    spacingKm = radiusKm * 1.8;  // Good overlap balance

    const pointGrid = turf.pointGrid(bbox, spacingKm, {
      units: "kilometers",
      mask: regionPolygon
    });

  /* Filter land-only points */
  const landOnlyPoints = pointGrid.features.filter(point =>
    indiaLandFC.features.some(landFeature =>
      turf.booleanPointInPolygon(point, landFeature)
    )
  );

  const grids = landOnlyPoints.map((pt, index) => ({
    id: `${region}_${String(index + 1).padStart(4, "0")}`,
    lat: pt.geometry.coordinates[1],
    lon: pt.geometry.coordinates[0]
  }));



  /* Clean and simplify boundary */
  let cleanBoundary;

  try {
    const intersected = turf.intersect(regionPolygon, indiaLandMerged);

    if (intersected && intersected.geometry && intersected.geometry.coordinates) {
      cleanBoundary = intersected;
    } else {
      cleanBoundary = regionPolygon;
    }

  } catch {
    cleanBoundary = regionPolygon;
  }

  /* Optional smoothing trick */
  cleanBoundary = turf.buffer(cleanBoundary, 0.2, { units: "kilometers" });
  cleanBoundary = turf.buffer(cleanBoundary, -0.2, { units: "kilometers" });


    const result = {
      region,
      radius_km: radiusKm,
      total_grids: grids.length,
      boundary: cleanBoundary,
      grids
    };

    fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));

    return result;
  }

