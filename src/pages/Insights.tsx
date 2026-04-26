import { useEffect, useMemo, useState } from "react";
import {
  Barbell,
  CalendarCheck,
  ChartLineUp,
  Flame,
  Heart,
  ShieldCheck,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react";
import ProfileSummaryCard from "../components/ProfileSummaryCard";
import { PremiumAreaChart } from "../components/charts/PremiumAreaChart";
import { PremiumDonutChart } from "../components/charts/PremiumDonutChart";
import { StackedProgressBar } from "../components/charts/StackedProgressBar";
import { getDailyNutritionTotals, getNutritionTrend } from "../generated/commands";
import type { NutritionTotals, NutritionTrendPoint } from "../generated/types";

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
}

const METRIC_COLORS = {
  calories: "var(--metric-calories)",
  protein: "var(--metric-protein)",
  carbs: "var(--metric-carbs)",
  fat: "var(--metric-fat)",
} as const;

function getTargets(): Targets {
  const goal = localStorage.getItem("nutrilog_goal") || "maintenance";
  let cal = 2000;
  let pro = 75;
  let carb = 250;
  let fat = 65;

  try {
    const raw = localStorage.getItem("nutrilog.userProfile.v1");
    if (raw) {
      const p = JSON.parse(raw);
      const w = p.weightKg || 70;
      const actMult: Record<string, number> = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9,
      };
      const mult = actMult[p.activityLevel] || 1.55;
      const bmr =
        p.sex === "male"
          ? 10 * w + 6.25 * (p.heightCm || 170) - 5 * (p.age || 30) + 5
          : 10 * w + 6.25 * (p.heightCm || 160) - 5 * (p.age || 30) - 161;
      const tdee = bmr * mult;

      if (goal === "weight_loss") {
        cal = tdee - 400;
        pro = w * 1.4;
      } else if (goal === "muscle_gain") {
        cal = tdee + 300;
        pro = w * 1.8;
      } else {
        cal = tdee;
        pro = w * 1.2;
      }

      carb = (cal * 0.45) / 4;
      fat = (cal * 0.25) / 9;
    }
  } catch {
    // Keep defaults when local profile is unavailable.
  }

  return {
    calories: Math.round(cal),
    proteinG: Math.round(pro),
    carbsG: Math.round(carb),
    fatG: Math.round(fat),
  };
}

function getProfile() {
  try {
    const raw = localStorage.getItem("nutrilog.userProfile.v1");
    if (raw) return JSON.parse(raw);
  } catch {
    // noop
  }
  return null;
}

function computeBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function bmiCategory(bmi: number): { label: string; colorClass: string } {
  if (bmi < 18.5) return { label: "Underweight", colorClass: "text-sky-300" };
  if (bmi < 25) return { label: "Normal", colorClass: "text-emerald-300" };
  if (bmi < 30) return { label: "Overweight", colorClass: "text-amber-300" };
  return { label: "Obese", colorClass: "text-rose-300" };
}

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
    <section className="rounded-3xl border border-white/5 bg-zinc-900/90 p-5 md:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Insights</div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-white/50">{subtitle}</p> : null}
        </div>
        {icon ? <div className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/75">{icon}</div> : null}
      </header>
      {children}
    </section>
  );
}

function HealthNudgeCard({ data, targets }: { data: DayData[]; targets: Targets }) {
  const recent = data.slice(-3);
  const overCalorieDays = recent.filter((day) => day.entryCount > 0 && day.calories > targets.calories * 1.15).length;
  const lowProteinDays = recent.filter((day) => day.entryCount > 0 && day.proteinG < targets.proteinG * 0.5).length;
  const missingLogDays = recent.filter((day) => day.entryCount === 0).length;

  const alertMessage =
    overCalorieDays >= 2
      ? "Calorie intake has been above target for most of the last 3 days."
      : lowProteinDays >= 2
        ? "Protein has been too low recently. Add one high-protein meal tomorrow."
        : missingLogDays >= 2
          ? "Logging consistency dropped over the last 3 days."
          : "You are maintaining steady nutrition patterns this week.";

  const toneClass =
    overCalorieDays >= 2
      ? "border-rose-300/25 bg-rose-300/8"
      : lowProteinDays >= 2 || missingLogDays >= 2
        ? "border-amber-300/25 bg-amber-300/8"
        : "border-emerald-300/25 bg-emerald-300/8";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-2.5">
        <WarningCircle size={18} weight="duotone" className="mt-0.5 text-white/80" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/65">Health Nudge</div>
          <p className="mt-1 text-sm text-white/85">{alertMessage}</p>
        </div>
      </div>
    </div>
  );
}

