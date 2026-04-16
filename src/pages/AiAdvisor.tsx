import { useNetwork } from "../lib/NetworkContext";
import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LLM_PROVIDERS } from "../hooks/useCredentials";
import { useAiConfig } from "../hooks/useAiConfig";
import { createEntry } from "../lib/foodLogStore";
import { loadProfile } from "../lib/profileStore";
import ReactMarkdown from "react-markdown";
import "../styles/ai-advisor.css";

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
  { label: "📊 Weekly Digest", prompt: "Generate my Weekly Nutrition Report Card. Include: (1) daily average macros vs my targets, (2) best and worst days this week, (3) consistency patterns like meal skipping or late-night eating, (4) my top 3 action items for next week. Set context to Last 7 Days." },
  { label: "❓ Simulate a Meal", prompt: "I'm thinking about eating a Big Mac for lunch. Simulate the macros for me and tell me how it affects my daily limits." },
  { label: "📅 Plan Tomorrow", prompt: "Based on my macro deficits, generate a healthy 3-meal plan for tomorrow and automatically log it into my diary." },
  { label: "🛒 Build Grocery List", prompt: "Look at my diet and suggest 3 ingredients I should buy to improve my nutrition, then add them to my grocery list." },
  { label: "🔍 Audit This", prompt: "Audit the ingredients in a standard Protein Bar. Tell me if it's healthy." },
];

