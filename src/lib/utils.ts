// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { User } from "@supabase/supabase-js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Marker suffix used for the internal placeholder email generated when a
 * student/parent is registered without a real email address (see
 * create_school_user in supabase/migrations). Never shown to the user.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "@no-email.academiahq.pro";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

/** Full name stored on the account at signup — used for greetings across dashboards. */
export function getFullName(user: User | null | undefined): string {
  const fullName = (user?.user_metadata as any)?.full_name;
  return typeof fullName === "string" ? fullName.trim() : "";
}

/** First name for a friendly greeting, falling back to email or "there". */
export function getFirstName(user: User | null | undefined): string {
  const fullName = getFullName(user);
  if (fullName) return fullName.split(/\s+/)[0];
  const email = user?.email;
  if (email && !isPlaceholderEmail(email)) return email.split("@")[0];
  return "there";
}
