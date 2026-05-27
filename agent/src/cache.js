import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const SCHEMA_CACHE_FILE = path.join(CACHE_DIR, "schema.json");
const SCHEMA_DETAILS_CACHE_FILE = path.join(CACHE_DIR, "schema-details.json");
const QUERY_CACHE_FILE = path.join(CACHE_DIR, "queries.json");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function getSchemaCache() {
  if (fs.existsSync(SCHEMA_CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SCHEMA_CACHE_FILE, "utf-8"));
      // Expire cache after 5 minutes
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        return data.schema;
      }
    } catch (e) {
      // Ignore reading errors
    }
  }
  return null;
}

export function setSchemaCache(schema) {
  try {
    fs.writeFileSync(
      SCHEMA_CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), schema }, null, 2)
    );
  } catch (e) {
    // Ignore writing errors
  }
}

export function getSchemaDetailsCache() {
  if (fs.existsSync(SCHEMA_DETAILS_CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SCHEMA_DETAILS_CACHE_FILE, "utf-8"));
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        return data.details;
      }
    } catch (e) {
      // Ignore reading errors
    }
  }
  return null;
}

export function setSchemaDetailsCache(details) {
  try {
    fs.writeFileSync(
      SCHEMA_DETAILS_CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), details }, null, 2)
    );
  } catch (e) {
    // Ignore writing errors
  }
}

export function getQueryCache(question) {
  if (fs.existsSync(QUERY_CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(QUERY_CACHE_FILE, "utf-8"));
      const cached = data[question.toLowerCase().trim()];
      // Expire query cache after 10 minutes
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        return cached.sql;
      }
    } catch (e) {
      // Ignore reading errors
    }
  }
  return null;
}

export function setQueryCache(question, sql) {
  try {
    let data = {};
    if (fs.existsSync(QUERY_CACHE_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(QUERY_CACHE_FILE, "utf-8"));
      } catch (e) {
        data = {};
      }
    }
    data[question.toLowerCase().trim()] = { timestamp: Date.now(), sql };
    fs.writeFileSync(QUERY_CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // Ignore writing errors
  }
}

export function clearCache() {
  try {
    if (fs.existsSync(SCHEMA_CACHE_FILE)) fs.unlinkSync(SCHEMA_CACHE_FILE);
    if (fs.existsSync(SCHEMA_DETAILS_CACHE_FILE)) fs.unlinkSync(SCHEMA_DETAILS_CACHE_FILE);
    if (fs.existsSync(QUERY_CACHE_FILE)) fs.unlinkSync(QUERY_CACHE_FILE);
    console.log("[Cache] Local schema and query caches cleared.");
  } catch (e) {
    // Ignore
  }
}
