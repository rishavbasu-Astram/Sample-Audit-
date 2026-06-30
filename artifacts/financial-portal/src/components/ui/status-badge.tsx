import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let colorClass = "";

  switch (normalizedStatus) {
    case "draft":
    case "cancelled":
    case "inactive":
      variant = "secondary";
      colorClass = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      break;
    case "sent":
    case "pending":
    case "approved":
    case "active":
      variant = "default";
      colorClass = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      break;
    case "paid":
      variant = "default";
      colorClass = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      break;
    case "overdue":
      variant = "destructive";
      break;
    default:
      variant = "outline";
  }

  return (
    <Badge variant={variant} className={cn("capitalize font-medium", colorClass, className)}>
      {status}
    </Badge>
  );
}
