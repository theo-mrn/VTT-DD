# Nettoyage : corbeille, purge, fichiers orphelins

> Conception validée le 2026-10-01. Ce qui est supprimé, quand, par quel service.

## Constat

- **Personnage supprimé** : suppression douce (`deleted_at`), rien d'autre. La ligne, ses stats,
  bonus, mise en page et réglages du Studio restent ; son dossier `characters/<id>/` sur le
  stockage aussi ; `character.deleted` n'est écouté par personne : engagement, tokens, place en
  combat, cibles d'attaque restent orphelins dans campaign.
- **Modèle de PNJ ou d'objet supprimé** : supprimé tout de suite (pas de corbeille) ; son image
  reste sur le stockage.
- **Fichiers abandonnés** : une image envoyée puis jamais enregistrée (Studio fermé sans
  enregistrer, envoi annulé après le PUT) reste pour toujours.

## Principes

1. **Corbeille de 7 jours pour les personnages.** Supprimer marque le personnage (`deleted_at`) :
   il disparaît aussitôt pour tous (listes, carte, combat), il est restaurable 7 jours par son
   propriétaire, puis purgé définitivement.
2. **Un modèle n'est jamais supprimé par le système**, quoi qu'il arrive : ni parce qu'il ne sert
   plus, ni après un délai. Il disparaît seulement quand le MJ le supprime lui-même, aussitôt et
   définitivement (pas de corbeille : un modèle se prépare longtemps à l'avance ou se réutilise
   bien plus tard, rien d'automatique ne doit y toucher).
3. **Purge définitive, par le service propriétaire.** Chaque service ne supprime que ses données
   et ses fichiers ; les autres réagissent à un événement (`*.purged`), jamais à un appel direct.
4. **Un fichier n'est supprimé que s'il n'est plus référencé nulle part** (les PNJ partagent
   l'image de leur modèle, un token peut porter l'image d'un autre) : chaque service qui stocke des
   adresses de fichiers répond « référencées ou non » pour une liste d'adresses.
5. **Tâches périodiques dans les services**, pas de nouveau service : une passe toutes les heures,
   protégée par un verrou consultatif Postgres (`pg_try_advisory_lock`) : une seule instance la
   fait. Idempotente : relancée, elle termine ce qui reste.

## Corbeille

| Élément    | Service   | Suppression (immédiate)                    | Restauration (7 jours)                                |
| ---------- | --------- | ------------------------------------------ | ----------------------------------------------------- |
| Personnage | character | `deleted_at`, `character.deleted` (existe) | `POST …/characters/:id/restore`, `character.restored` |

- Les modèles n'ont pas de corbeille (principe 2) : leur suppression par le MJ est immédiate et
  définitive, comme avant. Une première version leur en avait donné une (0012) ; 0013 la retire.
- **Instances de PNJ** (`kind` npc, posées sur la carte) : jamais dans la corbeille, leur modèle
  demeure ; purgées à la passe suivante, sans attendre 7 jours.
- **Campagne** : rien n'est masqué ni rendu. Supprimer un personnage le retire d'abord de ses
  campagnes (route existante : engagement, tokens, place en combat, avec leurs événements) ;
  restauré, il revient sans campagne, à réengager.
- Interface : un bouton « Corbeille » (page Personnages, absent si vide) avec « Restaurer » et la
  date de purge ; le toast de suppression propose « Annuler ».

## Purge définitive (après 7 jours)

**character**, passe horaire :

1. personnages dont `deleted_at` < maintenant − 7 jours, et instances de PNJ supprimées, par lots
   de 50 ; **jamais un modèle** ;
2. pour chacun : suppression de la ligne (les tables liées suivent par `ON DELETE CASCADE` :
   `legacy_ids`, `legacy_items`, `application_items`…), événement `character.purged` (outbox,
   même transaction) ;
3. fichiers : **aucun** à ce moment. Une image se partage (la copie d'un PNJ reprend le portrait
   de l'original, rangé dans le dossier de celui-ci) : seule la passe des fichiers orphelins la
   supprime, quand plus rien ne la référence (§ Fichiers).

**campaign** n'écoute rien : le retrait de la campagne a déjà eu lieu à la suppression. Les
notes gardent leur `character_id` (la note reste, c'est l'écrit du joueur) ; une instance purgée
n'a plus de token (son retrait de la carte est ce qui l'a supprimée).

**Gardé volontairement** : l'historique (service history) et les jets de dés journalisés. Ce sont
la chronique de la partie ; les événements portent déjà le nom du personnage.

## Fichiers orphelins

Passe horaire de chaque service qui **possède un dossier** du stockage (`startOrphanSweep`) :

| Dossier                | Service   |
| ---------------------- | --------- |
| `characters/`          | character |
| `campaigns/`           | campaign  |
| `avatars/`, `banners/` | identity  |

Pour chaque fichier, par lots de 500 (`sweepOrphans`, `@vtt/platform`) :

1. **jamais touché** s'il n'est pas au format exact de nos envois
   (`<dossier>/<uuid>/<uuid>.<ext>`, `uploadKey`) : un reste de l'ancienne app n'est pas candidat ;
2. **jamais touché** s'il a moins de 24 h (un envoi précède l'enregistrement de son adresse) ;
3. sinon, le service demande « référencé ? » à **chaque** service qui garde des adresses de
   fichiers, lui compris : character, campaign, identity, dice
   (`POST /internal/storage/references` `{ keys }` → `{ referenced }`, secret partagé) ;
