import { useNetwork } from "../lib/NetworkContext";
import { useState, useRef, useEffect, useMemo, lazy, Suspense, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LLM_PROVIDERS } from "../hooks/useCredentials";
import { useAiConfig } from "../hooks/useAiConfig";
import { loadProfile } from "../lib/profileStore";
import { getNutritionTargets } from "../lib/nutritionTargets";
import {
  getChatSessions,
  getSessionMessages,
  createChatSession,
  deleteChatSession,
  createChatMessage,
  getNutritionTrend,
  pruneOldSessions,
} from "../generated/commands";
import { AiChatSession, NutritionTrendPoint, type AppUserProfile } from "../generated/types";
import ReactMarkdown from "react-markdown";
import "../styles/ai-advisor.css";

const ConfirmLogCard = lazy(() =>
  import("../components/ConfirmLogCard").then((module) => ({ default: module.ConfirmLogCard })),
);
const NutritionChartCard = lazy(() =>
  import("../components/NutritionChartCard").then((module) => ({ default: module.NutritionChartCard })),
);
const MultiMacroTrendCard = lazy(() =>
  import("../components/MultiMacroTrendCard").then((module) => ({ default: module.MultiMacroTrendCard })),
);
const GoalVsActualCard = lazy(() =>
  import("../components/GoalVsActualCard").then((module) => ({ default: module.GoalVsActualCard })),
);

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

interface GoalOption {
  value: string;
  label: string;
  emoji: string;
}

interface ContextOption {
  value: number;
  label: string;
}

const QUICK_PROMPTS = [
  { label: "📊 Weekly Digest", prompt: "Generate my Weekly Nutrition Report Card. Include: (1) daily average macros vs my targets, (2) best and worst days this week, (3) consistency patterns like meal skipping or late-night eating, (4) my top 3 action items for next week. Set context to Last 7 Days." },
  { label: "❓ Simulate a Meal", prompt: "I'm thinking about eating a Big Mac for lunch. Simulate the macros for me and tell me how it affects my daily limits." },
  { label: "📅 Plan Tomorrow", prompt: "Based on my macro deficits, generate a healthy 3-meal plan for tomorrow and automatically log it into my diary." },
  { label: "🛒 Build Grocery List", prompt: "Look at my diet and suggest 3 ingredients I should buy to improve my nutrition, then add them to my grocery list." },
  { label: "🔍 Audit This", prompt: "Audit the ingredients in a standard Protein Bar. Tell me if it's healthy." },
];

const GOAL_OPTIONS: GoalOption[] = [
  { value: "weight_loss", label: "Cut", emoji: "🔥" },
  { value: "maintenance", label: "Maintain", emoji: "⚖️" },
  { value: "muscle_gain", label: "Bulk", emoji: "💪" },
];

const CONTEXT_OPTIONS: ContextOption[] = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 Days" },
  { value: 30, label: "30 Days" },
];

const ACTION_WIDGET_REGEX = /\[FRONTEND_ACTION:\s*(.*?)\((.*?)\)\]/g;
const LEGACY_WIDGET_REGEX = /\[FRONTEND_WIDGET:\s*(.*?)\]/g;
const THIRTY_DAYS_SECONDS = 30 * 86400;

type TrendMetric = "calories" | "protein" | "carbs" | "fat";
const DEFAULT_MULTI_METRICS: TrendMetric[] = ["protein", "carbs", "fat"];

function clampPeriodToDays(period: string): number | null {
  if (period === "30d") return 30;
  if (period === "7d") return 7;
  if (period === "1d" || period === "today") return 1;
  return null;
}

function parseMultiMetrics(raw: string | undefined): TrendMetric[] {
  if (!raw) return DEFAULT_MULTI_METRICS;
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is TrendMetric => item === "calories" || item === "protein" || item === "carbs" || item === "fat");
  return parsed.length > 0 ? parsed : DEFAULT_MULTI_METRICS;
}

function deriveSessionTitle(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New Chat";

  const words = cleaned.split(" ").slice(0, 8);
  const joined = words.join(" ");
  return joined.length > 64 ? `${joined.slice(0, 61)}...` : joined;
}

