<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- UI reads financial data only through `FinancialDataAdapter`, `BudgetPlanAdapter` and `SimulationAdapter` (selected in `src/services/config.ts`); why: authoritative backend services must swap in without touching components.
- Keep synthetic approved budgets in temporary adapter memory and invalidate budget/baseline queries after explicit approval; why: both screens must use the same plan without persistence or automatic reallocation.
- Return budget, savings, liquidity and explanation findings together from the simulation adapter; why: all comparison views must agree and missing monthly plans must remain unknown.
- All money is integer cents and all dates are `YYYY-MM-DD` strings; why: avoids float drift and timezone shifts.
- Never persist financial data in browser storage or URLs; why: Stage 1 security requirement (see SECURITY_HANDOFF.md).
- Keep the focused content pages on TanStack Router and the current-situation URL at /dashboard; why: simpler navigation preserves existing links and framework compatibility.
- Agent, history, alerts and messaging data flow through typed adapters in `src/services` with all proposed backend paths centralized in `src/services/endpoints.ts`; why: teammate endpoints are proposed, not confirmed, and must swap in one place without silent fallback.
- Share only the last submitted hypothetical request through an in-memory React context; recompute Cash Flow through SimulationAdapter against the approved plan; why: cross-page results remain current without financial storage or URL values.
