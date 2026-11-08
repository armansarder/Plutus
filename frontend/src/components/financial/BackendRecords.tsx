import type { SituationSnapshot } from "@/services/situation";
import { formatMoney } from "@/lib/formatMoney";
import { formatDateOnly } from "@/lib/dateOnly";

export function BackendSource({ snapshot }: { snapshot: SituationSnapshot }) {
  return <p className="mb-6 rounded-md bg-caution-soft p-3 text-sm">Backend data · {snapshot.backend?.synthetic ? "Synthetic demo dataset" : "Configured backend dataset"} · {snapshot.backend?.basis} snapshot · {formatDateOnly(snapshot.startDate)}. {snapshot.cashFlows.length === 0 ? "No upcoming transactions supplied." : snapshot.cashFlows.some(t => t.provenance === "assumed") ? "Includes estimated upcoming transactions." : "Upcoming transactions are marked confirmed by the source."} Schedule completeness is not verified.</p>;
}

export function BackendTransactions({ snapshot }: { snapshot: SituationSnapshot }) {
  return <section className="mt-9 border-y border-border py-8"><h2 className="font-display text-2xl font-semibold">Upcoming transactions</h2>{snapshot.cashFlows.length ? <ul className="mt-4 space-y-3">{[...snapshot.cashFlows].sort((a, b) => a.date.localeCompare(b.date)).map(t => <li key={t.id} className="flex flex-wrap justify-between gap-2"><span>{t.label} · {formatDateOnly(t.date)} · {t.provenance === "assumed" ? "Estimated" : "Confirmed"}</span><span>{formatMoney(t.amountCents)}</span></li>)}</ul> : <p>No upcoming transactions supplied.</p>}{snapshot.backend?.notes.map((note, i) => <p key={i} className="mt-3 text-sm text-muted-foreground">{note}</p>)}</section>;
}
