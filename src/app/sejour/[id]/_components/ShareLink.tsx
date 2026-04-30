"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  url: string;
}

export function ShareLink({ url }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié dans le presse-papier");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-muted p-3 break-all font-mono text-sm">
        {url}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handleCopy}
        className="w-full sm:w-auto"
      >
        {copied ? "Copié" : "Copier le lien"}
      </Button>
    </div>
  );
}
