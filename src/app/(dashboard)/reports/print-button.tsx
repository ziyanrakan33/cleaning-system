"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print mb-4 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground"
    >
      הדפסה / שמירה כ-PDF
    </button>
  );
}
