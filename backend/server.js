import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";
import geoGridRoutes from "./routes/geoGrid.js";
import path from "path";
import { fileURLToPath } from "url";
import exportMapRoute from "./routes/exportMap.js";




dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// 🔥 Mount BOTH routes correctly
app.use("/api/geo", geoGridRoutes);
app.use("/api/geo", exportMapRoute);

app.use(express.static(path.join(__dirname, "public")));
/* ================= OPENAI ================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================= BLACKWALL ================= */
const BLACKWALL_BASE = "https://blackwall-api.onrender.com";

const blackwallHeaders = {
  "Content-Type": "application/json",
  ...(process.env.BLACKWALL_API_KEY && {
    Authorization: `Bearer ${process.env.BLACKWALL_API_KEY}`,
  }),
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* ================= CHAT ROUTE ================= */
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const lastMessage = messages[messages.length - 1].content;

    /* ---- Detect latitude & longitude ---- */
    const coordMatch = lastMessage.match(
      /(-?\d+\.\d+)\s*,?\s*(-?\d+\.\d+)/
    );

    /* ======================================================
       BLACKWALL FLOW
    ====================================================== */
    if (coordMatch) {
      const latitude = parseFloat(coordMatch[1]);
      const longitude = parseFloat(coordMatch[2]);

      const location_name =
        lastMessage.replace(coordMatch[0], "").trim() ||
        "Selected Location";

      /* 1️⃣ Analyze */
      const analyzeRes = await axios.post(
        `${BLACKWALL_BASE}/api/v1/analyze`,
        {
          latitude,
          longitude,
          radius: 2,
          location_name,
        },
        { headers: blackwallHeaders }
      );

      const jobId = analyzeRes.data.job_id;

      /* 2️⃣ Poll status */
      let status = "queued";

      while (true) {
        await sleep(2000);

        const statusRes = await axios.get(
          `${BLACKWALL_BASE}/api/v1/status/${jobId}`,
          { headers: blackwallHeaders }
        );

        status = statusRes.data.status;
        console.log("Blackwall status:", status);

        if (status === "completed") break;

        if (status === "failed") {
          return res.json({
            reply: "❌ Blackwall analysis failed for this location.",
          });
        }
      }

      /* 3️⃣ Fetch report */
      const reportRes = await axios.get(
        `${BLACKWALL_BASE}/api/v1/report/${jobId}`,
        { headers: blackwallHeaders }
      );

      const report = reportRes.data.analysis;

      return res.json({
        reply: `
📍 **Hotspot Analysis: ${report.location_info.name}**

**Final Score:** ${report.final_score.percentage}%
**Category:** ${report.final_score.classification}

**Infrastructure**
• Roads: ${report.score_breakdown.roads.percentage}%
• Commercial: ${report.score_breakdown.commercial.percentage}%

**Amenities**
• Education: ${report.score_breakdown.amenities.details.education}
• Healthcare: ${report.score_breakdown.amenities.details.healthcare}
• Recreation: ${report.score_breakdown.amenities.details.recreation}

**Summary**
• Metro stations: ${report.data_summary.metro_stations}
• Total establishments: ${report.data_summary.total_establishments}
• Brand match rate: ${report.data_summary.brand_match_rate}
        `,
      });
    }

    /* ======================================================
       OPENAI FLOW
    ====================================================== */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        ...messages,
      ],
    });

    res.json({
      reply: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      reply: "⚠️ Server error. Please try again.",
    });
  }
});

import fs from "fs";

/* ================= BLACKWALL BATCH ROUTE ================= */
app.post("/blackwall/batch", async (req, res) => {
  try {
    // 1️⃣ Load the shared JSON file (your uploaded file)
    const raw = fs.readFileSync(
      "./Bengaluru_Bangalore_North_coverage.json",
      "utf-8"
    );

    const data = JSON.parse(raw);
    const locations = data.locations;

    const results = [];

    // 2️⃣ Process each coordinate SEQUENTIALLY (safe for Blackwall)
    for (const loc of locations) {
      console.log(`Processing ${loc.name} (${loc.lat}, ${loc.lon})`);

      // Analyze
      const analyzeRes = await axios.post(
        `${BLACKWALL_BASE}/api/v1/analyze`,
        {
          latitude: loc.lat,
          longitude: loc.lon,
          radius: loc.radius_km || data.radius_km,
          location_name: loc.name
        },
        { headers: blackwallHeaders }
      );

      const jobId = analyzeRes.data.job_id;

      // Poll status
      let status = "queued";
      while (true) {
        await sleep(2000);

        const statusRes = await axios.get(
          `${BLACKWALL_BASE}/api/v1/status/${jobId}`,
          { headers: blackwallHeaders }
        );

        status = statusRes.data.status;
        if (status === "completed") break;

        if (status === "failed") {
          throw new Error(`Blackwall failed for ${loc.name}`);
        }
      }

      // Fetch report
      const reportRes = await axios.get(
        `${BLACKWALL_BASE}/api/v1/report/${jobId}`,
        { headers: blackwallHeaders }
      );

      const analysis = reportRes.data.analysis;

      // Store individual result
      results.push({
        grid: loc.grid,
        name: loc.name,
        latitude: loc.lat,
        longitude: loc.lon,
        final_score: analysis.final_score,
        score_breakdown: analysis.score_breakdown,
        data_summary: analysis.data_summary
      });
    }

    // 3️⃣ Return combined JSON
    res.json({
      area: data.location,
      total_points: data.total_locations,
      radius_km: data.radius_km,
      generated_at: new Date().toISOString(),
      reports: results
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error: "Batch Blackwall processing failed"
    });
  }
});

/* ================= SERVER ================= */
app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});
