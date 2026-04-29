// src/pages/Insights.tsx
// Full analytics dashboard with charts, BMI, and health trajectory

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AppUserProfile, NutritionTrendPoint } from "../generated/types";
import { getNutritionTrend } from "../generated/commands";
import ProfileSummaryCard from "../components/ProfileSummaryCard";
import { detectNutritionThresholdAlerts } from "../lib/nutritionAlerts";
import { localDateString } from "../lib/foodLogStore";
import { getNutritionTargets, type MacroTargets } from "../lib/nutritionTargets";
import { loadProfile } from "../lib/profileStore";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapTargets(targets: MacroTargets): Targets {
  return {
    calories: targets.calories,
    proteinG: targets.protein,
    carbsG: targets.carbs,
    fatG: targets.fat,
    sourceLabel: targets.sourceLabel,
  };
}

function toDayData(point: NutritionTrendPoint): DayData {
  const date = new Date(point.periodStart * 1000);
  return {
    date: localDateString(date),
    label: date.toLocaleDateString('en-US', { weekday: 'narrow', day: 'numeric' }),
    calories: point.totals.caloriesKcal,
    proteinG: point.totals.proteinG,
    carbsG: point.totals.totalCarbohydrateG,
    fatG: point.totals.fatG,
    entryCount: point.totals.itemCount,
  };
}

function computeBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#60a5fa' };
  if (bmi < 25) return { label: 'Normal', color: '#10b981' };
  if (bmi < 30) return { label: 'Overweight', color: '#fbbf24' };
  return { label: 'Obese', color: '#ef4444' };
}

// ── Chart Components ──────────────────────────────────────────────────────────

