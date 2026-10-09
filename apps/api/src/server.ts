import "dotenv/config";
import cors from "cors";
import express from "express";
import { Pool } from "pg";

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(cors());
app.use(express.json());

app.get("/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ status: "ok" });
});

app.get("/locations/:locationId/eligible-auditors", async (request, response) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.display_name
       FROM auditors a
      WHERE a.active = true
        AND a.id <> (SELECT owner_auditor_id FROM locations WHERE id = $1)
      ORDER BY a.display_name`,
    [request.params.locationId]
  );
  response.json(rows);
});

app.post("/auditor-proposals", async (request, response) => {
  const { displayName, email, proposedBy } = request.body as { displayName?: string; email?: string; proposedBy?: string };
  if (!displayName || !email || !proposedBy) return response.status(400).json({ error: "displayName, email, and proposedBy are required." });
  const { rows } = await pool.query(
    "INSERT INTO auditor_proposals (display_name, email, proposed_by) VALUES ($1, $2, $3) RETURNING id, status",
    [displayName, email, proposedBy]
  );
  response.status(201).json(rows[0]);
});

app.listen(Number(process.env.PORT ?? 3001), () => console.log("Handshake API listening on port 3001"));
