'use client';

import { creationDe } from '@vtt/rules';
import { ChevronRight, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  PlayerAvatar,
  AppButton,
  Card,
  Loading,
  formatSince,
  Message,
  PageTitle,
  Empty,
} from '@/components/account/elements';
import { aclonica, inputStyle, labelStyle } from '@/components/account/styles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { createCharacter, listCharacters } from '@/lib/characters';
import { useResource } from '@/lib/resource';
import { listSystems, useSystem, type SystemSummary } from '@/lib/systems';
import { cn } from '@/lib/utils';

export default function CharactersPage() {
  const characters = useResource('personnages', listCharacters);
  const systems = useResource('systemes', listSystems);
  const [creating, setCreating] = useState(false);
  const systemName = (id: string) => systems.data?.find((s) => s.id === id)?.nom ?? id;
  const list = [...(characters.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Vos fiches, tous systèmes de jeu confondus.">Personnages</PageTitle>

      <Card
        title="Mes personnages"
        action={
          <AppButton onClick={() => setCreating(true)}>
            <Plus />
            Nouveau personnage
          </AppButton>
        }
      >
        {characters.loading && !characters.data ? (
          <Loading />
        ) : characters.error ? (
          <Message>{characters.error}</Message>
        ) : !list.length ? (
          <Empty>Aucun personnage pour l&apos;instant : créez le premier !</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.creation ? `/characters/${p.id}/creation` : `/characters/${p.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 transition-colors hover:border-[#c9a965] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
                >
                  <PlayerAvatar name={p.nom} url={p.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{p.nom}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {systemName(p.systeme.id)}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {p.creation && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#c9a965]/40 px-2 py-0.5 text-[#e2cc97]">
                          <Sparkles className="h-3 w-3" />
                          En création
                        </span>
                      )}
                      Modifié {formatSince(p.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-[#c9a965]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewCharacterDialog
        open={creating}
        onClose={() => setCreating(false)}
        systems={systems.data}
        systemsError={systems.error}
      />
    </div>
  );
}

function NewCharacterDialog({
  open,
  onClose,
  systems,
  systemsError,
}: {
  open: boolean;
  onClose(): void;
  systems: SystemSummary[] | undefined;
  systemsError: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const system = useSystem(open ? systemId : null);
  // Pendant le chargement d'un autre système, l'ancien reste en mémoire : on l'écarte
  const charge = system.data?.system.source.id === systemId ? system.data.system : undefined;
  const types = charge ? [...charge.entites.values()].map((e) => e.type) : [];

  // Premier système par défaut ; type par défaut : le premier qui a une création déclarée
  useEffect(() => {
    if (!systemId && systems?.length) setSystemId(systems[0]!.id);
  }, [systems, systemId]);
  useEffect(() => {
    if (!charge) return;
    if (type && charge.entites.has(type)) return;
    const withCreation = [...charge.entites.keys()].find((t) => creationDe(charge, t));
    setType(withCreation ?? charge.entites.keys().next().value ?? null);
  }, [charge, type]);

  function close() {
    if (sending) return;
    setName('');
    setError(null);
    onClose();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!systemId || !type) return;
    setSending(true);
    setError(null);
    try {
      const p = await createCharacter({ systemeId: systemId, type, nom: name.trim() });
      const assistant = p.etat.creation && !!charge && !!creationDe(charge, type);
      router.push(assistant ? `/characters/${p.id}/creation` : `/characters/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={create} className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>Nouveau personnage</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choisissez un système de jeu : la fiche et la création suivent ses règles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="nom-personnage" className={labelStyle}>
              Nom
            </Label>
            <Input
              id="nom-personnage"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputStyle}
              autoFocus
            />
          </div>

          <fieldset className="space-y-2">
            <legend className={labelStyle}>Système de jeu</legend>
            {systemsError ? (
              <Message>{systemsError}</Message>
            ) : !systems ? (
              <Loading text="Chargement des systèmes…" />
            ) : (
              <div className="grid gap-2">
                {systems.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                      systemId === s.id
                        ? 'border-[#c9a965] bg-[#c9a965]/10'
                        : 'border-zinc-800 hover:border-zinc-600',
                    )}
                  >
                    <input
                      type="radio"
                      name="systeme"
                      value={s.id}
                      checked={systemId === s.id}
                      onChange={() => {
                        setSystemId(s.id);
                        setType(null);
                      }}
                      className="mt-1 accent-[#c9a965]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-white">{s.nom}</span>
                      {s.description && (
                        <span className="line-clamp-2 block text-xs text-zinc-400">
                          {s.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {systemId && (
            <div className="space-y-2">
              <Label htmlFor="type-personnage" className={labelStyle}>
                Type de fiche
              </Label>
              {system.error ? (
                <Message>{system.error}</Message>
              ) : !charge ? (
                <Loading text="Chargement des règles…" />
              ) : (
                <select
                  id="type-personnage"
                  value={type ?? ''}
                  onChange={(e) => setType(e.target.value)}
                  className={cn(inputStyle, 'w-full border px-3')}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {error && <Message>{error}</Message>}
          <DialogFooter>
            <AppButton type="button" tone="secondaire" onClick={close} disabled={sending}>
              Annuler
            </AppButton>
            <AppButton type="submit" loading={sending} disabled={!name.trim() || !type || !charge}>
              Créer
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
