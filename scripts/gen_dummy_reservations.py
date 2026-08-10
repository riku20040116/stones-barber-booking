"""STONE'S BARBER ダミー予約データ生成。

ルール:
  - 営業時間: 平日 9:30-19:30 / 土日祝 9:00-19:00
  - 月曜定休（第3火曜も定休だが今回の対象週には無い）
  - 開始時刻は 15 分刻み
  - 同日内で重複しない（施術後 15 分のバッファも確保）
  - 昼の時間帯に 60 分以上の空きを残す
出力: Supabase SQL Editor に貼れる SQL
"""
import random
from datetime import datetime, timedelta

random.seed(20260706)  # 再現性のため固定

# --- メニュー（seed.sql と一致させる） -------------------------------------
MENUS = [
    # (slug, name, price, duration)
    ("cut-adult-shave", "カット・シャンプー・顔剃り（大人）", 4500, 50),
    ("cut-adult", "カット・シャンプー（大人）", 3500, 35),
    ("cut-high-school", "カット・シャンプー（高校生）", 3200, 30),
    ("cut-junior-high", "カット・シャンプー（中学生）", 2900, 30),
    ("cut-child", "カット・シャンプー（0歳〜小学生）", 2600, 25),
    ("course-headspa", "ヘッドスパコース", 5500, 80),
    ("course-facespa", "フェイススパコース", 5500, 80),
    ("course-king", "キングコース", 6500, 110),
    ("color-standard", "カラー", 7000, 90),
    ("perm-standard", "パーマ", 8500, 100),
]
# 出やすさの重み（カット系を多めに）
WEIGHTS = [22, 20, 10, 8, 8, 9, 7, 4, 7, 5]

OPTIONS = [
    ("opt-face-shave", "お顔剃り", 1000, 15),
    ("opt-scalp-spa", "頭皮スパ", 700, 20),
    ("opt-ear-wash", "耳洗い", 400, 15),
    ("opt-nose-wax", "鼻脱毛", 400, 10),
]

SEI = ["田中", "佐藤", "鈴木", "高橋", "渡辺", "伊藤", "山本", "中村", "小林", "加藤",
       "吉田", "山田", "松本", "井上", "木村", "林", "清水", "山口", "森", "池田"]
MEI = ["健太", "翔", "大輔", "拓也", "颯太", "陸", "亮", "誠", "直樹", "悠斗",
       "和也", "隼人", "涼", "優作", "圭", "翼", "海斗", "駿", "蓮", "湊"]

# --- 対象週（月曜定休はスキップ） ------------------------------------------
#   2026-08-10(月) は定休、2026-08-17(月) も定休なのでこの 6 日が 1 週間分。
#   ※ 08-11 は第2火曜なので「第3火曜の連休」には当たらない（＝営業日）。
#   ※ 08-11 は山の日。calendar.ts は祝日を判定せず平日扱い（9:30-19:30）だが、
#      holiday_overrides で「土日祝 9:00-19:00」を登録される可能性もあるため、
#      どちらでも営業時間内に収まる 9:30-19:00 を使う。
DAYS = [
    ("2026-08-11", "火", "09:30", "19:00"),
    ("2026-08-12", "水", "09:30", "19:30"),
    ("2026-08-13", "木", "09:30", "19:30"),
    ("2026-08-14", "金", "09:30", "19:30"),
    ("2026-08-15", "土", "09:00", "19:00"),
    ("2026-08-16", "日", "09:00", "19:00"),
]
PER_DAY = 8
GAP_MIN = 15          # 施術間バッファ

# 既に入っている実データ。ここは避ける（該当が無ければ空でよい）。
# 取りこぼしても各 INSERT の not exists ガードで衝突は防がれる。
PREOCCUPIED = {}
LUNCH_FROM, LUNCH_TO = 11 * 60, 15 * 60   # 昼休みを確保する帯
LUNCH_NEED = 60       # 帯の中に残す連続空き（分）


def to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def to_hhmm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def largest_free_in_lunch(blocks):
    """[ (start,end) ] を踏まえ、昼帯に残る最大連続空きを返す"""
    cur, best = LUNCH_FROM, 0
    for s, e in sorted(blocks):
        s2, e2 = max(s, LUNCH_FROM), min(e, LUNCH_TO)
        if e2 <= LUNCH_FROM or s2 >= LUNCH_TO:
            continue
        if s2 > cur:
            best = max(best, s2 - cur)
        cur = max(cur, e2)
    if cur < LUNCH_TO:
        best = max(best, LUNCH_TO - cur)
    return best


