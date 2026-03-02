import axios from "axios";
import express from "express";
import dotenv from "dotenv";
import { generateGeoGrid } from "../services/geoService.js";

dotenv.config();

const router = express.Router();

/* ---------------- GENERATE GRID ---------------- */
router.post("/generate-grid", async (req, res) => {
  try {
    const { region } = req.body;

    if (!region) {
      return res.status(400).json({ error: "Region is required" });
    }

    // 1️⃣ Generate basic grid
    const baseData = await generateGeoGrid(region);

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        error: "Google Maps API key not configured"
      });
    }

    // 2️⃣ Enrich with Google reverse (safe controlled version)

    const enrichedGrids = [];

    const batchSize = 5;

    for (let i = 0; i < baseData.grids.length; i += batchSize) {

      const batch = baseData.grids.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (grid) => {

          try {
            const response = await axios.get(
              "https://maps.googleapis.com/maps/api/geocode/json",
              {
                params: {
                  latlng: `${grid.lat},${grid.lon}`,
                  key: process.env.GOOGLE_MAPS_API_KEY
                },
                validateStatus: () => true
              }
            );

            if (!response.data || response.data.status !== "OK") {
              return {
                ...grid,
                area_name: "Peripheral / Rural Zone"
              };
            }

            return {
              ...grid,
              area_name: response.data.results[0].formatted_address
            };

          } catch (err) {
            return {
              ...grid,
              area_name: "Lookup Failed"
            };
          }

        })
      );

      enrichedGrids.push(...results);

      await new Promise(r => setTimeout(r, 200));
    }

    console.log("Sending response with grids:", enrichedGrids.length);

    // 3️⃣ Send enriched result
    res.json({
      region: baseData.region,
      radius_km: baseData.radius_km,
      boundary: baseData.boundary,
      total_grids: enrichedGrids.length,
      grids: enrichedGrids
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate grid" });
  }
});


/* ---------------- EXPORT GRID WITH GOOGLE REVERSE ---------------- */
router.post("/export-grid-json", async (req, res) => {

  const data = req.body;

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${data.region}_grid_with_names.json`
  );

  res.send(JSON.stringify(data, null, 2));
});


/* ---------------- SINGLE REVERSE LOOKUP (GOOGLE) ---------------- */
router.get("/reverse", async (req, res) => {

  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon" });
  }

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          latlng: `${lat},${lon}`,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );

    console.log("Google Status:", response.data.status);
    console.log("Google Response:", response.data);

    if (response.data.status !== "OK") {
      return res.status(400).json({ error: response.data.status });
    }

    res.json(response.data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reverse failed" });
  }
});

export default router;