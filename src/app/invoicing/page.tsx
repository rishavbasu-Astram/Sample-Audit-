"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  mockInvoices,
  formatCurrency,
  formatDate,
  getStatusColor,
  daysOverdue,
} from "@/data/mockData";
import { Plus, Search, MoreHorizontal } from "lucide-react";

export default function InvoicingPage() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredInvoices = mockInvoices.filter((inv) => {
    const matchesStatus = filterStatus === "all" || inv.status === filterStatus;
    const matchesSearch =
      inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalOutstanding = mockInvoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.total, 0);
  const totalOverdue = mockInvoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.total, 0);
  const totalPaid = mockInvoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.total, 0);
  const draftCount = mockInvoices.filter((i) => i.status === "draft").length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Outstanding</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {formatCurrency(totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Overdue</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(totalOverdue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Paid This Month</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {formatCurrency(totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Draft Invoices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{draftCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <CardTitle>All Invoices</CardTitle>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Invoice</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Client Name</label>
                      <Input placeholder="Enter client name" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Client Email</label>
                      <Input type="email" placeholder="client@example.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Issue Date</label>
                      <Input type="date" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Due Date</label>
                      <Input type="date" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Description</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Invoice description..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Amount</label>
                      <Input type="number" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Currency</label>
                      <select className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm">
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline">Cancel</Button>
                    <Button>Create Invoice</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Invoice #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const overdue = daysOverdue(inv.dueDate);
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-blue-600 cursor-pointer hover:underline">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {inv.clientName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td
                        className={`px-6 py-4 text-sm ${
                          overdue > 0
                            ? "text-red-600 font-medium"
                            : "text-slate-500"
                        }`}
                      >
                        {formatDate(inv.dueDate)}{" "}
                        {overdue > 0 && `(${overdue}d overdue)`}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-right text-slate-900">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge
                          variant="outline"
                          className={getStatusColor(inv.status)}
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-slate-400 hover:text-slate-600">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
