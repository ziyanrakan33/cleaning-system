import { PrintButton } from "./print-button";
import type { ReportColumn } from "@/server/reports/export";

/**
 * Shared print/PDF shell for every generated report — one table, RTL, with the
 * title/subtitle/summary line the individual report pages provide. Keeping
 * this in one place is what makes 15 report pages tractable: each page.tsx is
 * just a data fetch plus this component, not its own table markup.
 */
export function ReportPrintLayout({
  title,
  subtitle,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  emptyMessage?: string;
}) {
  return (
    <div className="mx-auto max-w-6xl p-8 print:p-0">
      <PrintButton />
      <h1 className="mb-1 text-xl font-bold">{title}</h1>
      {subtitle && <p className="mb-6 text-sm text-muted">{subtitle}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage ?? "אין נתונים להצגה"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                {columns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap p-2 text-start">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-panel-border">
                  {columns.map((c) => (
                    <td key={c.key} className="whitespace-nowrap p-2">
                      {row[c.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