export default function Insights() {
  const [range, setRange] = useState<7 | 14 | 30>(30);
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [dailyTotals, setDailyTotals] = useState<NutritionTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const now = Math.floor(Date.now() / 1000);
        const start = now - (range - 1) * 86400;
        const offsetMinutes = new Date().getTimezoneOffset();

        const [trend, todayTotals] = await Promise.all([
          getNutritionTrend({
            start,
            end: now,
            bucket: "DAY",
            offsetMinutes,
          }),
          getDailyNutritionTotals({
            anchor: now,
            offsetMinutes,
          }),
        ]);

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

        setDayData(days);
        setDailyTotals(todayTotals);
      } catch (err) {
        console.error("Failed to load insights data:", err);
        setDayData([]);
        setDailyTotals(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [range]);

  const targets = useMemo(() => getTargets(), []);

  const stats = useMemo(() => {
    const totalDays = dayData.length || 1;
    const loggedDays = dayData.filter((d) => d.entryCount > 0).length;
    const avgCalories = dayData.reduce((sum, d) => sum + d.calories, 0) / totalDays;
    const avgProtein = dayData.reduce((sum, d) => sum + d.proteinG, 0) / totalDays;
    const avgCarbs = dayData.reduce((sum, d) => sum + d.carbsG, 0) / totalDays;
    const avgFat = dayData.reduce((sum, d) => sum + d.fatG, 0) / totalDays;

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
      { name: "Protein", value: dailyTotals?.proteinG ?? 0, color: METRIC_COLORS.protein },
      { name: "Carbs", value: dailyTotals?.totalCarbohydrateG ?? 0, color: METRIC_COLORS.carbs },
      { name: "Fat", value: dailyTotals?.fatG ?? 0, color: METRIC_COLORS.fat },
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
    const profile = getProfile();
    if (!profile?.weightKg || !profile?.heightCm) return null;
    const bmi = computeBMI(profile.weightKg, profile.heightCm);
    return {
      bmi,
      category: bmiCategory(bmi),
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
    };
  }, []);

  if (loading) {
    return (
      <div className="page-enter flex h-full items-center justify-center px-4 pb-28 pt-5 md:px-8 md:pb-8">
        <div className="rounded-3xl border border-white/5 bg-zinc-900/80 px-6 py-5 text-sm text-white/60">Loading insights dashboard...</div>
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-28 pt-5 md:gap-5 md:px-8 md:pb-8 md:pt-6">
      <div className="pop-in">
        <ProfileSummaryCard />
      </div>

      <div className="pop-in flex items-center justify-between gap-3 rounded-3xl border border-white/5 bg-zinc-900/85 px-4 py-3.5 md:px-5 md:py-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Nutrition Cockpit</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">Performance Overview</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-1">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-white text-zinc-900"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
              onClick={() => setRange(r)}
              type="button"
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-3xl border border-white/5 bg-zinc-900/88 p-4">
          <div className="flex items-center gap-2 text-white/55"><CalendarCheck size={16} weight="duotone" /> Consistency</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-white">{stats.loggedPct}%</div>
          <div className="mt-1 text-xs text-white/45">days logged</div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-zinc-900/88 p-4">
          <div className="flex items-center gap-2 text-white/55"><Flame size={16} weight="duotone" /> Active Streak</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-white">{stats.streak}</div>
          <div className="mt-1 text-xs text-white/45">consecutive days</div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-zinc-900/88 p-4">
          <div className="flex items-center gap-2 text-white/55"><TrendUp size={16} weight="duotone" /> Avg Calories</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-white">{Math.round(stats.avgCalories)}</div>
          <div className="mt-1 text-xs text-white/45">kcal / day</div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-zinc-900/88 p-4">
          <div className="flex items-center gap-2 text-white/55"><ChartLineUp size={16} weight="duotone" /> Target Match</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-white">
            {Math.round((Math.min(stats.avgCalories / Math.max(targets.calories, 1), 1.25) / 1.25) * 100)}%
          </div>
          <div className="mt-1 text-xs text-white/45">calorie alignment</div>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">BMI</div>
              <div className="mt-1.5 font-mono text-3xl text-white">{bmiMeta.bmi.toFixed(1)}</div>
              <div className={`mt-1 text-sm font-semibold ${bmiMeta.category.colorClass}`}>{bmiMeta.category.label}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">Weight</div>
              <div className="mt-1.5 font-mono text-3xl text-white">{bmiMeta.weightKg.toFixed(1)}</div>
              <div className="mt-1 text-sm text-white/55">kg</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">Height</div>
              <div className="mt-1.5 font-mono text-3xl text-white">{Math.round(bmiMeta.heightCm)}</div>
              <div className="mt-1 text-sm text-white/55">cm</div>
            </div>
          </div>
        </BentoCard>
      ) : null}

      <HealthNudgeCard data={dayData} targets={targets} />

      <div className="h-4" />
    </div>
  );
}