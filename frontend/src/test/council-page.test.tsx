import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/config", () => ({DATA_MODE: "remote", API_BASE_URL: ""}));
vi.mock("@/services/council", () => ({assertCouncilSnapshot: vi.fn(), councilAdapter: {status: vi.fn(), create: vi.fn(), read: vi.fn(), send: vi.fn(), clear: vi.fn(), cancel: vi.fn()}}));
import { councilAdapter } from "@/services/council";
import { CouncilAnswer, CouncilWorkspace } from "@/components/chat/CouncilWorkspace";
import { financialPayload } from "./fixtures/engineResponses";
import fixture from "./fixtures/council.json";
import { councilRunSchema, type CouncilConversation } from "@/types/council";
import { ApiError } from "@/services/apiClient";
let client: QueryClient;
const empty = (role: CouncilConversation["role"]): CouncilConversation => ({id: role === "council" ? fixture.conversation_id : "b".repeat(32), role, messages: [], busy: false, temporary: true});
const view = (): CouncilConversation => ({...empty("council"), messages: [{request_key: "test_123", message: "Test purchase", result: councilRunSchema.parse(fixture)}]});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {observe() {} unobserve() {} disconnect() {}});
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(financialPayload)));
  vi.mocked(councilAdapter.status).mockResolvedValue({enabled: true, roles: ["council", "budget", "risk", "simulator"], temporary: true, scope: "Local demo"});
  vi.mocked(councilAdapter.create).mockImplementation(async role => empty(role));
  vi.mocked(councilAdapter.read).mockResolvedValue(view());
  vi.mocked(councilAdapter.send).mockResolvedValue(councilRunSchema.parse(fixture));
  vi.mocked(councilAdapter.clear).mockResolvedValue({cleared: true});
  vi.mocked(councilAdapter.cancel).mockResolvedValue({cancel_requested: true});
});
afterEach(() => {cleanup(); client?.clear(); vi.unstubAllGlobals();});
function page() {client = new QueryClient({defaultOptions: {queries: {retry: false}}}); return render(<QueryClientProvider client={client}><CouncilWorkspace /></QueryClientProvider>);}
it("opens isolated specialist tabs without sharing the other chat's history", async () => {
  page(); await screen.findByText("Council Leader", {selector: "h2"});
  await waitFor(() => expect(councilAdapter.create).toHaveBeenCalledWith("council"));
  fireEvent.click(screen.getByRole("tab", {name: "Budget Agent"}));
  await waitFor(() => expect(councilAdapter.create).toHaveBeenCalledWith("budget"));
  expect(screen.queryByText("Test purchase")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Question for Budget Agent")).toBeInTheDocument();
});
it("submits confirmed fields and shows actual reviews, evidence charts and original engine results", async () => {
  page(); await waitFor(() => expect(councilAdapter.create).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Question for Council Leader"), {target: {value: "Can I buy a laptop?"}});
  fireEvent.click(screen.getByLabelText("Include a confirmed purchase comparison"));
  fireEvent.change(screen.getByLabelText("Purchase amount (USD)"), {target: {value: "400"}});
  fireEvent.change(screen.getByLabelText("Purchase date"), {target: {value: "2026-11-08"}});
  fireEvent.click(screen.getByRole("button", {name: "Send to Council Leader"}));
  expect(await screen.findByText("Live Nemotron council")).toBeInTheDocument();
  expect(screen.getByText("Projected balances and reserve")).toBeInTheDocument();
  expect(screen.getByText("Observed action log and limitations")).toBeInTheDocument();
  const [, body] = vi.mocked(councilAdapter.send).mock.calls[0]!;
  expect(body.analysis?.purchase_amount).toBe("400.00");
  expect(body.handoff).toBeUndefined();
});
it("preserves retry idempotency and offers honest error states", async () => {
  vi.mocked(councilAdapter.send).mockRejectedValue(new Error("offline"));
  page(); await waitFor(() => expect(councilAdapter.create).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Question for Council Leader"), {target: {value: "Explain reserves"}});
  fireEvent.click(screen.getByRole("button", {name: "Send to Council Leader"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed");
  const first = vi.mocked(councilAdapter.send).mock.calls[0]![1];
  fireEvent.click(screen.getByRole("button", {name: "Retry same request"}));
  await waitFor(() => expect(councilAdapter.send).toHaveBeenCalledTimes(2));
  expect(vi.mocked(councilAdapter.send).mock.calls[1]![1].request_key).toBe(first.request_key);
});
it("keeps disabled council explicit without substituting a debate", async () => {
  vi.mocked(councilAdapter.status).mockResolvedValue({enabled: false, roles: [], temporary: true, scope: "disabled"});
  page(); expect(await screen.findByText("Council is disabled")).toBeInTheDocument();
  expect(councilAdapter.create).not.toHaveBeenCalled();
});

it("turns a natural purchase question into confirmed fields before any agent call", async () => {
  page(); await waitFor(() => expect(councilAdapter.create).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Question for Council Leader"), {target:{value:"Should I buy a $500 laptop?"}});
  fireEvent.click(screen.getByRole("button", {name:"Send to Council Leader"}));
  expect(screen.getByLabelText("Purchase amount (USD)")).toHaveValue("500.00");
  expect(councilAdapter.send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Send to Council Leader"}));
  await waitFor(() => expect(councilAdapter.send).toHaveBeenCalledTimes(1));
  expect(vi.mocked(councilAdapter.send).mock.calls[0]![1].analysis?.purchase_amount).toBe("500.00");
});

it("offers a same-snapshot comparison for this-or-that questions without silently choosing", async () => {
  page(); await waitFor(() => expect(councilAdapter.create).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Question for Council Leader"), {target:{value:"Should I buy a $500 laptop or a $300 tablet?"}});
  fireEvent.click(screen.getByRole("button", {name:"Send to Council Leader"}));
  expect(screen.getByRole("region", {name:"Confirm purchase choices"})).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Confirm and compare choices"})).toBeInTheDocument();
  expect(councilAdapter.send).not.toHaveBeenCalled();
});

it("asks for the two prices in the reported cash/laptop/downpayment question", async () => {
  page(); await waitFor(() => expect(councilAdapter.create).toHaveBeenCalled());
  fireEvent.click(screen.getByLabelText("Include a confirmed purchase comparison"));
  fireEvent.change(screen.getByLabelText("Question for Council Leader"), {target:{value:"I have 2500$, should i buy a laptop, or a downpayment for car, or should i save my money for a better time?"}});
  fireEvent.click(screen.getByRole("button", {name:"Send to Council Leader"}));
  expect(screen.getByLabelText("Laptop price (USD)")).toHaveValue("");
  expect(screen.getByLabelText("Car down payment price (USD)")).toHaveValue("");
  expect(screen.queryByText("Clarification or unsupported calculation")).not.toBeInTheDocument();
  expect(councilAdapter.send).not.toHaveBeenCalled();
});

it("keeps clarification replies free of projection and action-log boilerplate", () => {
  const clarification = councilRunSchema.parse({...fixture,status:"needs_clarification",mode:"no_analysis",message:"What would each choice cost?",next_question:"Laptop price and car down payment?",reviews:[],events:[],analysis:null,chart:null,handoff_reference:null});
  render(<CouncilAnswer result={clarification}/>);
  expect(screen.getByText("A few details first")).toBeInTheDocument();
  expect(screen.queryByText("Observed action log and limitations")).not.toBeInTheDocument();
  expect(screen.queryByText(/Projections use the supplied/)).not.toBeInTheDocument();
});

it("offers confirmed calculations when the running service has no model configuration", async () => {
  vi.mocked(councilAdapter.status).mockResolvedValue({enabled: true, roles: ["council"], temporary: true, scope: "local", model_configured: false});
  page();
  expect(await screen.findByText("AI reviews are not configured on the running service")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Use calculation only"}));
  expect(screen.getByLabelText("Include a confirmed purchase comparison")).toBeChecked();
  expect(screen.getByLabelText("Purchase amount (USD)")).toHaveValue("");
  expect(screen.getByLabelText(/Use Nemotron specialist reviews/)).not.toBeChecked();
});

it("explains how to recover from service authentication failure", async () => {
  vi.mocked(councilAdapter.create).mockRejectedValue(new ApiError("Request failed (401)"));
  page();
  expect(await screen.findByRole("alert")).toHaveTextContent("Restart both using the shared local launcher");
  expect(councilAdapter.send).not.toHaveBeenCalled();
});

it("shows one latest clear decision per agent and keeps technical evidence collapsed", () => {
  render(<CouncilAnswer result={councilRunSchema.parse(fixture)} />);
  const cards = screen.getAllByRole("region", {name: /recommendation$/});
  expect(cards).toHaveLength(4);
  expect(screen.getByRole("region", {name: "Council Leader recommendation"})).toHaveTextContent("Wait for your income, then recheck.");
  expect(screen.getByRole("region", {name: "Budget Agent recommendation"})).toHaveTextContent("Don't buy it on the selected date.");
  expect(screen.getByRole("region", {name: "Simulator Agent recommendation"})).toHaveTextContent("Try buying on November 16 instead.");
  expect(screen.queryByText(/^Position:/)).not.toBeInTheDocument();
  for (const reference of screen.getAllByText(/^Calculation references:/)) expect(reference).not.toBeVisible();
  expect(screen.getByText("Agent discussion and supporting evidence")).toBeVisible();
  expect(screen.getByText("Projected balances and reserve")).not.toBeVisible();
});
