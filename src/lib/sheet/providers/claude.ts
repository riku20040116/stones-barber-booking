/**
 * 手書き予約表の読み取り: Claude（Anthropic）版。有料。
 *
 * - モデルは Claude Opus 5。手書きの崩れた文字と、なぞった実線の位置を
 *   あわせて読む必要があるため、最上位のモデルを使う。
 * - 出力は JSON スキーマで強制する（structured outputs）。
 * - 送った写真が AI の学習に使われることはない（API の既定）。
 *
 * 料金の目安: 写真 2〜3 枚で 1 回あたり およそ 0.2〜0.4 ドル（30〜60 円）。
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import {
  SheetExtractionSchema,
  buildSystemPrompt,
  buildUserText,
  type ExtractResult,
  type SheetImage,
} from "../schema";

const MODEL = "claude-opus-5";

export async function extractWithClaude(images: SheetImage[]): Promise<ExtractResult> {
  const client = new Anthropic();

  // 読み取りの深さ。既定は high（最も正確）。時間がかかりすぎる場合だけ
  // 環境変数で medium に下げる。
  const effort = (process.env.SHEET_EXTRACT_EFFORT ?? "high") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      }),
    ),
    { type: "text", text: buildUserText(images) },
  ];

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // 安全判定で断られた場合に、推奨の別モデルで自動的にやり直す
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort,
        format: betaZodOutputFormat(SheetExtractionSchema),
      },
      system: buildSystemPrompt(),
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: "写真を読み取れませんでした（AI が処理を断りました）。写真を撮り直してお試しください。",
      };
    }
    if (response.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "読み取り結果が長すぎて途中で切れました。1 ページずつ取り込んでお試しください。",
      };
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      return { ok: false, error: "読み取り結果の形式が不正でした。もう一度お試しください。" };
    }
    return { ok: true, extraction: parsed, model: response.model };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "写真読み取り用の API キーが正しくありません。開発者にご連絡ください。" };
    }
    if (e instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, error: "写真読み取り用の API キーに権限がありません。開発者にご連絡ください。" };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "混み合っています。1分ほど待ってからお試しください。" };
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error("[sheet:claude] bad request:", e.message);
      return {
        ok: false,
        error: "写真を送信できませんでした。写真のサイズや形式（JPEG/PNG）をご確認ください。",
      };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "読み取りサービスに接続できませんでした。通信環境をご確認ください。" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[sheet:claude] api error:", e.status, e.message);
      return { ok: false, error: `読み取りに失敗しました（${e.status ?? "不明"}）。時間をおいてお試しください。` };
    }
    console.error("[sheet:claude] unexpected error:", e);
    return { ok: false, error: "読み取り中に予期しないエラーが発生しました。" };
  }
}
