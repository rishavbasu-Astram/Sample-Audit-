"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: "up" | "down" | "neutral";
  target?: number;
  unit: "currency" | "percentage" | "ratio" | "count";
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
}

export function KPICard({
  title,
  value,
  changePercent,
  trend,
  unit,
  icon: Icon,
  iconColor = "text-blue-600",
  iconBgColor = "bg-blue-50",
}: KPICardProps) {
  const formatValue = () => {
    switch (unit) {
      case "currency":
        return formatCurrency(value);
      case "percentage":
        return `${value.toFixed(1)}%`;
      case "ratio":
        return value.toFixed(1);
      case "count":
        return value.toString();
      default:
        return value.toString();
    }
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600 bg-emerald-50" : trend === "down" ? "text-red-600 bg-red-50" : "text-slate-600 bg-slate-50";

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-2 rounded-lg", iconBgColor)}>
            <Icon className={cn("w-5 h-5", iconColor)} />
          </div>
          <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", trendColor)}>
            <TrendIcon className="w-3 h-3" />
            {Math.abs(changePercent).toFixed(1)}%
          </div>
        </div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{formatValue()}</p>
      </CardContent>
    </Card>
  );
}
