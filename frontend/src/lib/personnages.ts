/**
 * Personnages : service character derrière la gateway (`/v1/characters/**`,
 * contrat dans docs/api-character.md). Le service fait autorité : chaque
 * écriture passe par sa route (valeurs, étapes de création, achats,
 * possessions, actions) avec la `version` connue, et la réponse remplace le
 * cache. Le front calcule seulement un aperçu immédiat avec le même moteur.
 *
 * Un héros appartient à une campagne : il y est engagé par campaign
 * (`POST /v1/campaigns/:id/characters`), qui sait aussi qui l'incarne.
 * `roomId` est donc lu dans mes campagnes (`characterIds`).
 *
 * Concurrence : les écritures d'un même personnage partent l'une après
 * l'autre. Un 409 (le MJ a modifié la fiche entre-temps) recharge la fiche,
 * annule les écritures en attente et prévient l'utilisateur : rien n'est
 * écrasé en silence.
 */
'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  EtatEntite,
  type BonusLibre,
  type Effet,
  type ResultatAction,
  type Tirage,
  type Valeur,
} from '@vtt/rules';
import { useMemo } from 'react';
import { api, ApiError } from './api';
import {
  campagnes,
  clePersonnagesCampagne,
  clesCampagnes,
  useCampagne,
  useCampagnes,
  type Campagne,
  type CampaignCharacterApi,
} from './campagnes';
import { useProfil } from './session';

// ─── Contrat de l'API (schémas Zod de backend/character/src/modules/personnages) ─

interface SummaryApi {
  tagline: string;
  highlights: { label: string; value: string }[];
}

interface DetailsApi {
  concept: string;
  appearance: string;
  backstory: string;
}

/** Élément de GET /v1/characters. */
interface CharacterListItemApi {
  id: string;
  nom: string;
  avatarUrl: string | null;
  systeme: { id: string; version: string };
  type: string;
  creation: boolean;
  concept: string;
  summary: SummaryApi;
  updatedAt: string;
}

/** Personnage complet (GET /v1/characters/:id et réponse des écritures). */
interface CharacterApi {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  etat: unknown;
  fiche: unknown;
  details: DetailsApi;
  summary: SummaryApi;
  /** Mise en page de la fiche ; null : disposition par défaut de la présentation. */
  sheetLayout?: SheetLayout | null;
  /** Droits de l'appelant : renvoyés par la lecture et par le changement de mise en page. */
  permissions?: PermissionsFiche;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Étape « tirer » de la création : le tirage retenu. */
  tirage?: TirageCreation;
}

interface ActionApi {
  resultat: ResultatAction;
  personnage?: CharacterApi;
}

// ─── Types de l'UI ───────────────────────────────────────────────────────────

/** Résumé calculé par le service : les listes l'affichent sans charger le système. */
export interface ResumePersonnage {
  /** « Elfe · Magicien » : entrées uniques (race, profil, carrière…). */
  tagline: string;
  /** Valeurs clés (« Niveau 3 », « PV 12/14 ») pour les cartes. */
  highlights: { label: string; value: string }[];
}

export interface DetailsPersonnage {
  concept: string;
  appearance: string;
  backstory: string;
}

/** Personnage dans une liste (les miens, ceux d'une campagne). */
export interface Personnage {
  id: string;
  name: string;
  portraitUrl: string | null;
  system: { id: string; version: string };
  type: string;
  /** Création pas encore terminée : la fiche se reprend dans l'assistant. */
  inCreation: boolean;
  /** Campagne où le personnage est engagé (null : libre, par exemple importé sans campagne). */
  roomId: string | null;
  ownerId: string;
  summary: ResumePersonnage;
  /** Concept du joueur (vide pour les personnages des autres). */
  concept: string;
  updatedAt: string;
}

/** Droits de l'appelant sur une fiche, décidés par le service character. */
export interface PermissionsFiche {
  /** Modifier le personnage (valeurs, achats, possessions, profil…). */
  write: boolean;
  /** Changer la mise en page de sa fiche. */
  layout: boolean;
}

/** Position d'un bloc dans la grille de la fiche (unités de la grille, 12 colonnes au plus). */
export interface SheetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SheetBreakpoint = 'lg' | 'md' | 'sm' | 'xs';

