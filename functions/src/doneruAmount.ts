import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";

const DONERU_API_BASE = "https://api.doneru.jp/widget/goal/data";
const TIMEOUT_MS = 10000; // 10 seconds

/**
 * Doneru Goal API へのプロキシエンドポイント
 * GET /doneruAmount?key=xxx で Doneru の目標金額データを取得
 */
export const doneruAmount = onRequest(
  {
    cors: true, // CORS を有効化
  },
  async (req, res) => {
    // OPTIONS preflight リクエストの処理
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // GET リクエストのみ許可
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    // key パラメータの検証
    const key = req.query.key as string | undefined;
    if (!key || key.trim() === "") {
      logger.error("doneruAmount: key parameter is missing or empty");
      res.status(400).json({error: "key is required"});
      return;
    }

    // Doneru API の呼び出し
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `${DONERU_API_BASE}?key=${encodeURIComponent(key)}`;
      logger.info("doneruAmount: Fetching from Doneru API");

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(
          `doneruAmount: Upstream returned status ${response.status}`
        );
        res.status(502).json({error: "upstream error"});
        return;
      }

      // レスポンスをそのまま返却
      const data = await response.json();
      logger.info("doneruAmount: Successfully fetched data");
      res.status(200).json(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        logger.error("doneruAmount: Request timeout");
        res.status(504).json({error: "upstream timeout"});
      } else {
        logger.error("doneruAmount: Error fetching from upstream", error);
        res.status(502).json({error: "upstream error"});
      }
    }
  }
);
