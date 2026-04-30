"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

interface Props {
  sejourId: string;
  token: string;
}

export function ShareLink({ sejourId, token }: Props) {
  const [copied, setCopied] = useState(false);

  function buildAbsoluteUrl(): string {
    if (typeof window === "undefined") {
      return `/sejour/${sejourId}?t=${token}`;
    }
    return `${window.location.origin}/sejour/${sejourId}?t=${token}`;
  }

  async function handleCopy() {
    const url = buildAbsoluteUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  const displayUrl = buildAbsoluteUrl();

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <code className="flex-1 truncate text-sm font-mono text-muted-foreground">
        {displayUrl}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="shrink-0"
      >
        {copied ? (
          <>
            <Check className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Copié</span>
          </>
        ) : (
          <>
            <Copy className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Copier</span>
          </>
        )}
      </Button>
    </div>
  );
}
