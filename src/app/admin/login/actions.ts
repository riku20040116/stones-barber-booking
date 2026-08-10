"use server";
/**
 * 管理画面ログイン関連の Server Actions。
 *  - signInAdmin: email/password でログイン → role 確認 → /admin へ
 *  - signOutAdmin: ログアウト → /admin/login へ
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(6, "パスワードは6文字以上で入力してください"),
});

export type SignInResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signInAdmin(
  _prev: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    console.error(
      "[admin login] signIn failed:",
      "email=",
      parsed.data.email,
      "code=",
      (error as { code?: string } | null)?.code,
      "status=",
      (error as { status?: number } | null)?.status,
      "message=",
      error?.message,
    );
    // よくある原因を判別して具体的なメッセージにする
    const code = (error as { code?: string } | null)?.code ?? "";
    const msg = error?.message ?? "";
    if (
      code === "email_not_confirmed" ||
      msg.toLowerCase().includes("email not confirmed")
    ) {
      return {
        ok: false,
        error:
          "メール確認が完了していません。Supabase ダッシュボードで該当ユーザーの "
          + "Email Confirmed を ON にするか、確認メールのリンクを開いてください。",
      };
    }
    if (code === "invalid_credentials") {
      return {
        ok: false,
        error:
          "メールアドレスまたはパスワードが正しくありません。"
          + "（ユーザーが Supabase Authentication に未登録の可能性もあります）",
      };
    }
    return {
      ok: false,
      error: `ログインに失敗しました${msg ? `（${msg}）` : ""}`,
    };
  }
  // 管理者ロール確認
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "このアカウントは管理画面の利用権限がありません",
    };
  }
  redirect("/admin");
}

export async function signOutAdmin() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
