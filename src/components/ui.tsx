import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { changeTone, fmtPct } from "@/lib/format";

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-10";
const btnVariants = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad text-white hover:opacity-90",
};
export type ButtonVariant = keyof typeof btnVariants;

export function Button({ variant = "primary", className, ...rest }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cn(btnBase, btnVariants[variant], className)} {...rest} />;
}

export function ButtonLink({ variant = "secondary", className, ...rest }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cn(btnBase, btnVariants[variant], className)} {...rest} />;
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      className={cn("min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none", className)}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn("min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none", className)} {...rest} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full bg-surface-2 ring-1 ring-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good/12 text-good-ink",
  bad: "bg-bad/12 text-bad-ink",
  warn: "bg-warn/18 text-warn-ink",
  accent: "bg-accent/12 text-accent",
};
export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone], className)}>{children}</span>;
}

export function Change({ value, className }: { value: number | null | undefined; className?: string }) {
  const t = changeTone(value);
  return (
    <span className={cn("tabular whitespace-nowrap", t === "up" ? "text-good-ink" : t === "down" ? "text-bad-ink" : "text-ink-2", className)}>
      {t === "up" ? "▲ " : t === "down" ? "▼ " : ""}
      {fmtPct(value)}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs font-medium tracking-wide text-ink-2 uppercase">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

const alertTones = {
  info: { cls: "border-accent/30 bg-accent/8", Icon: Info, icon: "text-accent" },
  warn: { cls: "border-warn/40 bg-warn/10", Icon: AlertTriangle, icon: "text-warn-ink" },
  error: { cls: "border-bad/40 bg-bad/8", Icon: XCircle, icon: "text-bad-ink" },
  success: { cls: "border-good/40 bg-good/8", Icon: CheckCircle2, icon: "text-good-ink" },
};
export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = alertTones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", t.cls, className)}>
      <t.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} aria-hidden />
      <div className="min-w-0 text-ink">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn("text-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function TableWrap({ children }: { children: ReactNode }) {
  // relative: keeps absolutely positioned bits (e.g. sr-only header labels) inside the scroll box.
  return <div className="relative -mx-4 overflow-x-auto sm:mx-0">{children}</div>;
}
export const th = "px-3 py-2 text-start text-xs font-medium tracking-wide text-ink-2 uppercase whitespace-nowrap";
export const td = "px-3 py-2.5 text-sm text-ink whitespace-nowrap";

export { Disclaimer } from "./disclaimer";
