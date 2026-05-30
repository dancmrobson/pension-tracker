import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
import { useColors } from "@/hooks/useColors";

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

const PORT_PAD: Padding = { left: 52, right: 16, top: 18, bottom: 44 };
const LAND_PAD: Padding = { left: 64, right: 32, top: 36, bottom: 56 };
const MAX_ZOOM = 10;

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `£${(v / 1_000).toFixed(0)}k`;
  return `£${v.toFixed(0)}`;
}

function formatCurrency(v: number): string {
  return `£${v.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Compute cumulative employee + employer contributions as of each pension entry date
function computeCumulativeContribs(
  entryDates: string[],
  contributions: ContributionPoint[]
): { employee: number; employer: number; total: number }[] {
  const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
  return entryDates.map((entryDate) => {
    let emp = 0;
    let emr = 0;
    for (const c of sorted) {
      if (c.date <= entryDate) {
        emp += c.employee;
        emr += c.employer;
      } else {
        break;
      }
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
    if (dist < minDist) {
      minDist = dist;
      nearest = pt;
    }
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
      innerW,
      innerH,
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
    x: xOf(d.date),
    y: yOf(d.value),
    date: d.date,
    value: d.value,
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
      seen.add(label);
      lastX = x;
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
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX.toFixed(1)} ${prev.y.toFixed(1)} ${cpX.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

// Build a closed fill path between two smooth lines (top forward, bottom backward)
function buildFillPath(
  topPts: { x: number; y: number }[],
  bottomPts: { x: number; y: number }[]
): string {
  if (topPts.length < 2 || bottomPts.length < 2) return "";
  let d = buildLinePath(topPts);
  // Line to last bottom point
  d += ` L ${bottomPts[bottomPts.length - 1].x.toFixed(1)} ${bottomPts[bottomPts.length - 1].y.toFixed(1)}`;
  // Backward through bottom
  for (let i = bottomPts.length - 2; i >= 0; i--) {
    const prev = bottomPts[i + 1];
    const curr = bottomPts[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX.toFixed(1)} ${prev.y.toFixed(1)} ${cpX.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  d += " Z";
  return d;
}

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

function ChartSvg({
  data,
  contributions,
  chartW,
  chartH,
  pad,
  activeDate,
  colors,
  fontSize = 10,
}: ChartSvgProps) {
  const hasContribs = (contributions?.length ?? 0) > 0;

  // Cumulative contribution amounts at each entry date
  const cumulContribs = useMemo(
    () =>
      hasContribs && contributions
        ? computeCumulativeContribs(
            data.map((d) => d.date),
            contributions
          )
        : null,
    [data, contributions, hasContribs]
  );

  // Include contribution values in Y-scale so they're always visible
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

  const isPositive =
    data.length >= 2 ? data[data.length - 1].value >= data[0].value : true;
  const lineColor = isPositive ? colors.positive : colors.negative;

  const linePath = buildLinePath(points);
  const bottomY = pad.top + innerH;

  // Pot value gradient fill (existing)
  const potFillPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`
      : "";

  // Contribution lines & fills
  let employeePts: { x: number; y: number }[] = [];
  let totalContribPts: { x: number; y: number }[] = [];
  let investReturnFillPath = "";
  let employerBandFillPath = "";
  let employeeBandFillPath = "";

  if (hasContribs && cumulContribs && points.length >= 2) {
    employeePts = points.map((pt, i) => ({
      x: pt.x,
      y: yOf(cumulContribs[i].employee),
    }));
    totalContribPts = points.map((pt, i) => ({
      x: pt.x,
      y: yOf(cumulContribs[i].total),
    }));

    // Investment return fill: between totalContrib line and potValue line
    investReturnFillPath = buildFillPath(points, totalContribPts);

    // Employer band: between totalContrib and employee lines
    const employerBottomPts = employeePts;
    employerBandFillPath = buildFillPath(totalContribPts, employerBottomPts);

    // Employee band: from employee line down to chart baseline
    const baselinePts = points.map((pt) => ({ x: pt.x, y: bottomY }));
    employeeBandFillPath = buildFillPath(employeePts, baselinePts);
  }

  const activePt = activeDate
    ? (points.find((p) => p.date === activeDate) ?? null)
    : null;
  const activeIdx = activePt ? points.indexOf(activePt) : -1;

  const TT_W = 160;
  const TT_H = hasContribs && activeIdx >= 0 && cumulContribs ? 82 : 52;
  const ttX = activePt
    ? activePt.x + TT_W + 10 > pad.left + innerW
      ? activePt.x - TT_W - 8
      : activePt.x + 8
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

      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <React.Fragment key={i}>
          <Line
            x1={pad.left}
            y1={tick.y}
            x2={pad.left + innerW}
            y2={tick.y}
            stroke={colors.border}
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <SvgText
            x={pad.left - 6}
            y={tick.y + 4}
            fontSize={fontSize}
            fill={colors.mutedForeground}
            textAnchor="end"
            fontFamily="Inter_400Regular"
          >
            {tick.label}
          </SvgText>
        </React.Fragment>
      ))}

      {/* X labels (hidden when crosshair active) */}
      {!activePt &&
        xLabels.map((lbl, i) => (
          <SvgText
            key={i}
            x={lbl.x}
            y={pad.top + innerH + fontSize + 6}
            fontSize={fontSize}
            fill={colors.mutedForeground}
            textAnchor="middle"
            fontFamily="Inter_400Regular"
          >
            {lbl.label}
          </SvgText>
        ))}

      {/* === Contribution fills (rendered below pot value line) === */}
      {hasContribs && employeeBandFillPath ? (
        <Path d={employeeBandFillPath} fill={colors.primary} opacity="0.18" />
      ) : null}
      {hasContribs && employerBandFillPath ? (
        <Path d={employerBandFillPath} fill={colors.accent} opacity="0.28" />
      ) : null}
      {hasContribs && investReturnFillPath ? (
        <Path d={investReturnFillPath} fill="url(#retGrad)" />
      ) : null}

      {/* Pot value gradient fill (only when no contributions) */}
      {!hasContribs && potFillPath ? (
        <Path d={potFillPath} fill="url(#potGrad)" />
      ) : null}

      {/* Contribution lines */}
      {hasContribs && employeePts.length > 1 ? (
        <Path
          d={buildLinePath(employeePts)}
          stroke={colors.primary}
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="5,3"
          opacity="0.7"
        />
      ) : null}
      {hasContribs && totalContribPts.length > 1 ? (
        <Path
          d={buildLinePath(totalContribPts)}
          stroke={colors.accent}
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="5,3"
          opacity="0.85"
        />
      ) : null}

      {/* Pot value line */}
      {points.length > 1 ? (
        <Path
          d={linePath}
          stroke={lineColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Data point dots */}
      {points.map((pt, i) => {
        if (pt.date === activeDate) return null;
        return (
          <Circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? colors.accent : lineColor}
            stroke="#fff"
            strokeWidth="1.5"
          />
        );
      })}

      {/* Crosshair + tooltip */}
      {activePt && (
        <>
          <Line
            x1={activePt.x}
            y1={pad.top}
            x2={activePt.x}
            y2={pad.top + innerH}
            stroke={colors.foreground}
            strokeWidth="1"
            strokeDasharray="4,3"
            opacity="0.25"
          />
          <Circle
            cx={activePt.x}
            cy={activePt.y}
            r={7}
            fill={colors.accent}
            stroke="#fff"
            strokeWidth="2.5"
          />

          {/* Contribution crosshair dots */}
          {hasContribs && cumulContribs && activeIdx >= 0 ? (
            <>
              <Circle
                cx={activePt.x}
                cy={yOf(cumulContribs[activeIdx].employee)}
                r={4}
                fill={colors.primary}
                stroke="#fff"
                strokeWidth="1.5"
              />
              <Circle
                cx={activePt.x}
                cy={yOf(cumulContribs[activeIdx].total)}
                r={4}
                fill={colors.accent}
                stroke="#fff"
                strokeWidth="1.5"
              />
            </>
          ) : null}

          <Rect
            x={ttX}
            y={ttY}
            width={TT_W}
            height={TT_H}
            rx="10"
            fill={colors.primary}
          />
          <SvgText
            x={ttX + TT_W / 2}
            y={ttY + 16}
            fontSize={fontSize}
            fill="rgba(255,255,255,0.7)"
            textAnchor="middle"
            fontFamily="Inter_400Regular"
          >
            {formatFullDate(activePt.date)}
          </SvgText>
          <SvgText
            x={ttX + TT_W / 2}
            y={ttY + 34}
            fontSize={fontSize + 4}
            fill="#fff"
            textAnchor="middle"
            fontFamily="Inter_700Bold"
          >
            {formatCurrency(activePt.value)}
          </SvgText>

          {hasContribs && cumulContribs && activeIdx >= 0 ? (
            <>
              <SvgText
                x={ttX + TT_W / 2}
                y={ttY + 52}
                fontSize={fontSize - 1}
                fill="rgba(255,255,255,0.65)"
                textAnchor="middle"
                fontFamily="Inter_400Regular"
              >
                {`Employee: ${formatCurrency(cumulContribs[activeIdx].employee)}`}
              </SvgText>
              <SvgText
                x={ttX + TT_W / 2}
                y={ttY + 68}
                fontSize={fontSize - 1}
                fill="rgba(255,255,255,0.65)"
                textAnchor="middle"
                fontFamily="Inter_400Regular"
              >
                {`Employer: ${formatCurrency(cumulContribs[activeIdx].employer)}`}
              </SvgText>
            </>
          ) : null}
        </>
      )}
    </Svg>
  );
}

