/**
 * 管理者アカウントを作成（または既存アカウントのパスワードを更新）して
 * profiles.role を 'admin' に昇格するスクリプト。
 *
 * Supabase ダッシュボードでの手作業（Authentication → Add user）が不要になる。
 *
 * 使い方:
 *   1) .env.local に SUPABASE_SERVICE_ROLE_KEY と NEXT_PUBLIC_SUPABASE_URL が入っていること
 *   2) node scripts/create-admin.mjs
 *      （メール・パスワードを変えたい場合）
 *      node scripts/create-admin.mjs someone@example.com 'PASSWORD'
 *
 * 注意: service_role キーを使うので、必ずローカルからのみ実行すること。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

/** .env.local を読んで process.env に反映する（dotenv 非依存の簡易版） */
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(projectRoot, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 前後のクォートを剥がす
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const DEFAULT_EMAIL = "inotokoya1119@yahoo.co.jp";
const DEFAULT_PASSWORD = "Shinichirou1119@";

const email = (process.argv[2] ?? DEFAULT_EMAIL).toLowerCase();
const password = process.argv[3] ?? DEFAULT_PASSWORD;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** 全ページを走査して該当メールの既存ユーザーを探す */
async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existing = await findUserByEmail(email);

let userId;
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("パスワード更新に失敗:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`既存ユーザーのパスワードを更新しました: ${email}`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 確認メールなしで即ログイン可能にする
  });
  if (error) {
    console.error("ユーザー作成に失敗:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`ユーザーを作成しました: ${email}`);
}

// handle_new_user() トリガが profiles を作るが、念のため upsert してから admin に昇格。
const { error: upsertError } = await supabase.from("profiles").upsert(
  { id: userId, email, role: "admin" },
  { onConflict: "id" },
);
if (upsertError) {
  console.error("profiles の更新に失敗:", upsertError.message);
  process.exit(1);
}

const { data: profile, error: readError } = await supabase
  .from("profiles")
  .select("id, email, role")
  .eq("id", userId)
  .single();
if (readError) {
  console.error("profiles の確認に失敗:", readError.message);
  process.exit(1);
}

console.log("完了:", profile);
console.log("\n/admin からこのメールアドレスとパスワードでログインできます。");
