// This component sends server-approved messages ONLY to one explicitly opted-in demo number.
import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env"), override: true });
dotenv.config({ path: resolve(__dirname, "../.env"), override: false });
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const secret = process.env.PHOTON_INTERNAL_SECRET ?? "";
const recipient = process.env.PHOTON_TEST_RECIPIENT ?? "";
const enrolled = process.env.PHOTON_RECIPIENT_OPTED_IN === "true";
const projectId = process.env.PHOTON_PROJECT_ID ?? "";
const projectSecret = process.env.PHOTON_PROJECT_SECRET ?? "";

if (secret.length < 32) throw new Error("PHOTON_INTERNAL_SECRET must be >=32 characters");
if (!/^\+[1-9]\d{7,14}$/.test(recipient)) throw new Error("Set a verified E.164 PHOTON_TEST_RECIPIENT");
if (!enrolled) throw new Error("Recipient not opted in: set PHOTON_RECIPIENT_OPTED_IN after verifying first contact");
if (!projectId || !projectSecret) throw new Error("Photon credentials missing");

const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] });
const provider = imessage(app);
const target = await provider.user(recipient);
const conversation = await provider.space.create(target);

function authorized(header: string | undefined) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST" || req.url !== "/send") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (!authorized(req.headers.authorization)) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let body = "";
  for await (const part of req) {
    body += part.toString();
    if (body.length > 2048) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: "too_large" }));
      return;
    }
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("message" in parsed) ||
      typeof parsed.message !== "string" ||
      parsed.message.length < 1 ||
      parsed.message.length > 800
    ) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "invalid_message" }));
      return;
    }
    await conversation.send(parsed.message);
    res.writeHead(202);
    res.end(JSON.stringify({ status: "submitted_not_confirmed_delivered" }));
  } catch (error) {
    // Never log message text, phone, or provider credentials.
    console.error("Photon send failed:", error instanceof Error ? error.name : "unknown");
    res.writeHead(502);
    res.end(JSON.stringify({ error: "provider_send_failed" }));
  }
});

server.listen(8790, "127.0.0.1", () => console.log("Photon sender listening on loopback :8790"));
const shutdown = async () => {
  server.close();
  await app.stop();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

