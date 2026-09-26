'use client';

import { creationDe } from '@vtt/rules';
import { ChevronRight, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  AvatarJoueur,
  Bouton,
  Carte,
  Chargement,
  formaterDepuis,
  Message,
  TitrePage,
  Vide,
} from '@/components/compte/elements';
import { aclonica, styleChamp, styleLabel } from '@/components/compte/styles';
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
import { messageErreur } from '@/lib/api';
import { creerPersonnage, listerPersonnages } from '@/lib/personnages';
import { useRessource } from '@/lib/ressource';
import { listerSystemes, useSysteme, type ResumeSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';

export default function PagePersonnages() {
  const personnages = useRessource('personnages', listerPersonnages);
  const systemes = useRessource('systemes', listerSystemes);
  const [creation, setCreation] = useState(false);
  const nomSysteme = (id: string) => systemes.donnees?.find((s) => s.id === id)?.nom ?? id;
  const liste = [...(personnages.donnees ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <div className="space-y-6">
      <TitrePage sousTitre="Vos fiches, tous systèmes de jeu confondus.">Personnages</TitrePage>

      <Carte
        titre="Mes personnages"
        action={
          <Bouton onClick={() => setCreation(true)}>
            <Plus />
            Nouveau personnage
          </Bouton>
        }
      >
        {personnages.chargement && !personnages.donnees ? (
          <Chargement />
        ) : personnages.erreur ? (
          <Message>{personnages.erreur}</Message>
        ) : !liste.length ? (
          <Vide>Aucun personnage pour l&apos;instant : créez le premier !</Vide>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {liste.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.creation ? `/personnages/${p.id}/creation` : `/personnages/${p.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 transition-colors hover:border-[#c9a965] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
                >
                  <AvatarJoueur nom={p.nom} url={p.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{p.nom}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {nomSysteme(p.systeme.id)}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {p.creation && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#c9a965]/40 px-2 py-0.5 text-[#e2cc97]">
                          <Sparkles className="h-3 w-3" />
                          En création
                        </span>
                      )}
                      Modifié {formaterDepuis(p.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-[#c9a965]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <DialogueNouveau
        ouvert={creation}
        onFermer={() => setCreation(false)}
        systemes={systemes.donnees}
        erreurSystemes={systemes.erreur}
      />
    </div>
  );
}

function DialogueNouveau({
  ouvert,
  onFermer,
  systemes,
  erreurSystemes,
}: {
  ouvert: boolean;
  onFermer(): void;
  systemes: ResumeSysteme[] | undefined;
  erreurSystemes: string | null;
}) {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [systemeId, setSystemeId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const systeme = useSysteme(ouvert ? systemeId : null);
  // Pendant le chargement d'un autre système, l'ancien reste en mémoire : on l'écarte
  const charge =
    systeme.donnees?.systeme.source.id === systemeId ? systeme.donnees.systeme : undefined;
  const types = charge ? [...charge.entites.values()].map((e) => e.type) : [];

  // Premier système par défaut ; type par défaut : le premier qui a une création déclarée
  useEffect(() => {
    if (!systemeId && systemes?.length) setSystemeId(systemes[0]!.id);
  }, [systemes, systemeId]);
  useEffect(() => {
    if (!charge) return;
    if (type && charge.entites.has(type)) return;
    const avecCreation = [...charge.entites.keys()].find((t) => creationDe(charge, t));
    setType(avecCreation ?? charge.entites.keys().next().value ?? null);
  }, [charge, type]);

  function fermer() {
    if (envoi) return;
    setNom('');
    setErreur(null);
    onFermer();
  }

  async function creer(e: FormEvent) {
    e.preventDefault();
    if (!systemeId || !type) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const p = await creerPersonnage({ systemeId, type, nom: nom.trim() });
      const assistant = p.etat.creation && !!charge && !!creationDe(charge, type);
      router.push(assistant ? `/personnages/${p.id}/creation` : `/personnages/${p.id}`);
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={creer} className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>Nouveau personnage</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choisissez un système de jeu : la fiche et la création suivent ses règles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="nom-personnage" className={styleLabel}>
              Nom
            </Label>
            <Input
              id="nom-personnage"
              required
              maxLength={100}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className={styleChamp}
              autoFocus
            />
          </div>

          <fieldset className="space-y-2">
            <legend className={styleLabel}>Système de jeu</legend>
            {erreurSystemes ? (
              <Message>{erreurSystemes}</Message>
            ) : !systemes ? (
              <Chargement texte="Chargement des systèmes…" />
            ) : (
              <div className="grid gap-2">
                {systemes.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                      systemeId === s.id
                        ? 'border-[#c9a965] bg-[#c9a965]/10'
                        : 'border-zinc-800 hover:border-zinc-600',
                    )}
                  >
                    <input
                      type="radio"
                      name="systeme"
                      value={s.id}
                      checked={systemeId === s.id}
                      onChange={() => {
                        setSystemeId(s.id);
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

          {systemeId && (
            <div className="space-y-2">
              <Label htmlFor="type-personnage" className={styleLabel}>
                Type de fiche
              </Label>
              {systeme.erreur ? (
                <Message>{systeme.erreur}</Message>
              ) : !charge ? (
                <Chargement texte="Chargement des règles…" />
              ) : (
                <select
                  id="type-personnage"
                  value={type ?? ''}
                  onChange={(e) => setType(e.target.value)}
                  className={cn(styleChamp, 'w-full border px-3')}
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

          {erreur && <Message>{erreur}</Message>}
          <DialogFooter>
            <Bouton type="button" ton="secondaire" onClick={fermer} disabled={envoi}>
              Annuler
            </Bouton>
            <Bouton type="submit" chargement={envoi} disabled={!nom.trim() || !type || !charge}>
              Créer
            </Bouton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
