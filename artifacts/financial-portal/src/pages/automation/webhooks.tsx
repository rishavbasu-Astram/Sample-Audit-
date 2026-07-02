import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useListWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useListWebhookDeliveries,
  getListWebhooksQueryKey,
  getListWebhookDeliveriesQueryKey,
} from "@workspace/api-client-react";
import type { Webhook, WebhookInput, WebhookDelivery } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Webhook as WebhookIcon, Zap, Power, Trash2 } from "lucide-react";

type FormState = {
  name: string;
  url: string;
  events: string;
  secret: string;
};

const EMPTY: FormState = {
  name: "",
  url: "",
  events: "*",
  secret: "",
};

type TestResult = {
  webhookId: number;
  status: string;
  responseCode: number | null;
  durationMs: number | null;
  error: string | null;
};

export function WebhooksPage() {
  const qc = useQueryClient();
  const { data: webhooks, isLoading } = useListWebhooks();
  const { data: deliveries, isLoading: deliveriesLoading } = useListWebhookDeliveries();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [testResults, setTestResults] = useState<Map<number, TestResult>>(new Map());

  const invalidateWebhooks = () => qc.invalidateQueries({ queryKey: getListWebhooksQueryKey() });
  const invalidateDeliveries = () => qc.invalidateQueries({ queryKey: getListWebhookDeliveriesQueryKey() });
  const invalidateAll = () => { invalidateWebhooks(); invalidateDeliveries(); };

  const createMutation = useCreateWebhook({
    mutation: {
      onSuccess: () => { invalidateAll(); setFormOpen(false); setForm(EMPTY); },
    },
  });

  const updateMutation = useUpdateWebhook({
    mutation: { onSuccess: invalidateWebhooks },
  });

  const deleteMutation = useDeleteWebhook({
    mutation: {
      onSuccess: () => { invalidateAll(); setDeleting(null); },
    },
  });

  const testMutation = useTestWebhook({
    mutation: {
      onSuccess: (delivery: WebhookDelivery) => {
        invalidateDeliveries();
        setTestResults((prev) => {
          const next = new Map(prev);
          next.set(delivery.webhookId, {
            webhookId: delivery.webhookId,
            status: delivery.status,
            responseCode: delivery.responseCode ?? null,
            durationMs: delivery.durationMs ?? null,
            error: delivery.error ?? null,
          });
          return next;
        });
      },
    },
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.url.trim()) return;
    const rawEvents = form.events
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const data: WebhookInput = {
      name: form.name,
      url: form.url,
      events: rawEvents.length > 0 ? rawEvents : ["*"],
      ...(form.secret.trim() ? { secret: form.secret.trim() } : {}),
    };
    createMutation.mutate({ data });
  }

  function testResultLabel(result: TestResult): string {
    if (result.status === "delivered") {
      return `test delivered (${result.responseCode ?? "?"}) in ${result.durationMs ?? "?"}ms`;
    }
    const code = result.responseCode ? ` (${result.responseCode})` : "";
    const err = result.error ? ` — ${result.error.slice(0, 60)}` : "";
    return `test failed${code}${err}`;
  }

  const webhookColumns = [
    { header: "Name", accessorKey: "name" as const },
    {
      header: "URL",
      cell: (h: Webhook) => (
        <span className="max-w-[220px] truncate font-mono text-xs block" title={h.url}>
          {h.url}
        </span>
      ),
    },
    {
      header: "Events",
      cell: (h: Webhook) => (
        <span className="text-xs text-muted-foreground">{h.events.join(", ")}</span>
      ),
    },
    {
      header: "Secret",
      cell: (h: Webhook) => (h.hasSecret ? "HMAC" : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Deliveries",
      cell: (h: Webhook) => h.deliveryCount,
    },
    {
      header: "Status",
      cell: (h: Webhook) => <StatusBadge status={h.active ? "active" : "paused"} />,
    },
    {
      header: "",
      cell: (h: Webhook) => {
        const result = testResults.get(h.id);
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => testMutation.mutate({ id: h.id })}
                disabled={testMutation.isPending}
                title="Send test ping"
              >
                <Zap className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() =>
                  updateMutation.mutate({ id: h.id, data: { name: h.name, url: h.url, active: !h.active } })
                }
                title={h.active ? "Pause" : "Enable"}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleting(h)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {result && (
              <span
                className={`text-xs ${result.status === "delivered" ? "text-muted-foreground" : "text-destructive"}`}
              >
                {testResultLabel(result)}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const deliveryColumns = [
    {
      header: "Webhook",
      cell: (d: WebhookDelivery) => d.webhookName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Event",
      cell: (d: WebhookDelivery) => <span className="font-mono text-xs">{d.event}</span>,
    },
    {
      header: "Status",
      cell: (d: WebhookDelivery) => <StatusBadge status={d.status} />,
    },
    {
      header: "Code",
      cell: (d: WebhookDelivery) =>
        d.responseCode != null ? d.responseCode : <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Duration",
      cell: (d: WebhookDelivery) =>
        d.durationMs != null ? `${d.durationMs}ms` : <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Time",
      cell: (d: WebhookDelivery) => formatDate(d.createdAt),
    },
  ];

  return (
    <PageLayout
      title="Webhooks"
      description="Push every ledger event to external systems in real time. Events mirror the audit trail — entity.ACTION, wildcards supported."
      actionLabel="New Webhook"
      onAction={() => { setForm(EMPTY); setFormOpen(true); }}
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WebhookIcon className="h-4 w-4" /> Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={webhookColumns}
            data={webhooks}
            isLoading={isLoading}
            emptyTitle="No webhooks"
            emptyDescription="Add a webhook to receive real-time event notifications from the audit trail."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={deliveryColumns}
            data={deliveries}
            isLoading={deliveriesLoading}
            emptyTitle="No deliveries yet"
            emptyDescription="Deliveries appear here when a webhook fires. Use the test button to send a ping."
          />
        </CardContent>
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Webhook"
        description="Receives a signed HTTP POST for every matching audit event."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Webhook"
        size="md"
      >
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Slack notifier"
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL *</Label>
            <Input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://example.com/hooks/astram"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Events</Label>
            <Input
              value={form.events}
              onChange={(e) => set("events", e.target.value)}
              placeholder="*, invoice.CREATE, invoice.*, bank_transfer.CREATE"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated event patterns. Examples: <code>invoice.CREATE</code>, <code>invoice.*</code>,{" "}
              <code>bank_transfer.CREATE</code>, <code>*</code> (all events).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Secret (optional)</Label>
            <Input
              value={form.secret}
              onChange={(e) => set("secret", e.target.value)}
              placeholder="Leave blank to skip signing"
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              Used to sign payloads with HMAC-SHA256. Verify the <code>X-Astram-Signature</code> header on your end.
            </p>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Webhook"
        description={`Delete "${deleting?.name}"? The webhook and all its delivery history will be permanently removed.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}

export default WebhooksPage;
