import { supabase } from "./supabaseClient.js";

// ---------- constants / labels ----------
const LEAD_STATUS = [
  ["new", "New / Identified"],
  ["contacted", "Contacted"],
  ["responding", "Responding"],
  ["details_shared", "Details Shared"],
  ["form_submitted", "Form Submitted"],
  ["not_interested", "Not Interested"],
  ["dormant", "Dormant"],
];
const DEAL_STAGE = [
  ["call_booked", "Call Booked"],
  ["no_show_followup", "No-Show — Follow-up"],
  ["no_show_dormant", "No-Show — Dormant"],
  ["pending", "Pending"],
  ["closed_won", "Closed Won"],
  ["not_interested", "Not Interested"],
  ["cancelled_14day", "Cancelled (14-day)"],
  ["dormant", "Dormant"],
];
const TIERS = [
  ["tier_1", "Tier 1", 2500],
  ["tier_2", "Tier 2", 5000],
  ["tier_3", "Tier 3", 10000],
];
const PLATFORMS = ["LinkedIn", "Instagram", "Facebook", "Email", "Referral", "Application Form"];
const WON = "closed_won";
const LOST = ["not_interested", "cancelled_14day", "dormant", "no_show_dormant"];

const lbl = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];
const tierLabel = (k) => (TIERS.find((t) => t[0] === k) || [k, "—"])[1];
const tierAmount = (k) => (TIERS.find((t) => t[0] === k) || [0, 0, 0])[2];
const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString());
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const MARK = `<img class="mark" src="logo.png" alt="Shevlin Coaching" />`;

// ---------- state ----------
const state = { user: null, profile: null, profiles: [], view: "dashboard", leadView: "kanban", dealView: "kanban" };
const app = document.getElementById("app");
const isStaff = () => ["coach", "admin"].includes(state.profile?.role);

// ============================================================
// BOOT
// ============================================================
init();
async function init() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await loadAndRender();
  else renderAuth();
  supabase.auth.onAuthStateChange((_e, session) => {
    if (session && !state.user) loadAndRender();
    if (!session && state.user) { state.user = null; state.profile = null; renderAuth(); }
  });
}

async function loadAndRender() {
  const { data: u } = await supabase.auth.getUser();
  state.user = u.user;
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", state.user.id).single();
  state.profile = prof;
  const { data: all } = await supabase.from("profiles").select("id,full_name,role").order("full_name");
  state.profiles = all || [];
  renderShell();
}

