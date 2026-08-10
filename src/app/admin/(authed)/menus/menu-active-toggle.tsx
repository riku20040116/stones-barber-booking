"use client";
import * as React from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleMenuActive } from "./actions";

export function MenuActiveToggle({
  menuId,
  initialActive,
}: {
  menuId: string;
  initialActive: boolean;
}) {
  const [active, setActive] = React.useState(initialActive);
  const [pending, startTransition] = React.useTransition();

  function handleChange(next: boolean) {
    const prev = active;
    setActive(next);
    startTransition(async () => {
      const res = await toggleMenuActive({ id: menuId, isActive: next });
      if (!res.ok) {
        setActive(prev);
        toast.error(res.error);
      } else {
        toast.success(next ? "公開しました" : "非公開にしました");
      }
    });
  }

  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-600">
      <span>{active ? "公開" : "非公開"}</span>
      <Switch
        size="sm"
        checked={active}
        onCheckedChange={handleChange}
        disabled={pending}
      />
    </label>
  );
}
