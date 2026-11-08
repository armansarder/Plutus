// Copy into Raiyan's frontend API layer. Money stays a string until chart rendering.
export type ScenarioName = 'baseline' | 'purchase' | 'delayed_income' | 'unexpected_expense' | 'buy_later';
export interface AgentRequest {
  purchase_amount: string;
  purchase_date?: string;
  reserve?: string;
  horizon_days?: number;
  message?: string;
  allow_model?: boolean;
  channel?: 'web' | 'photon';
}
export interface Forecast {
  customer_id: string; currency: string; start_date: string; end_date: string;
  starting_balance: string; ending_balance: string; minimum_balance: string;
  minimum_balance_date: string; shortfall_occurs: boolean;
  daily_balances: {date: string; ending_balance: string}[];
  transaction_timeline: {id: string; date: string; description: string; amount: string;
    type: 'income' | 'expense'; source_status: 'confirmed' | 'estimated'; balance: string}[];
  negative_balance_days: string[]; minimum_daily_ending_balance: string;
  minimum_daily_ending_balance_date: string;
  assumptions: {snapshot: string; same_day_order: string; coverage: string;
    estimated_transaction_ids: string[]; missing_information: string[];
    currency_precision: string; source_notes: string[]};
}
export interface AgentResponse {
  schema_version: '1.0'; request_id: string;
  mode: 'nemotron' | 'deterministic_fallback'; model: string | null;
  fallback_reason: 'model_disabled' | 'model_unavailable' | 'model_protocol_failed' | null;
  summary: string; risk_level: 'high' | 'medium' | 'low';
  scenarios: {name: ScenarioName; purchase_date: string | null;
    applicable: boolean; maintains_reserve: boolean; forecast: Forecast}[];
  safe_purchase_dates: string[]; safe_to_spend_on_purchase_date: string;
  stress_tests_passed: number; stress_tests_total: number;
  provenance: {source: string; snapshot_as_of: string; snapshot_id: string;
    generated_at: string; currency: string; synthetic: boolean; schedule_complete: boolean};
  passport: {id: string; purchase_amount: string; reserve: string; horizon_end: string;
    recommendation: 'consider_purchase' | 'consider_waiting' | 'reserve_at_risk';
    evidence_scenarios: ScenarioName[]; assumptions: string[]; payment_executed: false};
  trust_shield: {permissions: string[]; payment_execution: false; external_message_sent: false;
    model_data_shared: boolean; untrusted_text_excluded: true; security_scope: string};
  tool_trace: {tool: 'simulate_scenario' | 'decision'; scenario: ScenarioName | null;
    status: 'completed' | 'rejected' | 'fallback'; initiated_by: 'nemotron' | 'server'}[];
  photon: {text: string; simulated: true; delivery_status: 'draft_only'; requires_authenticated_delivery: true};
}

// Preferred: invoke from your application server/proxy, keeping the service token
// server-side. Direct browser bearer access is suitable only for the isolated demo.
export async function runAgent(baseUrl: string, token: string, input: AgentRequest,
  signal?: AbortSignal): Promise<AgentResponse> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/agent/run`, {
    method: 'POST', cache: 'no-store', signal,
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Plutus request failed (${response.status})`);
  return await response.json() as AgentResponse;
}
