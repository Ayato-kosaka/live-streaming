import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz0RvIKLuuRBCktb8m7RKGk0dD0mzo6DhYFt_32zIMnqWnsLzypvZ99OZY95wQTVtW1/exec";

const ALLOWED_ENDPOINTS = new Set([
  "weekly_manifest",
  "weekly_overview",
  "weekly_product_kpis",
  "weekly_search",
  "weekly_topics",
  "weekly_dish_media",
  "weekly_reviews_feedback",
  "weekly_errors",
  "weekly_external_api",
  "weekly_versions",
]);

const ALLOWED_PARAMS = new Set([
  "endpoint",
  "week_start",
  "timezone",
  "start_at",
  "end_at",
  "days",
  "limit",
]);

export const nanitabeyoWeeklyReportProxy = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const endpoint = getSingleQueryParam(req.query.endpoint);
    if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
      res.status(400).json({
        error: "Invalid or missing endpoint parameter",
        allowed_endpoints: Array.from(ALLOWED_ENDPOINTS),
      });
      return;
    }

    const url = new URL(APPS_SCRIPT_URL);
    for (const [key, value] of Object.entries(req.query)) {
      if (!ALLOWED_PARAMS.has(key)) continue;
      const singleValue = getSingleQueryParam(value);
      if (singleValue === null) continue;
      url.searchParams.set(key, singleValue);
    }

    try {
      const upstream = await fetch(url.toString(), {
        method: "GET",
        headers: {Accept: "application/json"},
      });

      const text = await upstream.text();
      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type") ||
        "application/json; charset=utf-8";
      res.set("Content-Type", contentType);
      res.send(text);
    } catch (error) {
      logger.error("nanitabeyoWeeklyReportProxy failed", {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({
        error: "Failed to fetch weekly report endpoint",
        endpoint,
      });
    }
  }
);

/**
 * Returns a single string query parameter value.
 *
 * @param {unknown} value Query parameter value from Express.
 * @return {string | null} First string value, or null.
 */
function getSingleQueryParam(value: unknown): string | null {
  if (Array.isArray(value)) return getSingleQueryParam(value[0]);
  if (typeof value === "string") return value;
  return null;
}
