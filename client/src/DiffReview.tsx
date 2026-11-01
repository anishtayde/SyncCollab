import { useEffect, useRef, useState } from "react";
import { api, getToken } from "./api";

interface DiffLine {
  type: "add" | "del" | "context";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}
interface DiffHunk {
  header: string;
  lines: DiffLine[];
}
interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}
interface ParseResult {
  files: DiffFile[];
  summary: { files: number; additions: number; deletions: number };
}

interface Finding {
  key: string;
  path: string;
  line: number;
  severity: "High" | "Medium" | "Low";
  title: string;
  body: string;
}
type Block = { kind: "finding"; finding: Finding } | { kind: "text"; text: string };

const BG = { add: "#e6ffec", del: "#ffebe9", context: "transparent" };
const SIGN = { add: "+", del: "-", context: " " };
const SEVERITY_BG = { High: "#ffebe9", Medium: "#fff8c5", Low: "#ddf4ff" };
const SEVERITY_BORDER = { High: "#cf222e", Medium: "#bf8700", Low: "#0969da" };

// the server runs here (same address the rest of the app talks to)
const SERVER_URL = "http://localhost:4000";

// split the streamed text into finding cards + leftover text
function parseBlocks(text: string): Block[] {
  const pieces = text.split(/\n(?=\*\*[^*\n]+:\d+\*\*)/);
  return pieces
    .map((piece, i): Block | null => {
      const m = /^\s*\*\*(.+?):(\d+)\*\*\s*\[(High|Medium|Low)\]\s*([^\n]*)\n?([\s\S]*)$/i.exec(piece);
      if (m) {
        const sev = (m[3][0].toUpperCase() + m[3].slice(1).toLowerCase()) as Finding["severity"];
        return {
          kind: "finding",
          finding: {
            key: `${i}-${m[1]}:${m[2]}`,
            path: m[1],
            line: Number(m[2]),
            severity: sev,
            title: m[4].trim(),
            body: m[5].trim(),
          },
        };
      }
      return piece.trim() ? { kind: "text", text: piece.trim() } : null;
    })
    .filter((b): b is Block => b !== null);
}

export default function DiffReview({
  roomId,
  onAddComment,
}: {
  roomId: string;
  onAddComment: (line: number, body: string) => Promise<void>;
}) {
  const [diff, setDiff] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [reviewText, setReviewText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [status, setStatus] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  // cancel any running review when leaving the page
  useEffect(() => () => abortRef.current?.abort(), []);

  async function parse(e: React.FormEvent) {
    e.preventDefault();
    if (!diff.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/rooms/${roomId}/review/parse`, {
        method: "POST",
        body: JSON.stringify({ diff }),
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runReview() {
    if (!diff.trim() || reviewing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setReviewing(true);
    setReviewText("");
    setStatus("Starting...");
    setError("");
    setAdded(new Set());

    try {
      const res = await fetch(`${SERVER_URL}/rooms/${roomId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ diff }),
        signal: controller.signal,
      });

      // validation errors come back as normal JSON, before streaming starts
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          if (!ev.startsWith("data:")) continue;
          const msg = JSON.parse(ev.slice(5).trim());
          if (msg.type === "token") setReviewText((prev) => prev + msg.text);
          else if (msg.type === "status") setStatus(msg.message);
          else if (msg.type === "error") setError(msg.message);
          else if (msg.type === "done") setStatus("Done");
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") setStatus("Stopped");
      else setError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  function stopReview() {
    abortRef.current?.abort();
  }

  async function addAsComment(f: Finding) {
    const text = `[${f.severity}] ${f.title}${f.body ? ": " + f.body : ""}`;
    try {
      await onAddComment(f.line, text.slice(0, 500));
      setAdded((prev) => new Set(prev).add(f.key));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const blocks = parseBlocks(reviewText);

  return (
    <details style={{ margin: "8px 0 12px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Review a diff</summary>
      <form onSubmit={parse} style={{ marginTop: 8 }}>
        <textarea
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          placeholder="Paste the output of `git diff` here"
          rows={8}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", padding: 6 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading || reviewing} style={{ padding: "6px 12px" }}>
            {loading ? "Parsing..." : "Parse diff"}
          </button>
          {!reviewing ? (
            <button type="button" onClick={runReview} style={{ padding: "6px 12px" }}>
              Run AI review
            </button>
          ) : (
            <button type="button" onClick={stopReview} style={{ padding: "6px 12px" }}>
              Stop
            </button>
          )}
          {status && <small style={{ alignSelf: "center" }}>{status}</small>}
        </div>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {blocks.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: "0 0 6px" }}>AI review</h4>
          {blocks.map((b, i) =>
            b.kind === "finding" ? (
              <div
                key={b.finding.key}
                style={{
                  background: SEVERITY_BG[b.finding.severity],
                  border: `1px solid ${SEVERITY_BORDER[b.finding.severity]}`,
                  color: "#1f2328",
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{b.finding.title}</strong>
                  <small>
                    {b.finding.severity} · {b.finding.path}:{b.finding.line}
                  </small>
                </div>
                <div style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontSize: 13 }}>{b.finding.body}</div>
                <button
                  onClick={() => addAsComment(b.finding)}
                  disabled={added.has(b.finding.key) || reviewing}
                >
                  {added.has(b.finding.key) ? "Comment added" : `Add as comment on line ${b.finding.line}`}
                </button>
              </div>
            ) : (
              <div key={`t${i}`} style={{ whiteSpace: "pre-wrap", fontSize: 13, marginBottom: 8 }}>
                {b.text}
              </div>
            )
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <p>
            {result.summary.files} file(s), <span style={{ color: "green" }}>+{result.summary.additions}</span>{" "}
            <span style={{ color: "crimson" }}>-{result.summary.deletions}</span>
          </p>
          {result.files.map((f) => (
            <div key={f.path} style={{ border: "1px solid #ddd", borderRadius: 6, marginBottom: 10 }}>
              <div style={{ padding: "6px 8px", background: "#f4f4f4", color: "#1f2328" }}>
                <strong>{f.path}</strong> <small>({f.status}) +{f.additions} -{f.deletions}</small>
              </div>
              <div style={{ maxHeight: 260, overflow: "auto" }}>
                {f.hunks.map((h, i) => (
                  <div key={i}>
                    <div style={{ padding: "2px 8px", color: "#6b7280", fontSize: 12 }}>{h.header}</div>
                    {h.lines.map((l, j) => (
                      <div
                        key={j}
                        style={{
                          background: BG[l.type],
                          color: "#1f2328",
                          fontFamily: "monospace",
                          fontSize: 12,
                          whiteSpace: "pre",
                          padding: "0 8px",
                        }}
                      >
                        <span style={{ display: "inline-block", width: 36, color: "#8b949e" }}>
                          {l.newLine ?? ""}
                        </span>
                        {SIGN[l.type]} {l.content}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}