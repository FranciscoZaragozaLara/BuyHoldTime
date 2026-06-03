'use client';

import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface SparklineDataPoint {
  value: number;
}

interface IndexSparklineCardProps {
  title: string;
  valueStr: string;
  badgeText: string;
  badgeType: 'success' | 'warning' | 'error' | 'info';
  sparklineData: SparklineDataPoint[];
  color: string;
  footerText: string;
}

export const IndexSparklineCard: React.FC<IndexSparklineCardProps> = ({
  title,
  valueStr,
  badgeText,
  badgeType,
  sparklineData,
  color,
  footerText,
}) => {
  const getBadgeClass = () => {
    switch (badgeType) {
      case 'success':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'error':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'info':
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const gradientId = `glow-${title.replace(/\s+/g, '-').toLowerCase()}`;

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
            <AreaChart data={sparklineData}>
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
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-700">
            No data
          </div>
        )}
      </div>

      <span className="text-[10px] text-slate-500">
        {footerText}
      </span>
    </div>
  );
};
