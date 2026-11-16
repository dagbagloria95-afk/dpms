/**
 * Teste la migration SQL sur un vrai moteur PostgreSQL (PGlite, en mémoire),
 * avec des bouchons minimaux pour les éléments propres à Supabase (auth).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildImportPayload, computePerformance, parseMonthlyWorkbook } from "../src/index";
import { buildFixture } from "./buildFixture";

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const ADMIN = "00000000-0000-0000-0000-00000000a001";
const INTRUDER = "00000000-0000-0000-0000-00000000b002";

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

let db: PGlite;
const as = (uid: string) => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

async function importFixture(sales: Record<number, [number, number]>, fileName = "nov.xlsx") {
  const parsed = await parseMonthlyWorkbook(
    await buildFixture([
      { region: "Région A", name: "ALPHA", phone: 70000001, city: "BANGUI", objHt: 1_000_000, sales },
      { region: "Région B", name: "BETA", phone: 70000002, city: "BOUAR", objTtc: 500_000, sales: { 2: [50_000, 0] } },
    ]),
  );
  const payload = buildImportPayload(parsed, computePerformance(parsed), { fileName });
  return one<{ id: string }>(`select public.apply_monthly_import($1::jsonb) as id`, [JSON.stringify(payload)]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@test'), ($2, 'intrus@test')`, [ADMIN, INTRUDER]);
});

describe("migration SQL", () => {
  it("le premier compte devient le seul administrateur", async () => {
    const { n } = await one<{ n: number }>(`select count(*)::int as n from public.admins`);
    expect(n).toBe(1);
    await as(INTRUDER);
    expect((await one<{ ok: boolean }>(`select public.is_admin() as ok`)).ok).toBe(false);
    await as(ADMIN);
    expect((await one<{ ok: boolean }>(`select public.is_admin() as ok`)).ok).toBe(true);
  });

  it("refuse l'import à un non-administrateur", async () => {
    await as(INTRUDER);
    await expect(importFixture({ 1: [1000, 0] })).rejects.toThrow(/Accès refusé/);
  });

  it("importe un mois puis le remplace au ré-import", async () => {
    await as(ADMIN);
    await importFixture({ 1: [100_000, 26_000], 3: [10_000, 0] });
    let alpha = await one<{ realise_ttc: string; rang: number; zone_name: string; phone: string }>(
      `select realise_ttc, rang, zone_name, phone from public.v_performances where distributor_name = 'ALPHA'`,
    );
    expect(Number(alpha.realise_ttc)).toBe(136_000);
    expect(alpha.zone_name).toBe("Région A");
    expect(alpha.phone).toBe("+23670000001");

    const second = await importFixture({ 1: [100_000, 26_000], 3: [10_000, 0], 5: [1_000_000, 0] }, "nov-v2.xlsx");
    alpha = await one(`select realise_ttc, rang from public.v_performances where distributor_name = 'ALPHA'`);
    expect(Number(alpha.realise_ttc)).toBe(1_136_000);
    expect(alpha.rang).toBe(1);

    const counts = await one<{ d: number; s: number; z: number; applied: number; superseded: number }>(`
      select (select count(*)::int from public.distributors) as d,
             (select count(*)::int from public.daily_sales) as s,
             (select count(*)::int from public.zones) as z,
             (select count(*)::int from public.import_batches where status = 'applied') as applied,
             (select count(*)::int from public.import_batches where status = 'superseded') as superseded`);
    expect(counts).toEqual({ d: 2, s: 5, z: 2, applied: 1, superseded: 1 });

    const period = await one<{ as_of: Date; last_import_id: string; weeks: unknown[] }>(
      `select as_of, last_import_id, weeks from public.periods where code = '2025-11'`,
    );
    expect(period.last_import_id).toBe(second.id);
    expect(period.weeks).toHaveLength(4);
  });

  it("déroule une campagne SMS via la passerelle Android", async () => {
    await as(ADMIN);
    const dists = (await db.query<{ id: string; phone: string; name: string }>(
      `select id, phone, name from public.distributors order by sort_order`,
    )).rows;
    const messages = dists.map((d) => ({ distributor_id: d.id, phone: d.phone, body: `Bonjour ${d.name}`, segments: 1 }));
    const { id: campaign } = await one<{ id: string }>(
      `select public.create_sms_campaign('Test', null, 'Bonjour {{nom}}', '2025-11', '{}', $1::jsonb) as id`,
      [JSON.stringify(messages)],
    );
    const { id: device } = await one<{ id: string }>(
      `insert into public.gateway_devices (name) values ('Mon Android') returning id`,
    );

    const claimed = (await db.query<{ id: string; phone: string }>(`select * from public.claim_sms($1, 10)`, [device])).rows;
    expect(claimed).toHaveLength(2);
    // Une 2e réservation ne renvoie rien : pas de double envoi.
    expect((await db.query(`select * from public.claim_sms($1, 10)`, [device])).rows).toHaveLength(0);

    await db.query(`select public.report_sms_status($1, 'delivered')`, [claimed[0]!.id]);
    await db.query(`select public.report_sms_status($1, 'sent')`, [claimed[0]!.id]); // accusé tardif
    await db.query(`select public.report_sms_status($1, 'failed', 'Pas de réseau')`, [claimed[1]!.id]);

    let stats = await one<{ status: string; nb_delivered: number; nb_failed: number }>(
      `select status, nb_delivered::int, nb_failed::int from public.v_campaign_stats where id = $1`, [campaign]);
    expect(stats).toEqual({ status: "completed", nb_delivered: 1, nb_failed: 1 });

    const alert = await one<{ severity: string; body: string }>(
      `select severity, body from public.alerts where type = 'campaign_done' order by created_at desc limit 1`);
    expect(alert.severity).toBe("error"); // 1 échec sur 2 > 20 %
    expect(alert.body).toContain("1/2 SMS envoyés");

    // Relance des échecs
    expect((await one<{ n: number }>(`select public.retry_failed_sms($1) as n`, [campaign])).n).toBe(1);
    const again = (await db.query<{ id: string }>(`select * from public.claim_sms($1, 10)`, [device])).rows;
    expect(again.map((m) => m.id)).toEqual([claimed[1]!.id]);
    await db.query(`select public.report_sms_status($1, 'sent')`, [again[0]!.id]);
    stats = await one(`select status, nb_delivered::int, nb_failed::int from public.v_campaign_stats where id = $1`, [campaign]);
    expect(stats).toEqual({ status: "completed", nb_delivered: 1, nb_failed: 0 });
  });

  it("annule une campagne et ses messages en attente", async () => {
    await as(ADMIN);
    const { id } = await one<{ id: string }>(
      `select public.create_sms_campaign('A annuler', null, 'x', null, '{}', '[{"phone":"+23670000001","body":"x"}]'::jsonb) as id`);
    await db.query(`select public.set_campaign_status($1, 'cancelled')`, [id]);
    const m = await one<{ status: string }>(`select status from public.sms_messages where campaign_id = $1`, [id]);
    expect(m.status).toBe("cancelled");
  });
});
