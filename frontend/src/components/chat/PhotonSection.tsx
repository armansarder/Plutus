import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { messagingAdapter } from "@/services/agent";
import type { MessagingStatus } from "@/types/agent";

/**
 * Photon messaging entry point. Shows the real connection status when the backend
 * provides it; in demo mode it honestly reports "not connected" — no fake numbers.
 */
export function PhotonSection() {
  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    messagingAdapter.getStatus(ctrl.signal).then(setStatus).catch(() => setFailed(true));
    return () => ctrl.abort();
  }, []);

  return (
    <section aria-label="Messaging" className="mt-10 border-t border-border pt-8">
      <div className="flex items-center gap-2.5">
        <MessageSquareText className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-display text-2xl font-semibold">Prefer texting?</h2>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Continue a conversation with Plutus through a supported messaging channel. You'll be able to ask a question by text and open the website to review the full comparison.
      </p>
      <div className="mt-4 panel flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className={failed || !status ? "h-2.5 w-2.5 rounded-full bg-muted-foreground" : status.connected ? "h-2.5 w-2.5 rounded-full bg-accent-foreground" : "h-2.5 w-2.5 rounded-full bg-caution"} />
        </span>
        <span className="font-medium text-foreground">
          {failed ? "Messaging status unavailable." : !status ? "Checking messaging status…" : status.connected ? `Connected via ${status.channel}` : "Messaging demo — not connected."}
        </span>
      </div>
      {status?.instructions && <p className="mt-3 text-sm text-muted-foreground">{status.instructions}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Privacy: messaging conversations may include financial information. Plutus will ask for your approval before sending any financial details externally.
      </p>
    </section>
  );
}
