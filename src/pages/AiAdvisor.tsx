import { useNetwork } from "../lib/NetworkContext";
import { useState, useRef, useEffect, useMemo, lazy, Suspense, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Basket, ChatCircleDots, Lightning, List, Robot, SpinnerGap } from "@phosphor-icons/react";
import { LLM_PROVIDERS } from "../hooks/useCredentials";
import { useAiConfig } from "../hooks/useAiConfig";
import { loadProfile } from "../lib/profileStore";
import { getNutritionTargets, getTrendMetricValue, isTrendMetric, type TrendMetric } from "../lib/nutritionTargets";
import {
  getChatSessions,
  getSessionMessages,
  createChatSession,
  deleteChatSession,
  createChatMessage,
  getNutritionTrend,
  pruneOldSessions,
} from "../generated/commands";
import { AiChatSession, type AiChatMessage, NutritionTrendPoint, type AppUserProfile } from "../generated/types";
import ReactMarkdown from "react-markdown";
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
  provider?: string;
}

interface GoalOption {
  value: string;
  label: string;
}

interface ContextOption {
  value: number;
  label: string;
}

const QUICK_PROMPTS = [
  { label: "Weekly Digest", prompt: "Generate my Weekly Nutrition Report Card. Include: (1) daily average macros vs my targets, (2) best and worst days this week, (3) consistency patterns like meal skipping or late-night eating, (4) my top 3 action items for next week. Set context to Last 7 Days." },
  { label: "Simulate a Meal", prompt: "I'm thinking about eating a Big Mac for lunch. Simulate the macros for me and tell me how it affects my daily limits." },
  { label: "Plan Tomorrow", prompt: "Based on my macro deficits, generate a healthy 3-meal plan for tomorrow and automatically log it into my diary." },
  { label: "Build Grocery List", prompt: "Look at my diet and suggest 3 ingredients I should buy to improve my nutrition, then add them to my grocery list." },
  { label: "Audit This", prompt: "Audit the ingredients in a standard Protein Bar. Tell me if it's healthy." },
];

const GOAL_OPTIONS: GoalOption[] = [
  { value: "weight_loss", label: "Cut" },
  { value: "maintenance", label: "Maintain" },
  { value: "muscle_gain", label: "Bulk" },
];

const CONTEXT_OPTIONS: ContextOption[] = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 Days" },
  { value: 30, label: "30 Days" },
];

