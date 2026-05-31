// Tiny classname combiner. We deliberately don't pull in clsx/cn — keeping
// the FE dep surface as small as ADR 0115 allows.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
