/* ============================================================================
   repo.js — the Supabase data layer for the dashboard.
   Loads all 14 org-scoped tables into the flat `DATA` shape the dashboard's
   renderers expect, writes one section back at a time, and exposes a realtime
   subscription. RLS does the tenant + role enforcement; this file never checks.
   ============================================================================ */
import { supabase } from "./supabase.js";

const num = (v) => (v == null || v === "" ? 0 : Number(v));
const nn = (v) => (v == null || v === "" ? null : v);

/* Carry the DB row id on the array/object the dashboard hands back, so
   saveSection() can tell an edit from an insert. The dashboard ignores it. */
function tagArr(arr, row) { arr._id = row.id; return arr; }
function tagObj(obj, row) { return Object.defineProperty(obj, "_id", { value: row.id, enumerable: false }); }

/* Maturity bands are methodology, not per-org data — kept with the dashboard. */
export const BANDS = [
  ["Critical", "0 – 30", "Institutional control at risk; Gate 1 priorities outstanding."],
  ["Foundational", "31 – 50", "Basic control established; systems not yet consistent."],
  ["Developing", "51 – 70", "Core systems operating; institutionalisation in progress."],
  ["Consolidating", "71 – 85", "Systems institutionalised; focus shifts to productivity and enterprise."],
  ["Mature", "86 – 100", "Investment-ready; scalable enterprise systems in place."],
];

const EMPTY_BENE = { total: 0, verified: 0, pending: 0, disputed: 0, female: 0, male: 0, households: 0, succession: 0 };
const EMPTY_FIN = {
  annualBudget: 0, ytdIncomeBudget: 0, ytdIncomeActual: 0, ytdExpBudget: 0,
  ytdExpActual: 0, cashBalance: 0, cashMonths: [], cashTrend: [], categories: [],
};
const EMPTY_IMPACT = {
  jobsThisYear: 0, jobsCumulative: 0, hectaresActive: 0, hectaresTotal: 0,
  householdsBenefit: 0, householdsTotal: 0, revenue: 0, training: 0, jobsByYear: [],
};

/* ---------------------------------------------------------------- load ---- */
export async function loadOrg(orgId) {
  const sel = (t, order) =>
    supabase.from(t).select("*").eq("org_id", orgId).order(order, { ascending: true });
  const results = await Promise.all([
    supabase.from("orgs").select("*").eq("id", orgId).single(),
    sel("gates", "n"),
    sel("score_domains", "sort"),
    sel("committee", "sort"),
    sel("actions", "created_at"),
    sel("masterfile_sections", "sort"),
    supabase.from("beneficiary_figures").select("*").eq("org_id", orgId).maybeSingle(),
    sel("land_portions", "sort"),
    sel("land_leases", "sort"),
    sel("land_allocations", "sort"),
    sel("movable_assets", "sort"),
    sel("permits", "sort"),
    supabase.from("finance_figures").select("*").eq("org_id", orgId).maybeSingle(),
    sel("budget_categories", "sort"),
    sel("projects", "sort"),
    supabase.from("impact_figures").select("*").eq("org_id", orgId).maybeSingle(),
    supabase.from("documents").select("section, ref_id").eq("org_id", orgId),
  ]);
  const bad = results.find((r) => r.error);
  if (bad) throw bad.error;
  const [org, gates, domains, committee, actions, mf, bene, land, leases,
         allocations, movable, permits, fin, cats, projects, impact, docs] =
    results.map((r) => r.data);

  // { section: { ref_id-or-"_": count } } — drives the paperclip badges
  const docCounts = {};
  for (const d of docs || []) {
    (docCounts[d.section] ||= {});
    const k = d.ref_id || "_";
    docCounts[d.section][k] = (docCounts[d.section][k] || 0) + 1;
  }

  const f = fin || {};
  const i = impact || {};

  return {
    cpa: {
      name: org.name, reg: org.registration || "", region: org.region || "",
      established: org.established || "", landExtent: num(org.land_extent_ha),
      portions: num(org.portions), members: num(org.members_count),
    },
    gates: (gates || []).map((g) => tagObj({ n: g.n, name: g.name, state: g.state }, g)),
    score: {
      domains: (domains || []).map((d) => tagObj({ name: d.name, weight: num(d.weight), achieved: num(d.achieved) }, d)),
      bands: BANDS,
    },
    committee: (committee || []).map((r) => tagArr([r.role, r.name, r.term || ""], r)),
    actions: (actions || []).map((r) =>
      tagArr([r.ref || "", r.category || "", r.description || "", r.owner || "", r.due_date || "", r.status], r)),
    masterFile: (mf || []).map((r) =>
      tagArr([r.section_no || "", r.name || "", r.doc_count_label || "", num(r.completeness_pct)], r)),
    beneficiary: bene
      ? { total: num(bene.total), verified: num(bene.verified), pending: num(bene.pending),
          disputed: num(bene.disputed), female: num(bene.female), male: num(bene.male),
          households: num(bene.households), succession: num(bene.succession) }
      : { ...EMPTY_BENE },
    assets: {
      land: (land || []).map((r) => tagArr([r.portion, r.primary_use || "", num(r.extent_ha), r.lease || "", r.status], r)),
      leases: (leases || []).map((r) => tagArr(
        [r.party, r.portion || "", r.land_use || "", num(r.area_ha), r.start_date || "", r.end_date || "", num(r.rental), r.status], r)),
      allocations: (allocations || []).map((r) => tagArr(
        [r.beneficiary, r.portion || "", r.purpose || "", num(r.area_ha), r.allocated_on || "", r.agreement_ref || "", r.status], r)),
      movable: (movable || []).map((r) => tagArr([r.asset_class, num(r.item_count), r.condition || ""], r)),
      permits: (permits || []).map((r) => tagArr([r.name, r.valid_until || "", r.status], r)),
    },
    finance: {
      annualBudget: num(f.annual_budget), ytdIncomeBudget: num(f.ytd_income_budget),
      ytdIncomeActual: num(f.ytd_income_actual), ytdExpBudget: num(f.ytd_exp_budget),
      ytdExpActual: num(f.ytd_exp_actual), cashBalance: num(f.cash_balance),
      cashMonths: f.cash_months || [], cashTrend: (f.cash_trend || []).map(Number),
      categories: (cats || []).map((r) => tagArr([r.name, num(r.budget), num(r.actual)], r)),
    },
    impact: {
      jobsThisYear: num(i.jobs_this_year), jobsCumulative: num(i.jobs_cumulative),
      hectaresActive: num(i.hectares_active), hectaresTotal: num(i.hectares_total),
      householdsBenefit: num(i.households_benefit), householdsTotal: num(i.households_total),
      revenue: num(i.revenue), training: num(i.training),
      jobsByYear: i.jobs_by_year || [],
    },
    _docCounts: docCounts,
  };
}

