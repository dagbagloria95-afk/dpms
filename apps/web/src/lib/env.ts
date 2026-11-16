export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Sans projet Supabase configuré, le site tourne en mode démonstration :
 * données fictives, pas de connexion, aucune écriture.
 */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