export function PensionChart({ data, contributions, height = 220 }: PensionChartProps) {
  const colors = useColors();
  const { width: winW, height: winH } = useWindowDimensions();
  const autoLandscape = winW > winH && Platform.OS !== "web";

  const [containerWidth, setContainerWidth] = useState(0);
  const [modalSize, setModalSize] = useState({ w: 0, h: 0 });
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const modalVisible = autoLandscape || fullscreen;

  const portraitPtsRef = useRef<ChartPoint[]>([]);
  const modalPtsRef = useRef<ChartPoint[]>([]);
  const zoomRef = useRef(1);
  const portStartX = useRef(0);
  const landStartX = useRef(0);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);
  const gestureMode = useRef<string>("idle");
  const lastTapTime = useRef(0);

  zoomRef.current = zoomScale;

  const visibleData = useMemo(() => {
    if (zoomScale <= 1 || data.length <= 2) return data;
    const count = Math.max(2, Math.ceil(data.length / zoomScale));
    return data.slice(Math.max(0, data.length - count));
  }, [data, zoomScale]);

  // Geometry just for updating pts refs (used by PanResponder)
  const hasContribsForScale = (contributions?.length ?? 0) > 0;
  const cumulForScale = useMemo(
    () =>
      hasContribsForScale && contributions
        ? computeCumulativeContribs(visibleData.map((d) => d.date), contributions)
        : null,
    [visibleData, contributions, hasContribsForScale]
  );
  const extraVals = useMemo(
    () => cumulForScale?.flatMap((c) => [c.employee, c.total]),
    [cumulForScale]
  );

  const portraitGeo = useMemo(
    () =>
      containerWidth > 0
        ? computeGeometry(visibleData, containerWidth, height, PORT_PAD, extraVals)
        : { points: [] as ChartPoint[], xLabels: [], yTicks: [], innerW: 0, innerH: 0, yOf: (_: number) => 0 },
    [visibleData, containerWidth, height, extraVals]
  );
  const modalGeo = useMemo(
    () =>
      modalSize.w > 0
        ? computeGeometry(visibleData, modalSize.w, modalSize.h, LAND_PAD, extraVals)
        : { points: [] as ChartPoint[], xLabels: [], yTicks: [], innerW: 0, innerH: 0, yOf: (_: number) => 0 },
    [visibleData, modalSize.w, modalSize.h, extraVals]
  );

  portraitPtsRef.current = portraitGeo.points;
  modalPtsRef.current = modalGeo.points;

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
            gestureMode.current = "idle";
            lastTapTime.current = 0;
            return;
          }
          lastTapTime.current = now;
          portStartX.current = evt.nativeEvent.locationX;
          gestureMode.current = "crosshair";
          setActiveDate(findNearest(portraitPtsRef.current, portStartX.current));
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
            const newZoom = Math.max(
              1,
              Math.min(pinchStartZoom.current * (dist / pinchStartDist.current), MAX_ZOOM)
            );
            setZoomScale(newZoom);
            zoomRef.current = newZoom;
          }
          return;
        }

        if (gestureMode.current === "crosshair") {
          setActiveDate(findNearest(portraitPtsRef.current, portStartX.current + gs.dx));
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

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No data yet
        </Text>
      </View>
    );
  }

  const hasContribs = (contributions?.length ?? 0) > 0;
  const showZoomLabel = zoomScale > 1.08;

  return (
    <>
      <View style={styles.chartWrapper}>
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

        <View style={styles.overlayRow}>
          {showZoomLabel ? (
            <Text style={[styles.zoomBadge, { color: colors.mutedForeground }]}>
              {zoomScale.toFixed(1)}× · double-tap to reset
            </Text>
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

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setFullscreen(false)}
      >
        <View
          style={[styles.fullscreen, { backgroundColor: colors.background }]}
          onLayout={(e) =>
            setModalSize({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }
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

          {!autoLandscape && (
            <Pressable
              style={[styles.closeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              hitSlop={12}
              onPress={() => { setFullscreen(false); setActiveDate(null); }}
            >
              <Text style={[styles.closeIcon, { color: colors.foreground }]}>✕</Text>
            </Pressable>
          )}

          {!activeDate && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {autoLandscape
                ? "Touch & drag to scan · Rotate to return"
                : "Touch & drag to scan"}
            </Text>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chartWrapper: {
    alignSelf: "stretch",
  },
  container: {
    alignSelf: "stretch",
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  zoomBadge: {
    flex: 1,
    fontSize: 11,
    opacity: 0.7,
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
  },
});