export default function AiAdvisor() {
  const { isOnline } = useNetwork();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNlog, setShowNlog] = useState<number | null>(null);
  const [contextDays, setContextDays] = useState<number>(7);
  const [goal, setGoal] = useState<string>(() => localStorage.getItem('nutrilog_goal') || 'maintenance');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const [groceryList, setGroceryList] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nutrilog_grocery') || '[]'); } 
    catch { return []; }
  });

  function addGroceryItem(item: string) {
    setGroceryList(prev => {
      if (prev.find((p) => p.toLowerCase() === item.toLowerCase())) return prev;
      const next = [...prev, item];
      localStorage.setItem('nutrilog_grocery', JSON.stringify(next));
      return next;
    });
  }

  function removeGroceryItem(item: string) {
    setGroceryList(prev => {
      const next = prev.filter(i => i !== item);
      localStorage.setItem('nutrilog_grocery', JSON.stringify(next));
      return next;
    });
  }

  const aiCfg = useAiConfig();

  // Read selected provider from backend config
  const selectedProvider = aiCfg.config?.selectedProvider || "ollama";
  const providerConfig = LLM_PROVIDERS.find((p) => p.id === selectedProvider) || LLM_PROVIDERS[0];
  const selectedModel = aiCfg.selectedModel(selectedProvider);

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Load the user's profile for personalized targets
      const profile = await loadProfile();
      let profileContext = '';
      if (profile) {
        const goal = localStorage.getItem('nutrilog_goal') || 'maintenance';
        profileContext = `User Profile: ${profile.sex}, ${profile.age} years old, ${profile.heightCm}cm, ${profile.weightKg}kg, activity level: ${profile.activityLevel}, goal: ${goal}.`;
      }

      const contextualQuestion = `${profileContext ? profileContext + '\n' : ''}(System Context: Today is ${today}.)\n\nUser Question: ${question.trim()}`;

      const historyPayload = messages.map(m => ({ role: m.role, content: m.content })).slice(-6);

      const result = await invoke<AiResponse>("get_ai_advice", {
        question: contextualQuestion,
        days: contextDays,
        provider: selectedProvider,
        model: selectedModel || null,
        history: historyPayload,
        offsetMinutes: new Date().getTimezoneOffset(),
      });

      let finalAdvice = result.advice;

      // Intercept Frontend WRITE Actions from the AI safely
      const writeRegex = /\[FRONTEND_ACTION:\s*log_food\((.*?)\)\]/g;
      const logMatches = [...finalAdvice.matchAll(writeRegex)];
      for (const match of logMatches) {
        const parts = match[1].split('|');
        if (parts.length >= 7) {
          const [foodName, cal, p, c, f, mealType, dateStr] = parts;
          try {
            await createEntry({
              date: dateStr.trim(),
              mealType: mealType.trim().toLowerCase() as "breakfast" | "lunch" | "dinner" | "snack",
              foodName: foodName.trim(),
              calories: parseFloat(cal) || 0,
              proteinG: parseFloat(p) || 0,
              carbsG: parseFloat(c) || 0,
              fatG: parseFloat(f) || 0
            });
            finalAdvice = finalAdvice.replace(match[0], `✅ **Done!** I logged ${foodName.trim()} for ${mealType.trim().toLowerCase()} on ${dateStr.trim()}.`);
          } catch (err: any) {
            finalAdvice = finalAdvice.replace(match[0], `❌ Failed to log food securely: ${err}`);
          }
        }
      }

      // Intercept Grocery List Actions
      const groceryMatches = [...finalAdvice.matchAll(/\[FRONTEND_ACTION:\s*add_grocery\((.*?)\)\]/g)];
      for (const m of groceryMatches) {
        const item = m[1].trim();
        addGroceryItem(item);
        finalAdvice = finalAdvice.replace(m[0], `✨ **Added to Grocery List:** ${item}`);
      }

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: finalAdvice,
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
    <div className="page-enter pop-in ai-advisor-shell">
      {!isOnline && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(255, 180, 0, 0.3)",
            background: "rgba(255, 180, 0, 0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 600 }}>You're offline</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>
            AI nutrition advice requires an internet connection. Connect to the
            network, then come back.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="ai-advisor-toolbar">
        <div className="ai-advisor-toolbar-left">
          <span className="ai-advisor-chip provider">{providerConfig.name}</span>
          {selectedModel && (
            <span className="ai-advisor-chip model" title={selectedModel}>
              {selectedModel}
            </span>
          )}
          {selectedProvider === "ollama" ? (
            <span className="ai-advisor-chip local">🔒 Local</span>
          ) : (
            <span className="ai-advisor-chip cloud">☁️ Cloud</span>
          )}
        </div>
        <span className="ai-advisor-toolbar-divider" />
        <div className="ai-advisor-toolbar-right">
          <div className="ai-advisor-control">
            <span className="ai-advisor-control-label">Goal</span>
            <select
              className="ai-advisor-toolbar-select"
              value={goal}
              onChange={(e) => {
                const newGoal = e.target.value;
                localStorage.setItem('nutrilog_goal', newGoal);
                setGoal(newGoal);
              }}
            >
              <option value="weight_loss">🔥 Cut</option>
              <option value="maintenance">⚖️ Maintain</option>
              <option value="muscle_gain">💪 Bulk</option>
            </select>
          </div>
          <div className="ai-advisor-control">
            <span className="ai-advisor-control-label">Context</span>
            <select
              className="ai-advisor-toolbar-select"
              value={contextDays}
              onChange={(e) => setContextDays(Number(e.target.value))}
            >
              <option value={1}>Today</option>
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grocery List UI */}
      {groceryList.length > 0 && (
        <div className="card" style={{ borderLeft: "3px solid #10b981", background: "rgba(16, 185, 129, 0.05)", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>🛒 Smart Grocery List</span>
            <span style={{ fontSize: 11, color: "var(--muted2)", fontWeight: "normal" }}>AI Managed</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groceryList.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", padding: "6px 10px", borderRadius: 8 }}>
                <span style={{ fontSize: 13 }}>{item}</span>
                <button
                  onClick={() => removeGroceryItem(item)}
                  style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer", fontSize: 16 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable messages area ── */}
      <div className="ai-advisor-messages" id="ai-messages-scroll">

        {/* Quick prompts (only when empty) */}
        {messages.length === 0 && (
          <div className="ai-advisor-empty">
            <div className="ai-advisor-empty-icon">💬</div>
            <div className="ai-advisor-empty-title">Start a conversation</div>
            <div className="ai-advisor-empty-text">
              Ask anything about your nutrition, or try one of these:
            </div>
            <div className="ai-advisor-quick-grid">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendQuestion(qp.prompt)}
                  disabled={loading}
                  className="ai-advisor-quick-btn"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`card ai-chat-bubble ${msg.role === "assistant" ? "ai-chat-assistant" : "ai-chat-user"}`}
          >
            <div className="ai-chat-role">
              {msg.role === "user" ? "You" : "NutriLog AI"}
            </div>
            {msg.role === "assistant" ? (
              <div className="ai-markdown" style={{ fontSize: 14, lineHeight: 1.7 }}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {msg.content}
              </div>
            )}

            {/* .nlog data toggle */}
            {msg.nlogData && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => setShowNlog(showNlog === i ? null : i)}
                  className="ai-nlog-toggle"
                >
                  {showNlog === i ? "Hide .nlog data" : "Show .nlog data sent to AI"}
                </button>
                {showNlog === i && (
                  <pre className="ai-nlog-pre">
                    {msg.nlogData}
                  </pre>
                )}
              </div>
            )}

            {msg.tokens && msg.tokens > 0 && (
              <div className="ai-chat-tokens">
                {msg.tokens} tokens used
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
            <div className="card ai-chat-bubble ai-chat-assistant">
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ai-loading-spinner">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="ai-loading-text">
                  Consulting NutriLog AI...
                </span>
              </div>
            </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="card" style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
            <div style={{ fontSize: 13 }}>{error}</div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Fixed input bar ── */}
      <div className="ai-advisor-input-bar">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your nutrition…"
          rows={1}
          className="ai-advisor-textarea"
        />
        <button
          onClick={() => sendQuestion(input)}
          disabled={loading || !input.trim()}
          className="ai-advisor-send-btn"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}