/**
 * Mise en page d'une fiche, enregistrée par le service (docs/api-character.md, « Mise en
 * page de la fiche ») : les blocs (widgets de la présentation) et leurs positions par
 * largeur d'écran. Elle appartient au personnage : toute la table voit la même fiche.
 */
export interface SheetLayout {
  /** 2 : pas vertical de 4 px ; 1 : rangées de 32 px espacées de 16 (converti à la lecture). */
  format: 1 | 2;
  blocks: {
    id: string;
    type: string;
    title: string;
    params: Record<string, string | number | boolean | string[]>;
    /** Hauteur dans la grille : suit le contenu, ou définie ; absente : préférence du bloc. */
    height?: 'auto' | 'fixed';
  }[];
  layouts: Partial<Record<SheetBreakpoint, SheetLayoutItem[]>>;
}

/** Personnage complet : état saisi (calculé par le moteur), présentation, version. */
export interface FichePersonnage extends Personnage {
  state: EtatEntite;
  details: DetailsPersonnage;
  /** Mise en page choisie ; null : disposition par défaut de la présentation. */
  sheetLayout: SheetLayout | null;
  /**
   * Droits de l'appelant, lus avec la fiche ; null tant qu'aucune lecture ne les a
   * donnés (les écritures ne les renvoient pas, le cache garde ceux de la lecture).
   */
  permissions: PermissionsFiche | null;
  version: number;
  createdAt: string;
}

/** Tirage de l'étape « tirer », fait par le service. */
export interface TirageCreation {
  attributs: string[];
  retenu: Tirage;
  essais: number;
}

/** Changement du profil : seuls les champs fournis changent. */
export interface ModificationProfil {
  name?: string;
  portraitUrl?: string | null;
  details?: Partial<DetailsPersonnage>;
}

/** Bonus libre posé sur un personnage (`POST /v1/characters/:id/bonus`). */
export interface DemandeBonus {
  /** Absent : créé à partir du nom ; présent : remplace le bonus de même identifiant. */
  id?: string;
  nom: string;
  source?: string;
  effets: BonusLibre['effets'];
  actif?: boolean;
  duree?: number;
}

/** Demande de possession (docs/api-character.md, « Possessions »). */
export interface DemandePossession {
  entree: string;
  exemplaire?: string;
  nouveau?: boolean;
  quantite?: number;
  rang?: number;
  actif?: boolean;
  choix?: Record<string, string[]>;
  /** Valeurs propres à l'exemplaire (points d'Obligation, munitions…). */
  champs?: Record<string, number | string | boolean>;
  /** Effets propres à l'exemplaire (épée +1) : remplacent les précédents. */
  effets?: Effet[];
  /** Caché aux autres joueurs (le propriétaire et le MJ le voient). */
  hidden?: boolean;
  /** Dossier d'inventaire ; null : retour à la racine. */
  folder?: string | null;
}

/** Don d'un objet à un personnage de la même campagne (`POST /possessions/give`). */
export interface DemandeDon {
  /** Personnage qui reçoit. */
  to: string;
  entree: string;
  exemplaire?: string;
  /** Unités données ; absent : tout l'exemplaire. */
  quantity?: number;
}

/** Dossier d'inventaire envoyé au service : sans `id`, un nouveau dossier. */
export interface DemandeDossier {
  id?: string;
  name: string;
}

/** Corps d'une étape de création, selon son type. */
export type CorpsEtape =
  | { entrees: { entree: string; choix?: Record<string, string[]> }[] }
  | { valeurs: Record<string, Valeur> }
  | { affectation?: Record<string, number> }
  | { achat: string; objet: string };

/** Écriture faite par une étape de l'assistant de création, envoyée au service. */
export type OperationCreation =
  { type: 'etape'; etape: string; corps: CorpsEtape } | { type: 'rembourser'; index: number };

// ─── Adaptateur API → UI ─────────────────────────────────────────────────────

const RESUME_VIDE: ResumePersonnage = { tagline: '', highlights: [] };