// ============================================================
// AUTH SCREEN
// ============================================================
function renderAuth(mode = "signin") {
  app.innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="brand">${MARK}<span class="name">SHEVLIN<span>·</span>CRM</span></div>
    <h1>${mode === "signin" ? "Sign in" : "Create account"}</h1>
    <p class="sub">${mode === "signin" ? "Welcome back. Log in to your pipeline." : "Set up your login. Ask Ayden to set your role after."}</p>
    <div id="msg"></div>
    ${mode === "signup" ? field("Full name", `<input id="f_name" placeholder="Jordan Smith"/>`) : ""}
    ${field("Email", `<input id="f_email" type="email" placeholder="you@shevlinmarketing.org"/>`)}
    ${field("Password", `<input id="f_pass" type="password" placeholder="••••••••"/>`)}
    <button class="btn" id="go">${mode === "signin" ? "Sign in" : "Create account"}</button>
    <div class="switch-line">
      ${mode === "signin" ? `New here? <b id="sw">Create an account</b>` : `Already have one? <b id="sw">Sign in</b>`}
    </div>
  </div></div>`;
  document.getElementById("sw").onclick = () => renderAuth(mode === "signin" ? "signup" : "signin");
  document.getElementById("go").onclick = () => (mode === "signin" ? doSignin() : doSignup());
  app.querySelectorAll("input").forEach((i) => (i.onkeydown = (e) => e.key === "Enter" && document.getElementById("go").click()));
}
const field = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
const msg = (t, cls = "err") => (document.getElementById("msg").innerHTML = `<div class="${cls}">${esc(t)}</div>`);

async function doSignin() {
  const email = val("f_email"), password = val("f_pass");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) msg(error.message);
}
async function doSignup() {
  const email = val("f_email"), password = val("f_pass"), full_name = val("f_name");
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) return msg(error.message);
  msg("Account created. If email confirmation is on, check your inbox, then sign in.", "ok");
}
const val = (id) => document.getElementById(id)?.value.trim() || "";

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  const nav = [
    ["dashboard", "Dashboard", `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`],
    ["leads", "Leads — Setter", `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>`],
    ["deals", "Deals — Closer", `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-9M14 17H5M17 3l3 4-3 4M7 21l-3-4 3-4"/></svg>`],
  ];
  if (isStaff()) nav.push(["team", "Team", `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`]);

  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand">${MARK}<span class="name">SHEVLIN<span>·</span>CRM</span></div>
      ${nav.map(([k, t, ic]) => `<div class="nav-item ${state.view === k ? "active" : ""}" data-nav="${k}">${ic}${t}</div>`).join("")}
      <div class="spacer"></div>
      <div class="whoami">
        <b>${esc(state.profile?.full_name || state.user.email)}</b>
        ${esc(state.user.email)}
        <div class="role-pill">${esc(state.profile?.role || "—")}</div>
      </div>
      <div class="nav-item" id="logout"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Log out</div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  app.querySelectorAll("[data-nav]").forEach((el) => (el.onclick = () => { state.view = el.dataset.nav; renderShell(); }));
  document.getElementById("logout").onclick = () => supabase.auth.signOut();
  renderView();
}