def draw_booking():
    """1件分のメニュー構成を抽選する。"""
    mi = random.choices(range(len(MENUS)), weights=WEIGHTS, k=1)[0]
    slug, name, price, dur = MENUS[mi]
    opts = []
    if random.random() < 0.35:
        opts = random.sample(OPTIONS, k=random.choice([1, 1, 2]))
    first_time = random.random() < 0.25
    total_dur = dur + sum(o[3] for o in opts) + (15 if first_time else 0)
    return {
        "menu": [(slug, name, price, dur)] + list(opts),
        "price": price + sum(o[2] for o in opts),
        "dur": total_dur,
        "first_time": first_time,
    }


def build_day(date, dow, open_s, close_s):
    """開店から順に詰めていく方式。必ず PER_DAY 件を営業時間内に収める。"""
    open_m, close_m = to_min(open_s), to_min(close_s)

    def align(m):
        """開店時刻を基準にした 15 分グリッドへ切り上げ"""
        return ((m - open_m + 14) // 15) * 15 + open_m

    for _ in range(600):
        bookings = [draw_booking() for _ in range(PER_DAY)]
        # 昼休み: 12:00〜13:00 のどこかから 60〜75 分
        lunch_start = random.choice([12 * 60, 12 * 60 + 15, 12 * 60 + 30, 13 * 60])
        lunch_len = random.choice([60, 60, 75])
        blocked = [(lunch_start, lunch_start + lunch_len)]
        # 実データの枠は前後に GAP_MIN のバッファを付けて封鎖
        blocked += [(to_min(a) - GAP_MIN, to_min(b) + GAP_MIN)
                    for a, b in PREOCCUPIED.get(date, [])]
        blocked.sort()

        need = sum(b["dur"] for b in bookings) + GAP_MIN * (PER_DAY - 1)
        need += sum(e - s for s, e in blocked)
        slack = (close_m - open_m) - need
        if slack < 0:
            continue  # メニューが重すぎた。引き直す。

        placed = []
        cursor = open_m
        ok = True
        for b in bookings:
            # 封鎖区間（昼休み・実データ）を避けられる位置まで送る
            for _ in range(10):
                hit = next((be for bs, be in blocked
                            if cursor < be and cursor + b["dur"] > bs), None)
                if hit is None:
                    break
                cursor = align(hit)
            start = cursor
            end = start + b["dur"]
            if end > close_m:
                ok = False
                break
            b["start"], b["end"] = start, end
            placed.append(b)
            cursor = align(end + GAP_MIN)
            # 余っている時間を少しずつ配って自然なばらつきを出す
            if slack >= 15 and random.random() < 0.5:
                extra = min(slack, random.choice([15, 15, 30]))
                cursor = align(cursor + extra)
                slack -= extra
        if ok and len(placed) == PER_DAY:
            return placed
    return None


rows = []
for date, dow, open_s, close_s in DAYS:
    placed = build_day(date, dow, open_s, close_s)
    if placed is None:
        print(f"-- WARN {date}: 配置に失敗しました")
        continue
    for b in placed:
        rows.append({
            "date": date, "dow": dow,
            "start": to_hhmm(b["start"]), "end": to_hhmm(b["end"]),
            "menu": b["menu"],
            "price": b["price"],
            "name": f"{random.choice(SEI)} {random.choice(MEI)}",
            "first_time": b["first_time"],
            "source": random.choices(["web", "phone"], weights=[7, 3], k=1)[0],
        })

# 日付・時刻順に整列
rows.sort(key=lambda r: (r["date"], r["start"]))

# --- SQL 出力 ---------------------------------------------------------------
out = []
out.append("-- ============================================================================")
out.append("-- STONE'S BARBER ダミー予約データ（動作確認用）")
out.append(f"-- 生成日時: {datetime.now():%Y-%m-%d %H:%M}")
out.append(f"-- 対象: {DAYS[0][0]}({DAYS[0][1]}) 〜 {DAYS[-1][0]}({DAYS[-1][1]}) の "
           f"{len(DAYS)} 営業日 × {PER_DAY} 名 = {len(rows)} 件")
out.append("--   ※ 2026-08-10(月) / 2026-08-17(月) は定休のため除外")
out.append("--   ※ 2026-08-11(火) は第2火曜なので営業日（第3火曜の連休には該当せず）")
out.append("-- 特徴: メールが @dummy.example なので、あとで一括削除できます")
out.append("-- ============================================================================")
out.append("")
out.append("-- 既存のダミーを消してから入れ直す（再実行しても重複しない）")
out.append("delete from public.reservation_items where reservation_id in (")
out.append("  select id from public.reservations where customer_email like '%@dummy.example'")
out.append(");")
out.append("delete from public.reservations where customer_email like '%@dummy.example';")
out.append("")

for i, r in enumerate(rows, 1):
    st = f"'{r['date']}T{r['start']}:00+09:00'::timestamptz"
    en = f"'{r['date']}T{r['end']}:00+09:00'::timestamptz"
    email = f"dummy{i:02d}@dummy.example"
    phone = f"090-{random.randint(1000,9999)}-{random.randint(1000,9999)}"
    nm = r["name"].replace("'", "''")
    note = f"【ダミーデータ】{r['dow']}曜 {r['start']}-{r['end']}"
    if r["first_time"]:
        note += " / 初回+15分"
    items = " ".join(f"{m[1]}" for m in r["menu"])
    note += f" / {items}"

    out.append(f"-- {i:02d}. {r['date']}({r['dow']}) {r['start']}-{r['end']}  {r['name']} 様  {r['price']:,}円")
    out.append("with ins as (")
    out.append("  insert into public.reservations (")
    out.append("    customer_id, start_at, end_at, customer_name, customer_email, customer_phone,")
    out.append("    total_price, payment_method, payment_status, stripe_payment_intent,")
    out.append("    status, source, notes")
    out.append("  )")
    out.append(f"  select null, {st}, {en}, '{nm}', '{email}', '{phone}',")
    out.append(f"         {r['price']}, 'in_store', 'unpaid', null, 'confirmed', '{r['source']}', '{note}'")
    out.append("  where not exists (")
    out.append("    select 1 from public.reservations x")
    out.append("    where x.status in ('pending','confirmed')")
    out.append(f"      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange({st}, {en}, '[)')")
    out.append("  )")
    out.append("  returning id")
    out.append(")")
    parts = []
    for order, (slug, name, price, dur) in enumerate(r["menu"], 1):
        parts.append(
            f"  select ins.id, m.id, m.name, m.price, m.duration_min, {order} "
            f"from ins cross join public.menus m where m.slug = '{slug}'"
        )
    out.append("insert into public.reservation_items")
    out.append("  (reservation_id, menu_id, name_snapshot, price_snapshot, duration_snapshot, sort_order)")
    out.append("\n  union all\n".join(parts) + ";")
    out.append("")

out.append("-- ----------------------------------------------------------------------------")
out.append("-- 確認用: 入ったダミーの一覧")
out.append("-- ----------------------------------------------------------------------------")
out.append("select start_at at time zone 'Asia/Tokyo' as jst_start,")
out.append("       end_at   at time zone 'Asia/Tokyo' as jst_end,")
out.append("       code, customer_name, total_price, status, source")
out.append("from public.reservations")
out.append("where customer_email like '%@dummy.example'")
out.append("order by start_at;")
out.append("")
out.append("-- ----------------------------------------------------------------------------")
out.append("-- 【ダミーを全部消したいとき】下の 2 行だけを実行してください")
out.append("-- ----------------------------------------------------------------------------")
out.append("-- delete from public.reservation_items where reservation_id in (")
out.append("--   select id from public.reservations where customer_email like '%@dummy.example');")
out.append("-- delete from public.reservations where customer_email like '%@dummy.example';")
out.append("")

path = r"C:\dev\stones-barber\supabase\seed-dummy-reservations.sql"
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(out))

