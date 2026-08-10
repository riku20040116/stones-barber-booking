"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInAdmin, type SignInResult } from "./actions";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [state, formAction, pending] = useActionState<
    SignInResult | null,
    FormData
  >(signInAdmin, null);

  const errorMsg = state && !state.ok ? state.error : initialError;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="email" className="text-zinc-200">
          メールアドレス
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="bg-zinc-950 text-zinc-100"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password" className="text-zinc-200">
          パスワード
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="bg-zinc-950 text-zinc-100"
        />
      </div>
      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" />
            ログイン中...
          </>
        ) : (
          "ログイン"
        )}
      </Button>
      <div className="pt-2 text-center text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-300">
          ← サイトトップへ戻る
        </Link>
      </div>
    </form>
  );
}