function renderView() {
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "leads") return renderLeads();
  if (state.view === "deals") return renderDeals();
  if (state.view === "team") return renderTeam();
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const main = document.getElementById("main");
  main.innerHTML = head("Overview", "Dashboard");
  const [{ data: leads }, { data: deals }] = await Promise.all([
    supabase.from("leads").select("status,owner_id"),
    supabase.from("deals").select("stage,tier,amount,owner_id,sourcing_setter"),
  ]);
  const L = leads || [], D = deals || [];
  const forms = L.filter((l) => l.status === "form_submitted").length;
  const won = D.filter((d) => d.stage === WON);
  const decided = D.filter((d) => d.stage === WON || LOST.includes(d.stage)).length;
  const closeRate = decided ? Math.round((won.length / decided) * 100) : 0;
  const revenue = won.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  main.insertAdjacentHTML("beforeend", `
    <div class="metrics">
      ${metric("Active leads", L.filter((l) => !["not_interested", "dormant", "form_submitted"].includes(l.status)).length)}
      ${metric("Forms submitted", forms, "accent")}
      ${metric("Deals in play", D.filter((d) => ["call_booked", "no_show_followup", "pending"].includes(d.stage)).length)}
      ${metric("Closed won", won.length, "good")}
      ${metric("Close rate", closeRate + "<small>%</small>", closeRate >= 40 ? "good" : closeRate < 30 && decided ? "accent" : "")}
      ${metric("Revenue won", money(revenue))}
    </div>
    <div class="section-grid">
      <div class="panel"><h3>Setter pipeline</h3>${barChart(LEAD_STATUS, L, "status")}</div>
      <div class="panel"><h3>Closer pipeline</h3>${barChart(DEAL_STAGE, D, "stage")}</div>
    </div>
    <div class="panel"><h3>Closed won by tier</h3>${barChart(TIERS.map((t) => [t[0], t[1]]), won, "tier")}</div>
    ${closeRate < 30 && decided ? `<div class="err">Close rate is under 30% — per your SOP this triggers a call review.</div>` : ""}
  `);
}
const metric = (k, v, cls = "") => `<div class="metric ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
function barChart(defs, rows, key) {
  const counts = {}; defs.forEach((d) => (counts[d[0]] = 0));
  rows.forEach((r) => { if (counts[r[key]] != null) counts[r[key]]++; });
  const max = Math.max(1, ...Object.values(counts));
  return defs.map(([k, label]) => `
    <div class="bar-row"><div class="lbl">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(counts[k] / max) * 100}%"></div></div>
      <div class="num">${counts[k]}</div></div>`).join("");
}

// ============================================================
// LEADS (setter pipeline)
// ============================================================
async function renderLeads() {
  const main = document.getElementById("main");
  main.innerHTML = head("Setter pipeline", "Leads", `
    <div class="toggle"><button data-lv="kanban" class="${state.leadView === "kanban" ? "on" : ""}">Board</button><button data-lv="table" class="${state.leadView === "table" ? "on" : ""}">Table</button></div>
    <button class="btn sm" id="newLead">+ New lead</button>`);
  main.querySelectorAll("[data-lv]").forEach((b) => (b.onclick = () => { state.leadView = b.dataset.lv; renderLeads(); }));
  document.getElementById("newLead").onclick = () => leadModal();

  const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
  if (error) return main.insertAdjacentHTML("beforeend", `<div class="err">${esc(error.message)}</div>`);
  const rows = data || [];
  if (!rows.length) return main.insertAdjacentHTML("beforeend", `<div class="empty">No leads yet. Add your first one.</div>`);

  if (state.leadView === "table") {
    main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Tier</th><th>Platform</th><th>Status</th><th>Owner</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((l) => `<tr data-edit="${l.id}">
        <td class="name">${esc(l.name)}</td><td>${tierTag(l.tier)}</td><td>${esc(l.platform || "—")}</td>
        <td><span class="tag ${l.status === "form_submitted" ? "hot" : LOST.includes(l.status) ? "lost" : ""}">${lbl(LEAD_STATUS, l.status)}</span></td>
        <td>${esc(ownerName(l.owner_id))}</td><td class="muted">${esc(l.next_action || "—")}</td></tr>`).join("")}
      </tbody></table></div>`);
    main.querySelectorAll("[data-edit]").forEach((tr) => (tr.onclick = () => leadModal(rows.find((r) => r.id === tr.dataset.edit))));
  } else {
    main.insertAdjacentHTML("beforeend", `<div class="kanban">${LEAD_STATUS.map(([k, label]) => {
      const items = rows.filter((r) => r.status === k);
      return `<div class="col"><div class="col-head"><span class="t">${label}</span><span class="c">${items.length}</span></div>
        <div class="col-body">${items.map((l) => leadCard(l)).join("") || `<div class="muted" style="padding:6px">—</div>`}</div></div>`;
    }).join("")}</div>`);
    wireLeadCards(rows);
  }
}
function leadCard(l) {
  return `<div class="card" data-edit="${l.id}">
    <div class="ct">${esc(l.name)}</div>
    <div class="cm">${tierTag(l.tier)} ${esc(l.platform || "")}</div>
    <div class="cf">
      <select data-move="${l.id}">${LEAD_STATUS.map(([k, t]) => `<option value="${k}" ${k === l.status ? "selected" : ""}>${t}</option>`).join("")}</select>
      ${l.status === "form_submitted" && !l.converted ? `<button class="btn mini" data-convert="${l.id}">Convert →</button>` : ""}
    </div></div>`;
}
function wireLeadCards(rows) {
  const main = document.getElementById("main");
  main.querySelectorAll("[data-edit]").forEach((c) => (c.onclick = (e) => { if (e.target.closest("select,button")) return; leadModal(rows.find((r) => r.id === c.dataset.edit)); }));
  main.querySelectorAll("[data-move]").forEach((s) => (s.onchange = async () => {
    await supabase.from("leads").update({ status: s.value }).eq("id", s.dataset.move); renderLeads();
  }));
  main.querySelectorAll("[data-convert]").forEach((b) => (b.onclick = () => convertLead(rows.find((r) => r.id === b.dataset.convert))));
}

