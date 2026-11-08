import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, AlertTriangle, ShieldCheck, Phone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/services/notifications";

export function TextNotificationSettings() {
  const queryClient = useQueryClient();
  const { data: prefs, isLoading, isError } = useQuery<NotificationPreferences>({
    queryKey: ["notification-preferences"],
    queryFn: fetchNotificationPreferences,
    staleTime: 10000,
  });

  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [purchaseAlerts, setPurchaseAlerts] = useState(true);
  const [threshold, setThreshold] = useState(85);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (prefs) {
      setPhone(prefs.phone_number || "");
      setEnabled(prefs.enabled);
      setBudgetAlerts(prefs.budget_alerts);
      setPurchaseAlerts(prefs.purchase_alerts);
      setThreshold(prefs.threshold_percent);
    }
  }, [prefs]);

  const mutation = useMutation({
    mutationFn: saveNotificationPreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData(["notification-preferences"], updated);
      queryClient.invalidateQueries({ queryKey: ["messaging-status"] });
      setSaveStatus("saved");
      setStatusMessage(
        updated.enabled
          ? updated.verified
            ? "Preferences saved. Text notifications are active for your verified number."
            : "Preferences saved. Note: this phone number is not yet enrolled for demo SMS delivery."
          : "Preferences saved. Text notifications are disabled.",
      );
      setTimeout(() => setSaveStatus("idle"), 6000);
    },
    onError: () => {
      setSaveStatus("error");
      setStatusMessage("Failed to save notification preferences. Please try again.");
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("idle");
    mutation.mutate({
      phone_number: phone,
      enabled,
      budget_alerts: budgetAlerts,
      purchase_alerts: purchaseAlerts,
      threshold_percent: threshold,
    });
  };

  if (isLoading) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground animate-pulse">
        Loading notification settings…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Unable to load notification settings from backend.
      </div>
    );
  }

  return (
    <section aria-labelledby="notif-settings-heading" className="panel p-6 mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <BellRing className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 id="notif-settings-heading" className="text-base font-semibold text-foreground">
              Text Notifications (Photon 2.0)
            </h2>
            <p className="text-xs text-muted-foreground">
              Get timely iMessage updates when spending reaches your warning zone or when a watched purchase becomes safe.
            </p>
          </div>
        </div>
        {prefs?.enabled ? (
          <Badge variant="default" className="bg-accent text-accent-foreground">
            Notifications Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Notifications Disabled
          </Badge>
        )}
      </div>

      <form onSubmit={handleSave} className="mt-5 space-y-6">
        {/* Phone number configuration */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="phone-input" className="text-xs font-semibold">
              Phone Number (E.164 or US format)
            </Label>
            <div className="relative mt-1.5">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                id="phone-input"
                type="tel"
                placeholder="+1 (214) 555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              In demo mode, text delivery is authorized for your enrolled test recipient.
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold">Active Recipient Status</Label>
            <div className="mt-1.5 flex h-10 items-center justify-between rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-foreground">
                {prefs?.phone_number_masked || "No phone saved"}
              </span>
              {prefs?.verified ? (
                <span className="inline-flex items-center gap-1 text-xs text-accent-foreground font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" /> Enrolled & Verified
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Unenrolled</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored securely on the backend in masked format.
            </p>
          </div>
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <Label htmlFor="master-toggle" className="text-sm font-semibold cursor-pointer">
              Enable Text Notifications
            </Label>
            <p className="text-xs text-muted-foreground">
              Master control for all automated text alerts. Turn off anytime to opt out completely.
            </p>
          </div>
          <Switch
            id="master-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable text notifications"
          />
        </div>

        {/* Feature toggles & Threshold */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="budget-toggle" className="text-xs font-semibold cursor-pointer">
                Budget Red-Zone Alerts
              </Label>
              <Switch
                id="budget-toggle"
                checked={budgetAlerts}
                disabled={!enabled}
                onCheckedChange={setBudgetAlerts}
                aria-label="Budget Red-Zone Alerts"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sends an alert when monthly category spending crosses your warning threshold.
            </p>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="purchase-toggle" className="text-xs font-semibold cursor-pointer">
                Saved-Purchase Opportunity Alerts
              </Label>
              <Switch
                id="purchase-toggle"
                checked={purchaseAlerts}
                disabled={!enabled}
                onCheckedChange={setPurchaseAlerts}
                aria-label="Saved-Purchase Opportunity Alerts"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sends a notification when a watched purchase meets your minimum cash reserve rule.
            </p>
          </div>
        </div>

        {/* Configurable Threshold Slider */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              Budget Warning Threshold
            </Label>
            <span className="font-mono text-sm font-semibold text-primary">
              {threshold}%
            </span>
          </div>
          <Slider
            value={[threshold]}
            min={50}
            max={100}
            step={5}
            disabled={!enabled || !budgetAlerts}
            onValueChange={(val) => setThreshold(val[0] ?? 85)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Default is 85%. You'll receive a notification the first time monthly spending crosses this level.
          </p>
        </div>

        {/* Action Button & Confirmation */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving Preferences…" : "Save Preferences"}
          </Button>

          {saveStatus === "saved" && (
            <p className="flex items-center gap-1.5 text-xs text-accent-foreground font-medium">
              <CheckCircle2 className="h-4 w-4" /> {statusMessage}
            </p>
          )}

          {saveStatus === "error" && (
            <p className="flex items-center gap-1.5 text-xs text-destructive font-medium">
              <AlertTriangle className="h-4 w-4" /> {statusMessage}
            </p>
          )}
        </div>

        {/* Opt-out disclosure statement */}
        <p className="border-t border-border pt-4 text-xs text-muted-foreground leading-relaxed">
          <strong>Privacy & Opt-out:</strong> You can opt out of Plutus text messages at any time by toggling
          notifications off above, or by replying STOP to any received message. Message frequency varies based on your
          spending and cash flows. Standard carrier text rates may apply. Messages are draft-simulated decision aids,
          not financial advice or payment confirmations.
        </p>
      </form>
    </section>
  );
}