# --- 検証 -------------------------------------------------------------------
print(f"生成: {len(rows)} 件 -> {path}")
by_day = {}
for r in rows:
    by_day.setdefault(r["date"], []).append(r)
ok = True
for d, rs in sorted(by_day.items()):
    rs.sort(key=lambda x: x["start"])
    print(f"  {d}: {len(rs)}件  " + ", ".join(f"{x['start']}-{x['end']}" for x in rs))
    blocks = [(to_min(x["start"]), to_min(x["end"])) for x in rs]
    blocks += [(to_min(a), to_min(b)) for a, b in PREOCCUPIED.get(d, [])]
    blocks.sort()
    for (as_, ae), (bs, be) in zip(blocks, blocks[1:]):
        if ae > bs:
            print(f"    !! 重複: {to_hhmm(as_)}-{to_hhmm(ae)} と {to_hhmm(bs)}-{to_hhmm(be)}")
            ok = False
    # 営業時間・グリッド・所要時間の整合
    _, _, o, c = next(x for x in DAYS if x[0] == d)
    for x in rs:
        if to_min(x["start"]) < to_min(o) or to_min(x["end"]) > to_min(c):
            print(f"    !! 営業時間外: {x['start']}-{x['end']} (営業 {o}-{c})")
            ok = False
        if to_min(x["start"]) % 15 != 0:
            print(f"    !! 15分刻みでない: {x['start']}")
            ok = False
        menu_dur = sum(m[3] for m in x["menu"])
        actual = to_min(x["end"]) - to_min(x["start"])
        if not (menu_dur <= actual <= menu_dur + 60):
            print(f"    !! 所要時間が不整合: 実{actual}分 vs メニュー{menu_dur}分")
            ok = False
    free = largest_free_in_lunch(blocks)
    if free < LUNCH_NEED:
        print(f"    !! 昼休みが確保できていない: 最大空き {free}分")
        ok = False
    else:
        print(f"       昼帯(11:00-15:00)の最大連続空き: {free}分")
print("検証:", "OK 営業時間内・重複なし・15分刻み・昼休み確保" if ok else "NG 問題あり")
