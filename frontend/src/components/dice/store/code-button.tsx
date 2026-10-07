'use client';

/**
 * Bouton « Code » de la boutique : échange un code (service billing) contre un
 * premium offert, un skin de dés ou un cadre. Les dés possédés sont relus après
 * coup (le service dice applique le droit à réception de l'événement).
 */
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { utiliserCode, type CodeUtilise } from '@/lib/abonnement';
import { messageErreur } from '@/lib/api';
import { dicePreferencesKey } from '@/lib/dice-preferences';

export function CodeButton({ onUtilise }: Readonly<{ onUtilise?: (r: CodeUtilise) => void }>) {
  const t = useTranslations('dice.store');
  const client = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(ev: FormEvent) {
    ev.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await utiliserCode(code);
      const relire = () => void client.invalidateQueries({ queryKey: dicePreferencesKey });
      relire();
      setTimeout(relire, 1500);
      toast.success(t(`rewards.${r.kind}`));
      setCode('');
      setOuvert(false);
      onUtilise?.(r);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Popover
      open={ouvert}
      onOpenChange={(o) => {
        setOuvert(o);
        setErreur(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <Ticket aria-hidden />
          {t('code')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <form onSubmit={valider} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              autoFocus
              aria-label={t('code')}
              placeholder="YNER-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErreur(null);
              }}
              className="font-mono uppercase"
            />
            <Button type="submit" loading={envoi} disabled={!code.trim()}>
              {t('codeOk')}
            </Button>
          </div>
          {erreur && (
            <p role="alert" className="text-xs text-destructive">
              {erreur}
            </p>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
