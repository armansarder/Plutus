import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BackendTalk } from "./BackendTalk";
import { CouncilWorkspace } from "./CouncilWorkspace";
export function TalkWorkspace() {
  const [council, setCouncil] = useState(true);
  return <><div className="mb-8 inline-flex max-w-full gap-1 rounded-xl border border-border bg-card p-1 shadow-sm" aria-label="Analysis experience"><Button className="h-auto min-h-10 whitespace-normal px-4 text-xs sm:text-sm" variant={council ? "default" : "ghost"} aria-pressed={council} onClick={() => setCouncil(true)}>Council & specialists</Button><Button className="h-auto min-h-10 whitespace-normal px-4 text-xs sm:text-sm" variant={!council ? "default" : "ghost"} aria-pressed={!council} onClick={() => setCouncil(false)}>Purchase analysis</Button></div>{council ? <CouncilWorkspace /> : <BackendTalk />}</>;
}
