import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

const DONERU_API_BASE = "https://api.doneru.jp/widget/youtube/refresh";
const TIMEOUT_MS = 10000; // 10 seconds

/**
 * Doneru YouTube Refresh API へのプロキシエンドポイント
 * POST /doneruYoutubeRefresh?key=xxx&type=alertbox&version=1.0.0
 * で Doneru の YouTube トークンを refresh する
 */
export const doneruYoutubeRefresh = onRequest(
  {
    cors: true, // CORS を有効化
  },
  async (req, res) => {
    // OPTIONS preflight リクエストの処理
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }

    // POST リクエストのみ許可
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // key パラメータの検証
    const key = req.query.key as string | undefined;
    if (!key || key.trim() === "") {
      logger.error("doneruYoutubeRefresh: key parameter is missing or empty");
      res.status(400).json({ error: "key is required" });
      return;
    }

    // type パラメータの取得（デフォルト: alertbox）
    const type = (req.query.type as string | undefined) || "alertbox";
    // version パラメータの取得（デフォルト: 1.0.0）
    const version = (req.query.version as string | undefined) || "1.0.0";

    // Doneru API の呼び出し
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const encodedKey = encodeURIComponent(key);
      const encodedType = encodeURIComponent(type);
      const encodedVersion = encodeURIComponent(version);
      const url =
        `${DONERU_API_BASE}?key=${encodedKey}` +
        `&type=${encodedType}&version=${encodedVersion}`;
      logger.info("doneruYoutubeRefresh: Calling Doneru API");

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(
          `doneruYoutubeRefresh: Upstream returned status ${response.status}`
        );
        res.status(502).json({ error: "upstream error" });
        return;
      }

      // レスポンスをそのまま返却
      const data = await response.json();
      logger.info("doneruYoutubeRefresh: Successfully refreshed token");
      res.status(200).json(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        logger.error("doneruYoutubeRefresh: Request timeout");
        res.status(504).json({ error: "upstream timeout" });
      } else {
        logger.error(
          "doneruYoutubeRefresh: Error fetching from upstream",
          error
        );
        res.status(502).json({ error: "upstream error" });
      }
    }
  }
);
