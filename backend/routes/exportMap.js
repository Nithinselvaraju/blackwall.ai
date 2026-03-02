import express from "express";
import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as turf from "@turf/turf";

const router = express.Router();

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const xtile = n * ((lng + 180) / 360);
  const ytile =
    n *
    (1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) +
        1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
    2;

  return { xtile, ytile };
}

router.post("/export-map", async (req, res) => {
  try {

    const { boundary, grids, radius_km } = req.body;

    const geometry = boundary.geometry || boundary;
    let coords;

    if (geometry.type === "Polygon") {
      coords = geometry.coordinates[0];
    } else if (geometry.type === "MultiPolygon") {
      coords = geometry.coordinates[0][0];
    } else {
      return res.status(400).json({ error: "Unsupported geometry type" });
    }
    const tileSize = 256;

    /* Bounding Box */
    let minLng = Infinity, minLat = Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;

    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);

    /* Smarter Zoom */
    let zoom;
    if (maxDiff > 6) zoom = 5;
    else if (maxDiff > 3) zoom = 8;
    else if (maxDiff > 1) zoom = 10;
    else zoom = 12;

    const topLeft = latLngToTile(maxLat, minLng, zoom);
    const bottomRight = latLngToTile(minLat, maxLng, zoom);

    const minTileX = Math.floor(topLeft.xtile);
    const maxTileX = Math.floor(bottomRight.xtile);
    const minTileY = Math.floor(topLeft.ytile);
    const maxTileY = Math.floor(bottomRight.ytile);

    const width = (maxTileX - minTileX + 1) * tileSize;
    const height = (maxTileY - minTileY + 1) * tileSize;

    if (width <= 0 || height <= 0 || width > 6000 || height > 6000) {
      return res.status(400).json({ error: "Region too large." });
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    /* Parallel Tile Fetch */

    const tasks = [];
    
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        tasks.push({ x, y });
      }
    }

      /* Safety check */
      const tileCount = tasks.length;

      if (tileCount > 400) {
        return res.status(400).json({
          error: "Region too large for PNG export. Please zoom into sub-region."
        });
      }

    for (const { x, y } of tasks) {

      try {
        const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 8000
        });

        const img = await loadImage(response.data);

        ctx.drawImage(
          img,
          (x - minTileX) * tileSize,
          (y - minTileY) * tileSize,
          tileSize,
          tileSize
        );

      } catch (err) {
        console.log("Tile failed:", x, y);
      }
    }
    function latLngToPixel(lat, lng) {
      const { xtile, ytile } = latLngToTile(lat, lng, zoom);
      return {
        x: (xtile - minTileX) * tileSize,
        y: (ytile - minTileY) * tileSize
      };
    }

    /* Draw Boundary */
    ctx.beginPath();
    coords.forEach(([lng, lat], i) => {
      const { x, y } = latLngToPixel(lat, lng);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(255,165,0,0.2)";
    ctx.fill();
    ctx.strokeStyle = "orange";
    ctx.lineWidth = 3;
    ctx.stroke();

    /* Draw Accurate Circles */
    if (grids && grids.length > 0) {

      grids.forEach(grid => {

        const circle = turf.circle(
          [grid.lon, grid.lat],
          radius_km || 2,
          { units: "kilometers", steps: 32 }
        );

        const coords = circle.geometry.coordinates[0];

        ctx.beginPath();

        coords.forEach(([lng, lat], i) => {
          const { x, y } = latLngToPixel(lat, lng);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });

        ctx.closePath();
        ctx.fillStyle = "rgba(0,0,255,0.15)";
        ctx.fill();
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    const buffer = canvas.toBuffer("image/png");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", "attachment; filename=map-export.png");

    return res.status(200).send(buffer);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Export failed" });
  }
});

export default router;
