"use server";

import { normalizeCarPhone } from "@dpms/core";
import { revalidatePath } from "next/cache";
import { IS_DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const DEMO_ERROR: ActionResult = {
  ok: false,
  error: "Mode démonstration : les modifications seront possibles une fois la base de données connectée.",
};

export async function saveDistributor(form: FormData): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_ERROR;
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  const rawPhone = String(form.get("phone") ?? "").trim();
  const city = String(form.get("city") ?? "").trim().toUpperCase();
  const zoneId = String(form.get("zoneId") ?? "") || null;

  if (!name) return { ok: false, error: "Le nom est obligatoire." };
  const phone = normalizeCarPhone(rawPhone);
  if (!phone) return { ok: false, error: "Numéro invalide : 8 chiffres attendus (ex. 72 18 80 81)." };

  const supabase = await createClient();
  const values = { name, phone, raw_phone: rawPhone, city, zone_id: zoneId };
  const { error } = id
    ? await supabase.from("distributors").update(values).eq("id", id)
    : await supabase.from("distributors").insert(values);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ce numéro est déjà attribué à un autre distributeur." };
    return { ok: false, error: error.message };
  }
  await supabase.from("audit_logs").insert({
    action: id ? "distributor_update" : "distributor_create",
    entity: "distributor",
    entity_id: id || phone,
    details: values,
  });
  revalidatePath("/distributeurs");
  revalidatePath("/");
  return { ok: true };
}

export async function setDistributorActive(id: string, active: boolean): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_ERROR;
  const supabase = await createClient();
  const { error } = await supabase.from("distributors").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({
    action: active ? "distributor_activate" : "distributor_deactivate",
    entity: "distributor",
    entity_id: id,
  });
  revalidatePath("/distributeurs");
  return { ok: true };
}

export async function createZone(form: FormData): Promise<ActionResult> {
  if (IS_DEMO) return DEMO_ERROR;
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Nom de région obligatoire." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("zones").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("zones").insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, error: error.code === "23505" ? "Cette région existe déjà." : error.message };
  revalidatePath("/distributeurs");
  return { ok: true };
}
