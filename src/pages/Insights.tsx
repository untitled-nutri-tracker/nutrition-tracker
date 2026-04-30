import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Barbell,
  CalendarCheck,
  ChartLineUp,
  Flame,
  Heart,
  ShieldCheck,
  TrendUp,
  ChartPieSlice,
  X,
  ChatCircleText,
} from "@phosphor-icons/react";

import ProfileSummaryCard from "../components/ProfileSummaryCard";
import { PremiumAreaChart } from "../components/charts/PremiumAreaChart";
import { PremiumDonutChart } from "../components/charts/PremiumDonutChart";
import { StackedProgressBar } from "../components/charts/StackedProgressBar";
import { MacroTrendChart } from "../components/charts/MacroTrendChart";
import { MealDistributionChart, type MealDistributionData } from "../components/charts/MealDistributionChart";

import { getDailyNutritionTotals, getNutritionTrend } from "../generated/commands";
import { localDateString, loadEntriesRange } from "../lib/foodLogStore";
import { detectNutritionThresholdAlerts } from "../lib/nutritionAlerts";
import { getNutritionTargets, type MacroTargets } from "../lib/nutritionTargets";
import { loadProfile } from "../lib/profileStore";
import type { NutritionTotals, NutritionTrendPoint, AppUserProfile } from "../generated/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  label: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryCount: number;
}

interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sourceLabel: string;
}

interface NudgeAlert {
  type: 'warning' | 'danger';
  emoji: string;
  title: string;
  message: string;
  thresholdLabel: string;
}

const METRIC_COLORS = {
  calories: "var(--metric-calories)",
  protein: "var(--metric-protein)",
  carbs: "var(--metric-carbs)",
  fat: "var(--metric-fat)",
} as const;

function mapTargets(targets: MacroTargets): Targets {
  return {
    calories: targets.calories,
    proteinG: targets.protein,
    carbsG: targets.carbs,
    fatG: targets.fat,
    sourceLabel: targets.sourceLabel,
  };
}

function computeBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function bmiCategory(bmi: number): { label: string; colorClass: string } {
  if (bmi < 18.5) return { label: "Underweight", colorClass: "text-sky-400" };
  if (bmi < 25) return { label: "Normal", colorClass: "text-emerald-400" };
  if (bmi < 30) return { label: "Overweight", colorClass: "text-amber-400" };
  return { label: "Obese", colorClass: "text-rose-400" };
}

// ── Shared UI Components ──────────────────────────────────────────────────────

function BentoCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-subtle bg-card/80 p-5 md:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">Insights</div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-primary">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs opacity-70">{subtitle}</p> : null}
        </div>
        {icon ? <div className="rounded-2xl border border-subtle bg-primary/5 p-2.5 opacity-70">{icon}</div> : null}
      </header>
      {children}
    </section>
  );
}