const ACTION_WIDGET_REGEX = /\[FRONTEND_ACTION:\s*(.*?)\((.*?)\)\]/g;
const LEGACY_WIDGET_REGEX = /\[FRONTEND_WIDGET:\s*(.*?)\]/g;
const THIRTY_DAYS_SECONDS = 30 * 86400;

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
    .filter((item): item is TrendMetric => isTrendMetric(item));
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
function TrendDataWidget({ metric, period }: { metric: TrendMetric; period: string }) {
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

  if (loading) return <div className="mt-2 mb-2 text-xs text-amber-200/80">Loading trend data...</div>;
  if (widgetError) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">{widgetError}</div>;
  if (!data.length) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">No nutrition data available for this period yet.</div>;

  return (
    <Suspense fallback={<div className="mt-2 mb-2 text-xs text-amber-200/80">Loading chart...</div>}>
      <NutritionChartCard 
        data={data} 
        metric={metric}
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
  }, [period, goal]);

  if (loading) return <div className="mt-2 mb-2 text-xs text-amber-200/80">Loading multi-macro trend...</div>;
  if (widgetError) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">{widgetError}</div>;
  if (!data.length) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">No trend data available for this period yet.</div>;

  return (
    <Suspense fallback={<div className="mt-2 mb-2 text-xs text-amber-200/80">Loading chart...</div>}>
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

  if (loading) return <div className="mt-2 mb-2 text-xs text-amber-200/80">Loading goal comparison...</div>;
  if (widgetError) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">{widgetError}</div>;
  if (!data.length) return <div className="mt-2 mb-2 text-xs text-amber-200/80 border border-dashed border-amber-200/20 rounded-[10px] px-2.5 py-2 bg-amber-100/5">No data available for goal comparison yet.</div>;

  const divisor = Math.max(data.length, 1);
  const targets = getNutritionTargets(profile, goal);
  const totalActual = data.reduce(
    (acc, point) => ({
      calories: acc.calories + getTrendMetricValue(point, "calories"),
      protein: acc.protein + getTrendMetricValue(point, "protein"),
      carbs: acc.carbs + getTrendMetricValue(point, "carbs"),
      fat: acc.fat + getTrendMetricValue(point, "fat"),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const avgActual = {
    calories: totalActual.calories / divisor,
    protein: totalActual.protein / divisor,
    carbs: totalActual.carbs / divisor,
    fat: totalActual.fat / divisor,
  };

  return (
    <Suspense fallback={<div className="mt-2 mb-2 text-xs text-amber-200/80">Loading card...</div>}>
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
  useEffect(() => {
    if (isControlsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isControlsOpen]);
  const [startInNewSession, setStartInNewSession] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);

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
      for (const session of sessions) {
        if (cancelled) break;
        if (session.title.trim().toLowerCase() !== "new chat") continue;

        try {
          const msgs: AiChatMessage[] = await getSessionMessages({ sessionId: session.id });
          const firstUser = msgs.find((m) => m.role === "user" && m.content.trim().length > 0);
          if (firstUser && !cancelled) {
            const derived = deriveSessionTitle(firstUser.content);
            setSessionTitlePreview((prev) => ({ ...prev, [session.id]: derived }));
          }
        } catch (err) {
          console.error(`Failed to hydrate session title preview for ${session.id}:`, err);
        }

        // Yield to the main thread to prevent UI freezing
        await new Promise((resolve) => setTimeout(resolve, 30));
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
        setSessionLoading(true);
        const msgs: AiChatMessage[] = await getSessionMessages({ sessionId: activeSessionId });
        const mapped: ChatMessage[] = [];
        for (const msg of msgs) {
          if (msg.role !== "user" && msg.role !== "assistant") {
            continue;
          }
          mapped.push({
            role: msg.role,
            content: msg.content,
            tokens: msg.tokens,
          });
        }
        setMessages(mapped);
      } catch (err) {
        console.error("Failed to load session messages:", err);
      } finally {
        setSessionLoading(false);
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
          ? [{ role: "assistant" as const, content: "Warning: I answered, but I could not save this reply to session history." }]
          : []),
      ]);
      
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e ?? "Failed to get AI advice");
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
        { role: "assistant", content: `Warning: ${helpText}` },
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
    <div className="page-enter flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden p-0">
      {(!isOnline && selectedProvider !== "ollama") && (
        <div className="shrink-0 mx-4 mt-4 mb-0 p-3.5 rounded-[18px] border border-amber-500/30 bg-amber-500/10 backdrop-blur-md sm:mx-5 md:mx-6">
          <div style={{ fontWeight: 600 }}>You're offline</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>
            Cloud AI advice requires an internet connection. Switch to <strong>Ollama (Local)</strong> or connect to the
            network to continue.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="m-4 shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-white/10 bg-[#1e1e2a]/90 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] max-sm:m-3 max-sm:flex-col max-sm:items-start max-sm:px-3 max-sm:py-2">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/14 bg-white/5 text-white/80 transition-all hover:-translate-y-px hover:border-white/20 hover:text-white"
            onClick={() => setIsControlsOpen((prev) => !prev)}
            title="Open chat controls"
            aria-label="Open chat controls"
            aria-haspopup="dialog"
            aria-expanded={isControlsOpen}
          >
            <List size={18} weight="bold" />
          </button>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis bg-indigo-500/12 text-indigo-300/95 border border-indigo-500/25">{providerConfig.name}</span>
          {selectedModel && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis bg-cyan-500/10 text-cyan-300/90 border border-cyan-500/20" title={selectedModel}>
              {selectedModel}
            </span>
          )}
          {selectedProvider === "ollama" ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.04em] bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/25">Local</span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.04em] bg-amber-500/10 text-amber-400/90 border border-amber-500/20">Cloud</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 max-sm:w-full">
          {messages.length > 0 && (
            <button
              className="bg-indigo-500/10 border border-indigo-500/20 text-white/90 px-2.5 py-1 rounded-md cursor-pointer flex items-center transition-all hover:bg-indigo-500/15 hover:border-indigo-500/40 hover:-translate-y-px"
              onClick={startNewChat}
              title="New Chat"
            >
              <span>+</span>
              <span style={{ fontSize: 11, fontWeight: "bold", marginLeft: 4 }}>New Chat</span>
            </button>
          )}

          <button
            className="bg-indigo-500/10 border border-indigo-500/20 text-white/90 px-2.5 py-1 rounded-md cursor-pointer flex items-center transition-all hover:bg-indigo-500/15 hover:border-indigo-500/40 hover:-translate-y-px"
            onClick={() => setIsGroceryOpen(!isGroceryOpen)}
            title="Toggle Grocery List"
            style={{ background: isGroceryOpen ? 'rgba(16, 185, 129, 0.15)' : '', borderColor: isGroceryOpen ? 'rgba(16, 185, 129, 0.4)' : '' }}
          >
            <Basket size={14} weight="duotone" />
            <span style={{ fontSize: 11, fontWeight: "bold", marginLeft: 4 }}>
              List {groceryList.length > 0 && `(${groceryList.length})`}
            </span>
          </button>
        </div>
      </div>

      {isControlsOpen && (
        <div
          className="absolute inset-0 z-[1200] flex items-stretch justify-center bg-gradient-to-br from-[rgba(68,81,124,0.20)] via-[rgba(6,8,12,0.76)] to-[rgba(20,90,90,0.18)] p-2.5 backdrop-blur-md max-sm:items-end max-sm:p-0"
          onClick={() => setIsControlsOpen(false)}
          role="presentation"
        >
          <div
            className="w-[min(720px,95%)] max-h-[90vh] overflow-hidden border border-white/[0.12] bg-[#1a1e29] shadow-[0_18px_50px_rgba(0,0,0,0.6)] rounded-[24px] flex flex-col m-auto max-sm:w-full max-sm:rounded-[24px_24px_0_0] max-sm:max-h-[95vh]"
            role="dialog"
            aria-label="Chat controls"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-2.5 px-5 py-4 border-b border-white/[0.07] sticky top-0 z-[2] bg-gradient-to-b from-[#1a1e29]/98 to-[#1a1e29]/93 max-sm:px-4 max-sm:py-3">
              <div>
                <div className="text-base font-[800] text-white/95 tracking-[0.01em] max-sm:text-[15px]">Chat Controls</div>
                <div className="mt-1 text-sm leading-relaxed text-white/80 max-sm:text-[11px]">Adjust advisor settings and jump between sessions.</div>
              </div>
              <button
                className="border border-white/25 bg-white/10 text-white/95 rounded-[10px] w-8 h-8 cursor-pointer text-[19px] leading-none hover:text-white hover:border-blue-300/60 hover:bg-blue-300/15"
                onClick={() => setIsControlsOpen(false)}
                title="Close controls"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-5 pb-3 flex flex-col gap-6 max-sm:px-4 max-sm:pt-4">
              <div className="text-xs font-bold text-white/80 uppercase tracking-[0.08em]">Goal</div>
              <div className="flex flex-wrap gap-2 max-sm:gap-1.5">
                {GOAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold cursor-pointer border transition-all hover:border-blue-300/64 hover:bg-blue-300/18 hover:-translate-y-px max-sm:text-[11px] max-sm:px-2.5 max-sm:py-2 ${goal === option.value ? "border-blue-400/78 bg-gradient-to-br from-indigo-400/34 to-sky-400/26 text-white" : "border-white/[0.26] bg-white/10 text-white/80"}`}
                    onClick={() => {
                      localStorage.setItem("nutrilog_goal", option.value);
                      setGoal(option.value);
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 flex flex-col gap-6 max-sm:px-4">
              <div className="text-xs font-bold text-white/80 uppercase tracking-[0.08em]">Context Window</div>
              <div className="flex flex-wrap gap-2 max-sm:gap-1.5">
                {CONTEXT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold cursor-pointer border transition-all hover:border-blue-300/64 hover:bg-blue-300/18 hover:-translate-y-px max-sm:text-[11px] max-sm:px-2.5 max-sm:py-2 ${contextDays === option.value ? "border-blue-400/78 bg-gradient-to-br from-indigo-400/34 to-sky-400/26 text-white" : "border-white/[0.26] bg-white/10 text-white/80"}`}
                    onClick={() => setContextDays(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 px-5 pb-5 max-sm:px-4 max-sm:pb-4">
              <div className="text-xs font-bold text-white/80 uppercase tracking-[0.08em]">Chat History</div>
              <input
                className="w-full rounded-[10px] border border-white/[0.34] bg-white/10 text-white/95 text-xs px-2.5 py-2 outline-none focus:border-blue-400/82 focus:shadow-[0_0_0_3px_rgba(130,162,255,0.2)] placeholder:text-white/60"
                type="search"
                placeholder="Search sessions..."
                value={controlsSearch}
                onChange={(e) => setControlsSearch(e.target.value)}
              />
              <div className="min-h-[120px] flex-1 overflow-y-auto flex flex-col gap-2 pr-1 max-sm:min-h-[180px]">
                {filteredSessions.length === 0 ? (
                  <div className="border border-dashed border-white/[0.35] rounded-xl p-3 text-white/80 text-xs">No saved sessions yet. Start a chat to create one.</div>
                ) : (
                  filteredSessions.map((session) => {
                    const isActive = activeSessionId === session.id;
                    const isRenaming = renamingSessionId === session.id;
                    const isPending = sessionActionPendingId === session.id;
                    return (
                      <div
                        key={session.id}
                        className={`text-left border rounded-xl p-2.5 cursor-pointer flex flex-col gap-1 transition-all hover:-translate-y-px max-sm:p-2.5 ${isActive ? "border-cyan-400/74 bg-gradient-to-br from-blue-400/26 to-cyan-400/19" : "border-white/[0.24] bg-white/[0.08] hover:border-blue-300/62 hover:bg-blue-300/18"}`}
                      >
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5 max-sm:flex-wrap">
                            <input
                              className="flex-1 min-w-0 max-sm:w-full rounded-lg border border-white/[0.34] bg-white/10 text-white/95 text-xs px-2.5 py-1.5 focus:outline-none focus:border-blue-400/82"
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
                              className="border border-white/[0.34] bg-white/10 text-white/95 rounded-lg px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-all hover:border-blue-300/75 hover:bg-blue-300/20 disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-auto max-sm:min-h-[44px]"
                              onClick={() => void saveRenamedSession(session.id)}
                              disabled={isPending || !renameDraft.trim()}
                            >
                              Save
                            </button>
                            <button
                              className="border border-white/[0.34] bg-white/10 text-white/80 rounded-lg px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-all hover:border-blue-300/75 hover:bg-blue-300/20 disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-auto max-sm:min-h-[44px]"
                              onClick={cancelRenameSession}
                              disabled={isPending}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              className="text-left border-0 bg-transparent text-[inherit] cursor-pointer p-0 w-full disabled:opacity-70 disabled:cursor-wait"
                              onClick={() => {
                                setStartInNewSession(false);
                                setMessages([]); // Clear messages immediately for snappier UI
                                setActiveSessionId(session.id);
                                setIsControlsOpen(false);
                              }}
                              disabled={isPending}
                            >
                              <div className="text-xs text-white/95 font-bold leading-[1.35] max-sm:text-[11px]">{getSessionOptionLabel(session)}</div>
                              <div className="text-[11px] text-white/80 max-sm:text-[10px]">{getSessionPreview(session)}</div>
                            </button>
                            <div className="flex gap-1.5 mt-1 max-sm:flex-wrap">
                              <button
                                className="border border-white/[0.34] bg-white/10 text-white/80 rounded-lg px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-all hover:border-blue-300/75 hover:bg-blue-300/20 disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-auto max-sm:min-h-[44px]"
                                onClick={() => startRenameSession(session)}
                                disabled={isPending}
                              >
                                Rename
                              </button>
                              <button
                                className="border border-red-400/42 text-red-200/95 bg-white/5 rounded-lg px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-all hover:border-red-400/78 hover:bg-red-400/20 disabled:opacity-60 disabled:cursor-not-allowed max-sm:flex-auto max-sm:min-h-[44px]"
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

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1">
          {/* ── Scrollable messages area ── */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-3.5 [scrollbar-width:thin] [scrollbar-color:rgba(124,92,255,0.25)_transparent]"
            id="ai-messages-scroll"
            style={{
              flex: 1,
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 1.25rem, black calc(100% - 5rem), transparent 100%)",
              maskImage: "linear-gradient(to bottom, transparent 0, black 1.25rem, black calc(100% - 5rem), transparent 100%)",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          >
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 pb-36 sm:pb-40">

        {/* Quick prompts (only when empty) */}
        {messages.length === 0 && (
          <div className="flex min-h-[55vh] flex-col items-center justify-center text-center px-1 py-10 gap-2">
            <ChatCircleDots size={38} weight="duotone" className="mb-1 text-white/60" />
            <div className="text-lg font-bold text-white/90">Start a conversation</div>
            <div className="text-sm text-white/40 max-w-[400px] mb-3">
              Ask anything about your nutrition, or try one of these:
            </div>
            <div className="flex gap-2 flex-wrap justify-center max-w-[600px] max-sm:gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendQuestion(qp.prompt)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 text-white/90 cursor-pointer text-sm font-semibold transition-all hover:border-indigo-500/50 hover:from-indigo-500/25 hover:to-cyan-500/15 hover:-translate-y-px disabled:opacity-50 disabled:cursor-wait max-sm:text-xs max-sm:px-3 max-sm:py-2 max-sm:flex-auto max-sm:text-center max-sm:min-h-[44px]"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading session history */}
        {sessionLoading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-[13px] text-white/45">
            <SpinnerGap size={17} weight="bold" className="animate-spin" />
            <span>Loading chat history...</span>
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
                    <Suspense key={`widget-${keyCounter++}`} fallback={<div className="mt-2 mb-2 text-xs text-amber-200/80">Loading card...</div>}>
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
                const [rawMetric, period] = argsString.split('|');
                const metric = rawMetric?.trim().toLowerCase();
                if (metric && period && isTrendMetric(metric)) {
                  contentElements.push(
                    <TrendDataWidget 
                      key={`widget-${keyCounter++}`}
                      metric={metric}
                      period={period.trim()}
                    />
                  );
                } else {
                  contentElements.push(
                    <ReactMarkdown key={`md-${keyCounter++}`}>
                      {widget.full}
                    </ReactMarkdown>,
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
            className={`w-fit max-w-[calc(100%-0.5rem)] sm:max-w-[85%] [animation:fadeSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards] rounded-2xl px-4 py-3.5 border backdrop-blur-sm transition-all ${
              msg.role === "assistant"
                ? "self-start border-indigo-500/20 [border-left:3px_solid_rgba(124,92,255,0.45)] bg-[rgba(124,92,255,0.05)]"
                : "self-end border-cyan-500/15 [border-right:3px_solid_rgba(0,209,255,0.35)] bg-[rgba(0,209,255,0.04)]"
            }`}
          >
            <div className="text-[11px] text-white/40 mb-1.5 font-semibold uppercase tracking-[0.04em]" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {msg.role === "user" ? "You" : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Robot size={12} weight="fill" />
                    NutriLog AI
                  </span>
                  {msg.provider && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: 6,
                      background: "rgba(124,92,255,0.15)",
                      border: "1px solid rgba(124,92,255,0.3)",
                      color: "rgba(124,92,255,0.9)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {msg.provider}
                    </span>
                  )}
                  <span className="rounded-md border border-white/10 bg-white/5 px-[7px] py-[2px] text-[10px] text-white/45">
                    AI Generated
                  </span>
                </>
              )}
            </div>
            {msg.role === "assistant" ? (
              <div className="prose prose-invert prose-sm max-w-none text-white/90" style={{ fontSize: 14, lineHeight: 1.7 }}>
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
                  className="bg-transparent border-0 text-white/40 text-[11px] cursor-pointer underline p-0 transition-colors hover:text-white/60"
                >
                  {showNlog === i ? "Hide .nlog data" : "Show .nlog data sent to AI"}
                </button>
                {showNlog === i && (
                  <pre className="mt-1.5 p-2.5 rounded-lg bg-black/30 text-[11px] overflow-auto max-h-[200px] text-white/60 border border-white/5">
                    {msg.nlogData}
                  </pre>
                )}
              </div>
            )}

            {msg.tokens !== undefined && msg.tokens > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/40">
                <span className="inline-flex items-center gap-1">
                  <Lightning size={12} weight="fill" />
                  {msg.tokens} tokens
                </span>
                {msg.provider && (
                  <span style={{ color: "var(--muted2)" }}>· via {msg.provider}</span>
                )}
              </div>
            )}
          </div>
          );
        })}

        {/* Loading indicator */}
        {loading && (
          <div className="w-fit max-w-[calc(100%-0.5rem)] sm:max-w-[85%] self-start [animation:fadeSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards] rounded-2xl px-4 py-3.5 border border-indigo-500/20 [border-left:3px_solid_rgba(124,92,255,0.45)] bg-[rgba(124,92,255,0.05)] backdrop-blur-sm">
              <div className="flex items-center gap-2.5 text-sm text-white/80">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="[animation:spin_1s_linear_infinite] text-indigo-400 shrink-0">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="[animation:pulse_2s_ease-in-out_infinite] text-white/60">
                  Consulting NutriLog AI…
                </span>
              </div>
            </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="w-fit max-w-[calc(100%-0.5rem)] sm:max-w-[85%] self-start rounded-2xl px-4 py-3.5 border border-red-500/30 bg-red-500/10">
            <div style={{ fontSize: 13 }}>{error}</div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
          </div>
        </div>
        {!isControlsOpen && (
          <div className="absolute left-0 right-0 z-20 p-4 max-sm:p-3 bottom-[var(--shell-mobile-nav-offset)] md:bottom-0">
            <div className="mx-auto w-full max-w-4xl">
              <div className="relative flex gap-2 items-end px-3.5 py-3 rounded-[22px] border border-white/10 bg-[#1e1e2a]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-sm:px-3 max-sm:py-2.5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your nutrition…"
                  rows={1}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/5 text-white/90 resize-none text-[13px] font-[inherit] leading-relaxed max-h-[120px] transition-colors focus:border-indigo-500/40 focus:outline-none placeholder:text-white/40"
                />
                <button
                  onClick={() => sendQuestion(input)}
                  disabled={loading || !input.trim()}
                  className="px-5 py-2.5 rounded-[10px] border border-indigo-500/35 bg-gradient-to-br from-indigo-500/25 to-cyan-500/10 text-white/90 cursor-pointer font-semibold text-[13px] whitespace-nowrap transition-all hover:from-indigo-500/35 hover:to-cyan-500/18 disabled:opacity-50 disabled:cursor-default max-sm:px-4 max-sm:py-3 max-sm:min-h-[44px]"
                >
                  {loading ? "…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Sliding Grocery List Panel */}
        {isGroceryOpen && (
          <div className="absolute right-3 top-3 bottom-[calc(var(--shell-mobile-content-padding)+0.5rem)] z-30 flex w-[min(360px,calc(100%-1.5rem))] max-w-sm flex-col rounded-2xl border border-white/10 bg-[#14161e]/95 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:static lg:ml-3 lg:mb-0 lg:w-[320px] lg:max-w-none lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:border-white/5 lg:bg-[#14161e]/95 lg:p-4 lg:shadow-none">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-emerald-400">
                <Basket size={15} weight="duotone" />
                Smart Grocery List
              </span>
              <button
                onClick={clearGroceryList}
                className="border-0 bg-transparent text-[10px] uppercase tracking-[0.05em] text-white/55 transition-colors hover:text-white/80"
              >
                Clear All
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {groceryList.length === 0 ? (
                <div className="mt-10 text-center text-[12px] text-white/50">
                  Your grocery list is empty. Ask the AI to build one for you!
                </div>
              ) : (
                groceryList.map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                    <span className="text-[13px] text-white/90">{item}</span>
                    <button
                      onClick={() => removeGroceryItem(item)}
                      className="border-0 bg-transparent text-[16px] leading-none text-white/55 transition-colors hover:text-white/85"
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
    </div>
  );
}