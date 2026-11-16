# DPMS : Distributor Performance Management System

Suivi des performances de 34 distributeurs (République centrafricaine) et envoi de
SMS personnalisés. Les distributeurs n'ont aucun compte : ils reçoivent uniquement des SMS.

## Applications

| Dossier | Rôle | Statut |
|---|---|---|
| `packages/core` | Lecture du modèle Excel, calcul des KPI, SMS (modèles, comptage) | ✅ Fait, testé |
| `supabase/migrations` | Base de données, sécurité, import, campagnes, passerelle SMS | ✅ Fait, testé |
| `apps/web` | Plateforme d'administration (Next.js, Vercel) : connexion, tableau de bord, import Excel, distributeurs | ✅ Étape 3 (SMS : étape 4) |
| `apps/mobile` | Application Android admin et passerelle SMS (Expo) | ⏳ Étape 5 |

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et la mise en ligne pas à pas : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Commandes

```bash
pnpm install
pnpm test        # tests du moteur de calcul et de la base de données
pnpm typecheck
```

## Règles de calcul

- Montants journaliers saisis en **TTC** (colonnes zebra et DW du modèle).
- **TTC = HT × 1,26** (paramètre `ttc_rate`), utilisé quand un seul des deux objectifs est rempli.
- Taux = réalisé TTC ÷ objectif TTC · RAF = max(objectif − réalisé, 0).
- Date d'arrêté = dernier jour du mois contenant au moins une vente.
- Moyenne journalière = réalisé ÷ jours écoulés · Objectif journalier = RAF ÷ jours restants.
- Rang national et rang par région selon le taux (sans objectif : non classé).
- Ré-importer un mois **remplace** entièrement ses chiffres.

## Confidentialité

Les fichiers `.xlsx` réels (noms et numéros des distributeurs) ne sont jamais
versionnés (`.gitignore`). Les tests utilisent des données fictives.
