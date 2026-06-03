// 2013 GitHub abbreviated counts: lowercase k/m (e.g. 12.3k, 1.2m). Shared so
// every surface renders the same magnitude identically.
export function formatCount(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1_000) return String(n);
  const m = n >= 1_000_000;
  const value = n / (m ? 1_000_000 : 1_000);
  let str = value < 10 ? value.toFixed(1) : value.toFixed(0);
  if (str.endsWith(".0")) str = str.slice(0, -2);
  // 999_600 rounds to "1000" in the k tier — promote instead of emitting "1000k"
  if (str === "1000") return m ? "1b" : "1m";
  return `${str}${m ? "m" : "k"}`;
}
