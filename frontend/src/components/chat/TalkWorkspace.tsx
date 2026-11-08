import { COUNCIL_UI_ENABLED } from "@/services/council";
import { CustomerFinancialData } from "@/components/app/CustomerFinancialData";
import { PageHeading } from "@/components/app/PageHeading";
import { Button } from "@/components/ui/button";
import { CouncilWorkspace } from "./CouncilWorkspace";

export function TalkWorkspace() {
  if (COUNCIL_UI_ENABLED) return <CouncilWorkspace />;
  return <CustomerFinancialData>{snapshot => <section>
    <PageHeading eyebrow={`Your account · Your financial records`} title="Council chats are disabled" description="Enable Council to talk to its specialists, or use the Simulator to compare a purchase." />
    <Button asChild><a href="/simulator">Open Simulator</a></Button>
  </section>}</CustomerFinancialData>;
}