function versPersonnage(p: CharacterListItemApi, ownerId: string): Personnage {
  return {
    id: p.id,
    name: p.nom,
    portraitUrl: p.avatarUrl,
    system: p.systeme,
    type: p.type,
    inCreation: p.creation,
    roomId: null,
    ownerId,
    summary: p.summary,
    concept: p.concept,
    updatedAt: p.updatedAt,
  };
}

function versFiche(p: CharacterApi): FichePersonnage {
  const state = EtatEntite.parse(p.etat);
  return {
    id: p.id,
    name: p.nom,
    portraitUrl: p.avatarUrl,
    system: state.systeme,
    type: state.type,
    inCreation: state.creation,
    roomId: null,
    ownerId: p.ownerId,
    summary: p.summary,
    concept: p.details.concept,
    updatedAt: p.updatedAt,
    state,
    details: p.details,
    sheetLayout: p.sheetLayout ?? null,
    permissions: p.permissions ?? null,
    version: p.version,
    createdAt: p.createdAt,
  };
}

/** Fiche reçue d'une écriture : garde les droits déjà lus si la réponse n'en porte pas. */
function avecDroits(fiche: FichePersonnage, connue: FichePersonnage | undefined): FichePersonnage {
  return fiche.permissions || !connue?.permissions
    ? fiche
    : { ...fiche, permissions: connue.permissions };
}

/** Personnage engagé dans une campagne, vu par les autres membres. */
function versEngage(
  e: CampaignCharacterApi,
  campagne: { id: string; system: string; systemVersion: string },
): Personnage {
  return {
    id: e.characterId,
    name: e.name ?? 'Personnage indisponible',
    portraitUrl: e.avatarUrl,
    system: { id: campagne.system, version: campagne.systemVersion },
    type: e.type ?? 'personnage',
    inCreation: e.inCreation,
    roomId: campagne.id,
    ownerId: e.ownerId,
    summary: e.summary ?? RESUME_VIDE,
    concept: '',
    updatedAt: '',
  };
}

/**
 * Adresse d'un personnage : sa fiche, ou l'assistant pour reprendre une
 * création pas terminée dans sa campagne.
 */
export function lienPersonnage(p: Pick<Personnage, 'id' | 'inCreation' | 'roomId'>): string {
  return p.inCreation && p.roomId
    ? `/personnages/nouveau?${new URLSearchParams({ campagne: p.roomId, personnage: p.id })}`
    : `/personnages/${p.id}`;
}

/** Campagne où le personnage est engagé, d'après mes campagnes. */
export function campagneDe(id: string, campagnes: Campagne[] | undefined): string | null {
  return campagnes?.find((c) => c.characterIds.includes(id))?.id ?? null;
}

function versCorpsProfil(m: ModificationProfil) {
  return {
    ...(m.name !== undefined ? { nom: m.name.trim() } : {}),
    ...(m.portraitUrl !== undefined ? { avatarUrl: m.portraitUrl } : {}),
    ...(m.details !== undefined ? { details: m.details } : {}),
  };
}

// ─── Accès au service ────────────────────────────────────────────────────────

const url = (id: string, suite = '') => `/v1/characters/${encodeURIComponent(id)}${suite}`;
const json = (corps: unknown) => ({ body: JSON.stringify(corps) });

/** Type d'entité des héros créés par l'assistant. */
export const TYPE_HEROS = 'personnage';

export const personnages = {
  lister: () => api<CharacterListItemApi[]>('/v1/characters'),
  lire: async (id: string) => versFiche(await api<CharacterApi>(url(id))),
  supprimer: (id: string) => api<void>(url(id), { method: 'DELETE' }),
};

// ─── Écritures : file par personnage, version, conflits ──────────────────────

/** Erreur montrée quand la fiche a changé ailleurs (le MJ, un autre onglet). */
export function conflitVersion(): ApiError {
  return new ApiError({
    status: 409,
    code: 'version_perimee',
    title: 'Fiche modifiée entre-temps',
    detail:
      "Cette fiche vient d'être modifiée ailleurs (par le MJ ou dans un autre onglet) : elle a été rechargée. Refaites votre modification.",
  });
}

const files = new Map<string, Promise<unknown>>();
const enAttente = new Map<string, number>();
/** Incrémentée à chaque conflit : les écritures mises en file avant sont abandonnées. */
const generations = new Map<string, number>();

