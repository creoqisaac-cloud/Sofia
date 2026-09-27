"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "./ui";

export function SystemBadge() {
  const [info, setInfo] = useState<{ provider: string; model: string | null; db: string } | null>(null);
  useEffect(() => {
    api<{ provider: string; model: string | null; db: string }>("/api/system").then(setInfo).catch(() => setInfo(null));
  }, []);
  if (!info) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge tone={info.provider === "anthropic" ? "green" : "violet"} title={info.model ?? undefined}>
        {info.provider === "anthropic" ? `Claude · ${info.model}` : "Motor demo (sin LLM)"}
      </Badge>
      <Badge tone="gray">{info.db === "pglite" ? "PGlite local" : "PostgreSQL"}</Badge>
    </div>
  );
}
