import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BackendTalk } from "./BackendTalk";
import { CouncilWorkspace } from "./CouncilWorkspace";
export function TalkWorkspace() {
  const [council, setCouncil] = useState(true);
  return <><div className="mb-6 flex flex-wrap gap-2" aria-label="Analysis experience"><Button variant={council ? "default" : "outline"} onClick={() => setCouncil(true)}>Council & specialists</Button><Button variant={!council ? "default" : "outline"} onClick={() => setCouncil(false)}>Original purchase analysis</Button></div>{council ? <CouncilWorkspace /> : <BackendTalk />}</>;
}
