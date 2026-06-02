import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Text } from '../../../components/ui/Text';
import { personColorFor, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Expense } from '../../../core/models/Expense';
import type { TripMember } from '../../../core/models/TripMember';

// ── SVG canvas constants ──────────────────────────────────────────────────────
const CX = 150;   // ellipse centre x
const CY = 82;    // ellipse centre y
const RX = 118;   // x-radius
const RY = 52;    // y-radius (≈ RX * 0.44 — gives the isometric tilt)
const DEPTH = 18; // extrusion depth (3D effect)

// ── Geometry helpers ──────────────────────────────────────────────────────────

function ep(angle: number) {
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
}

function topSlicePath(start: number, end: number): string {
  if (Math.abs(end - start) >= 2 * Math.PI - 0.001) {
    // Full circle: two semicircular arcs
    return (
      `M ${CX + RX} ${CY}` +
      ` A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY}` +
      ` A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY} Z`
    );
  }
  const s = ep(start);
  const e = ep(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${s.x} ${s.y} A ${RX} ${RY} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function sideWallPath(start: number, end: number): string {
  if (Math.abs(end - start) >= 2 * Math.PI - 0.001) {
    // Full circle side wall
    return (
      `M ${CX + RX} ${CY}` +
      ` A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY}` +
      ` L ${CX - RX} ${CY + DEPTH}` +
      ` A ${RX} ${RY} 0 1 0 ${CX + RX} ${CY + DEPTH} Z`
    );
  }
  const ts = ep(start);
  const te = ep(end);
  const bs = { x: ts.x, y: ts.y + DEPTH };
  const be = { x: te.x, y: te.y + DEPTH };
  const large = end - start > Math.PI ? 1 : 0;
  return (
    `M ${ts.x} ${ts.y}` +
    ` L ${bs.x} ${bs.y}` +
    ` A ${RX} ${RY} 0 ${large} 1 ${be.x} ${be.y}` +
    ` L ${te.x} ${te.y}` +
    ` A ${RX} ${RY} 0 ${large} 0 ${ts.x} ${ts.y} Z`
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SpendPieChartProps {
  expenses: Expense[];
  members: TripMember[];
  currency: string;
}

export function SpendPieChart({ expenses, members, currency }: SpendPieChartProps) {
  const colors = useColors();

  const { slices, totalCents } = useMemo(() => {
    const spendByUser = members
      .map(m => ({
        userId:      m.userId,
        displayName: m.displayName,
        amountCents: expenses
          .filter(e => e.paidByUserId === m.userId)
          .reduce((sum, e) => sum + e.totalAmountCents, 0),
      }))
      .filter(s => s.amountCents > 0);

    const total = spendByUser.reduce((sum, s) => sum + s.amountCents, 0);
    if (total === 0) return { slices: [], totalCents: 0 };

    let angle = -Math.PI / 2; // start at 12 o'clock
    const built = spendByUser.map((s, i) => {
      const span  = (s.amountCents / total) * 2 * Math.PI;
      const start = angle;
      const end   = angle + span;
      angle       = end;
      return {
        ...s,
        start,
        end,
        color: personColorFor(s.userId, members),
        midAngle: start + span / 2,
      };
    });

    // Painter's algorithm: back slices (sin < 0) before front slices (sin > 0)
    built.sort((a, b) => Math.sin(a.midAngle) - Math.sin(b.midAngle));

    return { slices: built, totalCents: total };
  }, [expenses, members]);

  if (slices.length === 0) {
    return null;
  }

  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.sm }}
      >
        Spend Breakdown
      </Text>

      {/* Isometric disc chart */}
      <View style={{ alignItems: 'center' }}>
        <Svg width={300} height={182} accessibilityLabel="Spend breakdown chart">
          {slices.map((s, i) => {
            const isFront = Math.sin(s.midAngle) > 0;
            return (
              <G key={i}>
                {isFront && (
                  <Path
                    d={sideWallPath(s.start, s.end)}
                    fill={s.color.bg}
                    opacity={0.85}
                  />
                )}
                <Path
                  d={topSlicePath(s.start, s.end)}
                  fill={s.color.text}
                  stroke={colors.background}
                  strokeWidth={1.5}
                />
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Legend — full-bleed colored chips */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: tokens.spacing.xs,
          marginTop: tokens.spacing.sm,
        }}
      >
        {slices.map((s, i) => (
          <View
            key={i}
            style={{
              backgroundColor: s.color.bg,
              borderRadius: tokens.radius.md,
              paddingHorizontal: tokens.spacing.sm,
              paddingVertical: tokens.spacing.xs,
              borderWidth: 1,
              borderColor: s.color.text + '40',
            }}
          >
            <Text variant="caption" color={s.color.text}>
              {s.displayName.split(/\s+/)[0]} · {formatCurrency(s.amountCents, currency)}
            </Text>
          </View>
        ))}
      </View>

      {/* Total */}
      <Text
        variant="caption"
        color={colors.text.tertiary}
        style={{ textAlign: 'center', marginTop: tokens.spacing.xs }}
      >
        Total: {formatCurrency(totalCents, currency)}
      </Text>
    </View>
  );
}