function enFile<T>(id: string, tache: () => Promise<T>): Promise<T> {
  const suivante = (files.get(id) ?? Promise.resolve()).catch(() => undefined).then(tache);
  files.set(id, suivante);
  void suivante
    .catch(() => undefined)
    .finally(() => {
      if (files.get(id) === suivante) files.delete(id);
    });
  return suivante;
}

export const clesPersonnages = {
  racine: ['personnages'] as const,
  miens: ['personnages', 'miens'] as const,
  campagne: clePersonnagesCampagne,
  un: (id: string) => ['personnages', 'un', id] as const,
};

/** Listes à recharger après une écriture (les fiches complètes sont à jour dans le cache). */
function invaliderListes(client: QueryClient) {
  void client.invalidateQueries({
    queryKey: clesPersonnages.racine,
    predicate: (q) => q.queryKey[1] !== 'un',
  });
}

/**
 * Écrit sur un personnage : `requete` reçoit la version à envoyer. `apercu`
 * (état calculé par le moteur local, ou changement de la fiche comme sa mise en
 * page) est montré tout de suite ; la réponse du service le remplace. Sur un
 * refus, la fiche du service est relue.
 */
function ecrire(
  client: QueryClient,
  id: string,
  requete: (version: number) => Promise<CharacterApi>,
  apercu?: EtatEntite | ((p: FichePersonnage) => FichePersonnage),
): Promise<{ fiche: FichePersonnage; brut: CharacterApi }> {
  const cle = clesPersonnages.un(id);
  const generation = generations.get(id) ?? 0;
  if (apercu)
    client.setQueryData<FichePersonnage>(cle, (p) =>
      p ? (typeof apercu === 'function' ? apercu(p) : { ...p, state: apercu }) : p,
    );
  enAttente.set(id, (enAttente.get(id) ?? 0) + 1);

  const recharger = async () => {
    // La lecture renvoie aussi les droits à jour
    const frais = await personnages.lire(id).catch(() => null);
    if (frais) client.setQueryData(cle, frais);
    else void client.invalidateQueries({ queryKey: cle });
  };

  return enFile(id, async () => {
    // Un conflit a eu lieu depuis cette demande : elle partirait d'une fiche périmée
    if ((generations.get(id) ?? 0) !== generation) {
      enAttente.set(id, (enAttente.get(id) ?? 1) - 1);
      throw conflitVersion();
    }
    try {
      const connue: FichePersonnage =
        client.getQueryData<FichePersonnage>(cle) ??
        (await client.fetchQuery<FichePersonnage>({
          queryKey: cle,
          queryFn: () => personnages.lire(id),
        }));
      const brut = await requete(connue.version);
      const fiche = avecDroits(versFiche(brut), client.getQueryData<FichePersonnage>(cle));
      const reste = (enAttente.get(id) ?? 1) - 1;
      // D'autres écritures attendent : on garde leur aperçu, avec la nouvelle version
      client.setQueryData<FichePersonnage>(cle, (p) =>
        reste > 0 && p ? { ...fiche, state: p.state, sheetLayout: p.sheetLayout } : fiche,
      );
      invaliderListes(client);
      return { fiche, brut };
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'version_perimee') {
        generations.set(id, generation + 1);
        await recharger();
        throw conflitVersion();
      }
      await recharger();
      throw err;
    } finally {
      enAttente.set(id, (enAttente.get(id) ?? 1) - 1);
    }
  });
}

