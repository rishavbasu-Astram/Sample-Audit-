// ============================================================
// UTILITY FUNCTIONS
// ============================================================
// Shared helpers for formatting, validation, and calculations

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with proper precedence
 * Uses clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number as currency with locale support
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format number as percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(d);
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

/**
 * Calculate days between dates
 */
export function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days overdue (0 if not overdue)
 */
export function daysOverdue(dueDate: Date | string): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const today = new Date();
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Get Tailwind color classes for status badges
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Invoice statuses
    paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
    sent: "bg-blue-100 text-blue-800 border-blue-200",
    draft: "bg-slate-100 text-slate-800 border-slate-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
    viewed: "bg-amber-100 text-amber-800 border-amber-200",

    // Journal entry statuses
    posted: "bg-emerald-100 text-emerald-800 border-emerald-200",
    reversed: "bg-orange-100 text-orange-800 border-orange-200",

    // Compliance statuses
    compliant: "bg-emerald-100 text-emerald-800 border-emerald-200",
    non_compliant: "bg-red-100 text-red-800 border-red-200",
    partial: "bg-amber-100 text-amber-800 border-amber-200",
    not_applicable: "bg-gray-100 text-gray-500 border-gray-200",

    // Variance statuses
    favorable: "bg-emerald-100 text-emerald-800 border-emerald-200",
    unfavorable: "bg-red-100 text-red-800 border-red-200",
    on_track: "bg-blue-100 text-blue-800 border-blue-200",

    // Transaction statuses
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    cleared: "bg-blue-100 text-blue-800 border-blue-200",
    reconciled: "bg-emerald-100 text-emerald-800 border-emerald-200"
  };

  return colors[status.toLowerCase()] || "bg-slate-100 text-slate-800 border-slate-200";
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Generate a unique ID (for client-side only)
 * In production, use UUID v4 from crypto module
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Calculate percentage change
 */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Format large numbers (K, M, B)
 */
export function formatCompactNumber(number: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(number);
}
