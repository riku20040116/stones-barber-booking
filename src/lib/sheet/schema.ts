/**
 * 手書き予約表の読み取り: どの AI を使っても共通の部分。
 *   - 出力スキーマ（zod と、そこから作る JSON Schema）
 *   - 指示文（予約表の書式の説明）
 *   - 画像の型
 *
 * 読み取り本体は providers/ の下（Claude / Gemini）。振り分けは extract.ts。
 */
import { z } from "zod/v4";

import { ALL_CODE_STRINGS, CODE_RULE, MAIN_CODES, OPTION_CODES } from "./menu-codes";

// -----------------------------------------------------------------------------
// 出力スキーマ
//   数値の範囲や正規表現は構造化出力で使えないものがあるので付けない。
//   形式のチェックは受け取った後に resolve 側で行う。
//
//   列記号・自信度・メニュー記号は enum にしたいところだが、AI によっては
//   enum を強制しない。その状態で enum の zod 検証をかけると、1 件でも想定外の値が
//   来たとき表全体の読み取りが失敗する。ここでは文字列で受け取り、resolve 側で弾く。
// -----------------------------------------------------------------------------
const CODE_HINT = `使ってよい記号: ${ALL_CODE_STRINGS.join(" ")}`;

const BookingSchema = z.object({
  box_start: z
    .string()
    .describe("実線の四角の上辺の時刻。24時間表記の HH:MM（例 09:30, 13:15）"),
  box_end: z
    .string()
    .describe("実線の四角の下辺の時刻。HH:MM。下辺が読み取れなければ空文字"),
  name: z.string().describe("四角の中の「名前」欄に書かれた名前。読めた文字をそのまま"),
  course_text: z.string().describe("四角の中の「コース」欄に書かれた文字をそのまま（例 C2+S）"),
  course_codes: z
    .array(z.string())
    .describe(`コース欄を凡例の記号に直したもの。読めない記号は入れない。${CODE_HINT}`),
  memo_no: z
    .number()
    .nullable()
    .describe("名前の横に ① ② のような丸数字があればその数字。なければ null"),
  crossed_out: z
    .boolean()
    .describe("名前・コースの上から ✖（×・❌）がかぶせて書かれていれば true（取り消し）"),
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
  week_year: z.number().nullable().describe("「この週の火曜日」の年。読めなければ null"),
  week_month: z.number().nullable(),
  week_day: z.number().nullable(),
  import_month: z
    .number()
    .nullable()
    .describe("「取り込み日」の月。空欄なら null"),
  import_day: z.number().nullable().describe("「取り込み日」の日。空欄なら null"),
  columns: z.array(ColumnSchema).describe("A〜F の各列。写っていない列は含めない"),
  contacts: z
    .array(ContactSchema)
    .describe("2 ページ目「お客様メモ」に書かれている行。空の行・写っていない場合は空配列"),
  warnings: z
    .array(z.string())
    .describe("全体についての注意（写真がぼやけている、一部が切れている等）"),
});

export type SheetExtraction = z.infer<typeof SheetExtractionSchema>;
export type ExtractedBooking = z.infer<typeof BookingSchema>;

/**
 * 上のスキーマを JSON Schema にしたもの（Gemini に渡す）。
 * "$schema" は Gemini の対応項目に無いので外す。
 */
export const SHEET_JSON_SCHEMA: Record<string, unknown> = (() => {
  const schema = { ...(z.toJSONSchema(SheetExtractionSchema) as Record<string, unknown>) };
  delete schema.$schema;
  return schema;
})();

// -----------------------------------------------------------------------------
// 画像
// -----------------------------------------------------------------------------
export type SheetImage = {
  /** sheet = 予約表（1 ページ目） ／ memo = 2 ページ目（お客様メモ・電話番号あり） */
  kind: "sheet" | "memo";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** base64 文字列（data: の接頭辞は付けない） */
  data: string;
};

export type ExtractResult =
  | { ok: true; extraction: SheetExtraction; model: string }
  | { ok: false; error: string };

export function buildUserText(images: SheetImage[]): string {
  return images.length > 1
    ? `写真 ${images.length} 枚です（1 ページ目の予約表と、2 ページ目のお客様メモ）。書式どおりに読み取ってください。`
    : "予約表の写真です。書式どおりに読み取ってください。";
}

