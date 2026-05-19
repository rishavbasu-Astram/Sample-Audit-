"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  mockChartOfAccounts,
  mockJournalEntries,
  formatCurrency,
  formatDate,
  getStatusColor,
} from "@/data/mockData";
import { Plus, BookOpen, Scale, ArrowRightLeft } from "lucide-react";

export default function LedgerPage() {
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  const totalAssets = mockChartOfAccounts
    .filter((a) => a.type === "asset")
    .reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = mockChartOfAccounts
    .filter((a) => a.type === "liability")
    .reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = mockChartOfAccounts
    .filter((a) => a.type === "equity")
    .reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <BookOpen className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-500">Total Assets</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalAssets)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <Scale className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-sm text-slate-500">Total Liabilities</p>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(totalLiabilities)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm text-slate-500">Total Equity</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalEquity)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart of Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Chart of Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockChartOfAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-mono text-slate-500">
                      {account.code}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 capitalize">
                      {account.type}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 capitalize">
                      {account.category.replace("_", " ")}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-slate-900">
                      {formatCurrency(account.balance)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge
                        variant="outline"
                        className={
                          account.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-500"
                        }
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Journal Entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Journal Entries</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Journal Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Description</label>
                  <input
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Entry description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Date</label>
                    <input type="date" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Reference</label>
                    <input
                      className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm"
                      placeholder="Reference number"
                    />
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">Journal Lines</h4>
                  {[1, 2].map((line) => (
                    <div key={line} className="grid grid-cols-3 gap-3">
                      <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                        <option>Select Account</option>
                        <option>Cash and Equivalents (1000)</option>
                        <option>Accounts Receivable (1100)</option>
                        <option>Software Revenue (4000)</option>
                      </select>
                      <input
                        type="number"
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="Debit"
                      />
                      <input
                        type="number"
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="Credit"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline">Cancel</Button>
                  <Button>Save as Draft</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Entry #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Debits
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockJournalEntries.map((je) => (
                  <tr
                    key={je.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() =>
                      setSelectedEntry(selectedEntry === je.id ? null : je.id)
                    }
                  >
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">
                      {je.entryNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(je.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {je.description}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {je.reference}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-right text-slate-900">
                      {formatCurrency(je.totalDebits)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-right text-slate-900">
                      {formatCurrency(je.totalCredits)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge
                        variant="outline"
                        className={getStatusColor(je.status)}
                      >
                        {je.status}
                      </Badge>
                    </td>
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