export interface OperationsPersonnage {
  profil(m: ModificationProfil): Promise<FichePersonnage>;
  /** Valeurs saisies (ressources à tout moment, attributs de base pendant la création…). */
  valeurs(valeurs: Record<string, Valeur>, apercu?: EtatEntite): Promise<FichePersonnage>;
  /** Étape de création ; l'étape « tirer » renvoie aussi le tirage fait par le service. */
  etape(
    etape: string,
    corps: CorpsEtape,
    apercu?: EtatEntite,
  ): Promise<{ fiche: FichePersonnage; tirage: TirageCreation | null }>;
  terminer(): Promise<FichePersonnage>;
  acheter(achat: string, objet: string, apercu?: EtatEntite): Promise<FichePersonnage>;
  rembourser(index: number, apercu?: EtatEntite): Promise<FichePersonnage>;
  possession(d: DemandePossession, apercu?: EtatEntite): Promise<FichePersonnage>;
  /** Retire une possession (un exemplaire précis ; absent : l'exemplaire sans identifiant). */
  retirerPossession(
    entree: string,
    exemplaire?: string,
    apercu?: EtatEntite,
  ): Promise<FichePersonnage>;
  /**
   * Donne un objet à un personnage de la même campagne : les deux fiches changent
   * ensemble (celle du receveur est relue).
   */
  donner(d: DemandeDon, apercu?: EtatEntite): Promise<FichePersonnage>;
  /** Remplace les dossiers d'inventaire (ordre, noms, ajouts, suppressions). */
  dossiers(folders: DemandeDossier[], apercu?: EtatEntite): Promise<FichePersonnage>;
  /** Pose (ou remplace, même `id`) un bonus libre : potion, bénédiction, décision du MJ. */
  bonus(d: DemandeBonus, apercu?: EtatEntite): Promise<FichePersonnage>;
  retirerBonus(id: string, apercu?: EtatEntite): Promise<FichePersonnage>;
  /**
   * Active ou coupe des effets d'entrées possédées ou d'exemplaires (clés `<source>/<index>`),
   * sans toucher à leur source : l'objet reste équipé.
   */
  effet(effets: string[], actif: boolean, apercu?: EtatEntite): Promise<FichePersonnage>;
  /**
   * Mise en page de la fiche (null : disposition par défaut), montrée tout de suite ;
   * elle appartient au personnage, toute la table la voit.
   */
  miseEnPage(layout: SheetLayout | null): Promise<FichePersonnage>;
  /**
   * Action du système (jet tiré par le service, transmis à l'historique des dés).
   * `appliquer` : les conséquences sur le personnage sont enregistrées avec le jet.
   */
  action(
    action: string,
    o: {
      parametres?: Record<string, Valeur>;
      appliquer?: boolean;
      campaignId?: string | null;
      visibility?: 'public' | 'private' | 'gm' | 'self';
    },
  ): Promise<{ resultat: ResultatAction; fiche: FichePersonnage | null }>;
}

