import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

const DONERU_API_BASE = "https://api.doneru.jp/widget/token";
const TIMEOUT_MS = 10000; // 10 seconds

/**
 * Doneru Token API へのプロキシエンドポイント
 * GET /doneruToken?key=xxx&type=alertbox で Doneru の Token データを取得
 * type パラメータは省略可能で、デフォルトは alertbox
 */
export const doneruToken = onRequest(
  {
    cors: true, // CORS を有効化
  },
  async (req, res) => {
    // OPTIONS preflight リクエストの処理
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }

    // GET リクエストのみ許可
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // key パラメータの検証
    const key = req.query.key as string | undefined;
    if (!key || key.trim() === "") {
      logger.error("doneruToken: key parameter is missing or empty");
      res.status(400).json({ error: "key is required" });
      return;
    }

    // type パラメータの取得（デフォルト: alertbox）
    const type = (req.query.type as string | undefined) || "alertbox";

    // Doneru API の呼び出し
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const encodedKey = encodeURIComponent(key);
      const encodedType = encodeURIComponent(type);
      const url = `${DONERU_API_BASE}?key=${encodedKey}&type=${encodedType}`;
      logger.info("doneruToken: Fetching from Doneru API");

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(
          `doneruToken: Upstream returned status ${response.status}`
        );
        res.status(502).json({ error: "upstream error" });
        return;
      }

      // レスポンスをそのまま返却
      const data = await response.json();
      logger.info("doneruToken: Successfully fetched data");
      res.status(200).json(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        logger.error("doneruToken: Request timeout");
        res.status(504).json({ error: "upstream timeout" });
      } else {
        logger.error("doneruToken: Error fetching from upstream", error);
        res.status(502).json({ error: "upstream error" });
      }
    }
  }
);