// Helper component for fetching trend data within a chat bubble
function TrendDataWidget({ metric, period }: { metric: string, period: string }) {
  const [data, setData] = useState<NutritionTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setWidgetError(null);
      setLoading(true);

      const days = period === "30d" ? 30 : period === "7d" ? 7 : null;
      if (!days) {
        setData([]);
        setWidgetError("Unsupported chart period. Please use 7d or 30d.");
        setLoading(false);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const start = now - (days * 86400);
      
      try {
        const result = await getNutritionTrend({
          start,
          end: now,
          bucket: "DAY",
          offsetMinutes: new Date().getTimezoneOffset(),
        });
        setData(result || []);
      } catch (err) {
        setData([]);
        setWidgetError("Could not load chart data right now.");
        console.error("Failed to fetch trend:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [metric, period]);

  if (loading) return <div className="ai-widget-loading">Loading trend data...</div>;
  if (widgetError) return <div className="ai-widget-state">{widgetError}</div>;
  if (!data.length) return <div className="ai-widget-state">No nutrition data available for this period yet.</div>;

  return (
    <Suspense fallback={<div className="ai-widget-loading">Loading chart...</div>}>
      <NutritionChartCard 
        data={data} 
        metric={metric as any} 
        title={`Last ${period} ${metric} trend`}
      />
    </Suspense>
  );
}

function MultiMacroTrendWidget({ period, metrics, goal }: { period: string; metrics: TrendMetric[]; goal: string }) {
  const [data, setData] = useState<NutritionTrendPoint[]>([]);
  const [targets, setTargets] = useState(() => getNutritionTargets(null, goal));
  const [loading, setLoading] = useState(true);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setWidgetError(null);
      setLoading(true);

      const days = clampPeriodToDays(period);
      if (!days) {
        setWidgetError("Unsupported period for multi-macro chart.");
        setData([]);
        setLoading(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const start = now - days * 86400;
      try {
        const [result, loadedProfile] = await Promise.all([
          getNutritionTrend({
            start,
            end: now,
            bucket: "DAY",
            offsetMinutes: new Date().getTimezoneOffset(),
          }),
          loadProfile(),
        ]);

        if (cancelled) return;

        setData(result || []);
        setTargets(getNutritionTargets(loadedProfile, goal));
      } catch (err) {
        console.error("Failed to fetch multi-macro trend:", err);
        setWidgetError("Could not load multi-macro trend right now.");
        setData([]);
        setTargets(getNutritionTargets(null, goal));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [period, metrics, goal]);

  if (loading) return <div className="ai-widget-loading">Loading multi-macro trend...</div>;
  if (widgetError) return <div className="ai-widget-state">{widgetError}</div>;
  if (!data.length) return <div className="ai-widget-state">No trend data available for this period yet.</div>;

  return (
    <Suspense fallback={<div className="ai-widget-loading">Loading chart...</div>}>
      <MultiMacroTrendCard data={data} metrics={metrics} period={period} targets={targets} />
    </Suspense>
  );
}

function GoalVsActualWidget({ period, goal }: { period: string; goal: string }) {
  const [data, setData] = useState<NutritionTrendPoint[]>([]);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setWidgetError(null);
      setLoading(true);

      const days = clampPeriodToDays(period);
      if (!days) {
        setWidgetError("Unsupported period for goal comparison.");
        setData([]);
        setLoading(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const start = now - days * 86400;
      try {
        const [trend, loadedProfile] = await Promise.all([
          getNutritionTrend({
            start,
            end: now,
            bucket: "DAY",
            offsetMinutes: new Date().getTimezoneOffset(),
          }),
          loadProfile(),
        ]);

        setData(trend || []);
        setProfile(loadedProfile);
      } catch (err) {
        console.error("Failed to fetch goal-vs-actual data:", err);
        setWidgetError("Could not load goal comparison right now.");
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [period, goal]);

  if (loading) return <div className="ai-widget-loading">Loading goal comparison...</div>;
  if (widgetError) return <div className="ai-widget-state">{widgetError}</div>;
  if (!data.length) return <div className="ai-widget-state">No data available for goal comparison yet.</div>;

  const days = clampPeriodToDays(period) || 7;
  const targets = getNutritionTargets(profile, goal);
  const totalActual = data.reduce(
    (acc, point) => ({
      calories: acc.calories + point.totals.caloriesKcal,
      protein: acc.protein + point.totals.proteinG,
      carbs: acc.carbs + point.totals.totalCarbohydrateG,
      fat: acc.fat + point.totals.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const avgActual = {
    calories: totalActual.calories / Math.max(days, 1),
    protein: totalActual.protein / Math.max(days, 1),
    carbs: totalActual.carbs / Math.max(days, 1),
    fat: totalActual.fat / Math.max(days, 1),
  };

  return (
    <Suspense fallback={<div className="ai-widget-loading">Loading card...</div>}>
      <GoalVsActualCard period={period} targets={targets} actual={avgActual} />
    </Suspense>
  );
}

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
  const [isGroceryOpen, setIsGroceryOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [startInNewSession, setStartInNewSession] = useState(false);

  // Phase 3 Session State
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionTitlePreview, setSessionTitlePreview] = useState<Record<number, string>>({});
  const [controlsSearch, setControlsSearch] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sessionActionPendingId, setSessionActionPendingId] = useState<number | null>(null);

  // Initialize Chat Sessions
  useEffect(() => {
    async function loadSessions() {
      try {
        try {
          await pruneOldSessions({
            deleteBeforeTimestamp: Math.floor(Date.now() / 1000) - THIRTY_DAYS_SECONDS,
          });
        } catch (pruneErr) {
          console.warn("Failed to prune old sessions:", pruneErr);
        }

        const result = await getChatSessions();
        setSessions(result || []);
        if (result && result.length > 0) {
          setActiveSessionId(result[0].id);
        } else {
          setActiveSessionId(null);
        }
      } catch (err) {
        console.error("Failed to load chat sessions:", err);
      }
    }
    loadSessions();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLegacySessionTitles() {
      const next: Record<number, string> = {};

      await Promise.all(
        sessions.map(async (session) => {
          if (session.title.trim().toLowerCase() !== "new chat") return;

          try {
            const msgs = await getSessionMessages({ sessionId: session.id });
            const firstUser = msgs.find((m) => m.role === "user" && m.content.trim().length > 0);
            if (firstUser) {
              next[session.id] = deriveSessionTitle(firstUser.content);
            }
          } catch (err) {
            console.error(`Failed to hydrate session title preview for ${session.id}:`, err);
          }
        }),
      );

      if (!cancelled) {
        setSessionTitlePreview(next);
      }
    }

    hydrateLegacySessionTitles();

    return () => {
      cancelled = true;
    };
  }, [sessions]);

  async function ensureActiveSessionId(initialQuestion: string): Promise<number> {
    if (activeSessionId !== null && !startInNewSession) {
      return activeSessionId;
    }

    if (!startInNewSession && sessions.length > 0) {
      const existingId = sessions[0].id;
      setActiveSessionId(existingId);
      return existingId;
    }

    const session = await createChatSession({
      title: deriveSessionTitle(initialQuestion),
      createdAt: Math.floor(Date.now() / 1000),
    });
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setStartInNewSession(false);
    return session.id;
  }

  // Fetch messages when active session changes
  useEffect(() => {
    async function loadMessages() {
      if (activeSessionId === null) return;
      try {
        const msgs = await getSessionMessages({ sessionId: activeSessionId });
        const mapped: ChatMessage[] = msgs.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          tokens: m.tokens,
        }));
        setMessages(mapped);
      } catch (err) {
        console.error("Failed to load session messages:", err);
      }
    }
    loadMessages();
  }, [activeSessionId]);

  // Input history state
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftInput, setDraftInput] = useState("");

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

    const trimmedQuestion = question.trim();
    setInput("");
    setError(null);
    setHistoryIndex(-1);
    setDraftInput("");
    setLoading(true);

    try {
      const sessionId = await ensureActiveSessionId(trimmedQuestion);
      const userMsg: ChatMessage = { role: "user", content: trimmedQuestion };

      await createChatMessage({
        message: {
          id: 0,
          sessionId,
          role: "user",
          content: trimmedQuestion,
          provider: selectedProvider,
          model: selectedModel || "default",
          tokens: 0,
          createdAt: Math.floor(Date.now() / 1000),
        },
      });

      setMessages((prev) => [...prev, userMsg]);

      const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Load the user's profile for personalized targets
      const profile = await loadProfile();
      let profileContext = '';
      if (profile) {
        const goal = localStorage.getItem('nutrilog_goal') || 'maintenance';
        profileContext = `User Profile: ${profile.sex}, ${profile.age} years old, ${profile.heightCm}cm, ${profile.weightKg}kg, activity level: ${profile.activityLevel}, goal: ${goal}.`;
      }

      const contextualQuestion = `${profileContext ? profileContext + '\n' : ''}(System Context: Today is ${today}.)\n\nUser Question: ${trimmedQuestion}`;

      const historyPayload = [...messages, userMsg]
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-6);

      const result = await invoke<AiResponse>("get_ai_advice", {
        question: contextualQuestion,
        days: contextDays,
        provider: selectedProvider,
        model: selectedModel || null,
        history: historyPayload,
        offsetMinutes: new Date().getTimezoneOffset(),
      });

      let finalAdvice = result.advice;

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

      let assistantSaveFailed = false;
      try {
        await createChatMessage({
          message: {
            id: 0,
            sessionId,
            role: "assistant",
            content: finalAdvice,
            provider: selectedProvider,
            model: selectedModel || "default",
            tokens: result.token_count,
            createdAt: Math.floor(Date.now() / 1000),
          },
        });
      } catch (persistErr) {
        assistantSaveFailed = true;
        console.error("Failed to persist assistant message:", persistErr);
      }

      setMessages((prev) => [
        ...prev,
        aiMsg,
        ...(assistantSaveFailed
          ? [{ role: "assistant" as const, content: "⚠️ I answered, but I could not save this reply to session history." }]
          : []),
      ]);
      
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
      return;
    }

    // Command History cycling
    const userHistory = messages
      .filter(m => m.role === "user")
      .map(m => m.content);

    if (e.key === "ArrowUp") {
      // Don't cycle if textarea has multiple lines and cursor isn't at the top
      // (Simplified for now: only cycle if we're not using Shift/Alt etc)
      if (userHistory.length === 0) return;

      e.preventDefault();
      let nextIndex: number;
      
      if (historyIndex === -1) {
        setDraftInput(input);
        nextIndex = userHistory.length - 1;
      } else {
        nextIndex = Math.max(0, historyIndex - 1);
      }
      
      setHistoryIndex(nextIndex);
      setInput(userHistory[nextIndex]);
    } else if (e.key === "ArrowDown") {
      if (historyIndex === -1) return;

      e.preventDefault();
      const nextIndex = historyIndex + 1;
      
      if (nextIndex >= userHistory.length) {
        setHistoryIndex(-1);
        setInput(draftInput);
      } else {
        setHistoryIndex(nextIndex);
        setInput(userHistory[nextIndex]);
      }
    }
  }

  // Auto-expand textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, [input]);

  useEffect(() => {
    if (!isControlsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsControlsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isControlsOpen]);

  const startNewChat = () => {
    setStartInNewSession(true);
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  };

  const filteredSessions = useMemo(() => {
    const query = controlsSearch.trim().toLowerCase();
    if (!query) return sessions;

    return sessions.filter((session) => {
      const displayTitle = getDisplaySessionTitle(session).toLowerCase();
      const dateLabel = getSessionPreview(session).toLowerCase();
      return displayTitle.includes(query) || dateLabel.includes(query);
    });
  }, [sessions, controlsSearch, sessionTitlePreview]);

  const startRenameSession = (session: AiChatSession) => {
    setRenamingSessionId(session.id);
    setRenameDraft(getDisplaySessionTitle(session));
  };

  const cancelRenameSession = () => {
    setRenamingSessionId(null);
    setRenameDraft("");
  };

  const saveRenamedSession = async (sessionId: number) => {
    const nextTitle = renameDraft.trim();
    if (!nextTitle) return;

    try {
      setSessionActionPendingId(sessionId);
      const updated = await invoke<AiChatSession>("update_chat_session_title", {
        sessionId,
        title: nextTitle,
      });

      setSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? updated : session)),
      );
      setSessionTitlePreview((prev) => {
        if (!(sessionId in prev)) return prev;
        const clone = { ...prev };
        delete clone[sessionId];
        return clone;
      });
      cancelRenameSession();
    } catch (err) {
      console.error("Failed to rename chat session:", err);
    } finally {
      setSessionActionPendingId(null);
    }
  };

  const removeSession = async (session: AiChatSession) => {
    const confirmed = confirm(`Delete chat session \"${getDisplaySessionTitle(session)}\"?`);
    if (!confirmed) return;

    try {
      setSessionActionPendingId(session.id);
      const deleted = await deleteChatSession({ sessionId: session.id });
      if (!deleted) return;

      setSessions((prev) => {
        const remaining = prev.filter((item) => item.id !== session.id);
        if (activeSessionId === session.id) {
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            setActiveSessionId(null);
            setMessages([]);
            setStartInNewSession(true);
          }
        }
        return remaining;
      });

      setSessionTitlePreview((prev) => {
        if (!(session.id in prev)) return prev;
        const clone = { ...prev };
        delete clone[session.id];
        return clone;
      });
      if (renamingSessionId === session.id) {
        cancelRenameSession();
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    } finally {
      setSessionActionPendingId(null);
    }
  };

  function getDisplaySessionTitle(session: AiChatSession): string {
    return session.title.trim().toLowerCase() === "new chat"
      ? (sessionTitlePreview[session.id] || session.title)
      : session.title;
  }

  function getSessionOptionLabel(session: AiChatSession): string {
    const displayTitle = getDisplaySessionTitle(session);
    const date = new Date(session.createdAt * 1000).toLocaleDateString();
    return `${displayTitle} · ${date}`;
  }

  function getSessionPreview(session: AiChatSession): string {
    const date = new Date(session.createdAt * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${date} · ${session.updatedAt > session.createdAt ? "Updated" : "Started"}`;
  }

  const clearGroceryList = () => {
    if (confirm("Empty your grocery list?")) {
      setGroceryList([]);
      localStorage.setItem('nutrilog_grocery', '[]');
    }
  };

  return (
    <div className="page-enter pop-in ai-advisor-shell">
      {(!isOnline && selectedProvider !== "ollama") && (
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
            Cloud AI advice requires an internet connection. Switch to <strong>Ollama (Local)</strong> or connect to the
            network to continue.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="ai-advisor-toolbar">
        <div className="ai-advisor-toolbar-left">
          <button
            className="ai-advisor-toolbar-action ai-advisor-controls-btn"
            onClick={() => setIsControlsOpen((prev) => !prev)}
            title="Open chat controls"
            aria-label="Open chat controls"
            aria-haspopup="dialog"
            aria-expanded={isControlsOpen}
          >
            <span aria-hidden="true">☰</span>
          </button>
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

        <div className="ai-advisor-toolbar-right">
          <button 
            className="ai-advisor-toolbar-action" 
            onClick={startNewChat}
            title="New Chat"
          >
            <span>+</span>
            <span style={{ fontSize: 11, fontWeight: "bold", marginLeft: 4 }}>New Chat</span>
          </button>

          <button 
            className="ai-advisor-toolbar-action" 
            onClick={() => setIsGroceryOpen(!isGroceryOpen)}
            title="Toggle Grocery List"
            style={{ background: isGroceryOpen ? 'rgba(16, 185, 129, 0.15)' : '', borderColor: isGroceryOpen ? 'rgba(16, 185, 129, 0.4)' : '' }}
          >
            <span>🛒</span>
            <span style={{ fontSize: 11, fontWeight: "bold", marginLeft: 4 }}>
              List {groceryList.length > 0 && `(${groceryList.length})`}
            </span>
          </button>
        </div>
      </div>

      {isControlsOpen && (
        <div
          className="ai-controls-overlay"
          onClick={() => setIsControlsOpen(false)}
          role="presentation"
        >
          <div
            className="ai-controls-panel card"
            role="dialog"
            aria-label="Chat controls"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-controls-header">
              <div>
                <div className="ai-controls-title">Chat Controls</div>
                <div className="ai-controls-subtitle">Adjust advisor settings and jump between sessions.</div>
              </div>
              <button
                className="ai-controls-close"
                onClick={() => setIsControlsOpen(false)}
                title="Close controls"
              >
                ×
              </button>
            </div>

            <div className="ai-controls-section">
              <div className="ai-controls-section-title">Goal</div>
              <div className="ai-controls-pill-row">
                {GOAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`ai-controls-pill ${goal === option.value ? "active" : ""}`}
                    onClick={() => {
                      localStorage.setItem("nutrilog_goal", option.value);
                      setGoal(option.value);
                    }}
                  >
                    <span>{option.emoji}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-controls-section">
              <div className="ai-controls-section-title">Context Window</div>
              <div className="ai-controls-pill-row">
                {CONTEXT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`ai-controls-pill ${contextDays === option.value ? "active" : ""}`}
                    onClick={() => setContextDays(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-controls-section ai-controls-history-section">
              <div className="ai-controls-section-title">Chat History</div>
              <input
                className="ai-controls-search"
                type="search"
                placeholder="Search sessions..."
                value={controlsSearch}
                onChange={(e) => setControlsSearch(e.target.value)}
              />
              <div className="ai-controls-history-list">
                {filteredSessions.length === 0 ? (
                  <div className="ai-controls-history-empty">No saved sessions yet. Start a chat to create one.</div>
                ) : (
                  filteredSessions.map((session) => {
                    const isActive = activeSessionId === session.id;
                    const isRenaming = renamingSessionId === session.id;
                    const isPending = sessionActionPendingId === session.id;
                    return (
                      <div
                        key={session.id}
                        className={`ai-history-item ${isActive ? "active" : ""}`}
                      >
                        {isRenaming ? (
                          <div className="ai-history-rename-row">
                            <input
                              className="ai-history-rename-input"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void saveRenamedSession(session.id);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelRenameSession();
                                }
                              }}
                              disabled={isPending}
                              autoFocus
                            />
                            <button
                              className="ai-history-action-btn"
                              onClick={() => void saveRenamedSession(session.id)}
                              disabled={isPending || !renameDraft.trim()}
                            >
                              Save
                            </button>
                            <button
                              className="ai-history-action-btn muted"
                              onClick={cancelRenameSession}
                              disabled={isPending}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              className="ai-history-main"
                              onClick={() => {
                                setStartInNewSession(false);
                                setActiveSessionId(session.id);
                                setIsControlsOpen(false);
                              }}
                              disabled={isPending}
                            >
                              <div className="ai-history-item-title">{getSessionOptionLabel(session)}</div>
                              <div className="ai-history-item-meta">{getSessionPreview(session)}</div>
                            </button>
                            <div className="ai-history-actions-row">
                              <button
                                className="ai-history-action-btn muted"
                                onClick={() => startRenameSession(session)}
                                disabled={isPending}
                              >
                                Rename
                              </button>
                              <button
                                className="ai-history-action-btn danger"
                                onClick={() => void removeSession(session)}
                                disabled={isPending}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* ── Scrollable messages area ── */}
        <div className="ai-advisor-messages" id="ai-messages-scroll" style={{ flex: 1 }}>


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
        {messages.map((msg, i) => {
          // Parse widgets natively in the frontend
          const contentElements: ReactNode[] = [];
          if (msg.role === "assistant") {
            let lastIndex = 0;
            let match: RegExpExecArray | null;
            let keyCounter = 0;

            const matches: Array<{ index: number; full: string; actionType: string; argsString: string }> = [];
            ACTION_WIDGET_REGEX.lastIndex = 0;
            while ((match = ACTION_WIDGET_REGEX.exec(msg.content)) !== null) {
              matches.push({
                index: match.index,
                full: match[0],
                actionType: match[1].trim().toLowerCase(),
                argsString: match[2],
              });
            }

            LEGACY_WIDGET_REGEX.lastIndex = 0;
            while ((match = LEGACY_WIDGET_REGEX.exec(msg.content)) !== null) {
              const raw = match[1].trim();
              const [legacyType, ...legacyArgs] = raw.split("|");
              matches.push({
                index: match.index,
                full: match[0],
                actionType: legacyType.toLowerCase(),
                argsString: legacyArgs.join("|"),
              });
            }

            matches.sort((a, b) => a.index - b.index);

            for (const widget of matches) {
              // Push text before the widget
              if (widget.index > lastIndex) {
                contentElements.push(
                  <ReactMarkdown key={`md-${keyCounter++}`}>
                    {msg.content.substring(lastIndex, widget.index)}
                  </ReactMarkdown>
                );
              }

              const actionType = widget.actionType;
              const argsString = widget.argsString;

              if (actionType === 'log_food' || actionType === 'confirm_log') {
                const parts = argsString.split('|');
                if (parts.length >= 5) {
                  const [foodName, cal, p, c, f, mealType = "snack", dateStr = new Date().toISOString().slice(0, 10)] = parts;
                  contentElements.push(
                    <Suspense key={`widget-${keyCounter++}`} fallback={<div className="ai-widget-loading">Loading card...</div>}>
                      <ConfirmLogCard
                        foodName={foodName.trim()}
                        calories={parseFloat(cal) || 0}
                        protein={parseFloat(p) || 0}
                        carbs={parseFloat(c) || 0}
                        fat={parseFloat(f) || 0}
                        mealType={mealType.trim().toLowerCase()}
                        dateStr={dateStr.trim()}
                      />
                    </Suspense>
                  );
                }
              } else if (actionType === 'nutrition_chart') {
                const [metric, period] = argsString.split('|');
                if (metric && period) {
                  contentElements.push(
                    <TrendDataWidget 
                      key={`widget-${keyCounter++}`}
                      metric={metric.trim()}
                      period={period.trim()}
                    />
                  );
                }
              } else if (actionType === 'nutrition_multi_chart') {
                const [period = '7d', rawMetrics] = argsString.split('|');
                contentElements.push(
                  <MultiMacroTrendWidget
                    key={`widget-${keyCounter++}`}
                    period={period.trim() || '7d'}
                    goal={goal}
                    metrics={parseMultiMetrics(rawMetrics)}
                  />,
                );
              } else if (actionType === 'goal_vs_actual') {
                const [period = '7d', goalOverride] = argsString.split('|');
                contentElements.push(
                  <GoalVsActualWidget
                    key={`widget-${keyCounter++}`}
                    period={period.trim() || '7d'}
                    goal={(goalOverride?.trim() || goal).toLowerCase()}
                  />,
                );
              } else {
                // Malformed or unknown widget, just show text
                contentElements.push(
                  <ReactMarkdown key={`md-${keyCounter++}`}>
                    {widget.full}
                  </ReactMarkdown>
                );
              }

              lastIndex = widget.index + widget.full.length;
            }

            // Push any remaining text
            if (lastIndex < msg.content.length) {
              contentElements.push(
                <ReactMarkdown key={`md-${keyCounter++}`}>
                  {msg.content.substring(lastIndex)}
                </ReactMarkdown>
              );
            }
          }

          return (
          <div
            key={i}
            className={`card ai-chat-bubble ${msg.role === "assistant" ? "ai-chat-assistant" : "ai-chat-user"}`}
          >
            <div className="ai-chat-role">
              {msg.role === "user" ? "You" : "NutriLog AI"}
            </div>
            {msg.role === "assistant" ? (
              <div className="ai-markdown" style={{ fontSize: 14, lineHeight: 1.7 }}>
                {contentElements.length > 0 ? contentElements : <ReactMarkdown>{msg.content}</ReactMarkdown>}
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

            {msg.tokens !== undefined && msg.tokens > 0 && (
              <div className="ai-chat-tokens">
                {msg.tokens} tokens used
              </div>
            )}
          </div>
          );
        })}

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

      {/* Sliding Grocery List Panel */}
      {isGroceryOpen && (
        <div 
          className="card" 
          style={{ 
            width: 280, 
            borderLeft: "1px solid var(--border)", 
            background: "rgba(20, 22, 30, 0.95)", 
            flexShrink: 0,
            animation: "fadeSlideLeft 0.2s ease-out",
            border: "none",
            borderRadius: 0,
            display: "flex",
            flexDirection: "column",
            margin: 0
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#10b981" }}>🛒 Smart Grocery List</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button 
                onClick={clearGroceryList}
                style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 10, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Clear All
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" }}>
            {groceryList.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted2)", fontSize: 12, marginTop: 40 }}>
                Your grocery list is empty. Ask the AI to build one for you!
              </div>
            ) : (
              groceryList.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.02)" }}>
                  <span style={{ fontSize: 13 }}>{item}</span>
                  <button
                    onClick={() => removeGroceryItem(item)}
                    style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer", fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>

      {/* ── Fixed input bar ── */}
      {!isControlsOpen && (
        <div className="ai-advisor-input-bar">
          <textarea
            ref={textareaRef}
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
      )}
    </div>
  );
}