/** Écritures sur un personnage, par les routes du service character. */
export function useOperationsPersonnage(id: string): OperationsPersonnage {
  const client = useQueryClient();
  return useMemo(() => {
    const w = (
      requete: (version: number) => Promise<CharacterApi>,
      apercu?: Parameters<typeof ecrire>[3],
    ) => ecrire(client, id, requete, apercu);
    const post = (suite: string, corps: object) =>
      api<CharacterApi>(url(id, suite), { method: 'POST', ...json(corps) });
    return {
      profil: async (m) =>
        (
          await w((version) =>
            api<CharacterApi>(url(id), {
              method: 'PATCH',
              ...json({ version, ...versCorpsProfil(m) }),
            }),
          )
        ).fiche,
      valeurs: async (valeurs, apercu) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(url(id, '/valeurs'), {
                method: 'PUT',
                ...json({ version, valeurs }),
              }),
            apercu,
          )
        ).fiche,
      etape: async (etape, corps, apercu) => {
        const r = await w(
          (version) => post(`/creation/${encodeURIComponent(etape)}`, { version, ...corps }),
          apercu,
        );
        return { fiche: r.fiche, tirage: r.brut.tirage ?? null };
      },
      terminer: async () => (await w((version) => post('/creation/terminer', { version }))).fiche,
      acheter: async (achat, objet, apercu) =>
        (await w((version) => post('/achats', { version, achat, objet }), apercu)).fiche,
      rembourser: async (index, apercu) =>
        (await w((version) => post('/achats/rembourser', { version, index }), apercu)).fiche,
      possession: async (d, apercu) =>
        (await w((version) => post('/possessions', { version, ...d }), apercu)).fiche,
      retirerPossession: async (entree, exemplaire, apercu) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(
                `${url(id, `/possessions/${encodeURIComponent(entree)}`)}?${new URLSearchParams({
                  version: String(version),
                  ...(exemplaire !== undefined ? { exemplaire } : {}),
                })}`,
                { method: 'DELETE' },
              ),
            apercu,
          )
        ).fiche,
      donner: async (d, apercu) => {
        const r = await w((version) => post('/possessions/give', { version, ...d }), apercu);
        // Le receveur a changé aussi : sa fiche en cache est relue
        void client.invalidateQueries({ queryKey: clesPersonnages.un(d.to) });
        return r.fiche;
      },
      dossiers: async (folders, apercu) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(url(id, '/folders'), {
                method: 'PUT',
                ...json({ version, folders }),
              }),
            apercu,
          )
        ).fiche,
      bonus: async (d, apercu) =>
        (await w((version) => post('/bonus', { version, ...d }), apercu)).fiche,
      effet: async (effets, actif, apercu) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(url(id, '/effets'), {
                method: 'PUT',
                ...json({ version, effets, actif }),
              }),
            apercu,
          )
        ).fiche,
      retirerBonus: async (bonusId, apercu) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(
                `${url(id, `/bonus/${encodeURIComponent(bonusId)}`)}?version=${version}`,
                { method: 'DELETE' },
              ),
            apercu,
          )
        ).fiche,
      miseEnPage: async (layout) =>
        (
          await w(
            (version) =>
              api<CharacterApi>(url(id, '/layout'), {
                method: 'PUT',
                ...json({ version, layout }),
              }),
            (p) => ({ ...p, sheetLayout: layout }),
          )
        ).fiche,
      action: (action, o) =>
        // Pas de version : le service verrouille le personnage ; la file garde l'ordre
        enFile(id, async () => {
          const r = await api<ActionApi>(url(id, `/actions/${encodeURIComponent(action)}`), {
            method: 'POST',
            ...json({
              ...(o.parametres ? { parametres: o.parametres } : {}),
              ...(o.appliquer ? { appliquer: true } : {}),
              ...(o.campaignId ? { campaignId: o.campaignId } : {}),
              ...(o.visibility ? { visibility: o.visibility } : {}),
            }),
          });
          const fiche = r.personnage
            ? avecDroits(
                versFiche(r.personnage),
                client.getQueryData<FichePersonnage>(clesPersonnages.un(id)),
              )
            : null;
          if (fiche) {
            client.setQueryData(clesPersonnages.un(id), fiche);
            invaliderListes(client);
          }
          return { resultat: r.resultat, fiche };
        }),
    };
  }, [client, id]);
}

// ─── Lectures ────────────────────────────────────────────────────────────────

/** Mes personnages, avec la campagne où chacun est engagé. */
export function usePersonnages() {
  const moi = useProfil().id;
  const liste = useQuery({ queryKey: clesPersonnages.miens, queryFn: personnages.lister });
  const mesCampagnes = useCampagnes();
  const data = useMemo(
    () =>
      liste.data && mesCampagnes.data
        ? liste.data.map((p) => ({
            ...versPersonnage(p, moi),
            roomId: campagneDe(p.id, mesCampagnes.data),
          }))
        : undefined,
    [liste.data, mesCampagnes.data, moi],
  );
  const erreur = liste.error ?? mesCampagnes.error;
  return {
    data,
    isPending: data === undefined && !erreur,
    isLoading: data === undefined && !erreur,
    isSuccess: data !== undefined,
    isError: Boolean(erreur),
    error: erreur,
  };
}

/** Personnages engagés dans une campagne (tous joueurs confondus, PNJ du MJ compris). */
export function usePersonnagesCampagne(roomId: string | null | undefined) {
  const engages = useQuery({
    queryKey: clesPersonnages.campagne(roomId ?? ''),
    queryFn: () => campagnes.personnages(roomId!),
    enabled: Boolean(roomId),
  });
  const campagne = useCampagne(roomId);
  const data = useMemo(
    () =>
      engages.data && campagne.data
        ? engages.data
            // Les listes de la table (« Qui joue ? », salon) ne montrent que les personnages
            // joueurs : les PNJ (côté ennemis ou alliés) relèvent de la carte et du MJ.
            .filter((e) => e.side === 'players')
            .map((e) => versEngage(e, campagne.data))
        : undefined,
    [engages.data, campagne.data],
  );
  const erreur = engages.error ?? campagne.error;
  return {
    data,
    isLoading: Boolean(roomId) && data === undefined && !erreur,
    isError: Boolean(erreur),
    error: erreur,
  };
}

