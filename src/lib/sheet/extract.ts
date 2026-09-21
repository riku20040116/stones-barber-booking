/**
 * 手書き予約表の写真を Claude で読み取り、構造化データにする。
 *
 * - モデルは Claude Opus 5。手書きの崩れた文字と、なぞった実線の位置を
 *   あわせて読む必要があるため、最上位のモデルを使う。
 * - 出力は JSON スキーマで強制する（structured outputs）。
 *   メニュー記号は enum にして、予約表に無い記号を作れないようにしている。
 * - 読み取り結果はそのまま登録せず、必ず管理画面で人が確認してから登録する。
 *
 * 料金の目安: 写真 2 枚で 1 回あたり およそ 0.2〜0.4 ドル（30〜60 円）。
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

import { ALL_CODE_STRINGS, MAIN_CODES, OPTION_CODES } from "./menu-codes";

const MODEL = "claude-opus-5";

// -----------------------------------------------------------------------------
// 出力スキーマ
//   数値の範囲や正規表現は構造化出力で使えないものがあるので付けない。
//   形式のチェックは受け取った後に resolve 側で行う。
//
//   列記号・自信度・メニュー記号は enum にしたいところだが、SDK の zod 変換は
//   enum を「説明文のヒント」に置き換える（強制ではない）。その状態で enum の
//   zod 検証をかけると、1 件でも想定外の値が来たとき表全体の読み取りが失敗する。
//   ここでは文字列で受け取り、sanitize 側で弾く。
// -----------------------------------------------------------------------------
const CODE_HINT = `使ってよい記号: ${ALL_CODE_STRINGS.join(" ")}`;

const BookingSchema = z.object({
  box_start: z
    .string()
    .describe("実線の四角の上辺の時刻。24時間表記の HH:MM（例 09:30, 13:15）"),
  box_end: z
    .string()
    .describe("実線の四角の下辺の時刻。HH:MM。下辺が読み取れなければ空文字"),
  written_start: z
    .string()
    .describe("「開始」欄に手書きされた時刻をそのまま HH:MM で。書かれていなければ空文字"),
  name: z.string().describe("「名前」欄の手書きの名前。読めた文字をそのまま"),
  course_text: z.string().describe("「コース」欄に書かれた文字をそのまま（例 C2+剃）"),
  course_codes: z
    .array(z.string())
    .describe(`コース欄を凡例の記号に直したもの。読めない記号は入れない。${CODE_HINT}`),
  memo_no: z
    .number()
    .nullable()
    .describe("名前の横に ① ② のような丸数字があればその数字。なければ null"),
  confidence: z
    .string()
    .describe("この予約の読み取りにどれだけ自信があるか。high / medium / low のどれか"),
  remarks: z
    .string()
    .describe("読みにくかった点・判断に迷った点。なければ空文字"),
});

const ColumnSchema = z.object({
  column: z.string().describe("列の記号。A / B / C / D / E / F のどれか"),
  month: z.number().nullable().describe("日付欄の「月」。読めなければ null"),
  day: z.number().nullable().describe("日付欄の「日」。読めなければ null"),
  closed: z.boolean().describe("「休」の四角に印があれば true"),
  bookings: z.array(BookingSchema),
});

const ContactSchema = z.object({
  no: z.number().describe("No. 欄の番号（①なら 1）"),
  name: z.string(),
  phone: z.string().describe("電話番号。書かれた数字とハイフンをそのまま"),
  menu_text: z.string(),
  remarks: z.string(),
});

export const SheetExtractionSchema = z.object({
  sheet_found: z
    .boolean()
    .describe("写真に STONE'S BARBER の予約表が写っていれば true"),
  week_year: z.number().nullable().describe("「この用紙の週」の年。読めなければ null"),
  week_month: z.number().nullable(),
  week_day: z.number().nullable(),
  columns: z.array(ColumnSchema).describe("A〜F の各列。写っていない列は含めない"),
  contacts: z
    .array(ContactSchema)
    .describe("2ページ目「お客様メモ」に書かれている行。空の行は含めない"),
  warnings: z
    .array(z.string())
    .describe("全体についての注意（写真がぼやけている、一部が切れている等）"),
});

export type SheetExtraction = z.infer<typeof SheetExtractionSchema>;
export type ExtractedBooking = z.infer<typeof BookingSchema>;

// -----------------------------------------------------------------------------
// 指示文
//   予約表の書式を具体的に説明する。凡例は menu-codes.json から組み立てるので、
//   記号を変えてもここを直す必要はない。
// -----------------------------------------------------------------------------
function buildSystemPrompt(): string {
  const legend = [
    ...MAIN_CODES.map((c) => `${c.code} = ${c.label}`),
    ...OPTION_CODES.map((c) => `${c.code} = ${c.label}（オプション）`),
  ].join("\n");

  return `あなたは理容室 STONE'S BARBER の手書き予約表を読み取り、予約の一覧に書き起こす係です。
読み取った結果は、店のスタッフが画面で確認してから予約システムに登録します。
推測で埋めるより、読めなかったことを正直に残すほうが役に立ちます。

## 予約表の書式（1ページ目）
- 横に A〜F の 6 列が並び、それぞれが 1 日分です。列の見出しに「月」「日」「曜」を書くマスと「休」の四角があります。
- 左右の端に時刻が印刷されています。9:00 から 19:30 まで、1 行が 15 分です。毎正時は太字です。
- 1 日分の列の中はさらに 3 つの欄に分かれています: 左から「開始」「名前」「コース」。
- 時刻の区切りの横線は、日付の列の中では印刷の段階ですべて「破線（点線）」です。毎正時の線も破線です。
  - 左右の時刻の列の中にある短い横線は印刷された目盛りです。予約の判定には使わないでください。
  - 1 時間おきに薄い灰色の帯が印刷されています。これも線ではありません。
- 予約が入ると、書いた人が予約の時間帯の上下の破線をペンでなぞって「実線」にし、四角で囲みます。
  - 日付の列の中で、ペンでなぞられた実線だけが予約の区切りです。
  - 四角の上辺の時刻 = 予約の開始、下辺の時刻 = 予約の終了です。
  - 連続した予約では、前の予約の下辺と次の予約の上辺が 1 本の実線を共有します。
  - 実線と実線の間に名前が書かれていない部分は予約ではありません。
- 四角の中の最初の行に、「開始」欄へ開始時刻、「名前」欄へお客様の名前（姓だけのことが多い）、「コース」欄へメニュー記号を書きます。
- 新規のお客様には名前の横に ① ② のような丸数字が添えてあり、2ページ目のお客様メモと対応します。
- 取り消した予約は、四角の中に大きな × が書かれています。
- 「この用紙の週：□年□月□日」は A 列の日付です。

## メニュー記号の凡例
${legend}
記号は組み合わせて書かれます（例: C2+剃 は カット・シャンプー と お顔剃り）。

## 2ページ目（写っている場合）
「お客様メモ」の表に No.（①②…）・お名前・お電話番号・メニュー・備考 が書かれています。書かれている行だけを contacts に入れてください。

## 読み取りのきまり
- 時刻は 24 時間表記の HH:MM で書いてください（午後 1 時 15 分 → 13:15）。
- 四角の上辺・下辺は、左右の端に印刷された時刻の行に合わせて 15 分単位で読んでください。
- 「開始」欄の手書きの時刻と四角の上辺の時刻が食い違うときは、両方をそのまま書き、remarks にその旨を書いてください。どちらかに寄せて直さないでください。
- 四角の中に大きな × がある予約、二重線で消された予約は取り消しなので含めないでください。書き直しがある場合は新しいほうを採用し、remarks に書いてください。
- 名前が読めない・メニュー記号が凡例に無い・線がなぞられているか判断できない、といった場合は confidence を low にし、remarks に具体的に書いてください。
- 写っていない列や、予約が 1 件もない列の bookings は空配列にしてください。`;
}

// -----------------------------------------------------------------------------
// 実行
// -----------------------------------------------------------------------------
export type SheetImage = {
  /** "image/jpeg" | "image/png" | "image/webp" */
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** base64 文字列（data: の接頭辞は付けない） */
  data: string;
};

