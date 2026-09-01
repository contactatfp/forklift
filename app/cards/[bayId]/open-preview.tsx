"use client";

import { useState } from "react";

export function OpenPreview({ bayId, url }: { bayId: string; url: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const key = sessionStorage.getItem("forklift-key") ?? "";
      await fetch(`/api/bays/${bayId}/preview`, {
        method: "POST",
        headers: key ? { "x-forklift-key": key } : {},
      });
    } catch {
      /* still try the stored url */
    } finally {
      setBusy(false);
      window.open(url, "_blank", "noreferrer");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="bg-[#e3a008] px-4 py-2 text-[11px] tracking-widest text-[#121416]"
    >
      {busy ? "WAKING…" : "OPEN LIVE PREVIEW"}
    </button>
  );
}
