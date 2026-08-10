/**
 * 初期メニューデータ。Phase 2 で Supabase に投入し、管理画面から編集可能になる。
 * 価格・所要時間はオーナー確認後に調整できるよう、固定マスタではなく seed 値として扱う。
 */

export type MenuCategory =
  | "cut"
  | "course"
  | "color"
  | "perm"
  | "straighten"
  | "option";

export type MenuItem = {
  /** Supabase 投入時に slug として使う安定 ID */
  id: string;
  category: MenuCategory;
  name: string;
  description?: string;
  /** 表示用ラベル。"7000円〜" のように幅がある場合に使用 */
  priceLabel?: string;
  /** 課金単位の最低価格（円・税込） */
  price: number;
  /** 想定所要時間（分）。連続枠の確保に使用 */
  durationMin: number;
  /** 顔剃込で +1000 円のような派生がある場合の備考 */
  note?: string;
  /** 単独メニューでなく、他メニューに追加するオプション */
  isOption?: boolean;
  /** ageGroup を持つメニュー（学割・子供料金）の判別に使用 */
  ageGroup?: "adult" | "high-school" | "junior-high" | "child";
  sortOrder: number;
};

export const CATEGORY_META: Record<
  MenuCategory,
  { label: string; emoji: string; description: string }
> = {
  cut: {
    label: "カット",
    emoji: "✂",
    description: "シャンプー・顔剃り込みの基本メニュー",
  },
  course: {
    label: "コースメニュー",
    emoji: "👑",
    description: "メンズカットにスパや角質落としを組み合わせた人気コース",
  },
  color: {
    label: "カラー",
    emoji: "🎨",
    description: "白髪ぼかし・ブリーチ・メッシュまで対応（カット込）",
  },
  perm: {
    label: "パーマ",
    emoji: "🌀",
    description: "スパイラル・ツイストなど特殊系もカット込",
  },
  straighten: {
    label: "縮毛矯正",
    emoji: "💧",
    description: "顔剃込のオプションあり",
  },
  option: {
    label: "オプション",
    emoji: "✨",
    description: "他メニューに追加できる単品オプション",
  },
};

