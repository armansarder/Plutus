import { afterEach, expect, it, vi } from "vitest";
import server from "../server";
import { proxyNotifications } from "../notificationsProxy.server";

afterEach(() => vi.unstubAllEnvs());
it("serves health without credentials and blocks production operator paths", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PLUTUS_PUBLIC_ORIGIN", "https://demo.example");
  expect((await server.fetch(new Request("https://demo.example/health"), {}, {})).status).toBe(200);
  for (const path of ["/operator", "/operator/", "/api/notifications/operator/state"]) {
    expect((await server.fetch(new Request("https://demo.example" + path), {}, {})).status).toBe(404);
  }
  expect((await proxyNotifications(new Request("https://demo.example/api/notifications/operator/state"))).status).toBe(404);
});
