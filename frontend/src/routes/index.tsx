import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NutriLens — AI food & nutrition analyzer" },
      { name: "description", content: "Snap a photo of your meal and get instant calorie, protein and fat breakdowns powered by AI." },
      { property: "og:title", content: "NutriLens — AI food & nutrition analyzer" },
      { property: "og:description", content: "Snap a photo of your meal and get instant calorie, protein and fat breakdowns powered by AI." },
    ],
  }),
  component: Index,
});

type ChatMsg =
  | { kind: "status"; text: string }
  | { kind: "question"; question: string; uncertainties: string }
  | { kind: "answer"; text: string }
  | { kind: "result"; text: string }
  | { kind: "segments"; data: any }
  | { kind: "error"; text: string };

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8000/evaluate";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      // strip "data:...;base64," prefix
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Index() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [plateDiameter, setPlateDiameter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<null | { question: string; uncertainties: string }>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const append = (m: ChatMsg) => setMessages((prev) => [...prev, m]);

  const onPickImage = async (f: File | null) => {
    setImageFile(f);
    if (!f) return setImagePreview(null);
    const url = URL.createObjectURL(f);
    setImagePreview(url);
  };

  const reset = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setRunning(false);
    setMessages([]);
    setPendingQuestion(null);
    setAnswerDraft("");
  };

  const submit = useCallback(async () => {
    if (running) return;
    if (!imageFile && !query.trim()) {
      append({ kind: "error", text: "Provide an image or a question to begin." });
      return;
    }
    setMessages([]);
    setPendingQuestion(null);
    setRunning(true);

    try {
      const img = imageFile ? await fileToBase64(imageFile) : null;
      const payload: Record<string, unknown> = {};
      if (img) payload.img = img;
      if (plateDiameter) payload.plate_diameter = Number(plateDiameter);
      if (query.trim()) payload.query = query.trim();

      append({ kind: "status", text: "Connecting to analyzer…" });
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        append({ kind: "status", text: "Analyzing your meal…" });
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (ev) => {
        let data: any;
        try { data = JSON.parse(ev.data); } catch { return; }

        if (data.error) {
          append({ kind: "error", text: data.error });
          return;
        }
        if (data.type === "error") {
          append({ kind: "error", text: data.message || "Server error" });
          return;
        }
        if (data.type === "question") {
          const q = { question: data.question || "", uncertainties: data.uncertainities || data.uncertainties || "" };
          setPendingQuestion(q);
          append({ kind: "question", ...q });
          return;
        }
        if (data.type === "result") {
          append({ kind: "result", text: data.answer || "" });
          return;
        }
        if (data.segments) {
          append({ kind: "segments", data });
          return;
        }
      };

      ws.onerror = () => append({ kind: "error", text: "WebSocket connection error. Make sure the backend is running." });
      ws.onclose = () => {
        setRunning(false);
        setPendingQuestion(null);
      };
    } catch (e: any) {
      append({ kind: "error", text: e?.message || "Failed to start session" });
      setRunning(false);
    }
  }, [imageFile, plateDiameter, query, running]);

  const sendAnswer = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const a = answerDraft.trim();
    if (!a) return;
    wsRef.current.send(JSON.stringify({ answer: a }));
    append({ kind: "answer", text: a });
    setPendingQuestion(null);
    setAnswerDraft("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero header */}
      <header className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl opacity-60"
          style={{ background: "var(--gradient-warm)" }}
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3 text-primary-foreground">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-xl backdrop-blur">🥗</div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">NutriLens</h1>
              <p className="text-xs text-primary-foreground/80">AI food & nutrition analyzer</p>
            </div>
          </div>
        </div>
        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-2 text-primary-foreground">
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight md:text-5xl">
            Snap your plate.<br />Know what's on it.
          </h2>
          <p className="mt-3 max-w-xl text-primary-foreground/90">
            Upload a meal photo and ask anything — we'll segment ingredients, estimate volume, and break down calories, protein and fat in real time.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-5">
        {/* Input panel */}
        <section
          className="lg:col-span-2 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <h3 className="text-lg font-semibold">Your meal</h3>
          <p className="text-sm text-muted-foreground">Add a photo, optional plate size, and any question.</p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium">Food image</span>
            <div className="group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-secondary/40 transition hover:border-primary/60">
              {imagePreview ? (
                <img src={imagePreview} alt="Selected meal" className="h-full w-full object-cover" />
              ) : (
                <div className="px-4 text-center">
                  <div className="text-4xl">📷</div>
                  <div className="mt-2 text-sm text-muted-foreground">Click to upload or drop an image</div>
                  <div className="text-xs text-muted-foreground/80">JPG, PNG · up to ~10MB</div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium">Plate diameter (cm) <span className="text-muted-foreground">— optional</span></span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={plateDiameter}
              onChange={(e) => setPlateDiameter(e.target.value)}
              placeholder="e.g. 26"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium">Question <span className="text-muted-foreground">— optional</span></span>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="How many calories? Is this keto-friendly?"
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="mt-5 flex gap-2">
            <button
              onClick={submit}
              disabled={running}
              className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:opacity-60"
              style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
            >
              {running ? "Analyzing…" : "Analyze meal"}
            </button>
            <button
              onClick={reset}
              disabled={!running && messages.length === 0}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-secondary disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Conversation / results */}
        <section
          className="lg:col-span-3 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <h3 className="text-lg font-semibold">Analysis</h3>
          <p className="text-sm text-muted-foreground">Live updates from the AI agents.</p>

          <div className="mt-4 flex max-h-[60vh] min-h-[320px] flex-col gap-3 overflow-y-auto pr-1">
            {messages.length === 0 && !running && (
              <EmptyState />
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}

            {running && !pendingQuestion && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                Working…
              </div>
            )}
          </div>

          {pendingQuestion && (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-accent-foreground/80">Clarification needed</div>
              <div className="mt-1 text-sm font-medium">{pendingQuestion.question}</div>
              <div className="mt-3 flex gap-2">
                <input
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
                  placeholder="Your answer…"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={sendAnswer}
                  className="rounded-md px-4 py-2 text-sm font-semibold text-primary-foreground"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Made By Rudra In Finding Of Love...❤️
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center py-12 text-center">
      <div className="text-5xl">🍽️</div>
      <div className="mt-3 text-sm font-medium">Ready when you are</div>
      <div className="text-xs text-muted-foreground">Upload a meal image and hit Analyze.</div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  if (msg.kind === "status") {
    return <div className="text-xs uppercase tracking-wide text-muted-foreground">• {msg.text}</div>;
  }
  if (msg.kind === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {msg.text}
      </div>
    );
  }
  if (msg.kind === "question") {
    return (
      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
        <div className="font-medium">🤔 {msg.question}</div>
        {msg.uncertainties && (
          <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{msg.uncertainties}</div>
        )}
      </div>
    );
  }
  if (msg.kind === "answer") {
    return (
      <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {msg.text}
      </div>
    );
  }
  if (msg.kind === "segments") {
    const segments: any[] = msg.data?.segments || [];
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-2 text-sm font-semibold">Detected items</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {segments.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="font-medium capitalize">{s.food_name || "Item"}</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {s.volume_ml != null && <div>Vol: <span className="text-foreground">{Number(s.volume_ml).toFixed(1)} ml</span></div>}
                {s.weight_g != null && <div>Wt: <span className="text-foreground">{Number(s.weight_g).toFixed(1)} g</span></div>}
                {s.calories != null && <div>Cal: <span className="text-foreground">{Number(s.calories).toFixed(0)} kcal</span></div>}
                {s.protein != null && <div>Protein: <span className="text-foreground">{Number(s.protein).toFixed(1)} g</span></div>}
                {s.fat != null && <div>Fat: <span className="text-foreground">{Number(s.fat).toFixed(1)} g</span></div>}
                {s.confidence != null && <div>Conf: <span className="text-foreground">{Math.round(Number(s.confidence) * 100)}%</span></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // result
  return (
    <div
      className="rounded-xl p-4 text-sm text-primary-foreground"
      style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
    >
      <div className="mb-1 text-xs uppercase tracking-wide opacity-80">Result</div>
      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
    </div>
  );
}
