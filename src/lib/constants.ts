/**
 * STONE'S BARBER 店舗の固定情報。
 * 営業時間や定休日の論理判定は src/lib/calendar.ts を参照。
 */
export const STORE = {
  name: "STONE'S BARBER",
  nameJa: "ストーンズバーバー",
  concept: "いつまでも男らしく",
  catchphrase: "常にかっこ良く素敵でありたい男性をサポート",
  description:
    "福岡市東区若宮の理容室。オーナー1人による完全マンツーマン施術で、カット・シェーブからヘッドスパ・カラー・パーマ・縮毛矯正まで対応。",
  address: {
    full: "福岡市東区若宮2丁目2-37 永正店舗105",
    prefecture: "福岡県",
    city: "福岡市東区",
    line1: "若宮2丁目2-37",
    line2: "永正店舗105",
    postalCode: "813-0036",
  },
  phone: {
    display: "092-231-8037",
    tel: "0922318037",
  },
  hours: {
    weekday: { open: "09:30", close: "19:30", label: "平日 9:30〜19:30" },
    weekend: { open: "09:00", close: "19:00", label: "土日祝 9:00〜19:00" },
  },
  closures: {
    weekly: "毎週月曜",
    monthly: "第3月曜・火曜は連休",
    note: "祝日営業。第3月曜・火曜は連休となります。",
  },
  social: {
    instagram: "https://www.instagram.com/stones_barber/",
    instagramHandle: "@stones_barber",
    line: "",
  },
  notes: {
    soloOperator:
      "オーナー1名の営業のため、施術中はお電話に出られない場合がございます。Web予約のご利用をおすすめします。",
  },
} as const;

export type StoreInfo = typeof STORE;

/**
 * オーナー情報。/owner ページとフッタで使用。
 */
export const OWNER = {
  name: "石橋 真一郎",
  nameKana: "いしばし しんいちろう",
  birthYear: 1981,
  bloodType: "A",
  hobby: "ゴルフ",
  yearsExperience: 20,
  background: [
    "県内4店舗で修行を積み、コンテストに何度も出場。多数受賞経験あり。",
    "髪質・骨格・ライフスタイルまで考えてご提案します。",
    "メンズカットのことなら何でもご相談ください。",
  ],
} as const;

/**
 * 公開ページ用画像のマッピング。
 * src/components/public 以下と各ページから参照する。
 */
export const SITE_IMAGES = {
  hero: "/images/site/id96914b0d2b046fb.jpg",
  ogImage: "/images/site/id96914b0d2b046fb.jpg",
  navLogo: "/images/site/i7ddaf449ec91b1a8.jpg",
  instagram: "/images/site/i9b826c936d26b007.png",
  banner1: "/images/site/ic72ba2c45e561404.png",
  banner2: "/images/site/i258ec5d2808ff8af.jpg",
  gallery: [
    "/images/site/ibbb2ea03018fceb8.jpg",
    "/images/site/i34c22cd8a88bcba2.jpg",
    "/images/site/i9427e0d8ccd692f3.jpg",
    "/images/site/i2e9289105a1aaa97.jpg",
    "/images/site/ic290bcb33e790862.jpg",
  ],
  kodawari: "/images/site/i33731f87da18ea43.jpg",
  menuImage: "/images/site/i568546dac8ece8d3.jpg",
  menuBanner: "/images/site/iebfa823c611ed4fa.png",
  shaving: [
    "/images/site/idfb9a281db0b7f5a.jpg",
    "/images/site/i3185013912e90ac5.jpg",
    "/images/site/i80fa6f49db346f01.jpg",
    "/images/site/i82002e9ca8d776cd.jpg",
  ],
  courses: [
    "/images/site/i23ee0c37d140845f.jpg",
    "/images/site/i44ae15c2dc5da0a3.jpg",
    "/images/site/i9e5b19df3ba53582.jpg",
    "/images/site/i99598aeaa084562e.jpg",
    "/images/site/ia1131cf1a93411df.jpg",
    "/images/site/i3ec519511a650a39.jpg",
  ],
  owner: "/images/site/i91e4b5713e0b0740.jpg",
  access: {
    map: "/images/site/ic710076c392fdce1.png",
    parking1: "/images/site/i730bb419b68a67af.jpg",
    parking2: "/images/site/iecab8b4f6d1cf254.jpg",
  },
  shampoo: "/images/site/ifb6aea6ab778fae6.jpg",
} as const;