export type ExtractResult =
  | { ok: true; extraction: SheetExtraction; model: string }
  | { ok: false; error: string };

/**
 * 開発用: 読み取り結果を JSON ファイルから返す（API を呼ばずに確認画面を試せる）。
 *   SHEET_EXTRACT_MOCK_FILE=scripts/fixtures/sheet-mock.json
 *
 * 条件は必ず `process.env.NODE_ENV !== "production"` をその場に書くこと。
 * 本番ビルドでは NODE_ENV が文字列に置き換わって分岐ごと消えるので、
 * ファイル読み込み（fs）が本番の関数に含まれない。関数に切り出すと消えずに残り、
 * Next のファイル追跡がプロジェクト全体を本番の関数に詰め込んでしまう。
 */
export function isSheetReaderConfigured(): boolean {
  if (process.env.NODE_ENV !== "production" && process.env.SHEET_EXTRACT_MOCK_FILE) {
    return true;
  }
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractSheet(images: SheetImage[]): Promise<ExtractResult> {
  if (process.env.NODE_ENV !== "production" && process.env.SHEET_EXTRACT_MOCK_FILE) {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(process.env.SHEET_EXTRACT_MOCK_FILE, "utf8"));
    const parsed = SheetExtractionSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `モックの形式が不正です: ${parsed.error.message}` };
    return { ok: true, extraction: parsed.data, model: "mock" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "写真の読み取り機能が設定されていません（ANTHROPIC_API_KEY が未設定です）。開発者にご連絡ください。",
    };
  }
  if (images.length === 0) {
    return { ok: false, error: "写真を選んでください。" };
  }

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
    {
      type: "text",
      text:
        images.length > 1
          ? "予約表の写真です（1枚目が予約表、2枚目以降にお客様メモが写っていることがあります）。書式どおりに読み取ってください。"
          : "予約表の写真です。書式どおりに読み取ってください。",
    },
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
        error: "読み取り結果が長すぎて途中で切れました。1週間分ずつ撮影してお試しください。",
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
      console.error("[sheet] bad request:", e.message);
      return {
        ok: false,
        error: "写真を送信できませんでした。写真のサイズや形式（JPEG/PNG）をご確認ください。",
      };
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "読み取りサービスに接続できませんでした。通信環境をご確認ください。" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[sheet] api error:", e.status, e.message);
      return { ok: false, error: `読み取りに失敗しました（${e.status ?? "不明"}）。時間をおいてお試しください。` };
    }
    console.error("[sheet] unexpected error:", e);
    return { ok: false, error: "読み取り中に予期しないエラーが発生しました。" };
  }
}