function leadModal(lead = null) {
  const editing = !!lead;
  openModal(`${editing ? "Edit lead" : "New lead"}`, `
    ${field("Name", `<input id="l_name" value="${esc(lead?.name || "")}"/>`)}
    <div class="row2">
      ${field("Tier", select("l_tier", TIERS.map((t) => [t[0], t[1]]), lead?.tier))}
      ${field("Platform", select("l_platform", PLATFORMS.map((p) => [p, p]), lead?.platform))}
    </div>
    ${field("Contact link", `<input id="l_link" value="${esc(lead?.contact_link || "")}" placeholder="profile URL / handle"/>`)}
    <div class="row2">
      ${field("Status", select("l_status", LEAD_STATUS, lead?.status || "new"))}
      ${field("Last contact", `<input id="l_last" type="date" value="${esc(lead?.last_contact || "")}"/>`)}
    </div>
    ${isStaff() ? field("Owner (setter)", select("l_owner", state.profiles.map((p) => [p.id, p.full_name || "—"]), lead?.owner_id || state.user.id)) : ""}
    ${field("Next action", `<input id="l_next" value="${esc(lead?.next_action || "")}"/>`)}
    ${field("Notes", `<textarea id="l_notes" rows="3">${esc(lead?.notes || "")}</textarea>`)}
    <label class="check"><input type="checkbox" id="l_afford" ${lead?.affordability_ok ? "checked" : ""}/> Affordability confirmed (ICP gate)</label>
  `, [
    editing ? { label: "Delete", cls: "ghost", act: async () => { await supabase.from("leads").delete().eq("id", lead.id); closeModal(); renderLeads(); } } : null,
    { label: editing ? "Save" : "Create", cls: "", act: async () => {
      const payload = {
        name: val("l_name"), tier: val("l_tier"), platform: val("l_platform"), contact_link: val("l_link"),
        status: val("l_status"), last_contact: val("l_last") || null, next_action: val("l_next"),
        notes: val("l_notes"), affordability_ok: document.getElementById("l_afford").checked,
      };
      if (isStaff()) payload.owner_id = val("l_owner");
      if (!payload.name) return msgModal("Name is required.");
      const q = editing ? supabase.from("leads").update(payload).eq("id", lead.id) : supabase.from("leads").insert({ ...payload, owner_id: payload.owner_id || state.user.id });
      const { error } = await q; if (error) return msgModal(error.message);
      closeModal(); renderLeads();
    } },
  ].filter(Boolean));
}

async function convertLead(lead) {
  if (!confirm(`Convert "${lead.name}" into a closer deal? This hands it to Ayden and marks the lead done.`)) return;
  const { error: dErr } = await supabase.from("deals").insert({
    contact_name: lead.name, tier: lead.tier, amount: tierAmount(lead.tier),
    stage: "call_booked", sourcing_setter: lead.owner_id, lead_id: lead.id,
  });
  if (dErr) return alert("Could not create deal: " + dErr.message);
  await supabase.from("leads").update({ converted: true }).eq("id", lead.id);
  state.view = "deals"; renderShell();
}

