/**
 * 貼り付けた文字の読み取りのテスト。`npm test` で動く。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePastedText, normalizeText, sameName } from "./parse.ts";
import { TEST_CATALOG } from "./test-fixtures.ts";
import type { ParseResult, ParsedRow } from "./types";

const TODAY = "2026-10-12";

function parse(text: string, baseDate = TODAY): ParseResult {
  return parsePastedText(text, { baseDate, today: TODAY, catalog: TEST_CATALOG });
}

/** 比べやすい形にする */
function brief(r: ParsedRow) {
  return {
    date: r.date,
    start: r.start,
    end: r.writtenEnd,
    name: r.name,
    menus: r.menus.map((h) => h.slug),
  };
}

// -----------------------------------------------------------------------------
// Google の AI の回答（2026-10 に実際の予約表の写真から作られた文字そのまま）
// -----------------------------------------------------------------------------

const AI_ANSWER = `画像に写っている予約表（STONE'S BARBER）の予約内容は以下の通りです。
火曜日（10月6日）
* 北村 様
   * コース：C2
   * 時間：12:15 〜 13:00
水曜日（10月7日）
* ユミダ 様
   * コース：C2
   * 時間：11:15 〜 12:00
* 中村 様
   * コース：C2
   * 時間：15:45 〜 16:30
金曜日（10月9日）
* タカハシ 様
   * コース：C4
   * 時間：14:00 〜 14:45
土曜日（10月10日）
* 田中 様
   * コース：C1
   * 時間：12:15 〜 13:15
日曜日（10月11日）
* 遠藤 様
   * コース：C4
   * 時間：15:45 〜 16:45
他の曜日（月曜日など）の確認や、特定の時間帯の空き状況の確認などが必要でしたらお知らせください。`;

test("Google の AI の回答から 6 件読める", () => {
  const res = parse(AI_ANSWER);
  assert.deepEqual(res.rows.map(brief), [
    { date: "2026-10-06", start: "12:15", end: "13:00", name: "北村", menus: ["cut-adult"] },
    { date: "2026-10-07", start: "11:15", end: "12:00", name: "ユミダ", menus: ["cut-adult"] },
    { date: "2026-10-07", start: "15:45", end: "16:30", name: "中村", menus: ["cut-adult"] },
    { date: "2026-10-09", start: "14:00", end: "14:45", name: "タカハシ", menus: ["cut-junior-high"] },
    { date: "2026-10-10", start: "12:15", end: "13:15", name: "田中", menus: ["cut-adult-shave"] },
    { date: "2026-10-11", start: "15:45", end: "16:45", name: "遠藤", menus: ["cut-junior-high"] },
  ]);
  // 前置きとしめくくりの文章は読み飛ばす
  assert.equal(res.ignoredLines.length, 2);
  assert.deepEqual(res.unreadLines, []);
  // 元の文字が残っている（確認画面で小さく見せる）
  assert.ok(res.rows[0]!.sourceLines.some((l) => l.includes("北村")));
  assert.ok(res.rows[0]!.menus.every((h) => h.sure));
});

// -----------------------------------------------------------------------------
// 手で打った文字
// -----------------------------------------------------------------------------

test("いろいろな時刻の書き方", () => {
  const res = parse(
    ["10:00 山田 C2", "10時半 佐藤様 C1", "14時30分 鈴木さん C3", "1600 田中 C4", "9時 高橋 C5"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.date, r.start, r.name]),
    [
      ["2026-10-15", "10:00", "山田"],
      ["2026-10-15", "10:30", "佐藤"],
      ["2026-10-15", "14:30", "鈴木"],
      ["2026-10-15", "16:00", "田中"],
      ["2026-10-15", "09:00", "高橋"],
    ],
  );
  assert.deepEqual(
    res.rows.map((r) => r.menus[0]?.slug),
    ["cut-adult", "cut-adult-shave", "cut-high-school", "cut-junior-high", "cut-child"],
  );
});

test("全角の文字も読める", () => {
  const res = parse("１０：００　山田　Ｃ２　０９０－１２３４－５６７８", "2026-10-15");
  assert.deepEqual(brief(res.rows[0]!), {
    date: "2026-10-15", start: "10:00", end: "", name: "山田", menus: ["cut-adult"],
  });
  assert.equal(res.rows[0]!.phone, "090-1234-5678");
});