// Rewritten HealthNudge using Tailwind and Bento conventions
function HealthNudge({ alerts, sourceLabel }: { alerts: NudgeAlert[]; sourceLabel: string }) {
  const [dismissed, setDismissed] = useState(() => {
    return !!sessionStorage.getItem(`nutrilog_nudge_${localDateString()}`);
  });
  const navigate = useNavigate();

  useEffect(() => {
    setDismissed(!!sessionStorage.getItem(`nutrilog_nudge_${localDateString()}`));
  }, [alerts.length]);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(`nutrilog_nudge_${localDateString()}`, '1');
  }

  if (dismissed || alerts.length === 0) return null;

  const isDanger = alerts.some(a => a.type === 'danger');
  const toneClass = isDanger 
    ? "border-red-500/20 bg-red-500/10" 
    : "border-amber-500/20 bg-amber-500/10";
  const titleColor = isDanger ? "text-red-500" : "text-amber-500";

  return (
    <div className={`rounded-3xl border px-5 py-4 ${toneClass} shadow-sm backdrop-blur-md`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl mt-0.5">🚨</span>
          <div>
            <div className={`text-sm font-bold tracking-tight ${titleColor}`}>Nutrition Alerts</div>
            <div className="text-[10px] uppercase tracking-[0.12em] opacity-70 mt-0.5">Using {sourceLabel.toLowerCase()}</div>
          </div>
        </div>
        <button onClick={handleDismiss} className="rounded-full p-1 opacity-60 hover:bg-black/10 dark:hover:bg-white/10 hover:opacity-100 transition">
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {alerts.map((a, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-lg mt-0.5">{a.emoji}</span>
            <div>
              <div className="text-[13px] font-bold text-primary">{a.title}</div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${a.type === 'danger' ? 'text-red-400' : 'text-amber-400'}`}>{a.thresholdLabel}</div>
              <div className="text-xs leading-relaxed opacity-80">{a.message}</div>
            </div>
          </div>
        ))}
      </div>

      <button 
        onClick={() => navigate('/ai')} 
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors"
      >
        <ChatCircleText size={16} weight="duotone" /> Get AI Advice
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const goal = localStorage.getItem('nutrilog_goal') || 'maintenance';
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [mealDistribution, setMealDistribution] = useState<MealDistributionData[]>([]);
  const [dailyTotals, setDailyTotals] = useState<NutritionTotals | null>(null);
  const [targets, setTargets] = useState<Targets>(() => mapTargets(getNutritionTargets(null, goal)));
  const [alerts, setAlerts] = useState<NudgeAlert[]>([]);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const now = Math.floor(Date.now() / 1000);
        const offsetMinutes = new Date().getTimezoneOffset();

        const endDateObj = new Date();
        endDateObj.setHours(23, 59, 59, 999);
        const startDateObj = new Date();
        startDateObj.setHours(0, 0, 0, 0);
        startDateObj.setDate(startDateObj.getDate() - (range - 1));

        const startDateStr = localDateString(startDateObj);
        const endDateStr = localDateString(endDateObj);

        const [trend, todayTotals, entriesRangeMap, loadedProfile] = await Promise.all([
          getNutritionTrend({
            start: Math.floor(startDateObj.getTime() / 1000),
            end: Math.floor(endDateObj.getTime() / 1000),
            bucket: "DAY",
            offsetMinutes,
          }),
          getDailyNutritionTotals({
            anchor: now,
            offsetMinutes,
          }),
          loadEntriesRange(startDateStr, endDateStr),
          loadProfile(),
        ]);

        if (cancelled) return;

        const rawTargets = getNutritionTargets(loadedProfile, goal);

        const days: DayData[] = (trend || []).map((point: NutritionTrendPoint) => {
          const date = new Date(point.periodStart * 1000);
          return {
            date: date.toISOString().slice(0, 10),
            label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            calories: point.totals.caloriesKcal,
            proteinG: point.totals.proteinG,
            carbsG: point.totals.totalCarbohydrateG,
            fatG: point.totals.fatG,
            entryCount: point.totals.itemCount,
          };
        });

        const mealData = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
        let totalCalories = 0;

        Object.values(entriesRangeMap).forEach((entries) => {
          entries.forEach((entry) => {
            const mt = entry.mealType.toLowerCase();
            if (mt === "breakfast") mealData.breakfast += entry.calories;
            else if (mt === "lunch") mealData.lunch += entry.calories;
            else if (mt === "dinner") mealData.dinner += entry.calories;
            else mealData.snack += entry.calories;
            
            totalCalories += entry.calories;
          });
        });

        const mDist: MealDistributionData[] = [
          { name: "Breakfast", calories: mealData.breakfast, percentage: totalCalories > 0 ? (mealData.breakfast / totalCalories) * 100 : 0 },
          { name: "Lunch", calories: mealData.lunch, percentage: totalCalories > 0 ? (mealData.lunch / totalCalories) * 100 : 0 },
          { name: "Dinner", calories: mealData.dinner, percentage: totalCalories > 0 ? (mealData.dinner / totalCalories) * 100 : 0 },
          { name: "Snacks", calories: mealData.snack, percentage: totalCalories > 0 ? (mealData.snack / totalCalories) * 100 : 0 },
        ];

        const nudges = detectNutritionThresholdAlerts(trend || [], rawTargets, {
          windowDays: 3,
          excludeToday: true,
        }).map(alert => ({
          type: alert.severity,
          emoji: alert.emoji,
          title: alert.title,
          message: alert.message,
          thresholdLabel: alert.thresholdLabel,
        }));

        setDayData(days);
        setMealDistribution(mDist);
        setDailyTotals(todayTotals);
        setTargets(mapTargets(rawTargets));
        setProfile(loadedProfile);
        setAlerts(nudges);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load insights data:", err);
        setDayData([]);
        setDailyTotals(null);
        setAlerts([]);
        setProfile(null);
        setTargets(mapTargets(getNutritionTargets(null, goal)));
        setError(err instanceof Error ? err.message : 'Could not load nutrition insights right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [range, goal]);

  const stats = useMemo(() => {
    const totalDays = dayData.length || 1;
    const loggedDays = dayData.filter((d) => d.entryCount > 0).length;
    const avgCalories = Math.round(dayData.reduce((sum, d) => sum + d.calories, 0) / totalDays);
    const avgProtein = Math.round(dayData.reduce((sum, d) => sum + d.proteinG, 0) / totalDays);
    const avgCarbs = Math.round(dayData.reduce((sum, d) => sum + d.carbsG, 0) / totalDays);
    const avgFat = Math.round(dayData.reduce((sum, d) => sum + d.fatG, 0) / totalDays);

    let streak = 0;
    for (let i = dayData.length - 1; i >= 0; i -= 1) {
      if (dayData[i].entryCount > 0) streak += 1;
      else break;
    }

    return {
      loggedPct: Math.round((loggedDays / totalDays) * 100),
      streak,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
    };
  }, [dayData]);

  const calorieAreaData = useMemo(
    () => dayData.map((d) => ({ date: d.label, value: Math.round(d.calories) })),
    [dayData],
  );

  const donutData = useMemo(
    () => [
      { name: "Protein", value: Math.round(dailyTotals?.proteinG ?? 0), color: METRIC_COLORS.protein },
      { name: "Carbs", value: Math.round(dailyTotals?.totalCarbohydrateG ?? 0), color: METRIC_COLORS.carbs },
      { name: "Fat", value: Math.round(dailyTotals?.fatG ?? 0), color: METRIC_COLORS.fat },
    ],
    [dailyTotals?.fatG, dailyTotals?.proteinG, dailyTotals?.totalCarbohydrateG],
  );

  const progressData = useMemo(
    () => [
      { name: "Calories", actual: stats.avgCalories, target: targets.calories, color: METRIC_COLORS.calories, unit: "kcal" },
      { name: "Protein", actual: stats.avgProtein, target: targets.proteinG, color: METRIC_COLORS.protein, unit: "g" },
      { name: "Carbs", actual: stats.avgCarbs, target: targets.carbsG, color: METRIC_COLORS.carbs, unit: "g" },
      { name: "Fat", actual: stats.avgFat, target: targets.fatG, color: METRIC_COLORS.fat, unit: "g" },
    ],
    [stats.avgCalories, stats.avgProtein, stats.avgCarbs, stats.avgFat, targets],
  );

  const bmiMeta = useMemo(() => {
    if (!profile?.weightKg || !profile?.heightCm) return null;
    const bmi = computeBMI(profile.weightKg, profile.heightCm);
    return {
      bmi,
      category: bmiCategory(bmi),
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
    };
  }, [profile]);

  if (loading && !dayData.length) {
    return (
      <div className="page-enter flex h-full items-center justify-center px-4 pb-28 pt-5 md:px-8 md:pb-8">
        <div className="rounded-3xl border border-subtle bg-card/80 px-6 py-5 text-sm opacity-70">Loading insights dashboard...</div>
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-28 pt-5 md:gap-5 md:px-8 md:pb-8 md:pt-6">
      <div className="pop-in">
        <ProfileSummaryCard />
      </div>

      <div className="pop-in-delay-1">
        <HealthNudge alerts={alerts} sourceLabel={targets.sourceLabel} />
      </div>

      <div className="pop-in-delay-2 flex items-center justify-between gap-3 rounded-3xl border border-subtle bg-card/80 px-4 py-3.5 md:px-5 md:py-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-70">Nutrition Cockpit</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary">Performance Overview</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-subtle bg-primary/5 p-1">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "opacity-70 hover:bg-primary/5 hover:text-primary"
              }`}
              onClick={() => setRange(r)}
              type="button"
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-3xl border border-subtle bg-card/80 p-4">
          <div className="flex items-center gap-2 opacity-70"><CalendarCheck size={16} weight="duotone" /> Consistency</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-primary">{stats.loggedPct}%</div>
          <div className="mt-1 text-xs opacity-70">days logged</div>
        </div>
        <div className="rounded-3xl border border-subtle bg-card/80 p-4">
          <div className="flex items-center gap-2 opacity-70"><Flame size={16} weight="duotone" /> Active Streak</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-primary">{stats.streak}</div>
          <div className="mt-1 text-xs opacity-70">consecutive days</div>
        </div>
        <div className="rounded-3xl border border-subtle bg-card/80 p-4">
          <div className="flex items-center gap-2 opacity-70"><TrendUp size={16} weight="duotone" /> Avg Calories</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-primary">{Math.round(stats.avgCalories)}</div>
          <div className="mt-1 text-xs opacity-70">kcal / day</div>
        </div>
        <div className="rounded-3xl border border-subtle bg-card/80 p-4">
          <div className="flex items-center gap-2 opacity-70"><ChartLineUp size={16} weight="duotone" /> Target Match</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-primary">
            {Math.round((Math.min(stats.avgCalories / Math.max(targets.calories, 1), 1.25) / 1.25) * 100)}%
          </div>
          <div className="mt-1 text-xs opacity-70">calorie alignment</div>
        </div>
      </div>

      <BentoCard
        title="Calorie Trend"
        subtitle={`Rolling ${range}-day view mapped to your daily intake`}
        icon={<TrendUp size={18} weight="duotone" />}
      >
        <PremiumAreaChart
          data={calorieAreaData}
          color={METRIC_COLORS.protein}
          gradientColor={METRIC_COLORS.carbs}
          height={220}
          valueFormatter={(v) => `${Math.round(v)} kcal`}
        />
      </BentoCard>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <BentoCard
          title="Macro Trend"
          subtitle={`Rolling ${range}-day view of your macro splits`}
          icon={<ChartLineUp size={18} weight="duotone" />}
        >
          <MacroTrendChart
            data={dayData}
            height={220}
          />
        </BentoCard>

        <BentoCard
          title="Meal Distribution"
          subtitle={`Calorie breakdown over the last ${range} days`}
          icon={<ChartPieSlice size={18} weight="duotone" />}
        >
          <div className="h-[220px]">
            <MealDistributionChart data={mealDistribution} />
          </div>
        </BentoCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <BentoCard
          title="Macro Distribution"
          subtitle="Today's macro split from daily totals"
          icon={<Barbell size={18} weight="duotone" />}
        >
          <div className="h-[250px]">
            <PremiumDonutChart data={donutData} />
          </div>
        </BentoCard>

        <BentoCard
          title="Goal Fulfillment"
          subtitle="Average intake vs personalized targets"
          icon={<ShieldCheck size={18} weight="duotone" />}
        >
          <div className="h-[250px]">
            <StackedProgressBar data={progressData} />
          </div>
        </BentoCard>
      </div>

      {bmiMeta ? (
        <BentoCard title="Body Metrics" subtitle="Profile-based baseline checks" icon={<Heart size={18} weight="duotone" />}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl border border-subtle bg-primary/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">BMI</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-primary">{bmiMeta.bmi.toFixed(1)}</div>
              <div className={`mt-0.5 text-xs font-semibold ${bmiMeta.category.colorClass}`}>{bmiMeta.category.label}</div>
            </div>
            <div className="rounded-xl border border-subtle bg-primary/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Weight</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-primary">{bmiMeta.weightKg.toFixed(1)}</div>
              <div className="mt-0.5 text-xs opacity-70">kg</div>
            </div>
            <div className="rounded-xl border border-subtle bg-primary/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Height</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-primary">{Math.round(bmiMeta.heightCm)}</div>
              <div className="mt-0.5 text-xs opacity-70">cm</div>
            </div>
          </div>
        </BentoCard>
      ) : null}

      <div className="h-4" />
    </div>
  );
}
