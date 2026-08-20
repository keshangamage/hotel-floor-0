import type { ReactNode } from "react";

type CardProps = {
  title: string;
  children?: ReactNode;
  className?: string;
};

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 p-6 dark:border-zinc-800 ${className}`}
    >
      <h2 className="text-base font-semibold text-black dark:text-zinc-50">
        {title}
      </h2>
      {children ? (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {children}
        </div>
      ) : null}
    </div>
  );
}
