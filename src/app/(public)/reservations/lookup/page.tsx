import { LookupFlow } from "./lookup-flow";

export const metadata = {
  title: "予約確認・キャンセル",
  description: "予約番号とメールアドレスで予約をご確認いただけます。",
};

export default function LookupPage() {
  return (
    <section className="container mx-auto max-w-2xl px-4 py-12 md:py-20">
      <p className="text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
        Lookup
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight md:text-4xl">
        予約確認・キャンセル
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        予約完了時にお送りした<strong className="font-semibold">予約番号</strong>と、
        ご登録の<strong className="font-semibold">メールアドレス</strong>でお調べいただけます。
      </p>
      <div className="mt-10">
        <LookupFlow />
      </div>
    </section>
  );
}
