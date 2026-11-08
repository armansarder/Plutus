import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Mic, SendHorizontal, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/app/PageHeading";
import { AffordabilityCard } from "@/components/chat/AffordabilityCard";
import { DevilsAdvocate } from "@/components/chat/DevilsAdvocate";
import { PhotonSection } from "@/components/chat/PhotonSection";
import { Button } from "@/components/ui/button";
import { agentAdapter } from "@/services/agent";
import type { AgentResponse } from "@/types/agent";
import { DATA_MODE } from "@/services/config";
import { BackendCustomerPage } from "@/components/app/BackendCustomerPage";

export const Route = createFileRoute("/talk")({
  head: () => ({ meta: [
    { title: "Talk to Plutus — Plutus" },
    { name: "description", content: "Explore financial questions when personalized answers are available." },
    { property: "og:title", content: "Talk to Plutus — Plutus" },
    { property: "og:description", content: "Explore financial choices, understand your budget, and plan your next move." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Talk,
});

const SUGGESTED = ["Can I afford a $500 laptop?", "How can I save more this month?", "What happens if my paycheck is late?"];

type ChatMessage = { id: number; role: "user" | "assistant"; text: string; response?: AgentResponse; error?: boolean };

// Browser speech recognition is optional; only offer the mic when it actually exists.
type SpeechRecognitionLike = { lang: string; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as (new () => SpeechRecognitionLike) | null;
}

function Talk() {
  return DATA_MODE === "remote" ? <BackendCustomerPage page="talk" /> : <DemoTalk />;
}
function DemoTalk() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const nextId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  // Detect speech recognition only after hydration to avoid server/client mismatch.
  const [RecCtor, setRecCtor] = useState<(new () => SpeechRecognitionLike) | null>(null);
  const [micChecked, setMicChecked] = useState(false);
  useEffect(() => { setRecCtor(() => speechRecognitionCtor()); setMicChecked(true); }, []);

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    setPending(true);
    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text: message }]);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    agentAdapter.ask(message, ctrl.signal)
      .then((response) => setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", text: response.reply, response }]))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", text: "Sorry — I couldn't answer that right now. Please try again.", error: true }]);
      })
      .finally(() => setPending(false));
  };

  const startListening = () => {
    if (!RecCtor) return;
    const rec = new RecCtor();
    rec.lang = "en-US";
    rec.onresult = (e) => { setInput(e.results[0][0].transcript); setMicNote("Review the text, then press send."); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setMicNote("Microphone unavailable or permission denied. You can type instead."); };
    setMicNote(null);
    setListening(true);
    rec.start();
  };

  return (
    <div>
      <PageHeading eyebrow="Talk to Plutus" title="Ask Plutus anything about your money." description="Explore financial choices, understand your budget, and plan your next move." />
      <p className="mb-6 text-sm text-muted-foreground">Demo assistant · Answers use the same simulation engine as the Simulator · Not financial advice</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {SUGGESTED.map((q) => (
          <button key={q} onClick={() => submit(q)} disabled={pending}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>

      <div className="panel p-4 sm:p-6" aria-live="polite" aria-busy={pending}>
        {messages.length === 0 && !pending && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Ask a question, or tap one of the examples above.</p>
        )}
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5 text-sm text-foreground"}>
                {m.error && <AlertCircle className="mr-1.5 inline h-4 w-4 text-destructive" aria-hidden />}
                {m.text}
                {m.response && <AffordabilityCard response={m.response} />}
                {m.response && <DevilsAdvocate response={m.response} />}
              </div>
            </li>
          ))}
          {pending && (
            <li className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                <span className="inline-flex gap-1" aria-label="Plutus is thinking"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" /></span>
              </div>
            </li>
          )}
        </ul>

        <form className="mt-5 flex items-center gap-2 border-t border-border pt-4" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
          <label htmlFor="chat-input" className="sr-only">Ask a question</label>
          <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a purchase, your plan, or your savings…" maxLength={500}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {RecCtor && (
            <Button type="button" variant="outline" size="icon" aria-label={listening ? "Listening…" : "Ask by voice"} aria-pressed={listening} onClick={startListening} disabled={listening || pending}>
              <Mic className={listening ? "h-4 w-4 text-destructive" : "h-4 w-4"} />
            </Button>
          )}
          <Button type="submit" size="icon" aria-label="Send" disabled={pending || !input.trim()}><SendHorizontal className="h-4 w-4" /></Button>
        </form>
        {micNote && <p className="mt-2 text-xs text-muted-foreground">{micNote}</p>}
        {micChecked && !RecCtor && <p className="mt-2 text-xs text-muted-foreground">Voice input isn't supported in this browser — typing works everywhere.</p>}
      </div>

      <PhotonSection />
    </div>
  );
}
