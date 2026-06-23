import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Omit an empty list from a query (undefined = "no filter").
export function nonEmpty<T>(a: T[]): T[] | undefined {
  return a.length > 0 ? a : undefined
}

// Comma-join a list for a flat query param, or undefined when empty.
export function toCsv(a: string[]): string | undefined {
  return a.length > 0 ? a.join(",") : undefined
}
