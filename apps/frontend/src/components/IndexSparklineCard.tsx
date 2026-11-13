'use client';

import React, { useId } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

interface SparklineDataPoint {
  value: number;
  date?: string;
}

interface IndexSparklineCardProps {
  title: string;
  valueStr: string;
  badgeText: string;
  badgeType: 'success' | 'warning' | 'error' | 'info';
  sparklineData: SparklineDataPoint[];
  color: string;
  footerText: string;
  /** Texto cuando no hay datos. */
  emptyText?: string;
  /** Decimales del valor en el tooltip. */
  dec?: number;
}

export const IndexSparklineCard: React.FC<IndexSparklineCardProps> = ({
  title,
  valueStr,
  badgeText,
  badgeType,
  sparklineData,
  color,
  footerText,
  emptyText = '—',
  dec = 2,
}) => {
  const getBadgeClass = () => {
    switch (badgeType) {
      case 'success':
        return 'bg-favorable-500/10 text-favorable-400 border-favorable-500/20';
      case 'warning':
        return 'bg-caution-500/10 text-caution-400 border-caution-500/20';
      case 'error':
        return 'bg-risk-500/10 text-risk-400 border-risk-500/20';
      case 'info':
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  // id seguro para url(#…): el título trae "(SPY)" y "&", que rompían la referencia y el relleno salía negro.
  const gradientId = `glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div className="flex flex-col gap-4 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 backdrop-blur-sm shadow-xl relative overflow-hidden transition-all duration-300 hover:border-slate-800 hover:bg-slate-900/10">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            {title}
          </span>
          <h3 className="text-2xl font-extrabold text-white mt-1">
            {valueStr}
          </h3>
        </div>
        <span className={`text-[10px] font-bold border rounded-md px-2 py-0.5 uppercase tracking-wider ${getBadgeClass()}`}>
          {badgeText}
        </span>
      </div>

      <div className="h-12 w-full">
        {sparklineData && sparklineData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              {/* Escala ajustada al rango de la serie (con eje desde 0 los precios se veían planos). */}
              <YAxis hide domain={[(min: number) => min - (Math.abs(min) * 0.002 || 1), (max: number) => max + (Math.abs(max) * 0.002 || 1)]} />
              <Tooltip
                cursor={{ stroke: '#475569', strokeWidth: 1 }}
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11, padding: '4px 8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                labelFormatter={(_, p) => (p?.[0]?.payload?.date as string) ?? ''}
                formatter={(v) => [Number(v).toFixed(dec), title]}
              />
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-700">
            {emptyText}
          </div>
        )}
      </div>

      <span className="text-[10px] text-slate-500">
        {footerText}
      </span>
    </div>
  );
};
