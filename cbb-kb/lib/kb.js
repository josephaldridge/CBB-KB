import { Redis } from "@upstash/redis";
import seed from "./seed.json";

// Lazily create the client so `next build` doesn't require env vars to be
// present at build time (routes are force-dynamic and only run at request time).
let _redis = null;
function client() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

// One key holds the whole KB document (categories -> articles).
// Small enough (~50KB) that whole-document read/write is simplest and safe.
export const KB_KEY = "cbb:kb:v2";

export function getSeed() {
  // Deep clone so callers never mutate the imported module.
  return JSON.parse(JSON.stringify(seed));
}

// Read the KB. If nothing is stored yet, seed it once and return the seed.
export async function readKB() {
  const stored = await client().get(KB_KEY);
  if (stored) {
    // Upstash may return an object (auto-parsed) or a JSON string.
    return typeof stored === "string" ? JSON.parse(stored) : stored;
  }
  const fresh = getSeed();
  await client().set(KB_KEY, JSON.stringify(fresh));
  return fresh;
}

export async function writeKB(data) {
  await client().set(KB_KEY, JSON.stringify(data));
  return data;
}

// Very lightweight shape check so a bad PUT can't corrupt the store.
export function isValidKB(data) {
  return (
    data &&
    Array.isArray(data.categories) &&
    data.categories.every(
      (c) =>
        typeof c.id === "string" &&
        typeof c.title === "string" &&
        Array.isArray(c.articles) &&
        c.articles.every(
          (a) =>
            typeof a.id === "string" &&
            typeof a.title === "string" &&
            typeof a.body === "string"
        )
    )
  );
}

export function checkPasscode(req) {
  const expected = process.env.KB_ADMIN_PASSCODE || "";
  if (!expected) return true; // no passcode configured => open
  const given = req.headers.get("x-kb-passcode") || "";
  return given === expected;
}
