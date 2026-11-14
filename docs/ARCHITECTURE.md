# Architecture (validée le 14/11/2026)

```
 Application WEB (Next.js / Vercel)        Application ANDROID (Expo, APK)
  import Excel, calculs, distributeurs,     tableaux de bord, alertes,
  modèles SMS, campagnes                    contrôle des campagnes, PASSERELLE SMS
              │                                         │
              └──────────── HTTPS + temps réel ─────────┘
                                │
                     SUPABASE (PostgreSQL, Auth,
                     Storage, Realtime)
                                │
                 SMS envoyés par la SIM du téléphone
                                ▼
                     34 distributeurs (+236 XXXXXXXX)
```

Décisions :
- Pas d'application Desktop : l'import et le calcul se font sur le Web.
- Produits : **zebra** et **DW**. TTC = HT × 1,26.
- SMS : le téléphone Android de l'administrateur sert de passerelle. L'interface
  `SmsProvider` permettra plus tard de passer à une API opérateur avec nom d'expéditeur.
- Campagnes déclenchées manuellement, à tout moment (Web ou mobile).
- Import : le modèle Excel mensuel habituel, réimportable à volonté.

## Flux d'import

1. L'admin dépose le fichier sur le Web. Le fichier est stocké dans le bucket privé `imports`.
2. `@dpms/core` lit la feuille, repère les colonnes **par leurs libellés** et signale les anomalies.
3. `computePerformance` calcule les KPI par distributeur, par région et au total.
4. L'admin vérifie l'aperçu, puis valide. `apply_monthly_import(payload)` enregistre tout en une transaction.

## Flux SMS (passerelle Android)

1. Web ou mobile : choix du modèle et de la cible. Les messages sont personnalisés avec `renderSmsTemplate`,
   puis `create_sms_campaign` les enregistre (statut `pending`).
2. Le téléphone, notifié en temps réel, appelle `claim_sms(device, n)`. Les messages réservés
   ne peuvent pas être pris deux fois (`FOR UPDATE SKIP LOCKED`).
3. Il envoie chaque SMS avec la SIM, avec une pause de `sms_interval_seconds` entre deux envois.
4. Les accusés Android (envoyé, livré, échec) sont remontés par `report_sms_status`.
5. Quand il ne reste rien à envoyer, la campagne passe à `completed` et une alerte est créée (push mobile).
6. Un message réservé sans retour depuis 10 minutes est remis en file automatiquement.

## Base de données

`admins`, `settings`, `zones`, `distributors`, `periods`, `import_batches`, `targets`,
`daily_sales`, `performances`, `sms_templates`, `sms_campaigns`, `sms_messages`,
`gateway_devices`, `alerts`, `audit_logs`. Vues : `v_performances` et `v_campaign_stats`.

Sécurité : RLS activée partout, accès réservé à `is_admin()`. Le premier compte créé
devient administrateur, puis les inscriptions sont désactivées dans Supabase.
