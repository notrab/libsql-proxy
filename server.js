import express from "express";
import { createClient } from "@libsql/client";

const app = express();
app.use(express.json());

const syncInterval = parseInt(process.env.TURSO_SYNC_INTERVAL, 10) || 60;

const client = createClient({
  url: "file:/app/data/local.db",
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval,
});

// Move to jose for proper JWT validation
function verifyClientAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: {
        message: "Missing Authorization header",
        code: "UNAUTHORIZED",
      },
    });
  }

  const clientToken = authHeader.slice(7);
  if (clientToken !== process.env.PROXY_AUTH_TOKEN) {
    return res.status(401).json({
      error: {
        message: "Invalid authorization token",
        code: "UNAUTHORIZED",
      },
    });
  }

  next();
}

function formatValue(value) {
  if (value === null) {
    return { type: "null", value: null };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { type: "integer", value: value.toString() };
    }
    return { type: "float", value: value.toString() };
  }

  return { type: "text", value: value.toString() };
}

app.post("/v2/pipeline", verifyClientAuth, async (req, res) => {
  try {
    const { requests } = req.body;
    let results = [];

    for (const request of requests) {
      if (request.type === "execute") {
        const result = await client.execute(request.stmt);

        const rows = result.rows.map((row) => {
          if (Array.isArray(row)) {
            return row.map(formatValue);
          }

          return result.columns.map((col) => formatValue(row[col]));
        });

        results.push({
          type: "ok",
          response: {
            type: "execute",
            result: {
              cols: result.columns.map((name) => ({
                name,
                decltype: null,
              })),
              rows,
              affected_row_count: result.rowsAffected || 0,
              last_insert_rowid: result.lastRowId
                ? result.lastRowId.toString()
                : null,
              replication_index: null,
              rows_read: result.rows.length,
              rows_written: result.rowsAffected || 0,
              query_duration_ms: 0,
            },
          },
        });
      } else if (request.type === "close") {
        results.push({
          type: "ok",
          response: {
            type: "close",
          },
        });
      }
    }

    res.json({
      baton: null,
      base_url: null,
      results,
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    res.status(500).json({
      error: {
        message: error.message,
        code: error.code || "INTERNAL_ERROR",
      },
    });
  }
});

app.get("/health", (req, res) => {
  res.sendStatus(200);
});

app.get("/version", (req, res) => {
  res.json({
    version: "1.0.0",
    protocol: "hrana-2",
    region: process.env.FLY_REGION,
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`LibSQL proxy server running on port ${port}`);
  console.log(`Region: ${process.env.FLY_REGION}`);
  console.log(`Sync Internal: ${syncInterval}`);
  console.log(`Database path: /app/data/local.db`);
});
