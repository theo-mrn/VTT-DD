import Link from 'next/link';
import type { ReactNode } from 'react';
import { Navigation } from '@/components/landing/navigation';
import { Pied } from '@/components/landing/pied';
import { LEGAL_UPDATED_AT } from '@/lib/legal';

/** Pages légales : même cadre que la landing, une colonne de lecture. */
export function LegalPage({
  title,
  intro,
  children,
}: Readonly<{ title: string; intro?: ReactNode; children: ReactNode }>) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Navigation />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-36">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-subtle">Dernière mise à jour : {LEGAL_UPDATED_AT}</p>
        {intro && <div className="mt-8 text-lg leading-relaxed text-muted-foreground">{intro}</div>}
        <div className="mt-12 space-y-12">{children}</div>
      </main>
      <Pied />
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: Readonly<{ id?: string; title: string; children: ReactNode }>) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: Readonly<{ children: ReactNode }>) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-subtle">{children}</ul>;
}

/** Tableau à deux colonnes ou plus, défilant seul sur mobile. */
export function LegalTable({ head, rows }: Readonly<{ head: string[]; rows: ReactNode[][] }>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-white/[0.03] text-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lien externe ou interne, souligné, dans le texte. */
export function LegalLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  const className =
    'text-foreground underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-primary';
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
