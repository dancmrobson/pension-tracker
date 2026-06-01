import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
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
const LAND_PAD: Padding = { left: 64, right: 32, top: 36, bottom: 56 };
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

function fromDateObj(date: Date): string {
  return toIso(date);
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

// ─── ChartSvg (pure render, unchanged) ───────────────────────────────────────

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

  const TT_W = 160;
  const TT_H = hasContribs && activeIdx >= 0 && cumulContribs ? 82 : 52;
  const ttX = activePt
    ? activePt.x + TT_W + 10 > pad.left + innerW ? activePt.x - TT_W - 8 : activePt.x + 8
    : 0;
  const ttY = pad.top + 4;

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

      {!activePt && xLabels.map((lbl, i) => (
        <SvgText key={i} x={lbl.x} y={pad.top + innerH + fontSize + 6} fontSize={fontSize}
          fill={colors.mutedForeground} textAnchor="middle" fontFamily="Inter_400Regular">
          {lbl.label}
        </SvgText>
      ))}

      {hasContribs && employeeBandFillPath ? <Path d={employeeBandFillPath} fill={colors.primary} opacity="0.18" /> : null}
      {hasContribs && employerBandFillPath ? <Path d={employerBandFillPath} fill={colors.accent} opacity="0.28" /> : null}
      {hasContribs && investReturnFillPath ? <Path d={investReturnFillPath} fill="url(#retGrad)" /> : null}
      {!hasContribs && potFillPath ? <Path d={potFillPath} fill="url(#potGrad)" /> : null}

      {hasContribs && employeePts.length > 1 ? (
        <Path d={buildLinePath(employeePts)} stroke={colors.primary} strokeWidth="1.5"
          fill="none" strokeDasharray="5,3" opacity="0.7" />
      ) : null}
      {hasContribs && totalContribPts.length > 1 ? (
        <Path d={buildLinePath(totalContribPts)} stroke={colors.accent} strokeWidth="1.5"
          fill="none" strokeDasharray="5,3" opacity="0.85" />
      ) : null}

      {points.length > 1 ? (
        <Path d={linePath} stroke={lineColor} strokeWidth="2.5"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}

      {points.map((pt, i) => {
        if (pt.date === activeDate) return null;
        return (
          <Circle key={i} cx={pt.x} cy={pt.y}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? colors.accent : lineColor}
            stroke="#fff" strokeWidth="1.5" />
        );
      })}

      {activePt && (
        <>
          <Line x1={activePt.x} y1={pad.top} x2={activePt.x} y2={pad.top + innerH}
            stroke={colors.foreground} strokeWidth="1" strokeDasharray="4,3" opacity="0.25" />
          <Circle cx={activePt.x} cy={activePt.y} r={7} fill={colors.accent} stroke="#fff" strokeWidth="2.5" />

          {hasContribs && cumulContribs && activeIdx >= 0 ? (
            <>
              <Circle cx={activePt.x} cy={yOf(cumulContribs[activeIdx].employee)}
                r={4} fill={colors.primary} stroke="#fff" strokeWidth="1.5" />
              <Circle cx={activePt.x} cy={yOf(cumulContribs[activeIdx].total)}
                r={4} fill={colors.accent} stroke="#fff" strokeWidth="1.5" />
            </>
          ) : null}

          <Rect x={ttX} y={ttY} width={TT_W} height={TT_H} rx="10" fill={colors.primary} />
          <SvgText x={ttX + TT_W / 2} y={ttY + 16} fontSize={fontSize}
            fill="rgba(255,255,255,0.7)" textAnchor="middle" fontFamily="Inter_400Regular">
            {formatFullDate(activePt.date)}
          </SvgText>
          <SvgText x={ttX + TT_W / 2} y={ttY + 34} fontSize={fontSize + 4}
            fill="#fff" textAnchor="middle" fontFamily="Inter_700Bold">
            {formatCurrency(activePt.value)}
          </SvgText>
          {hasContribs && cumulContribs && activeIdx >= 0 ? (
            <>
              <SvgText x={ttX + TT_W / 2} y={ttY + 52} fontSize={fontSize - 1}
                fill="rgba(255,255,255,0.65)" textAnchor="middle" fontFamily="Inter_400Regular">
                {`Employee: ${formatCurrency(cumulContribs[activeIdx].employee)}`}
              </SvgText>
              <SvgText x={ttX + TT_W / 2} y={ttY + 68} fontSize={fontSize - 1}
                fill="rgba(255,255,255,0.65)" textAnchor="middle" fontFamily="Inter_400Regular">
                {`Employer: ${formatCurrency(cumulContribs[activeIdx].employer)}`}
              </SvgText>
            </>
          ) : null}
        </>
      )}
    </Svg>
  );
}