export const MENU_ITEMS: MenuItem[] = [
  // === カット ===
  {
    id: "cut-adult-shave",
    category: "cut",
    name: "カット・シャンプー・顔剃り（大人）",
    description: "STONE'S BARBER の基本メニュー。顔剃り込みでさっぱり仕上げ。",
    price: 4500,
    durationMin: 50,
    ageGroup: "adult",
    sortOrder: 10,
  },
  {
    id: "cut-adult",
    category: "cut",
    name: "カット・シャンプー（大人）",
    price: 3500,
    durationMin: 35,
    ageGroup: "adult",
    sortOrder: 20,
  },
  {
    id: "cut-high-school",
    category: "cut",
    name: "カット・シャンプー（高校生）",
    price: 3200,
    durationMin: 30,
    ageGroup: "high-school",
    sortOrder: 30,
  },
  {
    id: "cut-junior-high",
    category: "cut",
    name: "カット・シャンプー（中学生）",
    price: 2900,
    durationMin: 30,
    ageGroup: "junior-high",
    sortOrder: 40,
  },
  {
    id: "cut-child",
    category: "cut",
    name: "カット・シャンプー（0歳〜小学生）",
    price: 2600,
    durationMin: 25,
    ageGroup: "child",
    sortOrder: 50,
  },

  // === コース ===
  {
    id: "course-headspa",
    category: "course",
    name: "ヘッドスパコース",
    description: "メンズカット ＋ 頭皮スパ ＋ 耳洗い",
    price: 5500,
    durationMin: 80,
    sortOrder: 110,
  },
  {
    id: "course-facespa",
    category: "course",
    name: "フェイススパコース",
    description: "メンズカット ＋ 角質落とし ＋ フェイススパ ＋ フェイスパック",
    price: 5500,
    durationMin: 80,
    sortOrder: 120,
  },
  {
    id: "course-king",
    category: "course",
    name: "キングコース",
    description:
      "メンズカット ＋ ヘッドスパコース ＋ フェイススパコースの全部入り",
    price: 6500,
    durationMin: 110,
    sortOrder: 130,
  },

  // === カラー ===
  {
    id: "color-standard",
    category: "color",
    name: "カラー",
    description: "長さ・種類により料金変動。カット込。",
    priceLabel: "7,000円〜",
    price: 7000,
    durationMin: 90,
    note: "顔剃込 +1,000円",
    sortOrder: 210,
  },
  {
    id: "color-bleach",
    category: "color",
    name: "ブリーチ",
    description: "カット込",
    priceLabel: "8,500円〜",
    price: 8500,
    durationMin: 120,
    note: "顔剃込 +1,000円",
    sortOrder: 220,
  },
  {
    id: "color-mesh",
    category: "color",
    name: "メッシュ",
    description: "カット込",
    priceLabel: "9,000円〜",
    price: 9000,
    durationMin: 110,
    note: "顔剃込 +1,000円",
    sortOrder: 230,
  },
  {
    id: "color-gray-blend",
    category: "color",
    name: "白髪ぼかし",
    price: 5500,
    durationMin: 70,
    note: "顔剃込 6,500円",
    sortOrder: 240,
  },

  // === パーマ ===
  {
    id: "perm-standard",
    category: "perm",
    name: "パーマ",
    description: "カット込",
    priceLabel: "8,500円〜",
    price: 8500,
    durationMin: 100,
    note: "顔剃込 +1,000円",
    sortOrder: 310,
  },
  {
    id: "perm-spiral",
    category: "perm",
    name: "スパイラルパーマ",
    description: "カット込",
    priceLabel: "8,800円〜",
    price: 8800,
    durationMin: 110,
    sortOrder: 320,
  },
  {
    id: "perm-twist-spiral",
    category: "perm",
    name: "ツイストスパイラルパーマ",
    description: "カット込",
    priceLabel: "9,000円〜",
    price: 9000,
    durationMin: 120,
    sortOrder: 330,
  },
  {
    id: "perm-wet",
    category: "perm",
    name: "濡れパン",
    description: "カット込",
    priceLabel: "8,500円〜",
    price: 8500,
    durationMin: 100,
    sortOrder: 340,
  },
  {
    id: "perm-twist",
    category: "perm",
    name: "ツイスト",
    description: "カット込",
    priceLabel: "10,500円〜",
    price: 10500,
    durationMin: 130,
    sortOrder: 350,
  },

  // === 縮毛矯正 ===
  {
    id: "straighten-standard",
    category: "straighten",
    name: "縮毛矯正",
    priceLabel: "9,000円〜",
    price: 9000,
    durationMin: 150,
    note: "顔剃込 9,500円〜",
    sortOrder: 410,
  },

  // === オプション ===
  {
    id: "opt-scalp-spa",
    category: "option",
    name: "頭皮スパ",
    description: "炭酸クレンジング ＋ 頭皮マッサージ",
    price: 700,
    durationMin: 20,
    isOption: true,
    sortOrder: 510,
  },
  {
    id: "opt-face-spa",
    category: "option",
    name: "フェイススパ",
    description: "米ぬか配合クリームで顔全体を引き上げマッサージ",
    price: 600,
    durationMin: 20,
    isOption: true,
    sortOrder: 520,
  },
  {
    id: "opt-face-pack",
    category: "option",
    name: "フェイスパック",
    description: "リフトエッセンス／クレイの2種から選択",
    price: 300,
    durationMin: 10,
    isOption: true,
    sortOrder: 530,
  },
  {
    id: "opt-exfoliation",
    category: "option",
    name: "角質落とし",
    description: "毛穴の汚れと古い角質を除去",
    price: 200,
    durationMin: 10,
    isOption: true,
    sortOrder: 540,
  },
  {
    id: "opt-ear-wash",
    category: "option",
    name: "耳洗い",
    description: "炭酸泡で耳の奥までクリーニング",
    price: 400,
    durationMin: 15,
    isOption: true,
    sortOrder: 550,
  },
  {
    id: "opt-nose-wax",
    category: "option",
    name: "鼻脱毛",
    description: "ワックスで手前部分のみ。痛みほぼなし。",
    price: 400,
    durationMin: 10,
    isOption: true,
    sortOrder: 560,
  },
  {
    id: "opt-eyebrow-shave",
    category: "option",
    name: "眉毛剃",
    price: 300,
    durationMin: 5,
    isOption: true,
    sortOrder: 570,
  },
  {
    id: "opt-design-line",
    category: "option",
    name: "分け目ライン・デザインライン",
    description: "本数・種類により料金が異なります",
    priceLabel: "200〜1,000円",
    price: 200,
    durationMin: 10,
    isOption: true,
    sortOrder: 580,
  },
  {
    id: "opt-skin-fade",
    category: "option",
    name: "スキンフェード追加",
    description: "技術と時間を要するため別料金",
    price: 500,
    durationMin: 15,
    isOption: true,
    sortOrder: 590,
  },
];

export function getMenusByCategory(category: MenuCategory): MenuItem[] {
  return MENU_ITEMS.filter((m) => m.category === category).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

export function findMenuById(id: string): MenuItem | undefined {
  return MENU_ITEMS.find((m) => m.id === id);
}

export function formatPrice(item: MenuItem): string {
  if (item.priceLabel) return item.priceLabel;
  return `${item.price.toLocaleString("ja-JP")}円`;
}

export function formatDuration(durationMin: number): string {
  if (durationMin < 60) return `約${durationMin}分`;
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  return m === 0 ? `約${h}時間` : `約${h}時間${m}分`;
}
