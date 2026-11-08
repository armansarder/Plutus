import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/formatMoney";
import { cn } from "@/lib/utils";
import type { YearHistory } from "@/types/history";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (month: string) => MONTH_LABELS[Number(month.slice(5)) - 1] ?? month;

/** Comparison sentence for the selected month — only claims the data supports. */
function compareSummary(history: YearHistory, index: number): string | null {
  const current = history.months[index];
  const previous = history.months[index - 1];
  if (!current || !previous) return null;
  const savedPart = current.savingsCents > previous.savingsCents ? `You saved more in ${monthLabel(current.month)} than ${monthLabel(previous.month)}`
    : current.savingsCents < previous.savingsCents ? `You saved less in ${monthLabel(current.month)} than ${monthLabel(previous.month)}` : null;
  const spentPart = current.spendingCents < previous.spendingCents ? `spent ${formatMoney(previous.spendingCents - current.spendingCents, { whole: true })} less`
    : current.spendingCents > previous.spendingCents ? `spent ${formatMoney(current.spendingCents - previous.spendingCents, { whole: true })} more` : null;
  if (savedPart && spentPart) return `${savedPart} and ${spentPart}.`;
  if (savedPart) return `${savedPart}.`;
  if (spentPart) return `You ${spentPart} in ${monthLabel(current.month)} than ${monthLabel(previous.month)}.`;
  return null;
}

export function YearSoFar({ history }: { history: YearHistory }) {
  const [selected, setSelected] = useState(history.months.length - 1);
  const month = history.months[selected];
  const data = useMemo(
    () => history.months.map((m) => ({ month: monthLabel(m.month), Income: m.incomeCents / 100, Spending: m.spendingCents / 100, Savings: m.savingsCents / 100 })),
    [history],
  );

  if (!month) return <p className="text-sm text-muted-foreground">No history is available for this year yet.</p>;
  const summary = compareSummary(history, selected);

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        Past activity · Simulated history — demo data, not bank records.
      </p>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => formatMoney(Number(v) * 100, { whole: true })} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              cursor={{ fill: "var(--color-secondary)" }}
              content={({ active, label, payload }) => active && payload?.length ? (
                <div className="panel min-w-44 px-3 py-2 text-xs">
                  <div className="mb-1 font-semibold text-foreground">{label}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="flex justify-between gap-4">
                      <span style={{ color: p.color }}>{p.dataKey}</span>
                      <span className="font-mono tabular text-foreground">{formatMoney(Number(p.value) * 100, { whole: true })}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            />
            <Bar dataKey="Income" fill="var(--color-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Spending" fill="var(--color-scenario-baseline)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Savings" fill="var(--color-accent-foreground)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Choose a month">
        {history.months.map((m, i) => (
          <button key={m.month} role="tab" aria-selected={i === selected} onClick={() => setSelected(i)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              i === selected ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground")}>
            {monthLabel(m.month)}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><p className="text-xs text-muted-foreground">Income</p><p className="mt-2 font-mono text-xl tabular text-foreground">{formatMoney(month.incomeCents, { whole: true })}</p></div>
        <div className="panel p-5"><p className="text-xs text-muted-foreground">Spending</p><p className="mt-2 font-mono text-xl tabular text-foreground">{formatMoney(month.spendingCents, { whole: true })}</p></div>
        <div className="panel p-5"><p className="text-xs text-muted-foreground">Saved</p><p className="mt-2 font-mono text-xl tabular text-accent-foreground">{formatMoney(month.savingsCents, { whole: true })}</p></div>
      </div>

      {summary && <p className="mt-4 text-sm text-foreground">{summary}</p>}
      {month.milestone && (
        <p className="mt-3 flex items-center gap-2 text-sm text-accent-foreground">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {month.milestone}
        </p>
      )}

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-primary">Spending by category in {monthLabel(month.month)}</summary>
        <ul className="mt-3 space-y-2">
          {month.byCategory.map((c) => (
            <li key={c.categoryId} data-category={c.categoryId} className="flex items-center gap-2 text-sm">
              <span className="category-dot" aria-hidden />
              <span className="flex-1 capitalize text-muted-foreground">{c.categoryId}</span>
              <span className="font-mono tabular text-foreground">{formatMoney(c.spentCents, { whole: true })}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