// ─── DatePickerModal (pure JS, no native modules — works in Expo Go) ─────────

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
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              style={[styles.modalBtn, styles.modalBtnConfirm, { backgroundColor: raw.length === 8 ? colors.primary : colors.secondary }]}
              onPress={handleConfirm}
              disabled={raw.length !== 8}
            >
              <Text style={[styles.modalBtnText, { color: raw.length === 8 ? "#fff" : colors.mutedForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── PensionChart (main component) ───────────────────────────────────────────

export function PensionChart({ data, contributions, height = 220 }: PensionChartProps) {
  const colors = useColors();
  const { width: winW, height: winH } = useWindowDimensions();
  const autoLandscape = winW > winH && Platform.OS !== "web";

  // ── UI state ──
  const [containerWidth, setContainerWidth] = useState(0);
  const [modalSize, setModalSize] = useState({ w: 0, h: 0 });
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>("All");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const modalVisible = fullscreen;

  // Lock to landscape when fullscreen button opens the modal; unlock on close.
  // Errors are suppressed — Expo Go may reject lockAsync in some configurations.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (fullscreen) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.unlockAsync().catch(() => {});
      };
    }
  }, [fullscreen]);

  // "Rotate to return": once the fullscreen modal has been landscape (lockAsync
  // succeeded or user rotated manually), rotating back to portrait auto-closes.
  // If lockAsync failed (device stayed portrait), wasLandscape stays false and
  // the user dismisses via the ✕ button instead.
  const wasLandscapeWhileFullscreen = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (fullscreen && autoLandscape) {
      wasLandscapeWhileFullscreen.current = true;
    } else if (fullscreen && !autoLandscape && wasLandscapeWhileFullscreen.current) {
      wasLandscapeWhileFullscreen.current = false;
      setFullscreen(false);
      setActiveDate(null);
    }
    if (!fullscreen) {
      wasLandscapeWhileFullscreen.current = false;
    }
  }, [fullscreen, autoLandscape]);

  // ── Gesture refs (stable across renders, safe for PanResponder closures) ──
  const portraitPtsRef = useRef<ChartPoint[]>([]);
  const modalPtsRef = useRef<ChartPoint[]>([]);
  const zoomRef = useRef(1);
  const portStartX = useRef(0);
  const landStartX = useRef(0);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const gestureMode = useRef<"idle" | "undecided" | "crosshair" | "scroll" | "pinch">("idle");
  const lastTapTime = useRef(0);
  const scrollOffsetRef = useRef(0);
  const scrollStartRef = useRef(0);
  const innerWRef = useRef(0);
  const rangeFilteredLenRef = useRef(0);
  const visibleLenRef = useRef(0);

  // Mirror state into refs (synchronously in render for PanResponder access)
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

  // Update measurement refs in render
  rangeFilteredLenRef.current = rangeFilteredData.length;
  visibleLenRef.current = visibleData.length;

  // ── Geometry (for hit-test refs used by PanResponder) ──
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
  const modalGeo = useMemo(
    () => modalSize.w > 0
      ? computeGeometry(visibleData, modalSize.w, modalSize.h, LAND_PAD, extraVals)
      : { points: [] as ChartPoint[], xLabels: [], yTicks: [], innerW: 0, innerH: 0, yOf: (_: number) => 0 },
    [visibleData, modalSize.w, modalSize.h, extraVals]
  );

  portraitPtsRef.current = portraitGeo.points;
  modalPtsRef.current = modalGeo.points;
  innerWRef.current = portraitGeo.innerW;

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

  // ── Portrait PanResponder ──
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
            // Double-tap → reset
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

        // Upgrade to pinch if second finger appears
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
              // Anchored to right (latest data) when starting from full view
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

        // Resolve undecided gesture mode
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

  // ── Modal (landscape / fullscreen) PanResponder — crosshair only ──
  const modalPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        landStartX.current = evt.nativeEvent.locationX;
        setActiveDate(findNearest(modalPtsRef.current, landStartX.current));
      },
      onPanResponderMove: (_, gs) => {
        setActiveDate(findNearest(modalPtsRef.current, landStartX.current + gs.dx));
      },
      onPanResponderRelease: () => setActiveDate(null),
      onPanResponderTerminate: () => setActiveDate(null),
    })
  ).current;

  // ── Scroll progress indicator ──
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
                { backgroundColor: active ? colors.primary : colors.secondary },
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
          {/* From date */}
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

          {/* To date */}
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

          {/* Clear button */}
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

      {/* ── Date picker modal (pure JS, works in Expo Go) ── */}
      {(showFromPicker || showToPicker) && (
        <DatePickerModal
          label={showFromPicker ? "From date" : "To date"}
          initialValue={showFromPicker ? toDisplay(customFrom) : toDisplay(customTo)}
          colors={colors}
          onConfirm={(iso) => {
            if (showFromPicker) {
              setCustomFrom(iso);
            } else {
              setCustomTo(iso);
            }
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

          {/* Scroll progress bar (visible when zoomed in) */}
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

          {/* Overlay row: zoom badge + reset + expand button */}
          <View style={styles.overlayRow}>
            {showZoomUI ? (
              <TouchableOpacity onPress={resetView} style={styles.zoomResetRow} activeOpacity={0.7}>
                <Text style={[styles.zoomBadge, { color: colors.mutedForeground }]}>
                  {zoomScale.toFixed(1)}× ·{" "}
                  {scrollFraction > 0.02 && scrollFraction < 0.98 ? "drag to scroll · " : ""}
                  tap to reset
                </Text>
              </TouchableOpacity>
            ) : null}
            <Pressable
              style={[styles.expandBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              hitSlop={12}
              onPress={() => { setFullscreen(true); setActiveDate(null); }}
            >
              <Text style={[styles.expandIcon, { color: colors.mutedForeground }]}>⛶</Text>
            </Pressable>
          </View>

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

      {/* ── Fullscreen / landscape modal ── */}
      <Modal
        visible={modalVisible}
        animationType="none"
        transparent={false}
        statusBarTranslucent={false}
        onRequestClose={() => setFullscreen(false)}
      >
        <View
          style={[styles.fullscreen, { backgroundColor: colors.background }]}
          onLayout={(e) => setModalSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          {...modalPan.panHandlers}
        >
          {modalSize.w > 0 && (
            <ChartSvg
              data={visibleData}
              contributions={contributions}
              chartW={modalSize.w}
              chartH={modalSize.h}
              pad={LAND_PAD}
              activeDate={activeDate}
              colors={colors}
              fontSize={12}
            />
          )}

          <Pressable
            style={[styles.closeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            hitSlop={12}
            onPress={() => { setFullscreen(false); setActiveDate(null); }}
          >
            <Text style={[styles.closeIcon, { color: colors.foreground }]}>✕</Text>
          </Pressable>

          {!activeDate && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {"Touch & drag to scan · Rotate to return"}
            </Text>
          )}
        </View>
      </Modal>
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
  dateInputWeb: {
    flex: 1,
    height: 36,
    paddingHorizontal: 10,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 8,
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
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  zoomResetRow: {
    flex: 1,
  },
  zoomBadge: {
    fontSize: 11,
    opacity: 0.7,
    fontFamily: "Inter_400Regular",
  },
  expandBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  expandIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 4,
    paddingTop: 6,
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
  fullscreen: {
    flex: 1,
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    fontSize: 12,
    opacity: 0.5,
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
  modalBtnConfirm: {},
  modalBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