test("時間の範囲の書き方（〜 - から）", () => {
  const res = parse(
    ["10:00〜10:45 山田 C2", "11:00 - 11:45 佐藤 C2", "13時から14時 鈴木 C2", "15:00～15:30 田中 C2"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.start, r.writtenEnd]),
    [["10:00", "10:45"], ["11:00", "11:45"], ["13:00", "14:00"], ["15:00", "15:30"]],
  );
});

test("料金の 1000 円や年の 2025 年は時刻にしない", () => {
  const res = parse("山田 C2 1000円\n2025年メモ", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0]!.start, "");
});

test("電話番号（ハイフンあり・なし）", () => {
  const res = parse(["10:00 山田 C2 090-1234-5678", "11:00 佐藤 C1 09012345678"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.phone), ["090-1234-5678", "09012345678"]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("様・さん・さま を外す", () => {
  const res = parse(["10:00 山田様 C2", "11:00 佐藤 さん C2", "12:00 鈴木さま C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤", "鈴木"]);
});

// -----------------------------------------------------------------------------
// 日付
// -----------------------------------------------------------------------------

test("日付の行があれば、そこから下はその日付", () => {
  const res = parse(
    ["10:00 前田 C2", "10/15", "10:00 山田 C2", "11:00 佐藤 C1", "10月16日(金)", "9:30 鈴木 C3"].join("\n"),
    "2026-10-14",
  );
  assert.deepEqual(
    res.rows.map((r) => [r.date, r.name]),
    [
      ["2026-10-14", "前田"],
      ["2026-10-15", "山田"],
      ["2026-10-15", "佐藤"],
      ["2026-10-16", "鈴木"],
    ],
  );
});

test("同じ行に日付があってもよい", () => {
  const res = parse("10/20 10:00 山田 C2\n10月21日 11:00 佐藤 C2");
  assert.deepEqual(res.rows.map((r) => r.date), ["2026-10-20", "2026-10-21"]);
});

test("年が無いときは今年。2 か月以上前になるなら来年", () => {
  // 今日は 2026-10-12
  const res = parse(["1/5 10:00 山田 C2", "8/20 10:00 佐藤 C2", "8/1 10:00 鈴木 C2", "2027年3月3日 10:00 田中 C2"].join("\n"));
  assert.deepEqual(res.rows.map((r) => r.date), ["2027-01-05", "2026-08-20", "2027-08-01", "2027-03-03"]);
});

test("ありえない日付は日付にしない", () => {
  const res = parse("2/30 10:00 山田 C2", "2026-10-15");
  assert.equal(res.rows[0]!.date, "2026-10-15");
});

// -----------------------------------------------------------------------------
// メニュー
// -----------------------------------------------------------------------------

test("記号とオプション（C2+S・C2S・K1+H+E・+剃）", () => {
  const res = parse(
    ["10:00 山田 C2+S", "11:00 佐藤 C2S", "12:00 鈴木 K1+H+E", "13:00 田中 C2+SF", "14:00 高橋 C2+剃"].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => h.slug)), [
    ["cut-adult", "opt-face-shave"],
    ["cut-adult", "opt-face-shave"],
    ["color-standard", "opt-scalp-spa", "opt-ear-wash"],
    ["cut-adult", "opt-skin-fade"],
    ["cut-adult", "opt-face-shave"],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤", "鈴木", "田中", "高橋"]);
});

test("メニューの正式名でも読める", () => {
  const res = parse("10:00 山田 縮毛矯正\n12:00 佐藤 キングコース", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => [h.slug, h.sure])), [
    [["straighten-standard", true]],
    [["course-king", true]],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("似ている書き方（カツト→カット、Cl→C1）は「確認してほしい」印つき", () => {
  const res = parse("10:00 山田 カツト\n11:00 佐藤 Cl", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => r.menus.map((h) => [h.slug, h.via, h.sure])), [
    [["cut-adult", "fuzzy", false]],
    [["cut-adult-shave", "fuzzy", false]],
  ]);
  assert.deepEqual(res.rows.map((r) => r.name), ["山田", "佐藤"]);
});

test("略し方の表の言葉は「確認してほしい」印つき", () => {
  const res = parse("10:00 山田 カット", "2026-10-15");
  assert.deepEqual(res.rows[0]!.menus.map((h) => [h.slug, h.via, h.sure]), [["cut-adult", "word", false]]);
});

test("少し違う名前（キングコーズ）も近いメニューを候補にする", () => {
  const res = parse("10:00 山田 キングコーズ", "2026-10-15");
  assert.deepEqual(res.rows[0]!.menus.map((h) => [h.slug, h.sure]), [["course-king", false]]);
  assert.equal(res.rows[0]!.name, "山田");
});

test("読めない記号（C9）は記録しておく", () => {
  const res = parse("10:00 山田 C9", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.deepEqual(res.rows[0]!.menus, []);
  assert.deepEqual(res.rows[0]!.unknownCodes, ["C9"]);
  assert.equal(res.rows[0]!.name, "山田");
});

// -----------------------------------------------------------------------------
// 行のまとめ方（レンズの文字は 1 件が何行にも分かれる）
// -----------------------------------------------------------------------------

test("名前が先・時刻があとの並び", () => {
  const res = parse(["北村", "C2", "12:15~13:00", "ヨシダ", "C2", "11:15~12:00"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map(brief), [
    { date: "2026-10-15", start: "12:15", end: "13:00", name: "北村", menus: ["cut-adult"] },
    { date: "2026-10-15", start: "11:15", end: "12:00", name: "ヨシダ", menus: ["cut-adult"] },
  ]);
});

test("時刻が先・名前があとの並び", () => {
  const res = parse(["12:15~13:00", "北村 C2", "15:45~16:30", "中村 C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["12:15", "北村"], ["15:45", "中村"]]);
});

test("ラベルつきの行（お名前：・メモ：・電話：）", () => {
  const res = parse(
    ["時間：10:00〜10:45", "お名前：山田 太郎 様", "メニュー：C2", "電話：090-1111-2222", "メモ：初めての方"].join("\n"),
    "2026-10-15",
  );
  assert.equal(res.rows.length, 1);
  const r = res.rows[0]!;
  assert.equal(r.name, "山田 太郎");
  assert.equal(r.phone, "090-1111-2222");
  assert.equal(r.notes, "初めての方");
  assert.deepEqual(r.menus.map((h) => h.slug), ["cut-adult"]);
});

test("1 行に 2 件あっても分ける", () => {
  const res = parse("10:00 山田 C2 11:00 佐藤 C1", "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name, r.menus[0]?.slug]), [
    ["10:00", "山田", "cut-adult"],
    ["11:00", "佐藤", "cut-adult-shave"],
  ]);
});

test("印刷された時刻の目盛り（時刻だけの行が続く）は読み飛ばす", () => {
  const res = parse(["9:00", "9:15", "9:30", "9:45", "10:00 山田 C2"].join("\n"), "2026-10-15");
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["10:00", "山田"]]);
  assert.equal(res.ignoredLines.length, 4);
});

test("予約表に印刷された説明の行は予約にしない", () => {
  const res = parse(
    [
      "予約表 火〜日 STONE'S BARBER この週の火曜日 年 月 日 取り込み日 月 日 ← 取り込んだら記入",
      "月 日 (火) 休",
      "名前 コース",
      "A",
      "12:15~13:00",
      "北村 C2",
      "1 行 = 15 分 横線はすべて破線(なぞった線だけが実線) 営業 火〜金 9:30-19:30 / 土日祝 9:00-19:00 定休 月曜・第3火曜",
    ].join("\n"),
    "2026-10-15",
  );
  assert.deepEqual(res.rows.map((r) => [r.start, r.name]), [["12:15", "北村"]]);
});

test("読めない行は「読み取れなかった行」に回す", () => {
  const res = parse(["###", "10:00 山田 C2", "佐藤"].join("\n"), "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.deepEqual(res.unreadLines, ["###", "佐藤"]);
});

test("時刻が無くてもメニューがあれば候補にする（確認画面で時刻を入れる）", () => {
  const res = parse("山田 C2", "2026-10-15");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0]!.start, "");
});

test("空の文字", () => {
  const res = parse("  \n\n ");
  assert.deepEqual(res, { rows: [], unreadLines: [], ignoredLines: [] });
});

// -----------------------------------------------------------------------------
// 小さな部品
// -----------------------------------------------------------------------------

test("normalizeText", () => {
  assert.equal(normalizeText("１０：００〜１１：００"), "10:00~11:00");
});

test("sameName（様・カタカナの小さい字・姓だけ）", () => {
  assert.ok(sameName("山田様", "山田"));
  assert.ok(sameName("山田", "山田 太郎"));
  assert.ok(sameName("ヨッシー", "ヨツシー"));
  assert.ok(!sameName("山田", "佐藤"));
  assert.ok(!sameName("", "佐藤"));
});
