import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground font-medium pr-2 border-r">
            Fiscal Year 2024
          </div>
          <div className="text-sm font-medium pl-2">
            Acme Corp
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto bg-gray-50/30 dark:bg-zinc-950/30">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
