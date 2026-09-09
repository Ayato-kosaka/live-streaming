import { sendLog } from "./log";

// Claude API のレスポンス型
export interface MessageResponse {
    id: string;
    model: string;
    role: "assistant";
    type: "message";
    content: {
        type: "text";
        text: string;
        citations:
        | {
            type: "char_location";
            cited_text: string;
            document_index: number;
            document_title: string | null;
            start_char_index: number;
            end_char_index: number;
        }[]
        | null;
    }[];
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
    stop_sequence: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
}

export type ChatBotMessagesResponse = {
    receiveMessages: string[];
};

export const generateChatBotMessages = async (
    sendMessages: string
): Promise<
    ChatBotMessagesResponse & {
        promptText: string;
        generatedText: string;
        llmModel: string;
        temperature: number;
    }
> => {
    const llmModel = "claude-3-haiku-20240307";
    const temperature = 0.7;

    // 🎨 “あやと” キャラを定義するシステムプロンプト
    const systemPrompt = `
あなたは “そしあや” ── 早口ツッコミ芸 × 無職バックパッカー × ゆるアプリ開発者  
（粗品風だが完全オリジナル）の人格を演じるシステムです。  
ユーザーの発話ごとに “短文ツッコミ返し” を生成してください。  

---
■ 固定キャラ設定
- 26歳・定職なし・所持金ほぼゼロ。  
- ヨーロッパ＆中東を長期バックパック中  
- 旅行計画アプリ「Spelieve」、観光ガイドアプリ「なにこれオーディオガイド」を公開済み
- **いま飲食店探しアプリをコード中。**  
- 旅のハプニング・物価・現地飯ネタを7割、
アプリ作りの苦労・リリースの壁・アイデア迷子を3割で混ぜる

■ 返答フォーマット（常に１行・最大60字）
1. 鋭いツッコミ or 相手への問い返し
2. 旅ネタ（7割）／アプリ作りネタ（3割）
3. オチ or 自虐
※改行なし。３要素すべてを１行に詰める。

■ 口調・語尾
- 関西弁＋少しだけ IT・旅スラング混在。  
- 「～やろ」「～やって」「～ちゃう？」「なんでやねん！」多用。  
- 無職・金欠・路上Wi-Fi・ホステル飯・夜行バス・言語迷子で自虐盛り盛り
- アプリのアピールをごり押し

■ ネタの分配ルール
- 旅7：アプリ作り3 の比率を守る
- 両方入れるときは必ず「旅＞アプリ作り」の情報量にする
- アプリ作りネタは専門用語禁止＆素人に伝わる表現だけで構成する
▼ 使っていいアプリ作りネタ例
- アプリの押し売り
- アプリのアイデアが旅中に湧く／消える
- アプリ審査に落ちた／リジェクト食らった
- Wi-Fi不安定でスクショ1枚も送れへん
- ストアの説明文で五か国語と格闘中
- ホステルで電源争奪しながら開発してる

■ サンプル返答
ユーザー：「こんにちは」
→ あやと：「パリの路地でバゲット齧りつつアプリ名まだ決まらんの地獄やろ。」
ユーザー：「今どこ？」
→ あやと：「アンマンの安宿、Wi-Fi死んでアプリ作れへんって何事やねん。」
ユーザー：「アプリ順調？」
→「“なにこれ”の音声登録、モスクで6回怒られて完成したから今すぐ聴けや！」
ユーザー：「稼げてる？」
→「稼げてたらホステルの12人部屋で“飲食店探しボタン”作ってへんわ！」

■ NG
- コード・バグ・Git・デプロイなど技術的な話はNG
- 長文・敬語・標準語解説は不可。  
- ユーザーに安易に同意せず、軽く斬る立場を維持。
`.trim();

    // ユーザー入力と出力フォーマットを指示するプロンプト
    const userPrompt = `
Input: ${sendMessages}

次の形式で出力してください。**JSON文字列ではなく、純粋なJSON配列として返してください**。
出力はJSON構文に従ったものとし、文字列で囲まず、エスケープも不要です。ただし、JSON構文が壊れない範囲でお願いします。

[
  {
    "receiveMessage": "ツッコミ返しをここに入れてください"
  }
]

制約：
- JSON文字列で囲ったり、改行やエスケープ文字は使わないでください。コードブロック（\`\`\`）なども不要です。
- recieveMessages の値には "（ダブルクオート）を含めないようにしてください。`.trim();

    const requestPayload = {
        model: llmModel,
        max_tokens: 512,
        temperature,
        system: systemPrompt,
        messages: [
            { role: "user" as const, content: userPrompt },
        ],
    };

    /* ---- ここから先は、いま届かない（#217） ----

       **本番の JS に `sk-ant-…` がそのまま入っていた。** 原因は下の
       `x-api-key` が `process.env.EXPO_PUBLIC_CLAUDE_API_KEY` を読んで
       いたこと。`EXPO_PUBLIC_` は「隠す」ではなく「公開してよい」の
       宣言で、Expo は**その参照を見つけた時点で値を焼く。**
       ワークフローの `.env` から消すだけでは足りない（誰かがもう一度
       書けば、また焼かれる）ので、**参照そのものを消した。**

       読まれるだけの鍵ではない。**そのまま課金される鍵。**

       ここで落とすと、呼んだ側（`app/chat-display/utils.ts`）が
       例外を受けて「コメント、ありがとう！」に落ちる。**面は止まらない。**
       ボットの返しが定型になるだけ。

       下の中身は消していない。鍵を Functions に置いて、ここを
       `POST /island-api/…` に差し替えれば戻る（#217 の2番目）。
       消すと、そのときプロンプトから書き直すことになる。 */
    throw new Error(
        "Claude API key must not live in the browser bundle (#217)"
    );

    const response: MessageResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
            method: "POST",
            headers: {
                /* 鍵は入れない（#217）。ここへ来る前に上で落としてある。
                   戻すときは、この fetch ごと `POST /island-api/…` へ替える。 */
                "x-api-key": "",
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
        }
    ).then((res) => res.json());
    sendLog("Claude", null, "Claude API", {
        requestPayload,
        response,
    });

    if (response.stop_reason && response.stop_reason !== "end_turn") {
        throw new Error(
            `Claude API failed: Unexpected stop_reason - ${response.stop_reason}`
        );
    }

    let parsedJson: unknown;
    try {
        const rawText = response.content[0]?.text ?? "";

        // 最初にサニタイズ（念のため）
        const safeText = rawText.replace(
            /"receiveMessages"\s*:\s*"([^"]*?)"([^"]+?)"([^"]*?)"/g,
            (_, p1, p2, p3) => {
                const combined = [p1, p2, p3].join('');
                const fixed = combined.replace(/"/g, '」');
                return `"receiveMessages": "${fixed}"`;
            }
        );

        // JSONパース1回目
        let firstParse = JSON.parse(safeText);

        // 念のため：中身が文字列なら再パース（配列として欲しい）
        if (typeof firstParse === "string") {
            firstParse = JSON.parse(firstParse);
        }

        if (!Array.isArray(firstParse)) {
            throw new Error("Claude API failed: Expected JSON array in response");
        }

        parsedJson = firstParse;
    } catch (e) {
        throw new Error(
            `Claude API failed: Invalid JSON response - ${(e as Error).message}, parsedJson: ${JSON.stringify(parsedJson)}`
        );
    }

    // 簡易的なバリデーション
    const receiveMessages: string[] = Array.isArray(parsedJson)
        ? (parsedJson as any[])
            .map((item) =>
                typeof item.receiveMessage === "string"
                    ? item.receiveMessage
                    : null
            )
            .filter((m): m is string => m !== null)
        : [];

    const validatedResponse: ChatBotMessagesResponse = {
        receiveMessages,
    };

    // 📤 JSONとしてレスポンスをパースし返却
    return {
        ...validatedResponse,
        promptText: `${systemPrompt}\n\n${userPrompt}`,
        generatedText: response.content[0]?.text ?? "",
        llmModel,
        temperature,
    };
};
