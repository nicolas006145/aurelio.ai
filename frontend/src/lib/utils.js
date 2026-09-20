import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function formatCurrencyBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatDateBR(iso) {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
