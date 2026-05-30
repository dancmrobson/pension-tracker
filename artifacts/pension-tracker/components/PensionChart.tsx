import React, { useMemo } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function formatValue(v: number): string {
  if (v >= 1000000) return `£${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `£${(v / 1000).toFixed(0)}k`;
  return `£${v.toFixed(0)}`;
}

export function PensionChart({ data, height = 220 }: PensionChartProps) {
  const colors = useColors();
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 32;

  const PAD = { left: 52, right: 16, top: 18, bottom: 44 };
  const innerW = chartWidth - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const { points, minVal, maxVal, xLabels, yTicks } = useMemo(() => {
    if (data.length === 0) {
      return { points: [], minVal: 0, maxVal: 0, xLabels: [], yTicks: [] };
    }

    const values = data.map((d) => d.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = (rawMax - rawMin) * 0.15 || rawMax * 0.1 || 1000;
    const minV = rawMin - padding;
    const maxV = rawMax + padding;

    const dates = data.map((d) => new Date(d.date + "T00:00:00").getTime());
    const minT = Math.min(...dates);
    const maxT = Math.max(...dates);
    const tRange = maxT - minT || 1;

    const pts = data.map((d, i) => {
      const t = new Date(d.date + "T00:00:00").getTime();
      const x = data.length === 1
        ? PAD.left + innerW / 2
        : PAD.left + ((t - minT) / tRange) * innerW;
      const y = PAD.top + ((maxV - d.value) / (maxV - minV)) * innerH;
      return { x, y, date: d.date, value: d.value };
    });

    const labelCount = Math.min(data.length, 4);
    const step = Math.max(1, Math.floor(data.length / labelCount));
    const xLabels = data
      .filter((_, i) => i % step === 0 || i === data.length - 1)
      .map((d) => {
        const t = new Date(d.date + "T00:00:00").getTime();
        const x = data.length === 1
          ? PAD.left + innerW / 2
          : PAD.left + ((t - minT) / tRange) * innerW;
        return { label: formatShortDate(d.date), x };
      });

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const val = minV + ((maxV - minV) * i) / tickCount;
      const y = PAD.top + ((maxV - val) / (maxV - minV)) * innerH;
      return { label: formatValue(val), y };
    });

    return { points: pts, minVal: minV, maxVal: maxV, xLabels, yTicks };
  }, [data, innerW, innerH, PAD.left, PAD.top]);

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No data yet
        </Text>
      </View>
    );
  }

  const buildLinePath = (pts: typeof points) => {
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
  };

  const linePath = buildLinePath(points);
  const bottomY = PAD.top + innerH;
  const fillPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`
      : "";

  const isPositive =
    data.length >= 2 ? data[data.length - 1].value >= data[0].value : true;
  const lineColor = isPositive ? colors.positive : colors.negative;

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.18" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick, i) => (
          <React.Fragment key={i}>
            <Line
              x1={PAD.left}
              y1={tick.y}
              x2={PAD.left + innerW}
              y2={tick.y}
              stroke={colors.border}
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <SvgText
              x={PAD.left - 6}
              y={tick.y + 4}
              fontSize="10"
              fill={colors.mutedForeground}
              textAnchor="end"
              fontFamily="Inter_400Regular"
            >
              {tick.label}
            </SvgText>
          </React.Fragment>
        ))}

        {xLabels.map((lbl, i) => (
          <SvgText
            key={i}
            x={lbl.x}
            y={PAD.top + innerH + 18}
            fontSize="10"
            fill={colors.mutedForeground}
            textAnchor="middle"
            fontFamily="Inter_400Regular"
          >
            {lbl.label}
          </SvgText>
        ))}

        {fillPath ? (
          <Path d={fillPath} fill="url(#grad)" />
        ) : null}

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

        {points.map((pt, i) => (
          <Circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === points.length - 1 ? 5 : 3}
            fill={i === points.length - 1 ? colors.accent : lineColor}
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}
      </Svg>
    </View>
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
});
