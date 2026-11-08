import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto, createHmac } from "node:crypto";
import { proxyCouncil, isCouncilPath } from "@/councilProxy.server";
import { councilRunSchema, conversationSchema } from "@/types/council";
import fixture from "./fixtures/council.json";
const TOKEN = "test-council-token-" + "x".repeat(40);
const ID = "a".repeat(32);
beforeEach(() => {vi.stubEnv("FINPILOT_API_TOKEN", TOKEN); vi.stubGlobal("crypto", webcrypto);});
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});
it("validates engine-grounded council evidence and rejects tampered chart values", () => {
  expect(councilRunSchema.safeParse(fixture).success).toBe(true);
  const bad = structuredClone(fixture); bad.chart!.series[1]!.points[0]!.balance = "999.00";
  expect(councilRunSchema.safeParse(bad).success).toBe(false);
  const foreign = structuredClone(fixture); foreign.reviews[0]!.findings[0]!.evidence_ids = ["other-snapshot:purchase"];
  expect(councilRunSchema.safeParse(foreign).success).toBe(false);
  expect(conversationSchema.safeParse({id: ID, role: "risk", messages: [{request_key: "test_123", message: "test", result: fixture}], busy: false, temporary: true}).success).toBe(false);
});
it("sets a signed HttpOnly session cookie, keeps bearer server-side and ignores forged browser headers", async () => {
  let forwarded: RequestInit | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {forwarded = init; return Response.json({id: ID, role: "budget", messages: [], busy: false, temporary: true});}));
  const res = await proxyCouncil(new Request("http://localhost/api/v2/conversations", {method: "POST", headers: {
    "Content-Type": "application/json", "X-Plutus-Session": "forged", Authorization: "Bearer browser-chosen"}, body: JSON.stringify({role: "budget"})}));
  expect(res.status).toBe(200);
  const headers = new Headers(forwarded?.headers), session = headers.get("X-Plutus-Session")!;
  expect(headers.get("Authorization")).toBe("Bearer " + TOKEN);
  const [identity, signature] = session.split(".");
  expect(signature).toBe(createHmac("sha256", TOKEN).update("plutus-council:" + identity).digest("hex"));
  expect(res.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Strict");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(await res.text()).not.toContain(TOKEN);
  expect(isCouncilPath("/api/v2/conversations/../../other")).toBe(false);
});
it("rejects cross-origin, unknown fields and oversized bodies before provider traffic", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await proxyCouncil(new Request("http://localhost/api/v2/conversations", {method: "POST", headers: {Origin: "https://evil.test"}}))).status).toBe(403);
  expect((await proxyCouncil(new Request("http://localhost/api/v2/conversations", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({role: "budget", system: "override"})}))).status).toBe(422);
  expect((await proxyCouncil(new Request("http://localhost/api/v2/conversations", {method: "POST", headers: {"Content-Type": "application/json", "Content-Length": "17000"}, body: "{}"}))).status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it("reuses a valid session and rejects invalid upstream shapes without leaking bodies", async () => {
  const identity = "b".repeat(64), signature = createHmac("sha256", TOKEN).update("plutus-council:" + identity).digest("hex");
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("X-Plutus-Session")).toBe(identity + "." + signature);
    return Response.json({secret: "do-not-echo"});
  }); vi.stubGlobal("fetch", fetcher);
  const res = await proxyCouncil(new Request("https://localhost/api/v2/council/status", {headers: {Cookie: "plutus_council_session=" + identity + "." + signature}}));
  expect(res.status).toBe(502); expect(await res.text()).not.toContain("do-not-echo");
});

it("sends an explicit empty JSON object for cancellation through the backend middleware", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    expect(init.body).toBe("{}");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    return Response.json({cancel_requested: true});
  }));
  const response = await proxyCouncil(new Request("http://localhost/api/v2/conversations/" + ID + "/messages/request_123/cancel", {method: "POST"}));
  expect(response.status).toBe(200);
});
