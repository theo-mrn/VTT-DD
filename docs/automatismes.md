# Automatismes — moteur de règles de la table

> Conception (à valider avant le code). Remplace la première version (réglages + quelques
> déclencheurs exécutés dans le navigateur du MJ).

## 1. But

Le moteur de la table : le MJ décrit des règles « **quand** il se passe ceci, **si** cela est
vrai, **alors** fais ça », et le serveur les applique tout seul, MJ connecté ou non.

> Quand **un combat se termine**, si **la scène est la Crypte**, alors **appliquer
> « Crypte, calme »**, puis 3 s après **poster « Le silence retombe… » au chat**.

Principes :

- **Ouvert** : chaque déclencheur, condition et action est déclaré à un seul endroit (schéma du
  contrat, exécution côté serveur, réglage dans l'éditeur). En ajouter un ne touche à rien d'autre.
- **Exécuté par le serveur** (service campaign) : une seule exécution par événement, même avec
  plusieurs onglets ou MJ ; un journal fiable de ce qui a été fait.
- **Sûr** : pas de boucle (une action ne relance pas sa propre règle au-delà d'une profondeur de
  3, `causationId`), débit plafonné par campagne, seul le MJ écrit les règles.
- **Les réglages restent** : un réglage (bloc complet son + météo + écran + heure) devient
  l'action « Appliquer le réglage X », réutilisable par plusieurs règles et lançable d'un clic.

## 2. Modèle

```ts
Rule {
  id, name, enabled,
  trigger: { type, filter? },          // ex. { type: 'dice.critical', filter: { side: 'players' } }
  conditions: Condition[],             // toutes vraies (ET)
  actions: { type, delayMs?, params }[], // dans l'ordre
  limit?: { oncePerSession? , cooldownSec? },
  sortOrder, version
}
```

Tables (service campaign) :

| Table              | Contenu                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `automations`      | réglages (existe, 0035)                                                                        |
| `automation_rules` | règles                                                                                         |
| `automation_jobs`  | actions différées et échéances (minuteur, heure du monde)                                      |
| `automation_runs`  | journal : règle, événement, actions faites, erreur ; sert aussi aux limites et à l'idempotence |
| `table_state`      | état des outils de table de la campagne (§ 4)                                                  |

## 3. Exécuteur

- Consommateur durable `campaign-automations` sur `vtt.*.>` (tous les événements de
  campagnes), boîte de réception contre les doublons, comme `campaign-accounts`.
- Pour chaque événement : règles actives de la campagne dont le déclencheur correspond (cache
  par campagne, vidé à chaque écriture de règle), filtre puis conditions évalués sur
  l'événement et l'état de la table, actions exécutées dans une transaction, les différées
  posées dans `automation_jobs`.
- Un ouvrier lit `automation_jobs` chaque seconde (modèle de `exploration-queue`) : actions
  différées, fin du minuteur, heure du monde atteinte.
- Chaque action produit ses événements habituels (`causationId` = événement déclencheur) :
  les clients se mettent à jour comme si le MJ avait cliqué.

## 4. État de la table côté serveur (préalable)

Aujourd'hui l'heure du monde, les horloges, le minuteur, les jetons de destin, l'ambiance
d'écran et la pause vivent dans le navigateur du MJ (canal éphémère). Le serveur ne peut ni
réagir dessus ni les changer. Ils passent dans `table_state` (une ligne par campagne, JSON
validé par le contrat), avec `GET/PATCH /v1/campaigns/:id/table-state` et l'événement
`table_state.updated`. Les panneaux gardent leur interface ; seule leur source change. Les
effets ponctuels (éclair, secousse) deviennent l'événement `table.fx`.

## 5. Premier catalogue

### Déclencheurs

| Famille     | Déclencheur                                                 | Source                                   |
| ----------- | ----------------------------------------------------------- | ---------------------------------------- |
| Scène       | arrivée, départ du groupe                                   | `map_settings.updated` (scène du groupe) |
| Combat      | début, fin, round, tour, adversaire vaincu                  | événements `combat.*`                    |
| Temps       | heure du monde atteinte                                     | échéance calculée (`automation_jobs`)    |
| Outils      | horloge : segment, pleine ; minuteur écoulé ; jeton dépensé | `table_state`                            |
| Personnages | PV à 0, sous un seuil ; montée de niveau                    | événements du service character          |
| Carte       | jeton entré dans une zone ; portail utilisé                 | `token.moved`, `map_portal.used`         |

### Conditions

Scène du groupe = X ; en combat ou non ; heure du monde entre A et B ; camp du personnage
(joueurs, adversaires, alliés) ; une chance sur N ; une fois par séance ; délai minimal entre
deux exécutions.

### Actions

| Famille  | Actions                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Ambiance | appliquer un réglage ; musique / ambiance sonore ; météo ; écran (ambiance, effet) ; heure et vitesse du temps                     |
| Outils   | lancer / arrêter le minuteur ; avancer une horloge ; donner un jeton ; pause                                                       |
| Table    | message au chat (au nom de la table) ; montrer un document ; notifier le MJ                                                        |
| Carte    | faire venir le groupe sur une scène ; montrer / cacher un jeton, un objet, une zone de brouillard ; allumer / éteindre une lumière |

Le son passe par une route interne du service audio (secret de service, comme les autres
appels internes).

## 6. Éditeur

Une phrase à compléter, bloc par bloc : **Quand** [déclencheur ▾] [filtres] — **Si** [+
condition] — **Alors** [+ action, délai]. Chaque bloc a son petit formulaire, déclaré avec son
type. Liste des règles avec interrupteur, et journal des dernières exécutions (« Fin de combat
→ Crypte, calme · il y a 2 min »).

## 7. Phases

1. **État de la table côté serveur** (§ 4) et bascule des outils existants — fait (migration
   0036, module `table`, `features/shared/table-state.ts`).
2. **Règles, exécuteur, journal, éditeur** ; déclencheurs scène, combat, temps et outils ;
   actions ambiance, outils, table — fait (migration 0037, module `automations`, consommateur
   `audio-automations`, `features/automations/ui/rule-*`). Les déclencheurs des réglages sont
   exécutés par le serveur comme des règles implicites (« lancer ce réglage »).
3. **Personnages et carte** : PV, niveau, zones, portails ; actions de carte.
4. Ce qui reste (sondage, jet de groupe, dés) sur le même modèle.

## 8. Points à confirmer

- ~~Route interne du service audio~~ : remplacée par l'événement `automation.audio`, que le
  service audio exécute comme une commande du MJ.
- Les événements du service character portent-ils les ressources (PV) avant / après ? Sinon,
  les ajouter pour « PV à 0 » et « sous un seuil ».
