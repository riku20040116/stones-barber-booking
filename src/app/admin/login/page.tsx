import { redirect } from "next/navigation";
import { getOptionalAdmin } from "@/lib/auth/admin";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "管理画面ログイン",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string }>;

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const admin = await getOptionalAdmin();
  if (admin) {
    redirect("/admin");
  }
  const params = await searchParams;
  const initialError =
    params.error === "forbidden"
      ? "管理画面の利用権限がありません。管理者アカウントでログインしてください。"
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-zinc-500">
            STONE&apos;S BARBER Admin
          </p>
          <h1 className="mt-3 font-heading text-2xl font-bold tracking-tight">
            管理画面ログイン
          </h1>
        </div>
        <LoginForm initialError={initialError} />
      </div>
    </main>
  );
}