4. supprimé seulement si aucun ne le référence ; un service qui ne répond pas arrête la passe sans
   rien supprimer.

« Référencé » se cherche dans **toutes les tables** du service, la ligne entière lue comme texte
(colonne d'adresse, vignette du CDN, JSON, texte d'une note) : une nouvelle colonne est couverte
sans rien changer. Seuls sont exclus l'outbox, l'inbox et les tables de Liquibase (le journal des
événements garderait tout pour toujours). Les modèles comptent toujours : leurs images ne partent
jamais tant qu'ils existent. Lecture seule, délai de 60 s par passe de table.

Audio (ses propres sons), history et billing ne gardent pas d'adresse d'image : ils ne sont pas
interrogés. La bibliothèque du produit (`assets.yner.fr`) n'est **jamais** balayée.

Réglages (`OrphanSweepSettings`) : `ORPHAN_SWEEP` = `off` | `dry-run` (défaut : journalise le
nombre, le volume et 20 exemples, sans rien supprimer) | `on` ; `ORPHAN_MIN_AGE_HOURS` (24) ;
`ORPHAN_SWEEP_EVERY_MINUTES` (60) ; `STORAGE_REFERENCE_URLS` (les autres services ; absent : pas de
balayage). Sans stockage, sans secret ou sans cette liste, la passe ne démarre pas.

## Briques

- `@vtt/platform` : `createObjectStore` (lister, supprimer), `withAdvisoryLock(pool, name, fn)`,
  `periodic`, `requireInternalSecret`, `referencedKeys`, `registerStorageReferences`,
  `remoteReferences`, `sweepOrphans`, `startOrphanSweep`.
- character : purge de la corbeille (`src/maintenance/`), `CLEANUP_EVERY_MINUTES` (60),
  `CLEANUP_DRY_RUN`.

## Ordre de réalisation

1. Corbeille des personnages, restauration, bouton Corbeille (front). Fait ; corbeille des
   modèles retirée (principe 2).
2. ~~Consommateur campaign~~ : abandonné (voir Corbeille, « Campagne »).
3. Purge définitive dans character (lignes et événements, pas de fichier). Fait.
4. Fichiers orphelins : route `references` (character, campaign, identity, dice), balayage dans
   character, campaign, identity. Fait, **en essai** (`dry-run`) : passer à `on` après lecture des
   journaux.

## Questions ouvertes

- Supprimer une **campagne** : même corbeille (7 jours) puis purge de tout son contenu (cartes,
  notes, fichiers, personnages engagés qui lui sont propres) ? Proposé : oui, même mécanique,
  dans un second temps.
- Restaurer un personnage dont la campagne a été purgée entre-temps : il revient sans campagne.
