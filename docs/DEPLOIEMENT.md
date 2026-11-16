# Mise en ligne, pas à pas (uniquement depuis le navigateur)

## A. Mettre le site en ligne sur Vercel (mode démonstration)

1. Allez sur **vercel.com**, puis **Sign Up** → **Continue with GitHub**.
2. Cliquez sur **Add New… → Project**.
3. Dans la liste, à côté de `dpms`, cliquez sur **Import**.
   (Si le dépôt n'apparaît pas : **Adjust GitHub App Permissions**, puis autorisez `dpms`.)
4. **Root Directory** → **Edit** → choisissez `apps/web` → **Continue**.
5. Ne touchez à rien d'autre, puis cliquez sur **Deploy**.
6. Après 2 à 3 minutes, Vercel affiche l'adresse du site (ex. `dpms-xxxx.vercel.app`).

Le site s'ouvre en **mode démonstration** (bandeau jaune, données fictives) tant que la
base de données n'est pas connectée.

## B. Créer la base de données Supabase

1. Allez sur **supabase.com**, puis **Start your project** → **Continue with GitHub**.
2. Cliquez sur **New project** :
   - *Name* : `dpms`
   - *Database Password* : cliquez sur **Generate a password** et conservez-le en lieu sûr
   - *Region* : **Central EU (Frankfurt)** ou **West EU (Paris)**, les plus proches de Bangui
   - **Create new project**, puis attendez environ 2 minutes.
3. Menu de gauche **SQL Editor** → **New query**.
   Ouvrez le fichier `supabase/migrations/20261114000001_init.sql` sur GitHub, cliquez sur
   l'icône **Copy raw file**, collez-le dans l'éditeur, puis cliquez sur **Run**.
   Le message attendu est « Success. No rows returned ».
4. Créez votre compte administrateur : **Authentication → Users → Add user → Create new user**.
   Saisissez votre e-mail et un mot de passe solide, et cochez **Auto Confirm User**.
   ➜ Le **premier** compte créé devient automatiquement l'administrateur.
5. Bloquez les inscriptions : **Authentication → Sign In / Providers**, puis désactivez
   **Allow new users to sign up** → **Save**.
6. Récupérez les clés : **Project Settings → API Keys** (ou bouton **Connect**) :
   - *Project URL* (ex. `https://abcd.supabase.co`)
   - la clé publique **anon / publishable**. Ne communiquez **jamais** la clé `service_role` / secret.

## C. Relier le site à la base de données

1. Dans Vercel, ouvrez le projet `dpms` → **Settings → Environment Variables** et ajoutez :
   - `NEXT_PUBLIC_SUPABASE_URL` = l'URL du projet
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clé publique
2. **Deployments** → sur le dernier déploiement, ouvrez le menu **⋯** → **Redeploy**.
3. Ouvrez le site : la page de connexion apparaît. Connectez-vous avec le compte créé en B.4.

À chaque modification du code poussée sur GitHub, Vercel remet le site à jour automatiquement.
