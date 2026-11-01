import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import { api, clearToken, getToken } from "../api";
import { SocketProvider } from "../SocketProvider";
import { COLORS, watchCursorStyles } from "../cursors";
import DiffReview from "../DiffReview";
import { WS_URL } from "../config";

interface RoomData {
  id: string;
  name: string;
}

interface CommentItem {
  id: string;
  line: number;
  body: string;
  author: string;
  created_at: string;
}

interface SnippetResult {
  id: string;
  title: string;
  language: string;
  code: string;
  similarity: number;
}

type EditorType = Parameters<OnMount>[0];

const LANGUAGES = ["javascript", "typescript", "python", "java", "html", "css", "json"];

export default function Room() {
  const { id } = useParams();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [online, setOnline] = useState<string[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [cursorLine, setCursorLine] = useState(1);
  const [editorReady, setEditorReady] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<SnippetResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<EditorType | null>(null);
  const decorationsRef = useRef<ReturnType<EditorType["createDecorationsCollection"]> | null>(
    null
  );
  const navigate = useNavigate();

  // add a comment, ignoring duplicates (we may get it from both the POST and the broadcast)
  function addComment(c: CommentItem) {
    setComments((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
  }

  useEffect(() => {
    api(`/rooms/${id}`)
      .then((data) => setRoom(data.room))
      .catch((err: Error) => {
        if (err.message.includes("token")) {
          clearToken();
          navigate("/login");
        } else {
          setError(err.message);
        }
      });
  }, [id, navigate]);

  useEffect(() => {
    api(`/rooms/${id}/comments`)
      .then((d) => setComments(d.comments))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  useEffect(() => {
    const load = () =>
      api(`/rooms/${id}/presence`)
        .then((d) => setOnline(d.online))
        .catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [id]);

  // draw a yellow marker next to every line that has a comment
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorReady) return;
    if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection();
    const lines = [...new Set(comments.map((c) => c.line))];
    decorationsRef.current.set(
      lines.map((l) => ({
        range: { startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 },
        options: { glyphMarginClassName: "comment-glyph" },
      }))
    );
  }, [comments, editorReady]);

  const handleMount: OnMount = (editor) => {
    cleanupRef.current?.();
    editorRef.current = editor;
    decorationsRef.current = null;
    setEditorReady(true);

    editor.onDidChangeCursorPosition((e) => setCursorLine(e.position.lineNumber));

    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const color = COLORS[doc.clientID % COLORS.length];

    awareness.setLocalStateField("user", { name: "Guest", color });
    api("/auth/me")
      .then((data) => {
        const name = (data.user.email as string).split("@")[0];
        awareness.setLocalStateField("user", { name, color });
      })
      .catch(() => {});

    const stopStyles = watchCursorStyles(awareness);
    const provider = new SocketProvider(
      `${WS_URL}/ws?room=${id}&token=${getToken()}`,
      doc,
      awareness,
      (msg) => {
        if (msg.type === "comment") addComment(msg.comment);
      }
    );
    const binding = new MonacoBinding(
      doc.getText("code"),
      editor.getModel()!,
      new Set([editor]),
      awareness
    );

    cleanupRef.current = () => {
      binding.destroy();
      provider.destroy();
      stopStyles();
      awareness.destroy();
      doc.destroy();
    };
  };

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const data = await api(`/rooms/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ line: cursorLine, body: commentText }),
      });
      addComment(data.comment);
      setCommentText("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // used by the AI review: turn a finding into an inline comment
  async function commentOnLine(line: number, body: string) {
    const data = await api(`/rooms/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ line, body }),
    });
    addComment(data.comment);
  }

  async function saveSnippet() {
    const code = editorRef.current?.getValue() ?? "";
    if (!code.trim()) {
      setNotice("Write some code first");
      return;
    }
    const title = window.prompt("Snippet title?");
    if (!title || !title.trim()) return;
    setNotice("Saving...");
    try {
      await api(`/rooms/${id}/snippets`, {
        method: "POST",
        body: JSON.stringify({ title, language, code }),
      });
      setNotice("Snippet saved!");
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    setNotice("");
    try {
      const data = await api(`/rooms/${id}/snippets/search?q=${encodeURIComponent(searchText)}`);
      setResults(data.results);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  // put a snippet's code into the editor at the cursor
  function insertSnippet(code: string) {
    const editor = editorRef.current;
    const pos = editor?.getPosition();
    if (!editor || !pos) return;
    editor.executeEdits("snippet-insert", [
      {
        range: {
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        },
        text: code + "\n",
      },
    ]);
    editor.focus();
  }

  function jumpToLine(line: number) {
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
    editorRef.current?.focus();
  }

  return (
    <div className="container">
      <Link to="/" className="back-link">
        ← Back to rooms
      </Link>
      {error && <p className="error-text">{error}</p>}
      {room && (
        <>
          <div className="room-header">
            <div>
              <h2>{room.name}</h2>
              <div className="chips">
                <span className="muted">Online</span>
                {online.length === 0 ? (
                  <span className="muted">–</span>
                ) : (
                  online.map((name, i) => (
                    <span key={`${name}-${i}`} className="chip">
                      <span className="dot" />
                      {name}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="toolbar">
              {notice && <span className="notice">{notice}</span>}
              <button onClick={saveSnippet}>Save as snippet</button>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <DiffReview roomId={id!} onAddComment={commentOnLine} />
          </div>

          <div className="workspace">
            <div className="editor-wrap">
              <Editor
                height="70vh"
                theme="vs-dark"
                language={language}
                defaultValue=""
                onMount={handleMount}
                options={{
                  fontSize: 14,
                  minimap: { enabled: false },
                  glyphMargin: true,
                  padding: { top: 12 },
                  scrollBeyondLastLine: false,
                }}
              />
            </div>

            <aside className="sidebar">
              <div className="panel">
                <h3 className="panel-title">Search snippets</h3>
                <form onSubmit={runSearch} className="search-form">
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="e.g. check user credentials"
                    maxLength={300}
                  />
                  <button type="submit" className="primary" disabled={searching}>
                    {searching ? "..." : "Search"}
                  </button>
                </form>
                {results && results.length === 0 && (
                  <p className="muted" style={{ marginTop: 10 }}>
                    No snippets saved in this room yet.
                  </p>
                )}
                {results?.map((r) => (
                  <div key={r.id} className="result">
                    <div className="result-head">
                      <strong>{r.title}</strong>
                      <span className="badge">{Math.round(r.similarity * 100)}% match</span>
                    </div>
                    <span className="muted">{r.language}</span>
                    <pre className="code-preview">{r.code}</pre>
                    <button onClick={() => insertSnippet(r.code)} style={{ width: "100%" }}>
                      Insert at cursor
                    </button>
                  </div>
                ))}
              </div>

              <div className="panel">
                <h3 className="panel-title">Comments</h3>
                {comments.length === 0 && <p className="muted">No comments yet.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="comment-item" onClick={() => jumpToLine(c.line)}>
                    <div className="comment-meta">
                      <span className="avatar">{c.author.charAt(0).toUpperCase()}</span>
                      <span>
                        {c.author.split("@")[0]} · line {c.line}
                      </span>
                    </div>
                    <div>{c.body}</div>
                  </div>
                ))}
                <form onSubmit={postComment} className="comment-form">
                  <span className="muted">Comment on line {cursorLine}</span>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Write a comment..."
                  />
                  <button type="submit" className="primary">
                    Add comment
                  </button>
                </form>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}