/* ------------------------------------------------------------ documents ---- */
const BUCKET = "cpa-docs";

export async function listDocs(orgId, section, refId) {
  let q = supabase.from("documents").select("*").eq("org_id", orgId).eq("section", section);
  q = refId == null ? q.is("ref_id", null) : q.eq("ref_id", String(refId));
  const { data, error } = await q.order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadDoc(orgId, section, refId, file) {
  const safe = (file.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const path = `${orgId}/${section}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("documents").insert({
    org_id: orgId, section, ref_id: refId == null ? null : String(refId),
    name: file.name, path, size: file.size, mime: file.type || null, uploaded_by: user?.id || null,
  }).select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data;
}

export async function docUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDoc(doc) {
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.path]).catch(() => {});
}

/* ---------------------------------------------------------------- save ---- */
/* Reconcile a whole collection: update tagged rows, insert new ones (writing
   the id back onto the array so the next save updates), delete what's gone. */
async function reconcile(table, orgId, rows, toDb) {
  const { data: existing, error: exErr } = await supabase.from(table).select("id").eq("org_id", orgId);
  if (exErr) throw exErr;
  const keep = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const body = toDb(row, i);
    if (row._id) {
      keep.add(row._id);
      const { error } = await supabase.from(table).update(body).eq("id", row._id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from(table).insert({ ...body, org_id: orgId }).select("id").single();
      if (error) throw error;
      row._id = data.id;
      keep.add(data.id);
    }
  }
  const gone = (existing || []).map((r) => r.id).filter((id) => !keep.has(id));
  if (gone.length) {
    const { error } = await supabase.from(table).delete().in("id", gone);
    if (error) throw error;
  }
}

async function updateSingleton(table, orgId, body) {
  const { error } = await supabase.from(table).upsert({ ...body, org_id: orgId }, { onConflict: "org_id" });
  if (error) throw error;
}

export async function saveSection(orgId, section, D) {
  switch (section) {
    case "cpa": {
      const { error } = await supabase.from("orgs").update({
        name: D.cpa.name, registration: nn(D.cpa.reg), region: nn(D.cpa.region),
        established: D.cpa.established ? Number(D.cpa.established) : null,
        land_extent_ha: num(D.cpa.landExtent), portions: num(D.cpa.portions),
        members_count: num(D.cpa.members),
      }).eq("id", orgId);
      if (error) throw error;
      return;
    }

    case "gates": {
      for (const g of D.gates) {
        const { error } = await supabase.from("gates")
          .update({ name: g.name, state: g.state }).eq("org_id", orgId).eq("n", g.n);
        if (error) throw error;
      }
      const cur = D.gates.find((g) => g.state === "current");
      if (cur) await supabase.from("orgs").update({ current_gate: cur.n }).eq("id", orgId);
      return;
    }

    case "score":
      for (const d of D.score.domains) {
        const { error } = await supabase.from("score_domains")
          .update({ achieved: num(d.achieved) }).eq("org_id", orgId).eq("name", d.name);
        if (error) throw error;
      }
      return;

    case "committee":
      return reconcile("committee", orgId, D.committee, (r, i) => ({ role: r[0], name: r[1], term: nn(r[2]), sort: i }));

    case "actions":
      return reconcile("actions", orgId, D.actions, (r) => ({
        ref: nn(r[0]), category: nn(r[1]), description: r[2], owner: nn(r[3]),
        due_date: nn(r[4]), status: r[5],
      }));

    case "masterfile":
      return reconcile("masterfile_sections", orgId, D.masterFile, (r, i) => ({
        section_no: nn(r[0]), name: r[1], doc_count_label: nn(r[2]),
        completeness_pct: Math.max(0, Math.min(100, num(r[3]))), sort: i,
      }));

    case "beneficiary":
      return updateSingleton("beneficiary_figures", orgId, {
        total: num(D.beneficiary.total), verified: num(D.beneficiary.verified),
        pending: num(D.beneficiary.pending), disputed: num(D.beneficiary.disputed),
        female: num(D.beneficiary.female), male: num(D.beneficiary.male),
        households: num(D.beneficiary.households), succession: num(D.beneficiary.succession),
      });

    case "land":
      return reconcile("land_portions", orgId, D.assets.land, (r, i) => ({
        portion: r[0], primary_use: nn(r[1]), extent_ha: num(r[2]), lease: nn(r[3]), status: r[4], sort: i,
      }));
    case "leases":
      return reconcile("land_leases", orgId, D.assets.leases, (r, i) => ({
        party: r[0], portion: nn(r[1]), land_use: nn(r[2]), area_ha: num(r[3]),
        start_date: nn(r[4]), end_date: nn(r[5]), rental: num(r[6]), status: r[7], sort: i,
      }));
    case "allocations":
      return reconcile("land_allocations", orgId, D.assets.allocations, (r, i) => ({
        beneficiary: r[0], portion: nn(r[1]), purpose: nn(r[2]), area_ha: num(r[3]),
        allocated_on: nn(r[4]), agreement_ref: nn(r[5]), status: r[6], sort: i,
      }));
    case "movable":
      return reconcile("movable_assets", orgId, D.assets.movable, (r, i) => ({
        asset_class: r[0], item_count: num(r[1]), condition: nn(r[2]), sort: i,
      }));
    case "permits":
      return reconcile("permits", orgId, D.assets.permits, (r, i) => ({
        name: r[0], valid_until: nn(r[1]), status: r[2], sort: i,
      }));

    case "finance":
      return updateSingleton("finance_figures", orgId, {
        annual_budget: num(D.finance.annualBudget), ytd_income_budget: num(D.finance.ytdIncomeBudget),
        ytd_income_actual: num(D.finance.ytdIncomeActual), ytd_exp_budget: num(D.finance.ytdExpBudget),
        ytd_exp_actual: num(D.finance.ytdExpActual), cash_balance: num(D.finance.cashBalance),
        cash_months: D.finance.cashMonths || [], cash_trend: (D.finance.cashTrend || []).map(Number),
      });
    case "categories":
      return reconcile("budget_categories", orgId, D.finance.categories, (r, i) => ({
        name: r[0], budget: num(r[1]), actual: num(r[2]), sort: i,
      }));

    case "projects":
      return reconcile("projects", orgId, D.projects, (r, i) => ({
        name: r[0], stage: nn(r[1]), budget: num(r[2]), spent: num(r[3]),
        progress_pct: Math.max(0, Math.min(100, num(r[4]))), status: r[5], sort: i,
      }));

    case "impact":
      return updateSingleton("impact_figures", orgId, {
        jobs_this_year: num(D.impact.jobsThisYear), jobs_cumulative: num(D.impact.jobsCumulative),
        hectares_active: num(D.impact.hectaresActive), hectares_total: num(D.impact.hectaresTotal),
        households_benefit: num(D.impact.householdsBenefit), households_total: num(D.impact.householdsTotal),
        revenue: num(D.impact.revenue), training: num(D.impact.training),
        jobs_by_year: D.impact.jobsByYear || [],
      });

    default:
      throw new Error("unknown section: " + section);
  }
}

/* ------------------------------------------------------------ realtime ---- */
/* One schema-wide subscription; RLS already limits events to the viewer's
   orgs, and we filter to the active org client-side. Debounced. */
export function subscribe(orgId, onChange) {
  let timer = null;
  const bump = () => { clearTimeout(timer); timer = setTimeout(onChange, 250); };
  const ch = supabase
    .channel(`cpa360:${orgId}`)
    .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
      const nw = payload.new || {}, od = payload.old || {};
      const known = "org_id" in nw || "org_id" in od || "id" in nw || "id" in od;
      const mine = nw.org_id === orgId || od.org_id === orgId || nw.id === orgId || od.id === orgId;
      // RLS already limits events to the viewer's orgs; refresh if it's this one
      // (or if the event is too sparse to tell — better a wasted reload than a miss).
      if (mine || !known) bump();
    })
    .subscribe();
  return ch;
}

export function unsubscribe(ch) {
  if (ch) supabase.removeChannel(ch);
}
