/**
 * DB の menus 行を UI で扱いやすい形に整形するヘルパ。
 * src/lib/menu-data.ts はランディングページ用のスタブで、DB が真実。
 */
import type { MenuRow } from "@/lib/reservation/queries";

export type MenuCategoryDb = MenuRow["category"];

export const MENU_CATEGORY_META: Record<
  MenuCategoryDb,
  { label: string; description: string }
> = {
  cut: {
    label: "カット",
    description: "シャンプー・顔剃り込みの基本メニュー",
  },
  course: {
    label: "コースメニュー",
    description: "カット ＋ スパや角質落としを組み合わせた人気コース",
  },
  color: {
    label: "カラー",
    description: "白髪ぼかし・ブリーチ・メッシュまで対応（カット込）",
  },
  perm: {
    label: "パーマ",
    description: "スパイラル・ツイストなど特殊系もカット込",
  },
  straighten: {
    label: "縮毛矯正",
    description: "顔剃込のオプションあり",
  },
  option: {
    label: "オプション",
    description: "他メニューに追加できる単品オプション",
  },
};

export const MENU_CATEGORY_ORDER: MenuCategoryDb[] = [
  "cut",
  "course",
  "color",
  "perm",
  "straighten",
  "option",
];

export function formatMenuPrice(menu: Pick<MenuRow, "price" | "price_label">): string {
  if (menu.price_label) return menu.price_label;
  return `${menu.price.toLocaleString("ja-JP")}円`;
}

export function formatDurationMin(min: number): string {
  if (min < 60) return `約${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `約${h}時間` : `約${h}時間${m}分`;
}

export function groupMenusByCategory(menus: MenuRow[]): Record<MenuCategoryDb, MenuRow[]> {
  const initial: Record<MenuCategoryDb, MenuRow[]> = {
    cut: [],
    course: [],
    color: [],
    perm: [],
    straighten: [],
    option: [],
  };
  for (const m of menus) {
    initial[m.category].push(m);
  }
  for (const cat of MENU_CATEGORY_ORDER) {
    initial[cat].sort((a, b) => a.sort_order - b.sort_order);
  }
  return initial;
}
