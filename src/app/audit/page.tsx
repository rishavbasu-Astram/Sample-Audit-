"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mockAuditLogs,
  mockComplianceControls,
  getStatusColor,
  formatDateTime,
} from "@/data/mockData";
import { ShieldCheck, Download } from "lucide-react";

export default function AuditPage() {
  const soc2Controls = mockComplianceControls.filter((c) => c.framework === "SOC2");
  const gdprControls = mockComplianceControls.filter((c) => c.framework === "GDPR");
  const pciControls = mockComplianceControls.filter((c) => c.framework === "PCI-DSS");

  const soc2Compliant = soc2Controls.filter((c) => c.status === "compliant").length;
  const gdprCompliant = gdprControls.filter((c) => c.status === "compliant").length;
  const pciCompliant = pciControls.filter((c) => c.status === "compliant").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">SOC 2 Type II</p>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800">Compliant</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900">{soc2Compliant}/{soc2Controls.length}</p>
            <p className="text-xs text-slate-400 mt-1">Controls assessed</p>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(soc2Compliant / soc2Controls.length) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">GDPR</p>
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800">Compliant</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900">{gdprCompliant}/{gdprControls.length}</p>
            <p className="text-xs text-slate-400 mt-1">Controls assessed</p>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(gdprCompliant / gdprControls.length) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">PCI-DSS</p>
              <Badge variant="outline" className="bg-amber-100 text-amber-800">Partial</Badge>
            </div>
            <p className="text-2xl font-bold text-slate-900">{pciCompliant}/{pciControls.length}</p>
            <p className="text-xs text-slate-400 mt-1">Controls assessed</p>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(pciCompliant / pciControls.length) * 100}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Compliance Controls</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Framework</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Control ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Owner</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Risk</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockComplianceControls.map((control) => (
                  <tr key={control.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{control.framework}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{control.controlId}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{control.title}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{control.owner}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className={control.riskLevel === "critical" ? "bg-red-100 text-red-800" : control.riskLevel === "high" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}>
                        {control.riskLevel}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className={getStatusColor(control.status)}>{control.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <CardTitle>Immutable Audit Trail</CardTitle>
          </div>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => alert("Audit log exported to CSV with SHA-256 hashes")}>
            <Download className="w-4 h-4" /> Export
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{formatDateTime(log.timestamp)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{log.userName}</td>
                    <td className="px-6 py-4 text-sm"><Badge variant="outline" className="bg-slate-100 text-slate-700 font-medium">{log.action}</Badge></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{log.entity}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{log.description}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
