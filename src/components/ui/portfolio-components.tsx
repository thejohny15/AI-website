import { ReactNode } from "react";

// Shared color palette for charts
export const CHART_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", 
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#84cc16", "#a855f7", "#eab308",
  "#6366f1", "#22d3ee"
];

// Info icon SVG
export function InfoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

// Reusable section card wrapper
export function SectionCard({ 
  children, 
  className = "" 
}: { 
  children: ReactNode; 
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

// Reusable toggle component
export function Toggle({
  label,
  checked,
  onChange,
  description
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-xl font-bold text-white">{label}</h2>
        {description && (
          <p className="text-sm text-slate-200 mt-1">{description}</p>
        )}
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="text-sm text-slate-200">{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded"
        />
      </label>
    </div>
  );
}

// Strategy preset card
export function StrategyCard({
  icon,
  title,
  description,
  features,
  onClick,
  borderColor = "slate"
}: {
  icon: string;
  title: string;
  description: string;
  features: string[];
  onClick: () => void;
  borderColor?: string;
}) {
  const borderColorClass = {
    slate: "border-slate-600/50 hover:border-slate-500/70",
    emerald: "border-emerald-600/50 hover:border-emerald-500/70",
    blue: "border-blue-600/50 hover:border-blue-500/70",
    rose: "border-rose-600/50 hover:border-rose-500/70"
  }[borderColor] || "border-slate-600/50";

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 ${borderColorClass} bg-slate-800/40 p-5 text-left hover:bg-slate-700/60 transition-all group shadow-lg`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="font-bold text-lg text-white">{title}</span>
      </div>
      <p className="text-sm text-slate-200 mb-3 leading-relaxed">
        {description}
      </p>
      <div className="space-y-1 text-xs text-slate-300">
        {features.map((feature, i) => (
          <div key={i}>• {feature}</div>
        ))}
      </div>
    </button>
  );
}

// Info box with icon
export function InfoBox({
  children,
  variant = "blue"
}: {
  children: ReactNode;
  variant?: "blue" | "emerald" | "amber" | "purple" | "rose";
}) {
  const variantClasses = {
    blue: "border-blue-300/30 bg-blue-500/10 text-blue-100",
    emerald: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-300/30 bg-amber-500/10 text-amber-100",
    purple: "border-purple-300/30 bg-purple-500/10 text-purple-100",
    rose: "border-rose-300/30 bg-rose-500/10 text-rose-100"
  }[variant];

  const iconColor = {
    blue: "text-blue-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    purple: "text-purple-300",
    rose: "text-rose-300"
  }[variant];

  return (
    <div className={`rounded-xl border ${variantClasses} p-3`}>
      <div className="flex items-start gap-2 text-xs">
        <InfoIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}