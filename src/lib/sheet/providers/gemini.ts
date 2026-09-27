/**
 * 手書き予約表の読み取り: Google Gemini 版。無料枠で使える。
 *
 * - API キーは Google AI Studio（https://aistudio.google.com/apikey）で無料発行。
 *   支払い情報を登録していないキーは「無料枠」になる。
 * - 出力は JSON スキーマで指定する（responseJsonSchema）。受け取った後に zod で検証する。
 *
 * ⚠ 無料枠の注意（Gemini API 利用規約・2026-09 確認）:
 *   - 送った写真と回答は Google の製品改善・機械学習に使われ、人が読むことがある。
 *   - 規約で「個人情報を無料枠に送らないこと」とされている。
 *   → 電話番号の入った 3 ページ目（お客様メモ）はこの AI には送らない（extract.ts で除外）。
 *     予約表 1/2・2/2 に書かれるのは姓・予約時間・メニュー記号だけ。
 *   → 姓だけでも気になる場合は、有料の Claude 版（ANTHROPIC_API_KEY）を使う。
 *
 * 回数の上限は Google AI Studio の画面で確認できる（無料枠は 1 日あたりの回数に上限がある）。
 */
import "server-only";
import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";

import {
  SHEET_JSON_SCHEMA,
  SheetExtractionSchema,
  buildSystemPrompt,
  buildUserText,
  type ExtractResult,
  type SheetImage,
} from "../schema";

/** 無料枠で使える安定版の Flash モデル（2026-09 時点）。環境変数で差し替えられる。 */
const DEFAULT_MODEL = "gemini-3.8-flash";

export async function extractWithGemini(images: SheetImage[]): Promise<ExtractResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            ...images.map((img) => ({
              inlineData: { mimeType: img.mediaType, data: img.data },
            })),
            { text: buildUserText(images) },
          ],
        },
      ],
      config: {
        systemInstruction: buildSystemPrompt(),
        responseMimeType: "application/json",
        responseJsonSchema: SHEET_JSON_SCHEMA,
      },
    });

    if (response.promptFeedback?.blockReason) {
      return {
        ok: false,
        error: "写真を読み取れませんでした（AI が処理を断りました）。写真を撮り直してお試しください。",
      };
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === FinishReason.MAX_TOKENS) {
      return {
        ok: false,
        error: "読み取り結果が長すぎて途中で切れました。1 ページずつ取り込んでお試しください。",
      };
    }
    if (finish && finish !== FinishReason.STOP) {
      console.error("[sheet:gemini] finish reason:", finish);
      return {
        ok: false,
        error: "写真を読み取れませんでした（AI が処理を中断しました）。写真を撮り直してお試しください。",
      };
    }

    const text = response.text;
    if (!text) {
      return { ok: false, error: "読み取り結果が空でした。もう一度お試しください。" };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, error: "読み取り結果の形式が不正でした。もう一度お試しください。" };
    }
    const parsed = SheetExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[sheet:gemini] schema mismatch:", parsed.error.message);
      return { ok: false, error: "読み取り結果の形式が不正でした。もう一度お試しください。" };
    }
    return { ok: true, extraction: parsed.data, model: response.modelVersion ?? model };
  } catch (e) {
    if (e instanceof ApiError) {
      console.error("[sheet:gemini] api error:", e.status, e.message);
      if (e.status === 429) {
        return {
          ok: false,
          error:
            "無料枠の回数の上限に達しました。しばらく（翌日まで）待ってからお試しいただくか、手動予約登録をご利用ください。",
        };
      }
      if (e.status === 400 && /api key/i.test(e.message)) {
        return { ok: false, error: "写真読み取り用の API キーが正しくありません。開発者にご連絡ください。" };
      }
      if (e.status === 401 || e.status === 403) {
        return { ok: false, error: "写真読み取り用の API キーに権限がありません。開発者にご連絡ください。" };
      }
      if (e.status === 404) {
        return {
          ok: false,
          error: `読み取り用の AI（${model}）が見つかりませんでした。開発者にご連絡ください。`,
        };
      }
      if (e.status === 400) {
        return {
          ok: false,
          error: "写真を送信できませんでした。写真のサイズや形式（JPEG/PNG）をご確認ください。",
        };
      }
      return { ok: false, error: `読み取りに失敗しました（${e.status}）。時間をおいてお試しください。` };
    }
    console.error("[sheet:gemini] unexpected error:", e);
    return { ok: false, error: "読み取りサービスに接続できませんでした。時間をおいてお試しください。" };
  }
}
