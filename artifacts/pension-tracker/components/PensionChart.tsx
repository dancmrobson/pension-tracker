import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DataPoint {
  date: string;
  value: number;
}

export interface ContributionPoint {
  date: string;
  employee: number;
  employer: number;
}

interface PensionChartProps {
  data: DataPoint[];
  contributions?: ContributionPoint[];
  height?: number;
}

type ChartPoint = { x: number; y: number; date: string; value: number };
type Padding = { left: number; right: number; top: number; bottom: number };
type RangePreset = "3M" | "6M" | "1Y" | "3Y" | "5Y" | "All" | "Custom";

// ─── Constants ───────────────────────────────────────────────────────────────

const PORT_PAD: Padding = { left: 52, right: 16, top: 18, bottom: 44 };
const MAX_ZOOM = 10;
const RANGE_PRESETS: RangePreset[] = ["3M", "6M", "1Y", "3Y", "5Y", "All", "Custom"];

// ─── Utility functions ────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}k`;
  return `£${v.toFixed(0)}`;
}

function formatCurrency(v: number): string {
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDisplay(iso: string): string {
  if (!iso || !iso.match(/^\d{4}-\d{2}-\d{2}$/)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function applyRangeFilter(
  data: DataPoint[],
  preset: RangePreset,
  from: string,
  to: string
): DataPoint[] {
  if (preset === "All") return data;
  if (preset === "Custom") {
    let f = data;
    if (from.match(/^\d{4}-\d{2}-\d{2}$/)) f = f.filter((d) => d.date >= from);
    if (to.match(/^\d{4}-\d{2}-\d{2}$/)) f = f.filter((d) => d.date <= to);
    return f;
  }
  const months = { "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 }[preset as Exclude<RangePreset, "All" | "Custom">];
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  return data.filter((d) => d.date >= cutoffStr);
}

function computeCumulativeContribs(
  entryDates: string[],
  contributions: ContributionPoint[]
): { employee: number; employer: number; total: number }[] {
  const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
  return entryDates.map((entryDate) => {
    let emp = 0, emr = 0;
    for (const c of sorted) {
      if (c.date <= entryDate) { emp += c.employee; emr += c.employer; }
      else break;
    }
    return { employee: emp, employer: emr, total: emp + emr };
  });
}

function findNearest(pts: ChartPoint[], touchX: number): string | null {
  if (pts.length === 0) return null;
  let nearest = pts[0];
  let minDist = Infinity;
  for (const pt of pts) {
    const dist = Math.abs(touchX - pt.x);
    if (dist < minDist) { minDist = dist; nearest = pt; }
  }
  return nearest.date;
}

function pinchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
}

function computeGeometry(
  data: DataPoint[],
  chartW: number,
  chartH: number,
  pad: Padding,
  extraValues?: number[]
) {
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  if (data.length === 0 || innerW <= 0 || innerH <= 0) {
    return {
      points: [] as ChartPoint[],
      xLabels: [] as { label: string; x: number }[],
      yTicks: [] as { label: string; y: number }[],
      innerW, innerH,
      yOf: (_v: number) => 0,
    };
  }

  const allValues = [...data.map((d) => d.value), ...(extraValues ?? [])];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const vPad = (rawMax - rawMin) * 0.12 || rawMax * 0.1 || 1000;
  const minV = rawMin - vPad;
  const maxV = rawMax + vPad;

  const times = data.map((d) => new Date(d.date + "T00:00:00").getTime());
  const minT = Math.min(...times);
  const tRange = Math.max(...times) - minT || 1;

  const xOf = (dateStr: string) => {
    const t = new Date(dateStr + "T00:00:00").getTime();
    return data.length === 1
      ? pad.left + innerW / 2
      : pad.left + ((t - minT) / tRange) * innerW;
  };
  const yOf = (v: number) => pad.top + ((maxV - v) / (maxV - minV)) * innerH;

  const points: ChartPoint[] = data.map((d) => ({
    x: xOf(d.date), y: yOf(d.value), date: d.date, value: d.value,
  }));

  const labelCount = Math.min(data.length, 5);
  const step = Math.max(1, Math.floor(data.length / labelCount));
  const seen = new Set<string>();
  let lastX = -Infinity;
  const xLabels = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => ({ label: formatShortDate(d.date), x: xOf(d.date) }))
    .filter(({ label, x }) => {
      if (seen.has(label) || x - lastX < 42) return false;
      seen.add(label); lastX = x;
      return true;
    });

  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const val = minV + ((maxV - minV) * i) / tickCount;
    return { label: formatAxisValue(val), y: yOf(val) };
  });

  return { points, xLabels, yTicks, innerW, innerH, yOf };
}

function buildLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX.toFixed(1)} ${prev.y.toFixed(1)} ${cpX.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

function buildFillPath(topPts: { x: number; y: number }[], bottomPts: { x: number; y: number }[]): string {
  if (topPts.length < 2 || bottomPts.length < 2) return "";
  let d = buildLinePath(topPts);
  d += ` L ${bottomPts[bottomPts.length - 1].x.toFixed(1)} ${bottomPts[bottomPts.length - 1].y.toFixed(1)}`;
  for (let i = bottomPts.length - 2; i >= 0; i--) {
    const prev = bottomPts[i + 1], curr = bottomPts[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX.toFixed(1)} ${prev.y.toFixed(1)} ${cpX.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  d += " Z";
  return d;
}

// ─── ChartSvg ─────────────────────────────────────────────────────────────────

interface ChartSvgProps {
  data: DataPoint[];
  contributions?: ContributionPoint[];
  chartW: number;
  chartH: number;
  pad: Padding;
  activeDate: string | null;
  colors: ReturnType<typeof useColors>;
  fontSize?: number;
}

function ChartSvg({ data, contributions, chartW, chartH, pad, activeDate, colors, fontSize = 10 }: ChartSvgProps) {
  const hasContribs = (contributions?.length ?? 0) > 0;

  const cumulContribs = useMemo(
    () => hasContribs && contributions
      ? computeCumulativeContribs(data.map((d) => d.date), contributions)
      : null,
    [data, contributions, hasContribs]
  );

  const extraValues = useMemo(() => {
    if (!cumulContribs) return undefined;
    return cumulContribs.flatMap((c) => [c.employee, c.total]);
  }, [cumulContribs]);

  const geo = useMemo(
    () => computeGeometry(data, chartW, chartH, pad, extraValues),
    [data, chartW, chartH, pad, extraValues]
  );
  const { points, xLabels, yTicks, innerW, innerH, yOf } = geo;
  if (points.length === 0) return null;

  const isPositive = data.length >= 2 ? data[data.length - 1].value >= data[0].value : true;
  const lineColor = isPositive ? colors.positive : colors.negative;
  const linePath = buildLinePath(points);
  const bottomY = pad.top + innerH;

  const potFillPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`
    : "";

  let employeePts: { x: number; y: number }[] = [];
  let totalContribPts: { x: number; y: number }[] = [];
  let investReturnFillPath = "";
  let employerBandFillPath = "";
  let employeeBandFillPath = "";

  if (hasContribs && cumulContribs && points.length >= 2) {
    employeePts = points.map((pt, i) => ({ x: pt.x, y: yOf(cumulContribs[i].employee) }));
    totalContribPts = points.map((pt, i) => ({ x: pt.x, y: yOf(cumulContribs[i].total) }));
    investReturnFillPath = buildFillPath(points, totalContribPts);
    employerBandFillPath = buildFillPath(totalContribPts, employeePts);
    const baselinePts = points.map((pt) => ({ x: pt.x, y: bottomY }));
    employeeBandFillPath = buildFillPath(employeePts, baselinePts);
  }

  const activePt = activeDate ? (points.find((p) => p.date === activeDate) ?? null) : null;
  const activeIdx = activePt ? points.indexOf(activePt) : -1;
  const latestPt = points[points.length - 1];

  return (
    <Svg width={chartW} height={chartH}>
      <Defs>
        <LinearGradient id="potGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lineColor} stopOpacity="0.12" />
          <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.positive} stopOpacity="0.22" />
          <Stop offset="1" stopColor={colors.positive} stopOpacity="0.06" />
        </LinearGradient>
      </Defs>

      {/* Grid lines + Y-axis labels */}
      {yTicks.map((tick, i) => (
        <React.Fragment key={i}>
          <Line x1={pad.left} y1={tick.y} x2={pad.left + innerW} y2={tick.y}
            stroke={colors.border} strokeWidth="1" strokeDasharray="4,4" />
          <SvgText x={pad.left - 6} y={tick.y + 4} fontSize={fontSize}
            fill={colors.mutedForeground} textAnchor="end" fontFamily="Inter_400Regular">
            {tick.label}
          </SvgText>
        </React.Fragment>
      ))}

      {/* X-axis labels (hidden when crosshair active) */}
      {!activePt && xLabels.map((lbl, i) => (
        <SvgText key={i} x={lbl.x} y={pad.top + innerH + fontSize + 6} fontSize={fontSize}
          fill={colors.mutedForeground} textAnchor="middle" fontFamily="Inter_400Regular">
          {lbl.label}
        </SvgText>
      ))}

      {/* Contribution bands */}
      {hasContribs && employeeBandFillPath ? <Path d={employeeBandFillPath} fill={colors.primary} opacity="0.18" /> : null}
      {hasContribs && employerBandFillPath ? <Path d={employerBandFillPath} fill={colors.accent} opacity="0.28" /> : null}
      {hasContribs && investReturnFillPath ? <Path d={investReturnFillPath} fill="url(#retGrad)" /> : null}
      {!hasContribs && potFillPath ? <Path d={potFillPath} fill="url(#potGrad)" /> : null}

      {/* Contribution dashed lines */}
      {hasContribs && employeePts.length > 1 ? (
        <Path d={buildLinePath(employeePts)} stroke={colors.primary} strokeWidth="1.5"
          fill="none" strokeDasharray="5,3" opacity="0.7" />
      ) : null}
      {hasContribs && totalContribPts.length > 1 ? (
        <Path d={buildLinePath(totalContribPts)} stroke={colors.accent} strokeWidth="1.5"
          fill="none" strokeDasharray="5,3" opacity="0.85" />
      ) : null}

      {/* Main value line */}
      {points.length > 1 ? (
        <Path d={linePath} stroke={lineColor} strokeWidth="2.5"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}

      {/* Data point dots — latest has a glow ring */}
      {points.map((pt, i) => {
        if (pt.date === activeDate) return null;
        const isLatest = i === points.length - 1;
        return (
          <React.Fragment key={i}>
            {isLatest && (
              <Circle cx={pt.x} cy={pt.y} r={14}
                fill={colors.accent} opacity="0.12" />
            )}
            <Circle cx={pt.x} cy={pt.y}
              r={isLatest ? 6 : 3}
              fill={isLatest ? colors.accent : lineColor}
              stroke="#fff" strokeWidth={isLatest ? 2 : 1.5} />
          </React.Fragment>
        );
      })}

      {/* Crosshair + active dot */}
      {activePt && (
        <>
          <Line
            x1={activePt.x} y1={pad.top}
            x2={activePt.x} y2={pad.top + innerH}
            stroke={colors.foreground} strokeWidth="1"
            strokeDasharray="4,3" opacity="0.3"
          />
          {/* Date label along crosshair */}
          <SvgText
            x={activePt.x}
            y={pad.top + innerH + fontSize + 6}
            fontSize={fontSize}
            fill={colors.primary}
            textAnchor="middle"
            fontFamily="Inter_600SemiBold"
          >
            {formatShortDate(activePt.date)}
          </SvgText>

          {/* Active dot — larger with outer ring */}
          <Circle cx={activePt.x} cy={activePt.y} r={12}
            fill={colors.accent} opacity="0.18" />
          <Circle cx={activePt.x} cy={activePt.y} r={7}
            fill={colors.accent} stroke="#fff" strokeWidth="2.5" />

          {/* Contribution crosshair dots */}
          {hasContribs && cumulContribs && activeIdx >= 0 ? (
            <>
              <Circle cx={activePt.x} cy={yOf(cumulContribs[activeIdx].employee)}
                r={4} fill={colors.primary} stroke="#fff" strokeWidth="1.5" />
              <Circle cx={activePt.x} cy={yOf(cumulContribs[activeIdx].total)}
                r={4} fill={colors.accent} stroke="#fff" strokeWidth="1.5" />
            </>
          ) : null}
        </>
      )}

      {/* "NOW" label above latest point (when no crosshair active) */}
      {!activePt && latestPt && (
        <SvgText
          x={latestPt.x}
          y={latestPt.y - 14}
          fontSize={fontSize - 1}
          fill={colors.accent}
          textAnchor="middle"
          fontFamily="Inter_600SemiBold"
          opacity="0.85"
        >
          NOW
        </SvgText>
      )}
    </Svg>
  );
}

// ─── Native info panel ────────────────────────────────────────────────────────

interface InfoPanelProps {
  date: string;
  value: number;
  prevValue: number | null;
  contribs: { employee: number; employer: number; total: number } | null;
  isLive: boolean;
  colors: ReturnType<typeof useColors>;
}

function NativeInfoPanel({ date, value, prevValue, contribs, isLive, colors }: InfoPanelProps) {
  const growthAmt = prevValue !== null ? value - prevValue : null;
  const growthPct = prevValue !== null && prevValue > 0
    ? ((value - prevValue) / prevValue) * 100 : null;
  const isUp = growthAmt !== null ? growthAmt >= 0 : true;
  const badgeColor = isUp ? colors.positive : colors.negative;

  return (
    <View style={[panelStyles.container, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
      <View style={panelStyles.left}>
        <Text style={[panelStyles.dateLabel, { color: colors.mutedForeground }]}>
          {isLive ? `Latest · ${formatFullDate(date)}` : formatFullDate(date)}
        </Text>
        <Text style={[panelStyles.value, { color: colors.foreground }]}>
          {formatCurrency(value)}
        </Text>
        {contribs && contribs.total > 0 ? (
          <Text style={[panelStyles.contribLine, { color: colors.mutedForeground }]}>
            You {formatCurrency(contribs.employee)}
            {"  ·  "}
            Employer {formatCurrency(contribs.employer)}
          </Text>
        ) : null}
      </View>

      {growthPct !== null && growthAmt !== null ? (
        <View style={[panelStyles.badge, { backgroundColor: badgeColor + "1A" }]}>
          <Ionicons
            name={isUp ? "trending-up" : "trending-down"}
            size={14}
            color={badgeColor}
          />
          <Text style={[panelStyles.badgePct, { color: badgeColor }]}>
            {isUp ? "+" : ""}{growthPct.toFixed(2)}%
          </Text>
          <Text style={[panelStyles.badgeAmt, { color: badgeColor }]}>
            {isUp ? "+" : ""}{formatCurrency(growthAmt)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const panelStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 10,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  contribLine: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  badge: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexShrink: 0,
  },
  badgePct: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  badgeAmt: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});

// ─── DatePickerModal ──────────────────────────────────────────────────────────

function DatePickerModal({
  label,
  initialValue,
  colors,
  onConfirm,
  onCancel,
}: {
  label: string;
  initialValue: string;
  colors: ReturnType<typeof useColors>;
  onConfirm: (iso: string) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(initialValue.replace(/\D/g, ""));

  function formatDisplay(digits: string) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 8);
    setRaw(digits);
  }

  function handleConfirm() {
    if (raw.length !== 8) return;
    const dd = raw.slice(0, 2);
    const mm = raw.slice(2, 4);
    const yyyy = raw.slice(4, 8);
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return;
    onConfirm(iso);
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={1}
        >
          <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{label}</Text>
          <TextInput
            style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
            placeholder="dd/mm/yyyy"
            placeholderTextColor={colors.mutedForeground}
            value={formatDisplay(raw)}
            onChangeText={handleChange}
            keyboardType="number-pad"
            autoFocus
            maxLength={10}
          />
          <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>Enter date as digits: ddmmyyyy</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: raw.length === 8 ? colors.primary : colors.secondary }]}
              onPress={handleConfirm}
              disabled={raw.length !== 8}
            >
              <Text style={[styles.modalBtnText, { color: raw.length === 8 ? "#fff" : colors.mutedForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── PensionChart (main component) ───────────────────────────────────────────

export function PensionChart({ data, contributions, height = 220 }: PensionChartProps) {
  const colors = useColors();

  const [containerWidth, setContainerWidth] = useState(0);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [rangePreset, setRangePreset] = useState<RangePreset>("All");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // ── Gesture refs ──
  const portraitPtsRef = useRef<ChartPoint[]>([]);
  const zoomRef = useRef(1);
  const portStartX = useRef(0);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const gestureMode = useRef<"idle" | "undecided" | "crosshair" | "scroll" | "pinch">("idle");
  const lastTapTime = useRef(0);
  const scrollOffsetRef = useRef(0);
  const scrollStartRef = useRef(0);
  const innerWRef = useRef(0);
  const rangeFilteredLenRef = useRef(0);
  const visibleLenRef = useRef(0);

  zoomRef.current = zoomScale;
  scrollOffsetRef.current = scrollOffset;

  // ── Derived data ──
  const rangeFilteredData = useMemo(
    () => applyRangeFilter(data, rangePreset, customFrom, customTo),
    [data, rangePreset, customFrom, customTo]
  );

  const visibleData = useMemo(() => {
    if (zoomScale <= 1 || rangeFilteredData.length <= 2) return rangeFilteredData;
    const count = Math.max(2, Math.ceil(rangeFilteredData.length / zoomScale));
    const maxOff = Math.max(0, rangeFilteredData.length - count);
    const off = Math.min(scrollOffset, maxOff);
    return rangeFilteredData.slice(off, off + count);
  }, [rangeFilteredData, zoomScale, scrollOffset]);

  rangeFilteredLenRef.current = rangeFilteredData.length;
  visibleLenRef.current = visibleData.length;

  // ── Geometry ──
  const hasContribsForScale = (contributions?.length ?? 0) > 0;
  const cumulForScale = useMemo(
    () => hasContribsForScale && contributions
      ? computeCumulativeContribs(visibleData.map((d) => d.date), contributions)
      : null,
    [visibleData, contributions, hasContribsForScale]
  );
  const extraVals = useMemo(
    () => cumulForScale?.flatMap((c) => [c.employee, c.total]),
    [cumulForScale]
  );

  const portraitGeo = useMemo(
    () => containerWidth > 0
      ? computeGeometry(visibleData, containerWidth, height, PORT_PAD, extraVals)
      : { points: [] as ChartPoint[], xLabels: [], yTicks: [], innerW: 0, innerH: 0, yOf: (_: number) => 0 },
    [visibleData, containerWidth, height, extraVals]
  );

  portraitPtsRef.current = portraitGeo.points;
  innerWRef.current = portraitGeo.innerW;

  // ── Info panel data ──
  const displayDate = activeDate ?? (data.length > 0 ? data[data.length - 1].date : null);
  const displayEntryIdx = displayDate ? data.findIndex((d) => d.date === displayDate) : -1;
  const displayEntry = displayEntryIdx >= 0 ? data[displayEntryIdx] : null;
  const prevEntry = displayEntryIdx > 0 ? data[displayEntryIdx - 1] : null;
  const displayContribs = displayDate && contributions && contributions.length > 0
    ? computeCumulativeContribs([displayDate], contributions)[0]
    : null;

  // ── Actions ──
  const handleRangeChange = (preset: RangePreset) => {
    setRangePreset(preset);
    setZoomScale(1);
    zoomRef.current = 1;
    setScrollOffset(0);
    scrollOffsetRef.current = 0;
    setActiveDate(null);
  };

  const resetView = () => {
    setZoomScale(1);
    zoomRef.current = 1;
    setScrollOffset(0);
    scrollOffsetRef.current = 0;
    setActiveDate(null);
  };

  // ── PanResponder ──
  const portraitPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          pinchStartDist.current = pinchDistance(touches);
          pinchStartZoom.current = zoomRef.current;
          gestureMode.current = "pinch";
          setActiveDate(null);
        } else {
          const now = Date.now();
          if (now - lastTapTime.current < 280) {
            setZoomScale(1);
            zoomRef.current = 1;
            setScrollOffset(0);
            scrollOffsetRef.current = 0;
            gestureMode.current = "idle";
            lastTapTime.current = 0;
            return;
          }
          lastTapTime.current = now;
          portStartX.current = evt.nativeEvent.locationX;
          scrollStartRef.current = scrollOffsetRef.current;
          gestureMode.current = "undecided";
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2 && gestureMode.current !== "pinch") {
          pinchStartDist.current = pinchDistance(touches);
          pinchStartZoom.current = zoomRef.current;
          gestureMode.current = "pinch";
          setActiveDate(null);
        }

        if (gestureMode.current === "pinch" && touches.length >= 2) {
          const dist = pinchDistance(touches);
          if (pinchStartDist.current && pinchStartDist.current > 0) {
            const newZoom = Math.max(1, Math.min(
              pinchStartZoom.current * (dist / pinchStartDist.current),
              MAX_ZOOM
            ));
            const totalLen = rangeFilteredLenRef.current;
            const newVisCount = Math.max(2, Math.ceil(totalLen / newZoom));
            let newOff: number;
            if (pinchStartZoom.current <= 1.05) {
              newOff = Math.max(0, totalLen - newVisCount);
            } else {
              const oldVisCount = Math.max(2, Math.ceil(totalLen / pinchStartZoom.current));
              const centerIdx = scrollOffsetRef.current + oldVisCount / 2;
              newOff = Math.max(0, Math.min(
                Math.round(centerIdx - newVisCount / 2),
                Math.max(0, totalLen - newVisCount)
              ));
            }
            setZoomScale(newZoom);
            zoomRef.current = newZoom;
            setScrollOffset(newOff);
            scrollOffsetRef.current = newOff;
          }
          return;
        }

        if (gestureMode.current === "undecided") {
          const absDx = Math.abs(gs.dx);
          const absDy = Math.abs(gs.dy);
          if (absDx > 12 && absDx > absDy * 1.5 && zoomRef.current > 1.1) {
            gestureMode.current = "scroll";
            setActiveDate(null);
          } else if (absDx > 5 || absDy > 5) {
            gestureMode.current = "crosshair";
          }
        }

        if (gestureMode.current === "crosshair") {
          setActiveDate(findNearest(portraitPtsRef.current, portStartX.current + gs.dx));
        }

        if (gestureMode.current === "scroll") {
          const pixPerPoint = innerWRef.current / Math.max(1, visibleLenRef.current - 1);
          if (pixPerPoint > 0) {
            const pointDelta = Math.round(-gs.dx / pixPerPoint);
            const maxOff = Math.max(0, rangeFilteredLenRef.current - visibleLenRef.current);
            const newOff = Math.max(0, Math.min(scrollStartRef.current + pointDelta, maxOff));
            setScrollOffset(newOff);
            scrollOffsetRef.current = newOff;
          }
        }
      },

      onPanResponderRelease: () => {
        pinchStartDist.current = null;
        gestureMode.current = "idle";
        setActiveDate(null);
      },
      onPanResponderTerminate: () => {
        pinchStartDist.current = null;
        gestureMode.current = "idle";
        setActiveDate(null);
      },
    })
  ).current;

  // ── Scroll indicator ──
  const showZoomUI = zoomScale > 1.08;
  const thumbFraction = rangeFilteredData.length > 0
    ? Math.max(0.08, visibleData.length / rangeFilteredData.length)
    : 1;
  const scrollFraction = rangeFilteredData.length > visibleData.length
    ? scrollOffset / Math.max(1, rangeFilteredData.length - visibleData.length)
    : 0;

  const hasContribs = (contributions?.length ?? 0) > 0;

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No data yet</Text>
      </View>
    );
  }

  return (
    <>
      {/* ── Range preset chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rangeRow}
        style={styles.rangeScroll}
      >
        {RANGE_PRESETS.map((preset) => {
          const active = rangePreset === preset;
          return (
            <TouchableOpacity
              key={preset}
              style={[
                styles.rangeChip,
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleRangeChange(preset)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.rangeChipText,
                  {
                    color: active ? "#fff" : colors.mutedForeground,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Custom date range inputs ── */}
      {rangePreset === "Custom" && (
        <View style={styles.customDateRow}>
          <TouchableOpacity
            style={[
              styles.dateBtn,
              { backgroundColor: colors.secondary, borderColor: customFrom ? colors.primary : colors.border },
            ]}
            onPress={() => { setShowFromPicker(true); setShowToPicker(false); }}
            activeOpacity={0.75}
          >
            <Ionicons name="calendar-outline" size={14} color={customFrom ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.dateBtnText, { color: customFrom ? colors.foreground : colors.mutedForeground }]}>
              {customFrom ? toDisplay(customFrom) : "From dd/mm/yyyy"}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.dateSep, { color: colors.mutedForeground }]}>→</Text>

          <TouchableOpacity
            style={[
              styles.dateBtn,
              { backgroundColor: colors.secondary, borderColor: customTo ? colors.primary : colors.border },
            ]}
            onPress={() => { setShowToPicker(true); setShowFromPicker(false); }}
            activeOpacity={0.75}
          >
            <Ionicons name="calendar-outline" size={14} color={customTo ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.dateBtnText, { color: customTo ? colors.foreground : colors.mutedForeground }]}>
              {customTo ? toDisplay(customTo) : "To dd/mm/yyyy"}
            </Text>
          </TouchableOpacity>

          {(customFrom || customTo) && (
            <TouchableOpacity
              onPress={() => {
                setCustomFrom("");
                setCustomTo("");
                setScrollOffset(0);
                scrollOffsetRef.current = 0;
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Date picker modal ── */}
      {(showFromPicker || showToPicker) && (
        <DatePickerModal
          label={showFromPicker ? "From date" : "To date"}
          initialValue={showFromPicker ? toDisplay(customFrom) : toDisplay(customTo)}
          colors={colors}
          onConfirm={(iso) => {
            if (showFromPicker) setCustomFrom(iso); else setCustomTo(iso);
            setScrollOffset(0);
            scrollOffsetRef.current = 0;
            setShowFromPicker(false);
            setShowToPicker(false);
          }}
          onCancel={() => {
            setShowFromPicker(false);
            setShowToPicker(false);
          }}
        />
      )}

      {/* ── Native info panel ── */}
      {displayEntry && (
        <NativeInfoPanel
          date={displayEntry.date}
          value={displayEntry.value}
          prevValue={prevEntry?.value ?? null}
          contribs={displayContribs}
          isLive={activeDate === null}
          colors={colors}
        />
      )}

      {/* ── No data in range ── */}
      {rangeFilteredData.length === 0 ? (
        <View style={[styles.empty, { height }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No data in this range
          </Text>
        </View>
      ) : (
        <View style={styles.chartWrapper}>
          {/* Chart canvas */}
          <View
            style={styles.container}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
            {...portraitPan.panHandlers}
          >
            {containerWidth > 0 && (
              <ChartSvg
                data={visibleData}
                contributions={contributions}
                chartW={containerWidth}
                chartH={height}
                pad={PORT_PAD}
                activeDate={activeDate}
                colors={colors}
                fontSize={10}
              />
            )}
          </View>

          {/* Scroll progress bar */}
          {showZoomUI && (
            <View style={[styles.scrollTrack, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.scrollThumb,
                  {
                    backgroundColor: colors.primary,
                    left: `${scrollFraction * (1 - thumbFraction) * 100}%` as `${number}%`,
                    width: `${thumbFraction * 100}%` as `${number}%`,
                  },
                ]}
              />
            </View>
          )}

          {/* Zoom badge */}
          {showZoomUI && (
            <TouchableOpacity onPress={resetView} style={styles.zoomResetRow} activeOpacity={0.7}>
              <Text style={[styles.zoomBadge, { color: colors.mutedForeground }]}>
                {zoomScale.toFixed(1)}× ·{" "}
                {scrollFraction > 0.02 && scrollFraction < 0.98 ? "drag to scroll · " : ""}
                tap to reset
              </Text>
            </TouchableOpacity>
          )}

          {/* Touch hint (shown only when not zoomed) */}
          {!showZoomUI && (
            <Text style={[styles.touchHint, { color: colors.mutedForeground }]}>
              Touch &amp; drag to explore · Pinch to zoom
            </Text>
          )}

          {/* Contribution legend */}
          {hasContribs && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.positive, opacity: 0.75 }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Investment return</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.accent, opacity: 0.75 }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Employer</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.primary, opacity: 0.6 }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>From you</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rangeScroll: {
    marginBottom: 10,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  rangeChipText: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  customDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  dateBtnText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  dateSep: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  chartWrapper: {
    alignSelf: "stretch",
  },
  container: {
    alignSelf: "stretch",
  },
  scrollTrack: {
    height: 3,
    borderRadius: 2,
    marginHorizontal: 4,
    marginTop: 4,
    overflow: "hidden",
    position: "relative",
  },
  scrollThumb: {
    position: "absolute",
    top: 0,
    height: 3,
    borderRadius: 2,
  },
  zoomResetRow: {
    paddingHorizontal: 4,
    paddingTop: 4,
    minHeight: 24,
  },
  zoomBadge: {
    fontSize: 11,
    opacity: 0.7,
    fontFamily: "Inter_400Regular",
  },
  touchHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.45,
    marginTop: 6,
    marginBottom: 2,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2,
  },
  modalHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    borderWidth: 1,
  },
  modalBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