/** Fiche complète d'un personnage (le mien, ou un personnage d'une de mes campagnes). */
export function usePersonnage(id: string | null | undefined) {
  const fiche = useQuery({
    queryKey: clesPersonnages.un(id ?? ''),
    queryFn: () => personnages.lire(id!),
    enabled: Boolean(id),
  });
  const mesCampagnes = useCampagnes();
  const data = useMemo(
    () =>
      fiche.data
        ? { ...fiche.data, roomId: campagneDe(fiche.data.id, mesCampagnes.data) }
        : undefined,
    [fiche.data, mesCampagnes.data],
  );
  return { ...fiche, data };
}

// ─── Création, profil, choix du héros, suppression ───────────────────────────

/**
 * Crée un héros dans une campagne, comme le décrit docs/api-campaign.md : le
 * personnage naît dans character (système de la campagne, création en cours),
 * est engagé dans la campagne, puis incarné par son créateur. Si la campagne
 * le refuse (création non autorisée…), il est supprimé : pas de héros orphelin.
 */
export function useCreerPersonnage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (n: {
      campagneId: string;
      systemId: string;
      name: string;
      details: DetailsPersonnage;
    }): Promise<FichePersonnage> => {
      let p = versFiche(
        await api<CharacterApi>('/v1/characters', {
          method: 'POST',
          ...json({ systemeId: n.systemId, type: TYPE_HEROS, nom: n.name.trim() }),
        }),
      );
      try {
        const details = {
          concept: n.details.concept.trim(),
          appearance: n.details.appearance.trim(),
          backstory: n.details.backstory.trim(),
        };
        if (details.concept || details.appearance || details.backstory)
          p = versFiche(
            await api<CharacterApi>(url(p.id), {
              method: 'PATCH',
              ...json({ version: p.version, details }),
            }),
          );
        await campagnes.engager(n.campagneId, p.id);
        const engages = await campagnes.incarner(n.campagneId, p.id);
        client.setQueryData(clesPersonnages.campagne(n.campagneId), engages);
      } catch (err) {
        await personnages.supprimer(p.id).catch(() => undefined);
        throw err;
      }
      return p;
    },
    onSuccess: (p, n) => {
      // Son créateur en est le propriétaire : tous les droits
      client.setQueryData(clesPersonnages.un(p.id), {
        ...p,
        permissions: { write: true, layout: true },
      });
      invaliderListes(client);
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
      void client.invalidateQueries({ queryKey: clesCampagnes.une(n.campagneId) });
    },
  });
}

/** Nom, portrait et présentation (dialogue de la fiche). */
export function useModifierPersonnage(id: string) {
  const ops = useOperationsPersonnage(id);
  return useMutation({ mutationFn: (m: ModificationProfil) => ops.profil(m) });
}

/**
 * Joue un personnage dans une campagne : un héros libre y est d'abord engagé,
 * puis incarné ; `null` : jouer en MJ.
 */
export function useJouerPersonnage(campagneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (p: Pick<Personnage, 'id' | 'roomId'> | null) => {
      if (p && p.roomId !== campagneId) await campagnes.engager(campagneId, p.id);
      return campagnes.incarner(campagneId, p?.id ?? null);
    },
    onSuccess: (engages) => {
      client.setQueryData(clesPersonnages.campagne(campagneId), engages);
      invaliderListes(client);
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
      void client.invalidateQueries({ queryKey: clesCampagnes.une(campagneId) });
    },
  });
}

/**
 * Supprime un personnage (son propriétaire) : il quitte d'abord les campagnes
 * où il est engagé, puis disparaît de character.
 */
export function useSupprimerPersonnage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const miennes = await client.ensureQueryData({
        queryKey: clesCampagnes.miennes,
        queryFn: campagnes.lister,
      });
      for (const c of miennes.filter((x) => x.characterIds.includes(id)))
        await campagnes.desengager(c.id, id).catch((err: unknown) => {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        });
      await personnages.supprimer(id);
    },
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: clesPersonnages.un(id) });
      invaliderListes(client);
      void client.invalidateQueries({ queryKey: clesCampagnes.racine });
    },
  });
}
