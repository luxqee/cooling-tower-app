"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await fetch(`/api/compliance/templates/${id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 underline underline-offset-2 disabled:opacity-40"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
