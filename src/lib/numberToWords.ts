// src/lib/numberToWords.ts
// Converts a money amount into words for receipts, e.g.
//   50000    -> "Fifty Thousand Naira Only"
//   1250.5   -> "One Thousand, Two Hundred and Fifty Naira, Fifty Kobo Only"

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** 1..999 -> words (British style: "One Hundred and Five"). */
function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    if (hundreds) parts.push("and");
    if (rest < 20) parts.push(ONES[rest]);
    else parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  }
  return parts.join(" ");
}

/** Whole number -> words. */
export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "Zero";

  const groups: number[] = [];
  let remaining = Math.floor(n);
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  if (groups.length > SCALES.length) return String(n); // beyond trillions: don't guess

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    let chunk = belowThousand(g);
    if (SCALES[i]) chunk += ` ${SCALES[i]}`;
    // "One Thousand and Fifty" — "and" before a final group that is under 100
    if (i === 0 && groups.length > 1 && g < 100) chunk = `and ${chunk}`;
    words.push(chunk);
  }
  return words.join(", ").replace(", and ", " and ");
}

/** Money amount in Naira (with kobo) -> words, ending in "Only". */
export function amountToWords(amount: number): string {
  const totalKobo = Math.round((Number(amount) || 0) * 100);
  const naira = Math.floor(totalKobo / 100);
  const kobo = totalKobo % 100;

  const nairaPart = `${integerToWords(naira)} Naira`;
  if (!kobo) return `${nairaPart} Only`;
  return `${nairaPart}, ${integerToWords(kobo)} Kobo Only`;
}
