export type DiffPart = { value: string; type: "same" | "add" | "del" };

// Word-level diff (LCS) for the before→after bullet view. Tokenizes on
// whitespace, keeping the separators so re-joining is faithful.
export function wordDiff(a: string, b: string): DiffPart[] {
  const at = tokenize(a);
  const bt = tokenize(b);
  const n = at.length;
  const m = bt.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = at[i] === bt[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (at[i] === bt[j]) {
      push(out, "same", at[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(out, "del", at[i]);
      i++;
    } else {
      push(out, "add", bt[j]);
      j++;
    }
  }
  while (i < n) push(out, "del", at[i++]);
  while (j < m) push(out, "add", bt[j++]);
  return out;
}

function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

function push(out: DiffPart[], type: DiffPart["type"], value: string): void {
  const last = out[out.length - 1];
  if (last && last.type === type) last.value += value;
  else out.push({ value, type });
}