// ============================================================
// DEALS (closer pipeline)
// ============================================================
async function renderDeals() {
  const main = document.getElementById("main");
  main.innerHTML = head("Closer pipeline", "Deals", `
    <div class="toggle"><button data-dv="kanban" class="${state.dealView === "kanban" ? "on" : ""}">Board</button><button data-dv="table" class="${state.dealView === "table" ? "on" : ""}">Table</button></div>
    <button class="btn sm" id="newDeal">+ New deal</button>`);
  main.querySelectorAll("[data-dv]").forEach((b) => (b.onclick = () => { state.dealView = b.dataset.dv; renderDeals(); }));
  document.getElementById("newDeal").onclick = () => dealModal();

  const { data, error } = await supabase.from("deals").select("*").order("updated_at", { ascending: false });
  if (error) return main.insertAdjacentHTML("beforeend", `<div class="err">${esc(error.message)}</div>`);
  const rows = data || [];
  if (!rows.length) return main.insertAdjacentHTML("beforeend", `<div class="empty">No deals yet. They appear here when a setter converts a lead, or add one manually.</div>`);

  if (state.dealView === "table") {
    main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Contact</th><th>Tier</th><th>Amount</th><th>Stage</th><th>Closer</th><th>Sourced by</th></tr></thead>
      <tbody>${rows.map((d) => `<tr data-edit="${d.id}">
        <td class="name">${esc(d.contact_name)}</td><td>${tierTag(d.tier)}</td><td>${money(d.amount)}</td>
        <td><span class="tag ${d.stage === WON ? "won" : LOST.includes(d.stage) ? "lost" : ""}">${lbl(DEAL_STAGE, d.stage)}</span></td>
        <td>${esc(ownerName(d.owner_id))}</td><td class="muted">${esc(ownerName(d.sourcing_setter))}</td></tr>`).join("")}
      </tbody></table></div>`);
    main.querySelectorAll("[data-edit]").forEach((tr) => (tr.onclick = () => dealModal(rows.find((r) => r.id === tr.dataset.edit))));
  } else {
    main.insertAdjacentHTML("beforeend", `<div class="kanban">${DEAL_STAGE.map(([k, label]) => {
      const items = rows.filter((r) => r.stage === k);
      const sum = items.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      return `<div class="col"><div class="col-head"><span class="t">${label}</span><span class="c">${items.length} · ${money(sum)}</span></div>
        <div class="col-body">${items.map((d) => dealCard(d)).join("") || `<div class="muted" style="padding:6px">—</div>`}</div></div>`;
    }).join("")}</div>`);
    wireDealCards(rows);
  }
}
function dealCard(d) {
  return `<div class="card" data-edit="${d.id}">
    <div class="ct">${esc(d.contact_name)}</div>
    <div class="cm">${tierTag(d.tier)} ${money(d.amount)}</div>
    <div class="cf"><select data-move="${d.id}">${DEAL_STAGE.map(([k, t]) => `<option value="${k}" ${k === d.stage ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>`;
}
function wireDealCards(rows) {
  const main = document.getElementById("main");
  main.querySelectorAll("[data-edit]").forEach((c) => (c.onclick = (e) => { if (e.target.closest("select,button")) return; dealModal(rows.find((r) => r.id === c.dataset.edit)); }));
  main.querySelectorAll("[data-move]").forEach((s) => (s.onchange = async () => {
    await supabase.from("deals").update({ stage: s.value }).eq("id", s.dataset.move); renderDeals();
  }));
}

function dealModal(deal = null) {
  const editing = !!deal;
  openModal(`${editing ? "Edit deal" : "New deal"}`, `
    ${field("Contact name", `<input id="d_name" value="${esc(deal?.contact_name || "")}"/>`)}
    <div class="row2">
      ${field("Tier", select("d_tier", TIERS.map((t) => [t[0], t[1]]), deal?.tier))}
      ${field("Amount (£)", `<input id="d_amount" type="number" value="${esc(deal?.amount ?? "")}"/>`)}
    </div>
    ${field("Stage", select("d_stage", DEAL_STAGE, deal?.stage || "call_booked"))}
    <div class="row2">
      ${field("Closer", select("d_owner", state.profiles.map((p) => [p.id, p.full_name || "—"]), deal?.owner_id || state.user.id))}
      ${field("Sourced by (setter)", select("d_setter", [["", "—"]].concat(state.profiles.map((p) => [p.id, p.full_name || "—"])), deal?.sourcing_setter || ""))}
    </div>
    ${field("Notes", `<textarea id="d_notes" rows="3">${esc(deal?.notes || "")}</textarea>`)}
    <label class="check"><input type="checkbox" id="d_stripe" ${deal?.stripe_sent ? "checked" : ""}/> Stripe link sent (within 5 min)</label>
    <label class="check"><input type="checkbox" id="d_ayden" ${deal?.ayden_notified ? "checked" : ""}/> Ayden notified of close</label>
  `, [
    editing ? { label: "Delete", cls: "ghost", act: async () => { await supabase.from("deals").delete().eq("id", deal.id); closeModal(); renderDeals(); } } : null,
    { label: editing ? "Save" : "Create", cls: "", act: async () => {
      const payload = {
        contact_name: val("d_name"), tier: val("d_tier"), amount: val("d_amount") ? Number(val("d_amount")) : null,
        stage: val("d_stage"), owner_id: val("d_owner"), sourcing_setter: val("d_setter") || null,
        notes: val("d_notes"), stripe_sent: document.getElementById("d_stripe").checked, ayden_notified: document.getElementById("d_ayden").checked,
      };
      if (!payload.contact_name) return msgModal("Contact name is required.");
      const q = editing ? supabase.from("deals").update(payload).eq("id", deal.id) : supabase.from("deals").insert(payload);
      const { error } = await q; if (error) return msgModal(error.message);
      closeModal(); renderDeals();
    } },
  ].filter(Boolean));
}

// ============================================================
// TEAM (admin / coach)
// ============================================================
async function renderTeam() {
  const main = document.getElementById("main");
  main.innerHTML = head("Team", "People");
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const admin = state.profile?.role === "admin";
  main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th>Role</th><th>Team</th></tr></thead>
    <tbody>${(data || []).map((p) => `<tr>
      <td class="name">${esc(p.full_name || "—")}</td>
      <td>${admin ? `<select data-role="${p.id}">${["setter", "closer", "coach", "admin"].map((r) => `<option value="${r}" ${r === p.role ? "selected" : ""}>${r}</option>`).join("")}</select>` : `<span class="tag">${esc(p.role)}</span>`}</td>
      <td class="muted">${esc(p.team || "—")}</td></tr>`).join("")}
    </tbody></table></div>
    ${admin ? `<p class="muted" style="margin-top:12px">Change a role from the dropdown — it saves immediately.</p>` : `<p class="muted" style="margin-top:12px">Only Ayden (admin) can change roles.</p>`}`);
  if (admin) main.querySelectorAll("[data-role]").forEach((s) => (s.onchange = async () => {
    const { error } = await supabase.from("profiles").update({ role: s.value }).eq("id", s.dataset.role);
    if (error) alert(error.message);
  }));
}

// ============================================================
// shared UI helpers
// ============================================================
function head(title, crumb, actions = "") {
  return `<div class="page-head"><div><div class="crumb">${crumb}</div><h2>${title}</h2></div><div class="head-actions">${actions}</div></div>`;
}
const select = (id, opts, sel) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
const tierTag = (t) => (t ? `<span class="tag ${t === "tier_1" ? "t1" : t === "tier_2" ? "t2" : "t3"}">${tierLabel(t)}</span>` : `<span class="tag lost">—</span>`);
const ownerName = (id) => state.profiles.find((p) => p.id === id)?.full_name || "—";

function openModal(title, body, actions) {
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `<div class="modal"><h3>${title}</h3><div id="modalMsg"></div>${body}
    <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls}" data-a="${i}">${a.label}</button>`).join("")}</div></div>`;
  wrap.onclick = (e) => { if (e.target === wrap) closeModal(); };
  document.body.appendChild(wrap);
  actions.forEach((a, i) => (wrap.querySelector(`[data-a="${i}"]`).onclick = a.act));
  window._modal = wrap;
}
const closeModal = () => { window._modal?.remove(); window._modal = null; };
const msgModal = (t) => (document.getElementById("modalMsg").innerHTML = `<div class="err">${esc(t)}</div>`);
