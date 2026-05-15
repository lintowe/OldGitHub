export type DiffLine =
  | { kind: "context"; old: number; new: number; text: string }
  | { kind: "add"; new: number; text: string }
  | { kind: "del"; old: number; text: string }
  | { kind: "no-newline"; text: string };

export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
};

export type DiffFile = {
  path: string;
  oldPath: string;
  newPath: string;
  status: "added" | "deleted" | "modified" | "renamed" | "binary";
  oldMode: string | null;
  newMode: string | null;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
  binaryNote: string | null;
};

export function parseUnifiedDiff(raw: string): DiffFile[] {
  const lines = raw.split("\n");
  const files: DiffFile[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("diff --git")) {
      i++;
      continue;
    }
    const file = parseFileHeader(lines, i);
    if (!file) {
      i++;
      continue;
    }
    i = file.next;
    file.entry.hunks = parseHunks(lines, file.entry, () => i, (n) => (i = n));
    files.push(file.entry);
  }
  return files;
}

type FileHeaderResult = { entry: DiffFile; next: number };

function parseFileHeader(lines: string[], start: number): FileHeaderResult | null {
  const head = lines[start];
  if (!head) return null;
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(head);
  const oldPath = m?.[1] ?? "";
  const newPath = m?.[2] ?? "";
  const entry: DiffFile = {
    path: newPath || oldPath,
    oldPath,
    newPath,
    status: "modified",
    oldMode: null,
    newMode: null,
    hunks: [],
    additions: 0,
    deletions: 0,
    isBinary: false,
    binaryNote: null,
  };

  let i = start + 1;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.startsWith("@@") || l.startsWith("diff --git")) break;

    if (l.startsWith("new file mode ")) {
      entry.status = "added";
      entry.newMode = l.slice("new file mode ".length).trim();
    } else if (l.startsWith("deleted file mode ")) {
      entry.status = "deleted";
      entry.oldMode = l.slice("deleted file mode ".length).trim();
    } else if (l.startsWith("rename from ")) {
      entry.status = "renamed";
    } else if (l.startsWith("rename to ")) {
      // status already set
    } else if (l.startsWith("Binary files ")) {
      entry.status = "binary";
      entry.isBinary = true;
      entry.binaryNote = l;
    } else if (l.startsWith("--- ")) {
      if (l === "--- /dev/null") entry.status = "added";
    } else if (l.startsWith("+++ ")) {
      if (l === "+++ /dev/null") entry.status = "deleted";
    }
    i++;
  }

  return { entry, next: i };
}

function parseHunks(
  lines: string[],
  file: DiffFile,
  getI: () => number,
  setI: (n: number) => void,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  while (getI() < lines.length) {
    const line = lines[getI()]!;
    if (line.startsWith("diff --git")) break;
    if (!line.startsWith("@@")) {
      setI(getI() + 1);
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (!m) {
      setI(getI() + 1);
      continue;
    }
    const oldStart = parseInt(m[1]!, 10);
    const oldLines = m[2] != null ? parseInt(m[2], 10) : 1;
    const newStart = parseInt(m[3]!, 10);
    const newLines = m[4] != null ? parseInt(m[4], 10) : 1;
    const header = (m[5] ?? "").trim();

    const hunk: DiffHunk = {
      oldStart,
      oldLines,
      newStart,
      newLines,
      header,
      lines: [],
    };
    setI(getI() + 1);

    let oldNo = oldStart;
    let newNo = newStart;
    while (getI() < lines.length) {
      const l = lines[getI()]!;
      if (l.startsWith("diff --git") || l.startsWith("@@")) break;
      if (l.startsWith("\\")) {
        hunk.lines.push({ kind: "no-newline", text: l });
        setI(getI() + 1);
        continue;
      }
      const prefix = l[0] ?? " ";
      const text = l.slice(1);
      if (prefix === "+") {
        hunk.lines.push({ kind: "add", new: newNo, text });
        newNo++;
        file.additions++;
      } else if (prefix === "-") {
        hunk.lines.push({ kind: "del", old: oldNo, text });
        oldNo++;
        file.deletions++;
      } else if (prefix === " ") {
        hunk.lines.push({ kind: "context", old: oldNo, new: newNo, text });
        oldNo++;
        newNo++;
      } else {
        break;
      }
      setI(getI() + 1);
    }
    hunks.push(hunk);
  }
  return hunks;
}
