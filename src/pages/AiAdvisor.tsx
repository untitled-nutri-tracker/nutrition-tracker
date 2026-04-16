import { useNetwork } from "../lib/NetworkContext";
import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LLM_PROVIDERS } from "../hooks/useCredentials";
import { useAiConfig } from "../hooks/useAiConfig";
import { createEntry } from "../lib/foodLogStore";
import { loadProfile } from "../lib/profileStore";
import ReactMarkdown from "react-markdown";

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
    <div className="page-enter pop-in" style={{ display: "grid", gap: 14, maxWidth: 900 }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🤖 AI Nutrition Advisor</div>
          <select 
            value={contextDays} 
            onChange={(e) => setContextDays(Number(e.target.value))}
            style={{ 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid var(--border)", 
              color: "var(--text)", 
              borderRadius: 6, 
              padding: "4px 8px", 
              fontSize: 12 
            }}
          >
            <option value={1} style={{ color: "black" }}>Today</option>
            <option value={7} style={{ color: "black" }}>Last 7 Days</option>
            <option value={30} style={{ color: "black" }}>Last 30 Days</option>
          </select>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted2)" }}>🎯 Goal:</span>
          <select 
            value={localStorage.getItem('nutrilog_goal') || 'maintenance'}
            onChange={(e) => { localStorage.setItem('nutrilog_goal', e.target.value); /* force re-render */ setContextDays(c => c); }}
            style={{ 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid var(--border)", 
              color: "var(--text)", 
              borderRadius: 6, 
              padding: "4px 8px", 
              fontSize: 12 
            }}
          >
            <option value="weight_loss" style={{ color: "black" }}>🔥 Weight Loss</option>
            <option value="maintenance" style={{ color: "black" }}>⚖️ Maintenance</option>
            <option value="muscle_gain" style={{ color: "black" }}>💪 Muscle Gain</option>
          </select>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted2)" }}>
          Powered by {providerConfig.name}.
          {selectedProvider === "ollama"
            ? " Your data never leaves your device."
            : " Meal data is sent securely to the provider for analysis."}
          {" "}Ask questions about your nutrition and get personalized advice.
        </div>
      </div>

      {/* Grocery List UI */}
      {groceryList.length > 0 && (
        <div className="card" style={{ borderLeft: "3px solid #10b981", background: "rgba(16, 185, 129, 0.05)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>🛒 Smart Grocery List</span>
            <span style={{ fontSize: 11, color: "var(--muted2)", fontWeight: "normal" }}>AI Managed</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groceryList.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", padding: "6px 10px", borderRadius: 8 }}>
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
        <>
          <style>
            {`
              @keyframes spin-ai { 100% { transform: rotate(360deg); } }
              @keyframes pulse-ai { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
            `}
          </style>
          <div className="card" style={{ borderLeft: "3px solid rgba(124,92,255,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin-ai 1s linear infinite", color: "rgba(124,92,255,1)" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span style={{ animation: "pulse-ai 2s ease-in-out infinite" }}>
                Consulting NutriLog AI...
              </span>
            </div>
          </div>
        </>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card" style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>
          <div style={{ fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Invisible element to scroll to */}
      <div ref={messagesEndRef} style={{ height: 1 }} />
      
      {/* Spacer so the sticky input doesn't overlap the last message */}
      <div style={{ paddingBottom: 60 }} />

      {/* Input */}
      <div className="card" style={{ 
        position: "sticky", 
        bottom: 0, 
        zIndex: 10,
        background: "rgba(20, 20, 20, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.05)" /* Subtle separation line */
      }}>
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