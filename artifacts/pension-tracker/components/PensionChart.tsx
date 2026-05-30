import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
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

interface PensionChartProps {
  data: DataPoint[];
  height?: number;
}

type ChartPoint = { x: number; y: number; date: string; value: number };
type Padding = { left: number; right: number; top: number; bottom: number };

const PORT_PAD: Padding = { left: 52, right: 16, top: 18, bottom: 44 };
const LAND_PAD: Padding = { left: 64, right: 32, top: 28, bottom: 56 };

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

function computeGeometry(
  data: DataPoint[],
  chartW: number,
  chartH: number,
  pad: Padding
) {
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  if (data.length === 0) {
    return {
      points: [] as ChartPoint[],
      xLabels: [] as { label: string; x: number }[],
      yTicks: [] as { label: string; y: number }[],
      innerW,
      innerH,
    };
  }

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const vPad = (rawMax - rawMin) * 0.15 || rawMax * 0.1 || 1000;
  const minV = rawMin - vPad;
  const maxV = rawMax + vPad;

  const times = data.map((d) => new Date(d.date + "T00:00:00").getTime());
  const minT = Math.min(...times);
  const tRange = (Math.max(...times) - minT) || 1;

  const xOf = (dateStr: string) => {
    const t = new Date(dateStr + "T00:00:00").getTime();
    return data.length === 1
      ? pad.left + innerW / 2
      : pad.left + ((t - minT) / tRange) * innerW;
  };
  const yOf = (v: number) =>
    pad.top + ((maxV - v) / (maxV - minV)) * innerH;

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

  return { points, xLabels, yTicks, innerW, innerH };
}

function buildLinePath(pts: ChartPoint[]): string {
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

interface ChartSvgProps {
  data: DataPoint[];
  chartW: number;
  chartH: number;
  pad: Padding;
  activeDate: string | null;
  colors: ReturnType<typeof useColors>;
  fontSize?: number;
}

function ChartSvg({
  data,
  chartW,
  chartH,
  pad,
  activeDate,
  colors,
  fontSize = 10,
}: ChartSvgProps) {
  const geo = useMemo(
    () => computeGeometry(data, chartW, chartH, pad),
    [data, chartW, chartH, pad]
  );
  const { points, xLabels, yTicks, innerW, innerH } = geo;

  if (points.length === 0) return null;

  const isPositive =
    data.length >= 2 ? data[data.length - 1].value >= data[0].value : true;
  const lineColor = isPositive ? colors.positive : colors.negative;

  const linePath = buildLinePath(points);
  const bottomY = pad.top + innerH;
  const fillPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`
      : "";

  const activePt = activeDate
    ? (points.find((p) => p.date === activeDate) ?? null)
    : null;

  const TT_W = 140;
  const TT_H = 50;
  const ttX = activePt
    ? activePt.x + TT_W + 10 > pad.left + innerW
      ? activePt.x - TT_W - 8
      : activePt.x + 8
    : 0;
  const ttY = pad.top + 4;

  return (
    <Svg width={chartW} height={chartH}>
      <Defs>
        <LinearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lineColor} stopOpacity="0.18" />
          <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* Y-axis grid + labels */}
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

      {/* X-axis labels — hidden while scanning */}
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

      {/* Area fill */}
      {fillPath ? <Path d={fillPath} fill="url(#cg)" /> : null}

      {/* Line */}
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

      {/* Dots — skip the active one, drawn separately below */}
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
            y={ttY + 18}
            fontSize={fontSize + 1}
            fill="rgba(255,255,255,0.75)"
            textAnchor="middle"
            fontFamily="Inter_400Regular"
          >
            {formatFullDate(activePt.date)}
          </SvgText>
          <SvgText
            x={ttX + TT_W / 2}
            y={ttY + 37}
            fontSize={fontSize + 4}
            fill="#fff"
            textAnchor="middle"
            fontFamily="Inter_700Bold"
          >
            {formatCurrency(activePt.value)}
          </SvgText>
        </>
      )}
    </Svg>
  );
}

export function PensionChart({ data, height = 220 }: PensionChartProps) {
  const colors = useColors();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH && Platform.OS !== "web";

  const [activeDate, setActiveDate] = useState<string | null>(null);

  const portraitPtsRef = useRef<ChartPoint[]>([]);
  const landscapePtsRef = useRef<ChartPoint[]>([]);

  const portraitGeo = useMemo(
    () => computeGeometry(data, winW - 32, height, PORT_PAD),
    [data, winW, height]
  );
  const landscapeGeo = useMemo(
    () => computeGeometry(data, winW, winH, LAND_PAD),
    [data, winW, winH]
  );

  portraitPtsRef.current = portraitGeo.points;
  landscapePtsRef.current = landscapeGeo.points;

  const findNearest = (pts: ChartPoint[], touchX: number): string | null => {
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
  };

  const portraitPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) =>
        setActiveDate(
          findNearest(portraitPtsRef.current, evt.nativeEvent.locationX)
        ),
      onPanResponderMove: (evt) =>
        setActiveDate(
          findNearest(portraitPtsRef.current, evt.nativeEvent.locationX)
        ),
      onPanResponderRelease: () => setActiveDate(null),
      onPanResponderTerminate: () => setActiveDate(null),
    })
  ).current;

  const landscapePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) =>
        setActiveDate(
          findNearest(landscapePtsRef.current, evt.nativeEvent.locationX)
        ),
      onPanResponderMove: (evt) =>
        setActiveDate(
          findNearest(landscapePtsRef.current, evt.nativeEvent.locationX)
        ),
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

  return (
    <>
      {/* Portrait chart */}
      <View style={styles.container} {...portraitPan.panHandlers}>
        <ChartSvg
          data={data}
          chartW={winW - 32}
          chartH={height}
          pad={PORT_PAD}
          activeDate={activeDate}
          colors={colors}
          fontSize={10}
        />
      </View>

      {/* Fullscreen landscape modal — auto-shows on rotation */}
      <Modal
        visible={isLandscape}
        animationType="none"
        transparent={false}
        statusBarTranslucent
        hardwareAccelerated
      >
        <View
          style={[styles.fullscreen, { backgroundColor: colors.background }]}
          {...landscapePan.panHandlers}
        >
          <ChartSvg
            data={data}
            chartW={winW}
            chartH={winH}
            pad={LAND_PAD}
            activeDate={activeDate}
            colors={colors}
            fontSize={12}
          />
          {!activeDate && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Touch &amp; drag to scan · Rotate to return
            </Text>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
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
    justifyContent: "center",
    alignItems: "center",
  },
  hint: {
    position: "absolute",
    bottom: 14,
    fontSize: 12,
    opacity: 0.55,
  },
});
