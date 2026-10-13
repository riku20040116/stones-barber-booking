/**
 * テスト用のメニューと、読み取り用の表。
 * 所要時間は 2026-10-13 の見直し後（20261013000001_menu_durations.sql）の値。
 * テストからだけ使う。
 */
import { readFileSync } from "node:fs";
import { buildCatalog } from "./parse.ts";
import { MENU_ALIASES } from "./aliases.ts";
import type { Catalog, CodeDefsInput, MenuEntry } from "./types";

const m = (
  slug: string,
  name: string,
  price: number,
  durationMin: number,
  isOption = false,
): MenuEntry => ({ slug, id: `id-${slug}`, name, price, durationMin, isOption, code: null });

export const TEST_MENUS: MenuEntry[] = [
  m("cut-adult-shave", "カット・シャンプー・顔剃り（大人）", 4800, 60),
  m("cut-adult", "カット・シャンプー（大人）", 3800, 45),
  m("cut-high-school", "カット・シャンプー（高校生）", 3300, 45),
  m("cut-junior-high", "カット・シャンプー（中学生）", 3000, 45),
  m("cut-child", "カット・シャンプー（0歳〜小学生）", 2700, 45),
  m("course-headspa", "ヘッドスパコース", 5800, 75),
  m("course-facespa", "フェイススパコース", 5800, 75),
  m("course-king", "キングコース", 6800, 90),
  m("color-standard", "カラー", 7500, 90),
  m("color-bleach", "ブリーチ", 9000, 120),
  m("color-mesh", "メッシュ", 9500, 120),
  m("color-gray-blend", "白髪ぼかし", 6000, 90),
  m("perm-standard", "パーマ", 9000, 120),
  m("perm-spiral", "スパイラルパーマ", 9300, 120),
  m("perm-twist-spiral", "ツイストスパイラルパーマ", 9500, 120),
  m("perm-wet", "濡れパン", 9000, 105),
  m("perm-twist", "ツイスト", 11700, 180),
  m("straighten-standard", "縮毛矯正", 9500, 120),
  m("opt-face-shave", "お顔剃り", 1000, 15, true),
  m("opt-scalp-spa", "頭皮スパ", 700, 20, true),
  m("opt-face-spa", "フェイススパ", 600, 20, true),
  m("opt-face-pack", "フェイスパック", 300, 10, true),
  m("opt-exfoliation", "角質落とし", 200, 10, true),
  m("opt-ear-wash", "耳洗い", 400, 15, true),
  m("opt-nose-wax", "鼻脱毛", 400, 10, true),
  m("opt-eyebrow-shave", "眉毛剃", 300, 5, true),
  m("opt-design-line", "分け目ライン・デザインライン", 200, 10, true),
  m("opt-skin-fade", "スキンフェード追加", 500, 15, true),
];

const codeDefs = JSON.parse(
  readFileSync(new URL("../sheet/menu-codes.json", import.meta.url), "utf8"),
) as CodeDefsInput;

export const TEST_CATALOG: Catalog = buildCatalog(TEST_MENUS, codeDefs, MENU_ALIASES);
