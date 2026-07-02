import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Box,
  ShoppingCart,
  Users,
  FileText,
  FileBox,
  Receipt,
  Repeat,
  Link as LinkIcon,
  CreditCard,
  Building2,
  Store,
  Wallet,
  ShoppingBag,
  FileDigit,
  Landmark,
  BookOpen,
  PieChart,
  Target,
  Banknote,
  Calculator,
  Lock,
  Gauge,
  Network,
  Boxes,
  TrendingUp,
  Bell,
  Package,
  Percent,
  BarChart3,
  ShieldCheck
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();

  const navigation = [
    {
      title: "Overview",
      items: [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Assets", url: "/assets", icon: Box },
      ]
    },
    {
      title: "Inventory",
      items: [
        { title: "Items", url: "/items", icon: Package },
      ]
    },
    {
      title: "Sales",
      icon: ShoppingCart,
      items: [
        { title: "Customers", url: "/sales/customers", icon: Users },
        { title: "Quotes", url: "/sales/quotes", icon: FileText },
        { title: "Sales Orders", url: "/sales/sales-orders", icon: FileBox },
        { title: "Invoices", url: "/sales/invoices", icon: Receipt },
        { title: "Sales Receipts", url: "/sales/sales-receipts", icon: Receipt },
        { title: "Recurring Invoices", url: "/sales/recurring-invoices", icon: Repeat },
        { title: "Payment Links", url: "/sales/payment-links", icon: LinkIcon },
        { title: "Payments Received", url: "/sales/payments-received", icon: CreditCard },
        { title: "Credit Notes", url: "/sales/credit-notes", icon: FileDigit },
      ]
    },
    {
      title: "Purchases",
      icon: ShoppingBag,
      items: [
        { title: "Vendors", url: "/purchases/vendors", icon: Store },
        { title: "Expenses", url: "/purchases/expenses", icon: Wallet },
        { title: "Recurring Expenses", url: "/purchases/recurring-expenses", icon: Repeat },
        { title: "Purchase Orders", url: "/purchases/purchase-orders", icon: FileBox },
        { title: "Bills", url: "/purchases/bills", icon: FileText },
        { title: "Recurring Bills", url: "/purchases/recurring-bills", icon: Repeat },
        { title: "Payments Made", url: "/purchases/payments-made", icon: CreditCard },
        { title: "Vendor Credits", url: "/purchases/vendor-credits", icon: FileDigit },
      ]
    },
    {
      title: "Banking",
      items: [
        { title: "Accounts & Transactions", url: "/banking", icon: Landmark },
      ]
    },
    {
      title: "Accountant",
      icon: BookOpen,
      items: [
        { title: "Journals", url: "/accountant/journals", icon: BookOpen },
        { title: "Chart of Accounts", url: "/accountant/chart-of-accounts", icon: PieChart },
        { title: "Budgets", url: "/accountant/budgets", icon: Target },
        { title: "VAT Payments", url: "/accountant/vat-payments", icon: Banknote },
        { title: "Currency Adjustments", url: "/accountant/currency-adjustments", icon: Calculator },
        { title: "Transaction Locking", url: "/accountant/transaction-locking", icon: Lock },
        { title: "Tax Rates", url: "/accountant/tax-rates", icon: Percent },
      ]
    },
    {
      title: "Controlling",
      icon: Gauge,
      items: [
        { title: "Cost Centers", url: "/controlling/cost-centers", icon: Network },
        { title: "Product Costs", url: "/controlling/product-costs", icon: Boxes },
        { title: "Profitability", url: "/controlling/profitability", icon: TrendingUp },
      ]
    },
    {
      title: "Automation",
      icon: Repeat,
      items: [
        { title: "Recurring Profiles", url: "/automation/recurring-profiles", icon: Repeat },
        { title: "Payment Reminders", url: "/automation/payment-reminders", icon: Bell },
      ]
    },
    {
      title: "Reports",
      items: [
        { title: "Financial Reports", url: "/reports/financial", icon: BarChart3 },
      ]
    },
    {
      title: "Security",
      items: [
        { title: "Audit Ledger", url: "/audit/ledger", icon: ShieldCheck },
      ]
    }
  ];

  return (
    <Sidebar>
      <SidebarHeader className="py-4 px-4 border-b">
        <Link
          href="/"
          aria-label="Astram — Dashboard"
          className="block rounded-md bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow"
        >
          <img
            src="/astram-logo.png"
            alt="Astram — Excellence, Integrity, Compliance, Sustainable Growth"
            className="h-auto w-full select-none"
            draggable={false}
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
