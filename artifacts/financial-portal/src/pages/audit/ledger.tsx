import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, Link2 } from "lucide-react";

interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: "CREATE" | "UPDATE" | "DELETE" | string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  prevHash: string;
  hash: string;
}

interface VerifyResult {
  valid: boolean;
  total: number;
  headHash: string | null;
  brokenAt?: { id: number; seq: number };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  CREATE: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

export function AuditLedgerPage() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-ledger"],
    queryFn: () => fetchJson<AuditEntry[]>("/api/audit?limit=200"),
  });

  const verify = useMutation({
    mutationFn: () => fetchJson<VerifyResult>("/api/audit/verify"),
  });

  return (
    <PageLayout
      title="Audit Ledger"
      description="Append-only, hash-chained record of every change — blockchain-grade tamper evidence."
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Chain integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? "Verifying…" : "Verify integrity"}
          </Button>

          {verify.data && (
            <div className="flex flex-wrap items-center gap-3">
              {verify.data.valid ? (
                <Badge className="gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified — chain intact
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" /> Tampering detected
                  {verify.data.brokenAt ? ` at #${verify.data.brokenAt.seq}` : ""}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {verify.data.total} record{verify.data.total === 1 ? "" : "s"} checked
              </span>
              {verify.data.headHash && (
                <span className="font-mono text-xs text-muted-foreground">
                  head {short(verify.data.headHash)}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !entries || entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No entries yet. Create, edit, or delete any record and it will be chained here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">Timestamp</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Entity</th>
                    <th className="py-2 pr-4 font-medium">Prev hash</th>
                    <th className="py-2 pr-4 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{e.id}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(e.ts)}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={ACTION_VARIANT[e.action] ?? "secondary"}>{e.action}</Badge>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {e.entityType}
                        {e.entityId ? <span className="text-muted-foreground"> #{e.entityId}</span> : null}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {short(e.prevHash)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          {short(e.hash)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export default AuditLedgerPage;
