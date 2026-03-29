import { useNetwork } from "../lib/NetworkContext";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LLM_PROVIDERS } from "../hooks/useCredentials";

interface AiResponse {
  nlog_data: string;
  advice: string;
  token_count: number;
  provider: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  nlogData?: string;
  tokens?: number;
}

const QUICK_PROMPTS = [
  { label: "📊 Analyze My Week", prompt: "Analyze my nutrition for the past week. What am I doing well and what should I improve?" },
  { label: "🥗 Suggest Improvements", prompt: "Based on my recent meals, suggest specific foods I should add or reduce in my diet." },
  { label: "⚖️ Macro Balance", prompt: "Am I getting the right balance of protein, carbs, and fats? Give me actionable advice." },
  { label: "🔍 Today's Review", prompt: "Review what I ate today. How can I make tomorrow better?" },
];

export default function AiAdvisor() {
  const { isOnline } = useNetwork();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNlog, setShowNlog] = useState<number | null>(null);

  // Read selected provider from localStorage (set in Settings)
  const selectedProvider = localStorage.getItem("nutrilog_ai_provider") || "ollama";
  const providerConfig = LLM_PROVIDERS.find((p) => p.id === selectedProvider) || LLM_PROVIDERS[0];

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const contextualQuestion = `(System Context: Today is ${today}. Only reference items matching this context if the user asks about today or specific dates.)\n\nUser Question: ${question.trim()}`;

      const result = await invoke<AiResponse>("get_ai_advice", {
        question: contextualQuestion,
        days: 7,
        provider: selectedProvider,
      });

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: result.advice,
        nlogData: result.nlog_data,
        tokens: result.token_count,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg = e?.toString() ?? "Failed to get AI advice";
      setError(errMsg);

      // Provider-aware error help
      let helpText = errMsg;
      if (selectedProvider === "ollama") {
        helpText += "\n\nMake sure Ollama is running locally:\n```\nollama serve\nollama pull llama3.2\n```";
      } else {
        helpText += `\n\nCheck that your ${providerConfig.name} API key is configured correctly in Settings → AI Provider Configuration.`;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${helpText}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      {!isOnline && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(255, 180, 0, 0.3)",
            background: "rgba(255, 180, 0, 0.06)",
          }}
        >
          <div style={{ fontWeight: 600 }}>You're offline</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>
            AI nutrition advice requires an internet connection. Connect to the
            network, then come back.
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>🤖 AI Nutrition Advisor</div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted2)" }}>
          Powered by {providerConfig.name}.
          {selectedProvider === "ollama"
            ? " Your data never leaves your device."
            : " Meal data is sent securely to the provider for analysis."}
          {" "}Ask questions about your nutrition and get personalized advice.
        </div>
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              onClick={() => sendQuestion(qp.prompt)}
              disabled={loading}
              style={quickBtnStyle}
            >
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      {messages.map((msg, i) => (
        <div
          key={i}
          className="card"
          style={{
            borderLeft: msg.role === "assistant"
              ? "3px solid rgba(124,92,255,0.5)"
              : "3px solid rgba(0,209,255,0.4)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted2)", marginBottom: 6, fontWeight: 600 }}>
            {msg.role === "user" ? "You" : "NutriLog AI"}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {msg.content}
          </div>

          {/* .nlog data toggle */}
          {msg.nlogData && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setShowNlog(showNlog === i ? null : i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted2)",
                  fontSize: 11,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                {showNlog === i ? "Hide .nlog data" : "Show .nlog data sent to AI"}
              </button>
              {showNlog === i && (
                <pre
                  style={{
                    marginTop: 6,
                    padding: 10,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.3)",
                    fontSize: 11,
                    overflow: "auto",
                    maxHeight: 200,
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {msg.nlogData}
                </pre>
              )}
            </div>
          )}

          {msg.tokens && msg.tokens > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted2)" }}>
              {msg.tokens} tokens used
            </div>
          )}
        </div>
      ))}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ borderLeft: "3px solid rgba(124,92,255,0.5)" }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            🔄 Analyzing your nutrition data…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card" style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
          <div style={{ fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Input */}
      <div className="card" style={{ position: "sticky", bottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your nutrition…"
            rows={2}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--text)",
              resize: "none",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => sendQuestion(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid rgba(124,92,255,0.35)",
              background: "linear-gradient(135deg, rgba(124,92,255,0.25), rgba(0,209,255,0.10))",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              alignSelf: "end",
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

const quickBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(124,92,255,0.3)",
  background: "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(0,209,255,0.08))",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};