// -----------------------------------------------------------------------------
// 指示文
//   予約表の書式を具体的に説明する。凡例は menu-codes.json から組み立てるので、
//   記号を変えてもここを直す必要はない。
// -----------------------------------------------------------------------------
export function buildSystemPrompt(): string {
  const legend = [
    ...MAIN_CODES.map((c) => `${c.code} = ${c.label}`),
    ...OPTION_CODES.map(
      (c) =>
        `${c.code} = ${c.label}（オプション）` +
        (c.aliases?.length ? `　※古い用紙では「+${c.aliases.join("」「+")}」と書かれていることがあります` : ""),
    ),
  ].join("\n");
  const examples = CODE_RULE.examples
    .map((e) => `  ${e.write} → ${e.means}`)
    .join("\n");

  return `あなたは理容室 STONE'S BARBER の手書き予約表を読み取り、予約の一覧に書き起こす係です。
読み取った結果は、店のスタッフが画面で確認してから予約システムに登録します。
推測で埋めるより、読めなかったことを正直に残すほうが役に立ちます。

## 用紙の構成（写真は 1〜2 枚）
- 1 ページ目「予約表」（A4 横）: 火〜日の 6 日分が 1 枚に並んでいます。
  列は左から A（火）・B（水）・C（木）・D（金）・E（土）・F（日）。
- 2 ページ目「メニュー早見表・書き方・お客様メモ」（A4 縦）: 予約は書かれていません。お客様メモだけを読みます。
- 月曜は定休なので用紙にありません。列の曜日は印刷済みで、列記号と曜日の対応は上のとおり固定です。

## 予約表の書式（1 ページ目）
- 横に 6 列が並び、それぞれが 1 日分です。列の見出しに列記号、「月」「日」を書くマス、印刷済みの曜日、「休」の四角があります。
- 見出しの右上に「この週の火曜日 □年□月□日」と「取り込み日 □月□日」があります。
  - 取り込み日は、この用紙をシステムに取り込んだ日を後から書く欄です。空欄が普通です。
- 左右の端に時刻が印刷されています。9:00 から 19:30 まで、1 行が 15 分です（1 行は約 4mm と細い）。毎正時は太字です。
- 1 日分の列の中は 2 つの欄に分かれています: 左が「名前」、右が「コース」。開始時刻を書く欄はありません。
- 時刻の区切りの横線は、日付の列の中では印刷の段階ですべて「破線（点線）」です。毎正時の線も破線です。
  - 左右の時刻の列の中にある短い横線は印刷された目盛りです。予約の判定には使わないでください。
  - 1 時間おきに薄い灰色の帯が印刷されています。これも線ではありません。
- 予約が入ると、書いた人が予約の時間帯の上下の破線をペンでなぞって「実線」にし、四角で囲みます。
  - 日付の列の中で、ペンでなぞられた実線だけが予約の区切りです。
  - 四角の上辺の時刻 = 予約の開始、下辺の時刻 = 予約の終了です。
  - 連続した予約では、前の予約の下辺と次の予約の上辺が 1 本の実線を共有します。
  - 実線と実線の間に名前が書かれていない部分は予約ではありません。
- 四角の中の「名前」欄にお客様の名前（姓だけのことが多い）、「コース」欄にメニュー記号を書きます。
  - 行が細いので、文字は行をまたいで四角の中のどこに書かれていても構いません（上寄り・真ん中など）。
  - 四角の中にある名前・コースは、すべてその四角の予約のものです。
  - 開始時刻は書かれません。四角の上辺の位置で判断してください。
- 新規のお客様には名前の横に ① ② のような丸数字が添えてあり、2 ページ目のお客様メモと対応します。
- **取り消し**: 予約を取り消すときは、名前・コースの上から大きな ✖（×・❌）をかぶせて書きます。
- 「この週の火曜日」は A 列（火）の日付です。

## メニュー記号の凡例
${legend}

## メニューの書き方のきまり
${CODE_RULE.text}。
${examples}
- コース記号（C1〜T1）は必ず 1 つ書かれ、先頭に来ます。
- オプションが無いときは「+」以降は書かれません。
- オプションが 2 つ以上のときは「+」でつなげます（例: C1+H+E）。
- 「+」を書き忘れて続けて書かれていることもあります（例: C2S）。その場合も C2 と +S に分けて読んでください。

## 2 ページ目（写っている場合）
「お客様メモ」の表に No.（①②…）・お名前・お電話番号・コース・備考 が書かれています。書かれている行だけを contacts に入れてください。
同じページの「メニュー早見表」「書き方」「記入例」は印刷された説明なので、予約として読まないでください。

## 読み取りのきまり
- 時刻は 24 時間表記の HH:MM で書いてください（午後 1 時 15 分 → 13:15）。
- 四角の上辺・下辺は、左右の端に印刷された時刻の行に合わせて 15 分単位で読んでください。行が細いので、上辺・下辺がどの時刻の線か迷うときは confidence を下げ、remarks に書いてください。
- 名前・コースの上から ✖（×・❌）がかぶせて書かれた予約、二重線で消された予約も、読み飛ばさずに bookings に含め、crossed_out を true にしてください。
  - 店のスタッフが画面で「本当に取り消しか」を確かめるためです。
  - ✖ かどうか迷うとき（ただの書き損じ・なぞり線と区別がつかない等）は crossed_out を false にし、confidence を low にして remarks に「✖ の可能性あり」と書いてください。
- 書き直しがある場合は新しいほうを採用し、remarks に書いてください。
- 写っていない列（用紙の端が切れている場合など）は columns に含めないでください。
- 名前が読めない・メニュー記号が凡例に無い・線がなぞられているか判断できない、といった場合は confidence を low にし、remarks に具体的に書いてください。
- 予約が 1 件もない列の bookings は空配列にしてください。`;
}
