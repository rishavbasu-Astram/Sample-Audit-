import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useListReminderRules,
  useCreateReminderRule,
  useUpdateReminderRule,
  useDeleteReminderRule,
  useRunRemindersNow,
  usePreviewReminders,
  useListReminderLog,
  getListReminderRulesQueryKey,
  getListReminderLogQueryKey,
  getPreviewRemindersQueryKey,
} from "@workspace/api-client-react";
import type { ReminderRule, ReminderRuleInput, ReminderLogEntry } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Bell, Send, Eye, Power, Trash2 } from "lucide-react";

const CHANNELS = ["email", "sms", "log"];

// Human label for a rule's timing relative to the invoice due date.
function timingLabel(r: ReminderRule): string {
  const base =
    r.offsetDays < 0 ? `${-r.offsetDays}d before due` : r.offsetDays === 0 ? "on due date" : `${r.offsetDays}d overdue`;
  if (r.repeatEveryDays && r.repeatEveryDays > 0) {
    return `${base}, repeat every ${r.repeatEveryDays}d${r.maxReminders ? ` (max ${r.maxReminders})` : ""}`;
  }
  return base;
}

type FormState = {
  name: string;
  offsetDays: string;
  repeatEveryDays: string;
  maxReminders: string;
  channel: string;
  subject: string;
  bodyTemplate: string;
};

const EMPTY: FormState = {
  name: "",
  offsetDays: "0",
  repeatEveryDays: "",
  maxReminders: "",
  channel: "email",
  subject: "Payment reminder: invoice {{invoiceNumber}}",
  bodyTemplate:
    "Hi {{customerName}}, invoice {{invoiceNumber}} for {{amountDue}} is due on {{dueDate}}. Please arrange payment. Thank you.",
};

function PreviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: due, isLoading } = usePreviewReminders({
    query: { enabled: open, queryKey: getPreviewRemindersQueryKey() },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reminders due now</DialogTitle>
          <DialogDescription>A dry run — nothing is sent. This is exactly what “Run now” would dispatch.</DialogDescription>
        </DialogHeader>
        <DataTable
          columns={[
            { header: "Invoice", cell: (d) => <span className="font-mono text-xs">{d.invoiceNumber}</span> },
            { header: "Customer", cell: (d) => d.customerName ?? "—" },
            {
              header: "To",
              cell: (d) =>
                d.customerEmail ? (
                  <span className="text-xs">{d.customerEmail}</span>
                ) : d.channel === "email" ? (
                  <span className="text-xs text-amber-600">no email on file</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            { header: "Occurrence", cell: (d) => formatDate(d.occurrenceDate) },
            {
              header: "Overdue",
              cell: (d) => (d.daysOverdue > 0 ? <span className="text-amber-600">{d.daysOverdue}d</span> : <span className="text-muted-foreground">—</span>),
            },
            { header: "Amount", cell: (d) => <span className="font-medium">{formatCurrency(d.amountDue)}</span> },
            { header: "Channel", cell: (d) => <span className="capitalize">{d.channel}</span> },
          ]}
          data={due}
          isLoading={isLoading}
          emptyTitle="Nothing due"
          emptyDescription="No open invoice matches an active rule's timing right now."
        />
      </DialogContent>
    </Dialog>
  );
}

export function PaymentRemindersPage() {
  const qc = useQueryClient();
  const { data: rules, isLoading } = useListReminderRules();
  const { data: log, isLoading: logLoading } = useListReminderLog();

  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ReminderRule | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const invalidateRules = () => qc.invalidateQueries({ queryKey: getListReminderRulesQueryKey() });
  const invalidateLog = () => qc.invalidateQueries({ queryKey: getListReminderLogQueryKey() });

  const createMutation = useCreateReminderRule({
    mutation: { onSuccess: () => { invalidateRules(); setFormOpen(false); } },
  });
  const updateMutation = useUpdateReminderRule({ mutation: { onSuccess: invalidateRules } });
  const deleteMutation = useDeleteReminderRule({
    mutation: { onSuccess: () => { invalidateRules(); setDeleting(null); } },
  });
  const runNowMutation = useRunRemindersNow({
    mutation: { onSuccess: () => { invalidateLog(); invalidateRules(); } },
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    const data: ReminderRuleInput = {
      name: form.name,
      offsetDays: Number(form.offsetDays || 0),
      repeatEveryDays: form.repeatEveryDays ? Number(form.repeatEveryDays) : undefined,
      maxReminders: form.maxReminders ? Number(form.maxReminders) : undefined,
      channel: form.channel,
      subject: form.subject,
      bodyTemplate: form.bodyTemplate,
    };
    createMutation.mutate({ data });
  }

  const ruleColumns = [
    { header: "Name", accessorKey: "name" as const },
    { header: "Timing", cell: (r: ReminderRule) => <span className="text-sm">{timingLabel(r)}</span> },
    { header: "Channel", cell: (r: ReminderRule) => <span className="capitalize">{r.channel}</span> },
    { header: "Status", cell: (r: ReminderRule) => <StatusBadge status={r.active ? "active" : "paused"} /> },
    {
      header: "",
      cell: (r: ReminderRule) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => updateMutation.mutate({ id: r.id, data: { name: r.name, active: !r.active } })}
            title={r.active ? "Disable" : "Enable"}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(r)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const logColumns = [
    { header: "Invoice", cell: (l: ReminderLogEntry) => <span className="font-mono text-xs">{l.invoiceNumber ?? "—"}</span> },
    { header: "Customer", cell: (l: ReminderLogEntry) => l.customerName ?? "—" },
    {
      header: "To",
      cell: (l: ReminderLogEntry) =>
        l.recipient ? <span className="text-xs">{l.recipient}</span> : <span className="text-muted-foreground">—</span>,
    },
    { header: "Occurrence", cell: (l: ReminderLogEntry) => formatDate(l.occurrenceDate) },
    { header: "Amount", cell: (l: ReminderLogEntry) => <span className="font-medium">{formatCurrency(l.amountDue)}</span> },
    { header: "Channel", cell: (l: ReminderLogEntry) => <span className="capitalize">{l.channel}</span> },
    { header: "Status", cell: (l: ReminderLogEntry) => <StatusBadge status={l.status} /> },
    { header: "Sent", cell: (l: ReminderLogEntry) => formatDate(l.sentAt) },
  ];

  return (
    <PageLayout
      title="Payment Reminders"
      description="Automatic dunning: rules fire relative to an invoice's due date. The engine runs continuously; every reminder is anchored in the audit ledger."
      actionLabel="New Rule"
      onAction={() => { setForm(EMPTY); setFormOpen(true); }}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
          <Send className="mr-2 h-4 w-4" />
          {runNowMutation.isPending ? "Dispatching…" : "Run reminders now"}
        </Button>
        <Button variant="outline" onClick={() => setPreviewing(true)}>
          <Eye className="mr-2 h-4 w-4" /> Preview due
        </Button>
        {runNowMutation.data && (
          <span className="self-center text-sm text-muted-foreground">
            Last run dispatched {runNowMutation.data.generated} reminder{runNowMutation.data.generated === 1 ? "" : "s"}
            {runNowMutation.data.delivery === "live" ? " (live email)" : " (simulated — no email provider configured)"}.
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Email delivery is <strong>simulated</strong> (logged only) unless <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>
        {" "}are set in the server environment. When configured, the background engine emails overdue-invoice customers automatically.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Reminder rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ruleColumns}
            data={rules}
            isLoading={isLoading}
            emptyTitle="No reminder rules"
            emptyDescription="Add a rule, e.g. “3 days before due” or “on due date, repeat every 7 days”."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={logColumns}
            data={log}
            isLoading={logLoading}
            emptyTitle="No reminders sent yet"
            emptyDescription="Use “Run reminders now” or wait for the engine to dispatch due reminders."
          />
        </CardContent>
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Reminder Rule"
        description="Timing is relative to each invoice's due date. Templates support {{customerName}}, {{invoiceNumber}}, {{amountDue}}, {{dueDate}}, {{daysOverdue}}."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Rule"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Gentle nudge — 3 days before due" />
          </div>
          <div className="space-y-1.5">
            <Label>Offset days</Label>
            <Input type="number" value={form.offsetDays} onChange={(e) => set("offsetDays", e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">Negative = before due, 0 = on due, positive = overdue.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Repeat every (days)</Label>
            <Input type="number" value={form.repeatEveryDays} onChange={(e) => set("repeatEveryDays", e.target.value)} placeholder="e.g. 7 (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label>Max reminders</Label>
            <Input type="number" value={form.maxReminders} onChange={(e) => set("maxReminders", e.target.value)} placeholder="e.g. 3 (optional)" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={3} value={form.bodyTemplate} onChange={(e) => set("bodyTemplate", e.target.value)} />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Reminder Rule"
        description={`Delete "${deleting?.name}"? Already-sent reminders are kept in the log.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />

      <PreviewDialog open={previewing} onClose={() => setPreviewing(false)} />
    </PageLayout>
  );
}

export default PaymentRemindersPage;
