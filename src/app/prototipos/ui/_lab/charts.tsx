"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { compactUYU, formatUYU, type CashflowPoint } from "./data";

// UI-01 — Gráficos SVG sin dependencias. Reglas: un solo eje, marcas finas,
// separación de 2 px entre rellenos, leyenda siempre presente con ≥ 2 series,
// tooltip por puntero y por teclado, y tabla equivalente para no depender del
// color ni del puntero.

export const seriesColors = { income: "#199e70", expense: "#9085e9" } as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (step / 2)) * (step / 2);
}

/** Barra con extremo de datos redondeado (4 px) y base recta sobre el eje. */
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  up = true,
) {
  const r = Math.min(4, width / 2, Math.abs(height));
  if (height <= 0) return "";
  if (up)
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return `M${x},${y}V${y + height - r}Q${x},${y + height} ${x + r},${y + height}H${x + width - r}Q${x + width},${y + height} ${x + width},${y + height - r}V${y}Z`;
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; shape?: "rect" | "line" }[];
}) {
  return (
    <ul className="lab-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span
            aria-hidden="true"
            className={item.shape === "line" ? "lab-key-line" : "lab-key-rect"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({
  x,
  width,
  children,
}: {
  x: number;
  width: number;
  children: ReactNode;
}) {
  const left = Math.min(Math.max(x, 96), width - 96);
  return (
    <div role="status" className="lab-tooltip" style={{ left }}>
      {children}
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <p className="lab-tooltip__row">
      <span
        aria-hidden="true"
        className="lab-key-line"
        style={{ background: color }}
      />
      <strong>{value}</strong>
      <span>{label}</span>
    </p>
  );
}

export function CashflowChart({
  data,
  mode,
  height = 240,
}: {
  data: readonly CashflowPoint[];
  mode: "bars" | "area" | "mirror";
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, "");
  const pad = {
    top: mode === "mirror" ? 26 : 12,
    right: 8,
    bottom: 28,
    left: 44,
  };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(
    Math.max(...data.map((d) => Math.max(d.income, d.expense))),
  );
  const step = plotW / data.length;
  const zero = mode === "mirror" ? pad.top + plotH / 2 : pad.top + plotH;
  const scale = mode === "mirror" ? plotH / 2 / max : plotH / max;
  const ticks =
    mode === "mirror"
      ? [max, max / 2, 0, max / 2, max]
      : [max, (max * 2) / 3, max / 3, 0];
  const center = (i: number) => pad.left + step * i + step / 2;

  const label = (d: CashflowPoint) =>
    `${d.label}${d.inProgress ? " (mes en curso)" : ""}: ingresos ${formatUYU(d.income)}, gastos ${formatUYU(d.expense)}, resultado ${formatUYU(d.income - d.expense)}`;

  const line = (key: "income" | "expense") =>
    data
      .map((d, i) => `${i ? "L" : "M"}${center(i)},${zero - d[key] * scale}`)
      .join("");

  return (
    <div className="lab-chart">
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Ingresos y gastos de los últimos seis meses en UYU"
            className="block overflow-visible"
          >
            <defs>
              <pattern
                id={`${gradient}-hatch`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="currentColor" opacity="0.18" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  opacity="0.55"
                />
              </pattern>
              {(["income", "expense"] as const).map((key) => (
                <linearGradient
                  key={key}
                  id={`${gradient}-${key}`}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0"
                    stopColor={seriesColors[key]}
                    stopOpacity="0.34"
                  />
                  <stop
                    offset="1"
                    stopColor={seriesColors[key]}
                    stopOpacity="0"
                  />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((tick, i) => {
              const y =
                mode === "mirror"
                  ? pad.top + (plotH / 4) * i
                  : pad.top + (plotH / 3) * i;
              return (
                <g key={i} className="lab-grid">
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    strokeDasharray={tick === 0 ? undefined : "2 4"}
                  />
                  <text x={pad.left - 10} y={y} dy="0.32em" textAnchor="end">
                    {tick === 0
                      ? "0"
                      : `${mode === "mirror" && i > 2 ? "−" : ""}${compactUYU(tick)}`}
                  </text>
                </g>
              );
            })}
            {active !== null && mode !== "bars" && (
              <rect
                className="lab-hover-band"
                x={pad.left + step * active + 4}
                width={step - 8}
                y={pad.top}
                height={plotH}
                rx="8"
              />
            )}

            {mode === "area" && (
              <>
                {(["expense", "income"] as const).map((key) => (
                  <g key={key}>
                    <path
                      d={`${line(key)}L${center(data.length - 1)},${zero}L${center(0)},${zero}Z`}
                      fill={`url(#${gradient}-${key})`}
                    />
                    <path
                      d={line(key)}
                      fill="none"
                      stroke={seriesColors[key]}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="lab-draw"
                    />
                  </g>
                ))}
                {active !== null && (
                  <g>
                    <line
                      className="lab-crosshair"
                      x1={center(active)}
                      x2={center(active)}
                      y1={pad.top}
                      y2={zero}
                    />
                    {(["income", "expense"] as const).map((key) => (
                      <circle
                        key={key}
                        cx={center(active)}
                        cy={zero - data[active][key] * scale}
                        r="5"
                        fill={seriesColors[key]}
                        className="lab-dot-ring"
                      />
                    ))}
                  </g>
                )}
              </>
            )}

            {mode !== "area" &&
              data.map((d, i) => {
                const barW = Math.min(
                  mode === "mirror" ? 26 : 18,
                  (step - 16) / (mode === "mirror" ? 1 : 2),
                );
                const muted = active !== null && active !== i;
                if (mode === "mirror") {
                  const x = center(i) - barW / 2;
                  const incomeH = d.income * scale;
                  const expenseH = d.expense * scale;
                  const net = d.income - d.expense;
                  return (
                    <g
                      key={d.period}
                      className={`lab-bar-group${muted ? " is-muted" : ""}`}
                    >
                      <path
                        d={barPath(x, zero - incomeH - 1, barW, incomeH, true)}
                        fill={seriesColors.income}
                      />
                      <path
                        d={barPath(x, zero + 1, barW, expenseH, false)}
                        fill={seriesColors.expense}
                      />
                      {d.inProgress && (
                        <path
                          d={barPath(x, zero + 1, barW, expenseH, false)}
                          fill={`url(#${gradient}-hatch)`}
                          className="text-[#0b1220]"
                        />
                      )}
                      {/* Etiqueta directa del resultado solo si hay espacio;
                          en pantallas angostas vive en el tooltip y la tabla. */}
                      {step >= 56 && (
                        <text
                          className="lab-net-label"
                          x={center(i)}
                          y={zero - incomeH - 10}
                          textAnchor="middle"
                        >
                          {net >= 0 ? "+" : "−"}
                          {compactUYU(Math.abs(net))}
                        </text>
                      )}
                    </g>
                  );
                }
                const x1 = center(i) - barW - 1;
                const x2 = center(i) + 1;
                return (
                  <g
                    key={d.period}
                    className={`lab-bar-group${muted ? " is-muted" : ""}`}
                  >
                    <path
                      d={barPath(
                        x1,
                        zero - d.income * scale,
                        barW,
                        d.income * scale,
                      )}
                      fill={seriesColors.income}
                    />
                    <path
                      d={barPath(
                        x2,
                        zero - d.expense * scale,
                        barW,
                        d.expense * scale,
                      )}
                      fill={seriesColors.expense}
                    />
                    {d.inProgress && (
                      <path
                        d={barPath(
                          x2,
                          zero - d.expense * scale,
                          barW,
                          d.expense * scale,
                        )}
                        fill={`url(#${gradient}-hatch)`}
                        className="text-[#0b1220]"
                      />
                    )}
                  </g>
                );
              })}

            {data.map((d, i) => (
              <g key={d.period}>
                <text
                  className={`lab-axis-x${active === i ? " is-active" : ""}`}
                  x={center(i)}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {d.label}
                  {d.inProgress ? " ·" : ""}
                </text>
                <rect
                  x={pad.left + step * i}
                  y={pad.top}
                  width={step}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={label(d)}
                  className="lab-hit"
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            ))}
          </svg>
        )}
        {active !== null && width > 0 && (
          <Tooltip x={center(active)} width={width}>
            <p className="lab-tooltip__title">
              {data[active].label} 2026
              {data[active].inProgress ? " · en curso" : ""}
            </p>
            <TooltipRow
              color={seriesColors.income}
              label="Ingresos"
              value={formatUYU(data[active].income)}
            />
            <TooltipRow
              color={seriesColors.expense}
              label="Gastos"
              value={formatUYU(data[active].expense)}
            />
            <p className="lab-tooltip__foot">
              Resultado{" "}
              <strong>
                {formatUYU(data[active].income - data[active].expense)}
              </strong>
            </p>
          </Tooltip>
        )}
      </div>
      <div className="lab-chart__foot">
        <ChartLegend
          items={[
            {
              label: "Ingresos",
              color: seriesColors.income,
              shape: mode === "area" ? "line" : "rect",
            },
            {
              label: "Gastos",
              color: seriesColors.expense,
              shape: mode === "area" ? "line" : "rect",
            },
          ]}
        />
        <details className="lab-table-toggle">
          <summary>Ver como tabla</summary>
          <table className="lab-mini-table">
            <caption className="sr-only">
              Ingresos y gastos mensuales en UYU
            </caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos</th>
                <th scope="col">Gastos</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.period}>
                  <th scope="row">
                    {d.label}
                    {d.inProgress ? " (en curso)" : ""}
                  </th>
                  <td>{formatUYU(d.income)}</td>
                  <td>{formatUYU(d.expense)}</td>
                  <td>{formatUYU(d.income - d.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}

type Category = { name: string; amount: number; color: string };

function percent(value: number, total: number) {
  return `${((value / total) * 100).toFixed(1).replace(".", ",")} %`;
}

/** Anillo con total al centro; el foco o el puntero cambian la lectura central. */
export function CategoryDonut({
  data,
  total,
  size = 188,
}: {
  data: Category[];
  total: number;
  size?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const gap = 4; // ≈ 2 px de superficie a cada lado del segmento
  const offsets = data.map((_, i) =>
    data
      .slice(0, i)
      .reduce((sum, d) => sum + (d.amount / total) * circumference, 0),
  );
  const current = active === null ? null : data[active];
  return (
    <div className="lab-donut">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Distribución de gastos del mes por categoría"
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="lab-donut__track"
            strokeWidth="14"
          />
          {data.map((d, i) => {
            const length = (d.amount / total) * circumference;
            const dash = `${Math.max(0, length - gap)} ${circumference}`;
            return (
              <circle
                key={d.name}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={active === i ? 18 : 14}
                strokeDasharray={dash}
                strokeDashoffset={-offsets[i]}
                strokeLinecap="butt"
                className={`lab-donut__seg${active !== null && active !== i ? " is-muted" : ""}`}
                tabIndex={0}
                role="img"
                aria-label={`${d.name}: ${formatUYU(d.amount)}, ${percent(d.amount, total)}`}
                onPointerEnter={() => setActive(i)}
                onPointerMove={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            );
          })}
        </svg>
        <div className="lab-donut__center" aria-hidden="true">
          <span className="lab-donut__label">
            {current ? current.name : "Gastos del mes"}
          </span>
          <strong className="lab-donut__value">
            {compactUYU(current ? current.amount : total)}
          </strong>
          <span className="lab-donut__label">
            {current ? percent(current.amount, total) : "UYU"}
          </span>
        </div>
      </div>
      <ul className="lab-donut__legend" aria-label="Detalle por categoría">
        {data.map((d, i) => (
          <li key={d.name} className={active === i ? "is-active" : undefined}>
            <span
              aria-hidden="true"
              className="lab-key-rect"
              style={{ background: d.color }}
            />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto tabular-nums">{formatUYU(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tendencia mínima para tarjetas de indicadores (serie única, sin leyenda). */
export function Sparkline({
  values,
  color,
  label,
  width = 120,
  height = 36,
}: {
  values: number[];
  color: string;
  label: string;
  width?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (v: number) =>
    height - 4 - ((v - min) / (max - min || 1)) * (height - 10);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`}
        fill={`url(#${id})`}
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values.at(-1)!)}
        r="3.5"
        fill={color}
        className="lab-dot-ring"
      />
    </svg>
  );
}

export function ProgressRing({
  value,
  color,
  size = 56,
  stroke = 6,
  children,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="lab-donut__track"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, value) * circumference} ${circumference}`}
          className="lab-ring-fill"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">
        {children}
      </span>
    </div>
  );
}
