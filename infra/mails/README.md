# E-mails

Les e-mails transactionnels (réinitialisation du mot de passe, vérification de
l'adresse…) sont envoyés par [Kourrier](https://github.com/theo-mrn/kourrier), le
service d'envoi du cluster. Un service ne construit pas le contenu : il envoie à
Kourrier un **nom de template** et ses **données**, Kourrier rend le template et le
livre.

```
identity ──POST /v1/emails──► Kourrier ──► Mailpit (dev) / AWS SES (cluster)
           { template: "reinitialisation", data: { lien } }
                                 │
                       templates : ce dossier (dev), R2 (cluster)
```

| Où | Kourrier | Templates lus depuis | Livraison |
|----|----------|----------------------|-----------|
| dev (`pnpm dev`) | `http://localhost:8090`, conteneur `kourrier` | `infra/mails/templates/` (monté, relu à chaque envoi) | Mailpit, http://localhost:8025 |
| staging | `http://kourrier.kourrier.svc:8080` | bucket R2 `kourrier-templates` (cache d'une minute) | AWS SES, `eu-west-3` |

Côté service : `KOURRIER_URL`, `KOURRIER_API_KEY` (secret) et `MAIL_FROM`, qui doit
être une adresse `@yner.fr`. Sans `KOURRIER_URL`, l'e-mail est seulement journalisé.

## Templates

```
templates/yner/_layout.html                  mise en page commune (blocs title et content)
templates/yner/<modele>/fr/subject.txt       objet
templates/yner/<modele>/fr/body.html         HTML (html/template de Go)
templates/yner/<modele>/fr/body.txt          texte brut (toujours le fournir)
```

`yner` est le tenant de Kourrier ; `<modele>` correspond au type `ModeleMail` de
`backend/identity/src/mail/mailer.ts`. Les données sont accessibles par `{{.lien}}`.
Dans `body.html`, Go échappe tout automatiquement : une donnée ne peut pas injecter de
HTML. La syntaxe complète est décrite dans l'ADR 010 de Kourrier.

### Modifier un texte

1. Éditer le fichier : en dev, l'e-mail suivant l'utilise déjà (vérifier dans Mailpit).
2. Commiter, puis publier sur R2 : `bash infra/mails/publier.sh` (après
   `npx wrangler login`). Le staging l'utilise en moins d'une minute, sans redéploiement.

### Ajouter un e-mail

1. Créer `templates/yner/<modele>/fr/` (les trois fichiers).
2. Ajouter `<modele>` au type `ModeleMail` et une fonction dans le module concerné
   (voir `backend/identity/src/modules/securite/mails.ts`).
3. Publier les templates **avant** de déployer le code qui les utilise : sinon Kourrier
   ne trouve pas le template et l'e-mail part en dead-letter queue.

## Diagnostic

Un e-mail qui n'est pas arrivé : runbook `docs/runbooks/kourrier.md` du dépôt
`argocd_registry` (statut de l'e-mail, dead-letter queue, rejeu).
