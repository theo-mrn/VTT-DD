'use client';

/**
 * Description d'une entrée du catalogue : texte brut (retours à la ligne conservés), ou HTML
 * assaini par DOMPurify (liste blanche de balises de mise en forme, aucun attribut actif).
 * Côté serveur ou sans DOMPurify, les balises sont retirées.
 */
import DOMPurify, { type WindowLike } from 'dompurify';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const BALISES = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'span', 'hr'];
const HTML = /<\/?[a-z][\s\S]*?>/i;

function sanitize(html: string): string | null {
  if (typeof window === 'undefined') return null;
  const p = DOMPurify(window as unknown as WindowLike);
  if (!p.isSupported) return null;
  return p.sanitize(html, { ALLOWED_TAGS: BALISES, ALLOWED_ATTR: [] });
}

export function RichText({ text, className }: Readonly<{ text: string; className?: string }>) {
  const html = useMemo(() => (HTML.test(text) ? sanitize(text) : null), [text]);
  const base = cn('text-[13px] leading-relaxed text-foreground/85', className);
  if (html !== null)
    return (
      <div
        className={cn(base, '[&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_ul]:list-disc')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  return (
    <p className={cn(base, 'whitespace-pre-line')}>{text.replace(/<\/?[a-z][\s\S]*?>/gi, '')}</p>
  );
}