function BarChart({ data, dataKey, targetValue, color, label, unit }: {
  data: DayData[];
  dataKey: keyof DayData;
  targetValue: number;
  color: string;
  label: string;
  unit: string;
}) {
  const maxVal = Math.max(...data.map(d => d[dataKey] as number), targetValue, 10) * 1.15;

  return (
    <div style={chartCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted2)' }}>Target: {targetValue}{unit}</span>
      </div>
      <svg viewBox="0 0 400 160" style={{ width: '100%', height: 160 }}>
        {/* Target line */}
        <line
          x1="0" y1={140 - (targetValue / maxVal) * 130}
          x2="400" y2={140 - (targetValue / maxVal) * 130}
          stroke={color} strokeWidth="1" strokeDasharray="6,4" opacity="0.5"
        />
        {/* Bars */}
        {data.map((d, i) => {
          const val = d[dataKey] as number;
          const h = (val / maxVal) * 130;
          const x = i * (400 / data.length) + 8;
          const w = (400 / data.length) - 16;
          const overTarget = val > targetValue * 1.1;
          const barColor = overTarget ? '#f97316' : color;
          return (
            <g key={d.date || i}>
              <rect x={x} y={140 - h} width={w} height={h} rx="4" fill={barColor} opacity="0.75" />
              <text x={x + w / 2} y={155} textAnchor="middle" fill="var(--muted2,#888)" fontSize="9">{d.label}</text>
              {val > 0 && <text x={x + w / 2} y={140 - h - 4} textAnchor="middle" fill="var(--muted2,#888)" fontSize="8">{Math.round(val)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MacroPieChart({ data }: { data: DayData[] }) {
  const totP = data.reduce((s, d) => s + d.proteinG, 0);
  const totC = data.reduce((s, d) => s + d.carbsG, 0);
  const totF = data.reduce((s, d) => s + d.fatG, 0);
  const total = totP + totC + totF;
  if (total === 0) return null;

  const pPct = totP / total;
  const cPct = totC / total;
  const fPct = totF / total;

  // SVG donut
  const r = 60, cx = 80, cy = 80;
  const circumference = 2 * Math.PI * r;

  const pLen = pPct * circumference;
  const cLen = cPct * circumference;
  const fLen = fPct * circumference;

  const pOff = 0;
  const cOff = -pLen;
  const fOff = -(pLen + cLen);

  return (
    <div style={chartCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Macro Distribution (Weekly Avg)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <svg viewBox="0 0 160 160" style={{ width: 120, height: 120 }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#8b5cf6" strokeWidth="18"
            strokeDasharray={`${pLen} ${circumference - pLen}`} strokeDashoffset={pOff}
            transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#06b6d4" strokeWidth="18"
            strokeDasharray={`${cLen} ${circumference - cLen}`} strokeDashoffset={cOff}
            transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth="18"
            strokeDasharray={`${fLen} ${circumference - fLen}`} strokeDashoffset={fOff}
            transform={`rotate(-90 ${cx} ${cy})`} />
        </svg>
        <div style={{ display: 'grid', gap: 8 }}>
          <LegendItem color="#8b5cf6" label="Protein" value={`${Math.round(pPct * 100)}%`} sub={`${Math.round(totP / data.length)}g/day`} />
          <LegendItem color="#06b6d4" label="Carbs" value={`${Math.round(cPct * 100)}%`} sub={`${Math.round(totC / data.length)}g/day`} />
          <LegendItem color="#f59e0b" label="Fat" value={`${Math.round(fPct * 100)}%`} sub={`${Math.round(totF / data.length)}g/day`} />
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, value, sub }: { color: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}: {value}</div>
        <div style={{ fontSize: 10, color: 'var(--muted2)' }}>{sub}</div>
      </div>
    </div>
  );
}

function BMICard({ profile }: { profile: AppUserProfile | null }) {
  if (!profile || !profile.weightKg || !profile.heightCm) {
    return (
      <div style={chartCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Body Metrics</div>
        <div style={{ fontSize: 12, color: 'var(--muted2)' }}>Set up your profile to see BMI calculations.</div>
      </div>
    );
  }

  const bmi = computeBMI(profile.weightKg, profile.heightCm);
  const cat = bmiCategory(bmi);
  const heightM = profile.heightCm / 100;
  const idealMin = 18.5 * heightM * heightM;
  const idealMax = 24.9 * heightM * heightM;

  // BMI scale visualization (15 to 40)
  const scaleMin = 15, scaleMax = 40;
  const pct = ((bmi - scaleMin) / (scaleMax - scaleMin)) * 100;

  return (
    <div style={chartCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Body Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={metricBoxStyle}>
          <div style={{ fontSize: 24, fontWeight: 800, color: cat.color }}>{bmi.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)' }}>BMI</div>
          <div style={{ fontSize: 11, color: cat.color, fontWeight: 600, marginTop: 2 }}>{cat.label}</div>
        </div>
        <div style={metricBoxStyle}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.weightKg}<span style={{ fontSize: 11, color: 'var(--muted2)' }}> kg</span></div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>Current Weight</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 4 }}>Ideal: {idealMin.toFixed(0)}–{idealMax.toFixed(0)} kg</div>
        </div>
      </div>
      {/* BMI Scale Bar */}
      <div style={{ fontSize: 10, color: 'var(--muted2)', marginBottom: 4 }}>BMI Scale</div>
      <div style={{ position: 'relative', height: 18, borderRadius: 9, overflow: 'hidden', background: 'linear-gradient(90deg, #60a5fa 0%, #10b981 28%, #10b981 40%, #fbbf24 60%, #ef4444 100%)' }}>
        <div style={{
          position: 'absolute',
          left: `calc(${Math.min(Math.max(pct, 2), 98)}% - 6px)`,
          top: 1, width: 12, height: 16, borderRadius: 4,
          background: '#fff', border: '2px solid #111',
          transition: 'left 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted2)', marginTop: 2 }}>
        <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
      </div>
    </div>
  );
}

function ConsistencyCard({ data, targets }: { data: DayData[]; targets: Targets }) {
  const daysWithFood = data.filter(d => d.entryCount > 0).length;
  const totalDays = data.length;
  const pct = totalDays > 0 ? (daysWithFood / totalDays) * 100 : 0;
  const avgCal = totalDays > 0 ? data.reduce((s, d) => s + d.calories, 0) / totalDays : 0;

  // Streak (from most recent day backwards)
  let streak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].entryCount > 0) streak++;
    else break;
  }

  return (
    <div style={chartCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Consistency & Trends</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div style={metricBoxStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: pct >= 80 ? '#10b981' : pct >= 50 ? '#fbbf24' : '#ef4444' }}>{Math.round(pct)}%</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Days Logged</div>
        </div>
        <div style={metricBoxStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(124,92,255,0.9)' }}>{streak}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Current Streak</div>
        </div>
        <div style={metricBoxStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: avgCal <= targets.calories * 1.1 ? '#10b981' : '#f97316' }}>{Math.round(avgCal)}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Avg Cal/Day</div>
        </div>
      </div>
    </div>
  );
}

// ── Proactive Health Nudge ────────────────────────────────────────────────────

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

  const primaryType = alerts.some(a => a.type === 'danger') ? 'danger' : 'warning';

  return (
    <div style={{
      border: primaryType === 'danger' ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(251,191,36,0.35)',
      background: primaryType === 'danger' ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)',
      borderRadius: 14, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: primaryType === 'danger' ? '#ef4444' : '#fbbf24' }}>Nutrition Threshold Alerts</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>Using {sourceLabel.toLowerCase()}</div>
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'var(--muted2)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {alerts.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{a.emoji}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontSize: 10, color: a.type === 'danger' ? '#fca5a5' : '#fde68a', marginBottom: 2 }}>{a.thresholdLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{a.message}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/ai')} style={{
        marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 8,
        border: '1px solid rgba(124,92,255,0.3)', background: 'rgba(124,92,255,0.12)',
        color: 'rgba(124,92,255,0.95)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        💬 Get AI Advice →
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const goal = localStorage.getItem('nutrilog_goal') || 'maintenance';
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [dayData, setDayData] = useState<DayData[]>([]);
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

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - (range - 1));

      try {
        const [trend, loadedProfile] = await Promise.all([
          getNutritionTrend({
            start: Math.floor(startDate.getTime() / 1000),
            end: Math.floor(endDate.getTime() / 1000),
            bucket: 'DAY',
            offsetMinutes: new Date().getTimezoneOffset(),
          }),
          loadProfile(),
        ]);

        if (cancelled) return;

        const rawTargets = getNutritionTargets(loadedProfile, goal);
        const days = (trend || []).map(toDayData);
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

        setTargets(mapTargets(rawTargets));
        setProfile(loadedProfile);
        setDayData(days);
        setAlerts(nudges);
      } catch (err) {
        if (cancelled) return;
        setDayData([]);
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
  }, [goal, range]);

  return (
    <div className="page-enter" style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      <div className="pop-in">
        <ProfileSummaryCard />
      </div>

      <HealthNudge alerts={alerts} sourceLabel={targets.sourceLabel} />

      {/* Header with range selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>📈 Nutrition Insights</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([7, 14, 30] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: range === r ? '1px solid rgba(124,92,255,0.5)' : '1px solid var(--border,rgba(255,255,255,0.08))',
                background: range === r ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.04)',
                color: range === r ? 'rgba(124,92,255,0.95)' : 'var(--muted2,#888)',
              }}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          ...chartCardStyle,
          border: '1px solid rgba(239,68,68,0.35)',
          background: 'rgba(239,68,68,0.08)',
          color: '#fecaca',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={chartCardStyle}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading insights...</div>
        </div>
      ) : (
        <>
          {/* BMI & Body Metrics */}
          <BMICard profile={profile} />

          {/* Consistency */}
          <ConsistencyCard data={dayData} targets={targets} />

          {/* Calorie Chart */}
          <BarChart data={dayData} dataKey="calories" targetValue={targets.calories} color="#8b5cf6" label="Daily Calories" unit=" kcal" />

          {/* Protein Chart */}
          <BarChart data={dayData} dataKey="proteinG" targetValue={targets.proteinG} color="#10b981" label="Daily Protein" unit="g" />

          {/* Macro Distribution Pie */}
          <MacroPieChart data={dayData} />

          {/* Carbs Chart */}
          <BarChart data={dayData} dataKey="carbsG" targetValue={targets.carbsG} color="#06b6d4" label="Daily Carbs" unit="g" />

          {/* Fat Chart */}
          <BarChart data={dayData} dataKey="fatG" targetValue={targets.fatG} color="#f59e0b" label="Daily Fat" unit="g" />
        </>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const chartCardStyle: React.CSSProperties = {
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 14,
  padding: '16px 18px',
};

const metricBoxStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.2)',
  borderRadius: 10,
  padding: '10px 12px',
  textAlign: 'center',
};
