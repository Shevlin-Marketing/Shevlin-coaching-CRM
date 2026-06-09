import { supabase } from "./supabaseClient.js";

// ---------- constants ----------
const LEAD_STATUS = [
  ["new", "New / Identified"],
  ["contacted", "Contacted"],
  ["responding", "Responding"],
  ["details_shared", "Details Shared"],
  ["form_submitted", "Form Submitted"],
  ["not_interested", "Not Interested"],
  ["dormant", "Dormant"],
];
const LEAD_ACTIVE = ["new", "contacted", "responding", "details_shared"];
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
const COMMISSION = { tier_1: 500, tier_2: 1000, tier_3: 1500 };
const PLATFORMS = ["LinkedIn", "Instagram", "Facebook", "Email", "Referral", "Application Form"];
const WON = "closed_won";
const LOST = ["not_interested", "cancelled_14day", "dormant", "no_show_dormant"];
const RANGES = [["7d", "This week"], ["30d", "30 days"], ["mtd", "This month"], ["all", "All time"]];
const STALE_DAYS = 7;

const lbl = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];
const tierLabel = (k) => (TIERS.find((t) => t[0] === k) || [k, "—"])[1];
const tierAmount = (k) => (TIERS.find((t) => t[0] === k) || [0, 0, 0])[2];
const money = (n) => (n == null ? "—" : "£" + Number(n).toLocaleString());
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const initials = (n) => (n || "?").trim().split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const MARK = `<img class="mark" src="logo.png" alt="Shevlin Coaching" />`;

// ---------- state ----------
const state = { user: null, profile: null, profiles: [], projects: [], currentProject: "all", view: "dashboard", leadView: "kanban", dealView: "kanban", range: "30d", activitiesOk: true };
const app = document.getElementById("app");
const isStaff = () => ["coach", "admin"].includes(state.profile?.role);

// ---------- date helpers ----------
function rangeStart(r = state.range) {
  const now = new Date();
  if (r === "all") return null;
  if (r === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = r === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 864e5);
}
function inRange(dateStr, r = state.range) {
  const start = rangeStart(r);
  if (!start || !dateStr) return !start ? true : false;
  return new Date(dateStr) >= start;
}
function periodCounts(rows, field) {
  const start = rangeStart();
  if (!start) return { cur: rows.length, prev: null };
  const len = Date.now() - start.getTime();
  const prevStart = new Date(start.getTime() - len);
  let cur = 0, prev = 0;
  rows.forEach((row) => {
    const d = row[field] ? new Date(row[field]) : null;
    if (!d) return;
    if (d >= start) cur++;
    else if (d >= prevStart) prev++;
  });
  return { cur, prev };
}
function deltaHTML(cur, prev, suffix = "") {
  if (prev == null) return "";
  const diff = cur - prev;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  return `<div class="delta ${cls}">${arrow} ${diff >= 0 ? "+" : ""}${diff}${suffix}</div>`;
}
function weeklyBuckets(rows, field, weeks = 6) {
  const now = Date.now(), out = new Array(weeks).fill(0);
  rows.forEach((row) => {
    if (!row[field]) return;
    const ageW = Math.floor((now - new Date(row[field]).getTime()) / (7 * 864e5));
    if (ageW >= 0 && ageW < weeks) out[weeks - 1 - ageW]++;
  });
  return out;
}
function spark(points, color = "var(--blue)") {
  const w = 62, h = 24, max = Math.max(...points), min = Math.min(...points), r = max - min || 1;
  if (!points.some((p) => p)) return "";
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / r) * (h - 4) - 2}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" fill="none"><polyline points="${d}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

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
  const { data: projects } = await supabase.from("projects").select("*").eq("status", "active").order("name");
  state.projects = projects || [];
  if (state.currentProject !== "all" && !state.projects.some((p) => p.id === state.currentProject)) state.currentProject = "all";
  renderShell();
}
// scope a query to the selected project
const pf = (q) => (state.currentProject === "all" ? q : q.eq("project_id", state.currentProject));
const projectName = (id) => state.projects.find((p) => p.id === id)?.full_name || state.projects.find((p) => p.id === id)?.name || "—";
const postableProjects = () => state.projects.filter((p) => p.status === "active");

// ============================================================
// AUTH
// ============================================================
function renderAuth(mode = "signin") {
  app.innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="brand">${MARK}<span class="name">SHEVLIN<span>·</span>CRM</span></div>
    <h1>${mode === "signin" ? "Sign in" : "Create account"}</h1>
    <p class="sub">${mode === "signin" ? "Welcome back. Log in to your pipeline." : "Set up your login — Ayden sets your role after."}</p>
    <div id="msg"></div>
    ${mode === "signup" ? field("Full name", `<input id="f_name" name="name" type="text" autocomplete="name" autocapitalize="words" enterkeyhint="next" placeholder="Jordan Smith"/>`) : ""}
    ${field("Email", `<input id="f_email" name="email" type="email" inputmode="email" autocomplete="${mode === "signin" ? "username" : "email"}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="you@shevlincoaching.co.uk"/>`)}
    ${field("Password", `<input id="f_pass" name="password" type="password" autocomplete="${mode === "signin" ? "current-password" : "new-password"}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="••••••••"/>`)}
    <button class="btn" id="go">${mode === "signin" ? "Sign in" : "Create account"}</button>
    <div class="switch-line">${mode === "signin" ? `New here? <b id="sw">Create an account</b>` : `Already have one? <b id="sw">Sign in</b>`}</div>
    <div class="muted" style="text-align:center;margin-top:16px;font-size:11px;letter-spacing:.05em">build 8</div>
  </div></div>`;
  document.getElementById("sw").onclick = () => renderAuth(mode === "signin" ? "signup" : "signin");
  document.getElementById("go").onclick = () => (mode === "signin" ? doSignin() : doSignup());
  app.querySelectorAll("input").forEach((i) => (i.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("go").click(); } }));
}
const field = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
const msg = (t, cls = "err") => (document.getElementById("msg").innerHTML = `<div class="${cls}">${esc(t)}</div>`);
async function doSignin() {
  const { error } = await supabase.auth.signInWithPassword({ email: val("f_email"), password: val("f_pass") });
  if (error) msg(error.message);
}
async function doSignup() {
  const { error } = await supabase.auth.signUp({ email: val("f_email"), password: val("f_pass"), options: { data: { full_name: val("f_name") } } });
  if (error) return msg(error.message);
  msg("Account created. If email confirmation is on, check your inbox, then sign in.", "ok");
}
const val = (id) => document.getElementById(id)?.value.trim() || "";

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  const main = [
    ["dashboard", "Dashboard", icon("dash")],
    ["myday", "My Day", icon("sun")],
    ["leads", "Leads — Setter", icon("user")],
    ["deals", "Deals — Closer", icon("deal")],
  ];
  const manage = [];
  if (isStaff()) manage.push(["team", "Team", icon("team")], ["reports", "Reports", icon("chart")]);
  if (state.profile?.role === "admin") manage.push(["projects", "Projects", icon("proj")]);

  const switcher = state.projects.length ? `<div class="navlbl">Project</div>
    <select class="minisel projsel" id="projSwitch">
      <option value="all">${state.profile?.role === "admin" ? "All projects" : "All my projects"}</option>
      ${state.projects.map((p) => `<option value="${p.id}" ${p.id === state.currentProject ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>` : "";

  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand">${MARK}<span class="name">SHEVLIN<span>·</span>CRM</span></div>
      ${switcher}
      <div class="navlbl">Workspace</div>
      ${main.map(navItem).join("")}
      ${manage.length ? `<div class="navlbl">Manage</div>${manage.map(navItem).join("")}` : ""}
      <div class="spacer"></div>
      <div class="nav-item" id="logout">${icon("out")}Log out</div>
      <div class="whoami"><div class="avatar">${initials(state.profile?.full_name || state.user.email)}</div>
        <div><b>${esc(state.profile?.full_name || state.user.email)}</b><div class="role-pill">${esc(state.profile?.role || "—")}</div></div></div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;
  app.querySelectorAll("[data-nav]").forEach((el) => (el.onclick = () => { state.view = el.dataset.nav; renderShell(); }));
  document.getElementById("logout").onclick = () => supabase.auth.signOut();
  const ps = document.getElementById("projSwitch");
  if (ps) ps.onchange = () => { state.currentProject = ps.value; renderView(); };
  renderView();
}
const navItem = ([k, t, ic]) => `<div class="nav-item ${state.view === k ? "active" : ""}" data-nav="${k}">${ic}${t}</div>`;
function renderView() {
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "myday") return renderMyDay();
  if (state.view === "leads") return renderLeads();
  if (state.view === "deals") return renderDeals();
  if (state.view === "team") return renderTeam();
  if (state.view === "reports") return renderReports();
  if (state.view === "projects") return renderProjects();
}
function rangeSelect() {
  return `<select class="minisel" id="rangeSel">${RANGES.map(([v, t]) => `<option value="${v}" ${v === state.range ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const main = document.getElementById("main");
  main.innerHTML = head("Overview", "Dashboard", rangeSelect());
  document.getElementById("rangeSel").onchange = (e) => { state.range = e.target.value; renderDashboard(); };
  main.insertAdjacentHTML("beforeend", `<div class="empty">Loading…</div>`);

  const [{ data: leads }, { data: deals }] = await Promise.all([
    pf(supabase.from("leads").select("status,owner_id,created_at,updated_at,last_contact,name,tier")),
    pf(supabase.from("deals").select("stage,tier,amount,owner_id,created_at,updated_at,closed_at,contact_name")),
  ]);
  const L = leads || [], D = deals || [];

  const formRows = L.filter((l) => l.status === "form_submitted");
  const forms = periodCounts(formRows, "updated_at");
  const wonRows = D.filter((d) => d.stage === WON);
  const wonClosedField = (d) => d.closed_at || d.updated_at;
  const closes = periodCounts(wonRows.map((d) => ({ t: wonClosedField(d) })), "t");
  const revInRange = wonRows.filter((d) => inRange(wonClosedField(d))).reduce((s, d) => s + (+d.amount || 0), 0);
  const decided = D.filter((d) => (d.stage === WON || LOST.includes(d.stage)) && inRange(d.updated_at)).length;
  const wonInRange = wonRows.filter((d) => inRange(wonClosedField(d))).length;
  const cr = decided ? Math.round((wonInRange / decided) * 100) : 0;

  const activeLeads = L.filter((l) => LEAD_ACTIVE.includes(l.status)).length;
  const inPlay = D.filter((d) => ["call_booked", "no_show_followup", "pending"].includes(d.stage)).length;

  const m = (k, v, cls, spk, dlt) => `<div class="metric ${cls || ""} fade"><div class="k">${k}</div><div class="v">${v}</div>${dlt || ""}${spk || ""}</div>`;
  const metricsHTML = `<div class="metrics">
    ${m("Active leads", activeLeads, "", spark(weeklyBuckets(L, "created_at"), "var(--blue)"))}
    ${m("Forms submitted", forms.cur, "accent", spark(weeklyBuckets(formRows, "updated_at"), "var(--red)"), deltaHTML(forms.cur, forms.prev))}
    ${m("Deals in play", inPlay, "")}
    ${m("Closed won", closes.cur, "good", spark(weeklyBuckets(wonRows, "created_at"), "var(--green)"), deltaHTML(closes.cur, closes.prev))}
    ${m("Close rate", cr + "<small>%</small>", cr >= 40 ? "good" : cr < 30 && decided ? "accent" : "", "", "")}
    ${m("Revenue won", money(revInRange), "", spark(weeklyBuckets(wonRows, "created_at"), "var(--ember)"))}
  </div>`;

  // reminders
  const now = Date.now();
  const stale = L.filter((l) => LEAD_ACTIVE.includes(l.status)).filter((l) => {
    const ref = l.last_contact || l.created_at;
    return ref && (now - new Date(ref).getTime()) / 864e5 >= STALE_DAYS;
  }).slice(0, 6);
  const chase = D.filter((d) => d.stage === "no_show_followup").slice(0, 6);
  const remHTML = `<div class="panel fade" style="animation-delay:.1s"><h3>Needs attention <span class="count">${stale.length + chase.length} items</span></h3>
    ${stale.map((l) => `<div class="remind"><span class="dot stale"></span><span class="nm">${esc(l.name)}</span> <span class="muted">${lbl(LEAD_STATUS, l.status)}</span><span class="meta">no contact ${Math.round((now - new Date(l.last_contact || l.created_at).getTime()) / 864e5)}d</span></div>`).join("")}
    ${chase.map((d) => `<div class="remind"><span class="dot chase"></span><span class="nm">${esc(d.contact_name)}</span> <span class="muted">no-show — chase</span><span class="meta">follow up</span></div>`).join("")}
    ${!stale.length && !chase.length ? `<div class="muted" style="padding:6px">All clear — nothing overdue.</div>` : ""}</div>`;

  const charts = `<div class="section-grid">
    <div class="panel fade" style="animation-delay:.16s"><h3>Setter pipeline</h3>${barChart(LEAD_STATUS, L, "status")}</div>
    <div class="panel fade" style="animation-delay:.22s"><h3>Closer pipeline</h3>${barChart(DEAL_STAGE, D, "stage")}</div>
  </div>
  <div class="panel fade" style="animation-delay:.28s"><h3>Closed won by tier <span class="count">${state.range === "all" ? "all time" : RANGES.find((r) => r[0] === state.range)[1]}</span></h3>${barChart(TIERS.map((t) => [t[0], t[1]]), wonRows.filter((d) => inRange(wonClosedField(d))), "tier")}</div>`;

  main.innerHTML = head("Overview", "Dashboard", rangeSelect());
  document.getElementById("rangeSel").onchange = (e) => { state.range = e.target.value; renderDashboard(); };
  main.insertAdjacentHTML("beforeend", metricsHTML + remHTML + charts);
  if (cr < 30 && decided) main.insertAdjacentHTML("beforeend", `<div class="err">Close rate is under 30% for this period — per your SOP this triggers a call review.</div>`);
}
function barChart(defs, rows, key) {
  const counts = {}; defs.forEach((d) => (counts[d[0]] = 0));
  rows.forEach((r) => { if (counts[r[key]] != null) counts[r[key]]++; });
  const max = Math.max(1, ...Object.values(counts));
  return defs.map(([k, label]) => `<div class="bar-row"><div class="lbl">${label}</div><div class="bar-track"><div class="bar-fill" style="--w:${(counts[k] / max) * 100}%"></div></div><div class="num">${counts[k]}</div></div>`).join("");
}

// ============================================================
// LEADS
// ============================================================
async function renderLeads() {
  const main = document.getElementById("main");
  main.innerHTML = head("Setter pipeline", "Leads", `
    ${searchBox("leadSearch")}
    <select class="minisel" id="leadTier"><option value="">All tiers</option>${TIERS.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join("")}</select>
    <div class="toggle"><button data-lv="kanban" class="${state.leadView === "kanban" ? "on" : ""}">Board</button><button data-lv="table" class="${state.leadView === "table" ? "on" : ""}">Table</button></div>
    <button class="btn sm ghost" id="logAct">Log activity</button>
    <button class="btn sm ghost" id="importCsv">Import CSV</button>
    <button class="btn sm" id="newLead">+ New lead</button>`);
  main.querySelectorAll("[data-lv]").forEach((b) => (b.onclick = () => { state.leadView = b.dataset.lv; renderLeads(); }));
  document.getElementById("newLead").onclick = () => leadModal();
  document.getElementById("logAct").onclick = () => activityModal();
  document.getElementById("importCsv").onclick = () => importModal();

  const { data, error } = await pf(supabase.from("leads").select("*").order("updated_at", { ascending: false }));
  if (error) return main.insertAdjacentHTML("beforeend", `<div class="err">${esc(error.message)}</div>`);
  const rows = data || [];
  if (!rows.length) { main.insertAdjacentHTML("beforeend", `<div class="empty">No leads yet. Add your first one.</div>`); wireBoardFilter("lead"); return; }

  if (state.leadView === "table") {
    main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Tier</th><th>Platform</th><th>Status</th><th>Owner</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((l) => `<tr data-edit="${l.id}" data-name="${esc((l.name || "").toLowerCase())}" data-tier="${l.tier || ""}">
        <td class="name">${esc(l.name)}</td><td>${tierTag(l.tier)}</td><td>${esc(l.platform || "—")}</td>
        <td><span class="tag ${l.status === "form_submitted" ? "hot" : LOST.includes(l.status) ? "lost" : ""}">${lbl(LEAD_STATUS, l.status)}</span></td>
        <td>${esc(ownerName(l.owner_id))}</td><td class="muted">${esc(l.next_action || "—")}</td></tr>`).join("")}
      </tbody></table></div>`);
    main.querySelectorAll("[data-edit]").forEach((tr) => (tr.onclick = () => leadModal(rows.find((r) => r.id === tr.dataset.edit))));
  } else {
    main.insertAdjacentHTML("beforeend", `<div class="kanban">${LEAD_STATUS.map(([k, label]) => {
      const items = rows.filter((r) => r.status === k);
      return `<div class="col" data-col data-key="${k}"><div class="col-head"><span class="t">${label}</span><span class="c">${items.length}</span></div>
        <div class="col-body">${items.map(leadCard).join("") || `<div class="muted" style="padding:6px">—</div>`}</div></div>`;
    }).join("")}</div>`);
    wireLeadCards(rows);
  }
  wireBoardFilter("lead");
}
function leadCard(l) {
  return `<div class="card" draggable="true" data-edit="${l.id}" data-id="${l.id}" data-name="${esc((l.name || "").toLowerCase())}" data-tier="${l.tier || ""}">
    <div class="ct">${esc(l.name)}</div>
    <div class="cm">${tierTag(l.tier)} ${esc(l.platform || "")}</div>
    <div class="cf"><select data-move="${l.id}">${LEAD_STATUS.map(([k, t]) => `<option value="${k}" ${k === l.status ? "selected" : ""}>${t}</option>`).join("")}</select>
      ${l.status === "form_submitted" && !l.converted ? `<button class="btn mini" data-convert="${l.id}">Convert →</button>` : ""}</div></div>`;
}
async function moveLeadStatus(id, status) { await supabase.from("leads").update({ status }).eq("id", id); renderLeads(); }
function wireLeadCards(rows) {
  const main = document.getElementById("main");
  main.querySelectorAll("[data-edit]").forEach((c) => (c.onclick = (e) => { if (e.target.closest("select,button")) return; leadModal(rows.find((r) => r.id === c.dataset.edit)); }));
  main.querySelectorAll("[data-move]").forEach((s) => (s.onchange = () => moveLeadStatus(s.dataset.move, s.value)));
  main.querySelectorAll("[data-convert]").forEach((b) => (b.onclick = () => convertLead(rows.find((r) => r.id === b.dataset.convert))));
  enableDragDrop(main, (id, key) => moveLeadStatus(id, key));
}

function leadModal(lead = null) {
  const editing = !!lead;
  const defProj = lead?.project_id || (state.currentProject !== "all" ? state.currentProject : postableProjects()[0]?.id) || "";
  openModal(`${editing ? "Edit lead" : "New lead"}`, `
    ${field("Name", `<input id="l_name" value="${esc(lead?.name || "")}"/>`)}
    ${field("Project", select("l_project", postableProjects().map((p) => [p.id, p.name]), defProj))}
    <div class="row2">${field("Tier", select("l_tier", TIERS.map((t) => [t[0], t[1]]), lead?.tier))}${field("Platform", select("l_platform", PLATFORMS.map((p) => [p, p]), lead?.platform))}</div>
    ${field("Contact link", `<input id="l_link" value="${esc(lead?.contact_link || "")}" placeholder="profile URL / handle"/>`)}
    <div class="row2">${field("Status", select("l_status", LEAD_STATUS, lead?.status || "new"))}${field("Last contact", `<input id="l_last" type="date" value="${esc(lead?.last_contact || "")}"/>`)}</div>
    ${isStaff() ? field("Owner (setter)", select("l_owner", state.profiles.map((p) => [p.id, p.full_name || "—"]), lead?.owner_id || state.user.id)) : ""}
    ${field("Next action", `<input id="l_next" value="${esc(lead?.next_action || "")}"/>`)}
    ${field("Notes", `<textarea id="l_notes" rows="3">${esc(lead?.notes || "")}</textarea>`)}
    <label class="check"><input type="checkbox" id="l_afford" ${lead?.affordability_ok ? "checked" : ""}/> Affordability confirmed (ICP gate)</label>
    ${editing ? timelinePlaceholder() : ""}
  `, [
    editing ? { label: "Delete", cls: "ghost", act: async () => { await supabase.from("leads").delete().eq("id", lead.id); closeModal(); renderLeads(); } } : null,
    { label: editing ? "Save" : "Create", cls: "", act: async () => {
      const payload = { name: val("l_name"), project_id: val("l_project"), tier: val("l_tier"), platform: val("l_platform"), contact_link: val("l_link"), status: val("l_status"), last_contact: val("l_last") || null, next_action: val("l_next"), notes: val("l_notes"), affordability_ok: document.getElementById("l_afford").checked };
      if (isStaff()) payload.owner_id = val("l_owner");
      if (!payload.name) return msgModal("Name is required.");
      if (!payload.project_id) return msgModal("Pick a project — every lead belongs to one.");
      const q = editing ? supabase.from("leads").update(payload).eq("id", lead.id) : supabase.from("leads").insert({ ...payload, owner_id: payload.owner_id || state.user.id });
      const { error } = await q; if (error) return msgModal(error.message);
      closeModal(); renderLeads();
    } },
  ].filter(Boolean));
  if (editing) loadTimeline("lead", lead.id);
}

async function convertLead(lead) {
  if (!confirm(`Convert "${lead.name}" into a closer deal? This hands it to Ayden and marks the lead done.`)) return;
  const { error: dErr } = await supabase.from("deals").insert({ contact_name: lead.name, tier: lead.tier, amount: tierAmount(lead.tier), stage: "call_booked", sourcing_setter: lead.owner_id, lead_id: lead.id, project_id: lead.project_id });
  if (dErr) return alert("Could not create deal: " + dErr.message);
  await supabase.from("leads").update({ converted: true }).eq("id", lead.id);
  state.view = "deals"; renderShell();
}

// activity logging (leading indicators)
function activityModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal("Log activity", `
    <p class="muted" style="margin:-6px 0 14px">Record your outreach so the team can track leading indicators, not just pipeline stage.</p>
    <div class="row2">${field("Date", `<input id="a_date" type="date" value="${today}"/>`)}${field("Outreach sent", `<input id="a_out" type="number" inputmode="numeric" value="0"/>`)}</div>
    <div class="row2">${field("Replies", `<input id="a_rep" type="number" inputmode="numeric" value="0"/>`)}<div></div></div>
    ${field("Notes", `<textarea id="a_notes" rows="2" placeholder="optional"></textarea>`)}
  `, [{ label: "Save", cls: "", act: async () => {
    const payload = { activity_date: val("a_date"), outreach: +val("a_out") || 0, replies: +val("a_rep") || 0, notes: val("a_notes") };
    const { error } = await supabase.from("activities").insert(payload);
    if (error) return msgModal(error.message.includes("activities") ? "Activity logging needs the v2 migration run in Supabase (see UPGRADES.md)." : error.message);
    closeModal();
  } }]);
}

// ============================================================
// DEALS
// ============================================================
async function renderDeals() {
  const main = document.getElementById("main");
  main.innerHTML = head("Closer pipeline", "Deals", `
    ${searchBox("dealSearch")}
    <select class="minisel" id="dealTier"><option value="">All tiers</option>${TIERS.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join("")}</select>
    <div class="toggle"><button data-dv="kanban" class="${state.dealView === "kanban" ? "on" : ""}">Board</button><button data-dv="table" class="${state.dealView === "table" ? "on" : ""}">Table</button></div>
    <button class="btn sm" id="newDeal">+ New deal</button>`);
  main.querySelectorAll("[data-dv]").forEach((b) => (b.onclick = () => { state.dealView = b.dataset.dv; renderDeals(); }));
  document.getElementById("newDeal").onclick = () => dealModal();

  const { data, error } = await pf(supabase.from("deals").select("*").order("updated_at", { ascending: false }));
  if (error) return main.insertAdjacentHTML("beforeend", `<div class="err">${esc(error.message)}</div>`);
  const rows = data || [];
  if (!rows.length) { main.insertAdjacentHTML("beforeend", `<div class="empty">No deals yet — they appear when a setter converts a lead, or add one manually.</div>`); wireBoardFilter("deal"); return; }

  if (state.dealView === "table") {
    main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Contact</th><th>Tier</th><th>Amount</th><th>Stage</th><th>Closer</th><th>Sourced by</th></tr></thead>
      <tbody>${rows.map((d) => `<tr data-edit="${d.id}" data-name="${esc((d.contact_name || "").toLowerCase())}" data-tier="${d.tier || ""}">
        <td class="name">${esc(d.contact_name)}</td><td>${tierTag(d.tier)}</td><td>${money(d.amount)}</td>
        <td><span class="tag ${d.stage === WON ? "won" : LOST.includes(d.stage) ? "lost" : ""}">${lbl(DEAL_STAGE, d.stage)}</span></td>
        <td>${esc(ownerName(d.owner_id))}</td><td class="muted">${esc(ownerName(d.sourcing_setter))}</td></tr>`).join("")}
      </tbody></table></div>`);
    main.querySelectorAll("[data-edit]").forEach((tr) => (tr.onclick = () => dealModal(rows.find((r) => r.id === tr.dataset.edit))));
  } else {
    main.insertAdjacentHTML("beforeend", `<div class="kanban">${DEAL_STAGE.map(([k, label]) => {
      const items = rows.filter((r) => r.stage === k);
      const sum = items.reduce((s, d) => s + (+d.amount || 0), 0);
      return `<div class="col" data-col data-key="${k}"><div class="col-head"><span class="t">${label}</span><span class="c">${items.length} · ${money(sum)}</span></div>
        <div class="col-body">${items.map(dealCard).join("") || `<div class="muted" style="padding:6px">—</div>`}</div></div>`;
    }).join("")}</div>`);
    wireDealCards(rows);
  }
  wireBoardFilter("deal");
}
function dealCard(d) {
  return `<div class="card" draggable="true" data-edit="${d.id}" data-id="${d.id}" data-name="${esc((d.contact_name || "").toLowerCase())}" data-tier="${d.tier || ""}">
    <div class="ct">${esc(d.contact_name)}</div><div class="cm">${tierTag(d.tier)} ${money(d.amount)}</div>
    <div class="cf"><select data-move="${d.id}">${DEAL_STAGE.map(([k, t]) => `<option value="${k}" ${k === d.stage ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>`;
}
async function moveDealStage(id, stage, rows) {
  const prev = rows.find((r) => r.id === id);
  if (stage === WON && prev?.stage !== WON) { await markClosed({ ...prev, stage: WON }); }
  else { await supabase.from("deals").update({ stage }).eq("id", id); renderDeals(); }
}
function wireDealCards(rows) {
  const main = document.getElementById("main");
  main.querySelectorAll("[data-edit]").forEach((c) => (c.onclick = (e) => { if (e.target.closest("select,button")) return; dealModal(rows.find((r) => r.id === c.dataset.edit)); }));
  main.querySelectorAll("[data-move]").forEach((s) => (s.onchange = () => moveDealStage(s.dataset.move, s.value, rows)));
  enableDragDrop(main, (id, key) => moveDealStage(id, key, rows));
}

async function markClosed(deal) {
  // set closed_at, then enforce the SOP via a quick modal + optional webhook
  await supabase.from("deals").update({ stage: WON, closed_at: new Date().toISOString() }).eq("id", deal.id);
  notifyClose(deal);
  openModal("Closed won — finish the SOP", `
    <p class="muted" style="margin:-6px 0 16px">${esc(deal.contact_name)} · ${tierLabel(deal.tier)} · ${money(deal.amount)}. Confirm the close steps:</p>
    <label class="check"><input type="checkbox" id="c_stripe" ${deal.stripe_sent ? "checked" : ""}/> Stripe link sent (within 5 min)</label>
    <label class="check"><input type="checkbox" id="c_ayden" checked/> Ayden notified of close</label>
  `, [{ label: "Done", cls: "", act: async () => {
    await supabase.from("deals").update({ stripe_sent: document.getElementById("c_stripe").checked, ayden_notified: document.getElementById("c_ayden").checked }).eq("id", deal.id);
    closeModal(); renderDeals();
  } }]);
}
function notifyClose(deal) {
  const hook = (window.CRM_CONFIG || {}).CLOSE_WEBHOOK;
  if (!hook) return;
  fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "closed_won", contact: deal.contact_name, tier: tierLabel(deal.tier), amount: deal.amount, closer: ownerName(deal.owner_id), setter: ownerName(deal.sourcing_setter), at: new Date().toISOString() }) }).catch(() => {});
}

function dealModal(deal = null) {
  const editing = !!deal;
  const defProj = deal?.project_id || (state.currentProject !== "all" ? state.currentProject : postableProjects()[0]?.id) || "";
  openModal(`${editing ? "Edit deal" : "New deal"}`, `
    ${field("Contact name", `<input id="d_name" value="${esc(deal?.contact_name || "")}"/>`)}
    ${field("Project", select("d_project", postableProjects().map((p) => [p.id, p.name]), defProj))}
    <div class="row2">${field("Tier", select("d_tier", TIERS.map((t) => [t[0], t[1]]), deal?.tier))}${field("Amount (£)", `<input id="d_amount" type="number" inputmode="numeric" value="${esc(deal?.amount ?? "")}"/>`)}</div>
    ${field("Stage", select("d_stage", DEAL_STAGE, deal?.stage || "call_booked"))}
    <div class="row2">${field("Closer", select("d_owner", state.profiles.map((p) => [p.id, p.full_name || "—"]), deal?.owner_id || state.user.id))}${field("Sourced by (setter)", select("d_setter", [["", "—"]].concat(state.profiles.map((p) => [p.id, p.full_name || "—"])), deal?.sourcing_setter || ""))}</div>
    ${field("Notes", `<textarea id="d_notes" rows="3">${esc(deal?.notes || "")}</textarea>`)}
    <label class="check"><input type="checkbox" id="d_stripe" ${deal?.stripe_sent ? "checked" : ""}/> Stripe link sent (within 5 min)</label>
    <label class="check"><input type="checkbox" id="d_ayden" ${deal?.ayden_notified ? "checked" : ""}/> Ayden notified of close</label>
    ${editing ? timelinePlaceholder() : ""}
  `, [
    editing ? { label: "Delete", cls: "ghost", act: async () => { await supabase.from("deals").delete().eq("id", deal.id); closeModal(); renderDeals(); } } : null,
    { label: editing ? "Save" : "Create", cls: "", act: async () => {
      const stage = val("d_stage");
      const payload = { contact_name: val("d_name"), project_id: val("d_project"), tier: val("d_tier"), amount: val("d_amount") ? +val("d_amount") : null, stage, owner_id: val("d_owner"), sourcing_setter: val("d_setter") || null, notes: val("d_notes"), stripe_sent: document.getElementById("d_stripe").checked, ayden_notified: document.getElementById("d_ayden").checked };
      if (!payload.contact_name) return msgModal("Contact name is required.");
      if (!payload.project_id) return msgModal("Pick a project — every deal belongs to one.");
      if (stage === WON && deal?.stage !== WON) payload.closed_at = new Date().toISOString();
      const q = editing ? supabase.from("deals").update(payload).eq("id", deal.id) : supabase.from("deals").insert(payload);
      const { error } = await q; if (error) return msgModal(error.message);
      if (stage === WON && deal?.stage !== WON) notifyClose({ ...deal, ...payload });
      closeModal(); renderDeals();
    } },
  ].filter(Boolean));
  if (editing) loadTimeline("deal", deal.id);
}

// ============================================================
// TEAM
// ============================================================
async function renderTeam() {
  const main = document.getElementById("main");
  main.innerHTML = head("Team", "People");
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const admin = state.profile?.role === "admin";
  main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th>Role</th><th>Team</th></tr></thead>
    <tbody>${(data || []).map((p) => `<tr><td class="name">${esc(p.full_name || "—")}</td>
      <td>${admin ? `<select class="minisel" data-role="${p.id}">${["setter", "closer", "coach", "admin"].map((r) => `<option value="${r}" ${r === p.role ? "selected" : ""}>${r}</option>`).join("")}</select>` : `<span class="tag">${esc(p.role)}</span>`}</td>
      <td class="muted">${esc(p.team || "—")}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted" style="margin-top:12px">${admin ? "Change a role from the dropdown — it saves immediately." : "Only Ayden (admin) can change roles."}</p>`);
  if (admin) main.querySelectorAll("[data-role]").forEach((s) => (s.onchange = async () => { const { error } = await supabase.from("profiles").update({ role: s.value }).eq("id", s.dataset.role); if (error) alert(error.message); }));
}

// ============================================================
// REPORTS
// ============================================================
async function renderReports() {
  const main = document.getElementById("main");
  main.innerHTML = head("Reports", "Performance", rangeSelect());
  document.getElementById("rangeSel").onchange = (e) => { state.range = e.target.value; renderReports(); };
  main.insertAdjacentHTML("beforeend", `<div class="empty">Crunching the numbers…</div>`);

  const [{ data: leads }, { data: deals }, actRes] = await Promise.all([
    pf(supabase.from("leads").select("owner_id,status,tier,created_at,updated_at")),
    pf(supabase.from("deals").select("owner_id,sourcing_setter,stage,tier,amount,created_at,updated_at,closed_at")),
    supabase.from("activities").select("owner_id,outreach,replies,activity_date"),
  ]);
  const L = leads || [], D = deals || [], A = actRes.error ? null : (actRes.data || []);
  const nameOf = (id) => state.profiles.find((p) => p.id === id)?.full_name || "Unassigned";
  const closedField = (d) => d.closed_at || d.updated_at;

  const Lr = L.filter((l) => inRange(l.updated_at) || l.status === "new" && inRange(l.created_at));
  const wonR = D.filter((d) => d.stage === WON && inRange(closedField(d)));
  const lostR = D.filter((d) => LOST.includes(d.stage) && inRange(d.updated_at));

  // 1. scorecard
  const reps = {};
  const ens = (id) => (reps[id] = reps[id] || { leads: 0, forms: 0, taken: 0, won: 0, lost: 0, sourced: 0 });
  L.forEach((l) => { if (!l.owner_id) return; const r = ens(l.owner_id); if (inRange(l.created_at)) r.leads++; if (l.status === "form_submitted" && inRange(l.updated_at)) r.forms++; });
  D.forEach((d) => {
    if (d.owner_id && (inRange(closedField(d)) || inRange(d.created_at))) { const r = ens(d.owner_id); if (inRange(d.created_at)) r.taken++; if (d.stage === WON && inRange(closedField(d))) r.won++; else if (LOST.includes(d.stage) && inRange(d.updated_at)) r.lost++; }
    if (d.sourcing_setter && d.stage === WON && inRange(closedField(d))) ens(d.sourcing_setter).sourced++;
  });
  const scoreRows = Object.entries(reps).map(([id, r]) => { const dec = r.won + r.lost; return { name: nameOf(id), ...r, cr: dec ? Math.round((r.won / dec) * 100) : null }; }).sort((a, b) => b.won - a.won);
  const scorecard = `<div class="panel fade"><h3>Team scorecard</h3><div class="tbl-wrap" style="background:transparent;border:none;padding:0;backdrop-filter:none">
    <table class="tbl"><thead><tr><th>Rep</th><th>Leads</th><th>Forms</th><th>Calls</th><th>Won</th><th>Close rate</th><th>Sourced</th></tr></thead>
    <tbody>${scoreRows.map((r) => `<tr><td class="name">${esc(r.name)}</td><td>${r.leads}</td><td>${r.forms}</td><td>${r.taken}</td><td>${r.won}</td><td>${r.cr == null ? "—" : `<span class="tag ${r.cr >= 40 ? "won" : r.cr < 30 ? "hot" : ""}">${r.cr}%</span>`}</td><td>${r.sourced}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">No data in range</td></tr>`}</tbody></table>
    </div><button class="btn sm" data-csv="scorecard" style="margin-top:14px">Export CSV</button></div>`;

  // 2. leading indicators
  let leading = "";
  if (A) {
    const act = {}; A.filter((a) => inRange(a.activity_date)).forEach((a) => { const x = act[a.owner_id] = act[a.owner_id] || { out: 0, rep: 0 }; x.out += a.outreach || 0; x.rep += a.replies || 0; });
    const aRows = Object.entries(act).map(([id, x]) => ({ name: nameOf(id), ...x, rate: x.out ? Math.round((x.rep / x.out) * 100) : 0 })).sort((a, b) => b.out - a.out);
    leading = `<div class="panel fade" style="animation-delay:.06s"><h3>Leading indicators</h3><div class="tbl-wrap" style="background:transparent;border:none;padding:0;backdrop-filter:none">
      <table class="tbl"><thead><tr><th>Setter</th><th>Outreach</th><th>Replies</th><th>Reply rate</th></tr></thead>
      <tbody>${aRows.map((r) => `<tr><td class="name">${esc(r.name)}</td><td>${r.out}</td><td>${r.rep}</td><td>${r.rate}%</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No activity logged in range</td></tr>`}</tbody></table>
      </div><button class="btn sm" data-csv="leading" style="margin-top:14px">Export CSV</button></div>`;
  } else {
    leading = `<div class="panel fade" style="animation-delay:.06s"><h3>Leading indicators</h3><p class="muted">Run the v2 migration (UPGRADES.md) to enable outreach tracking. Setters then tap “Log activity” on the Leads page.</p></div>`;
  }

  // 3. pipeline & revenue
  const totalRev = wonR.reduce((s, d) => s + (+d.amount || 0), 0);
  const dec = wonR.length + lostR.length;
  const cr = dec ? Math.round((wonR.length / dec) * 100) : 0;
  const byTier = TIERS.map(([k, label]) => { const wt = wonR.filter((d) => d.tier === k); return { label, count: wt.length, revenue: wt.reduce((s, d) => s + (+d.amount || 0), 0) }; });
  const summary = `<div class="panel fade" style="animation-delay:.1s"><h3>Pipeline &amp; revenue</h3>
    <div class="metrics" style="margin-bottom:16px">
      ${mini("Forms", L.filter((l) => l.status === "form_submitted" && inRange(l.updated_at)).length, "accent")}
      ${mini("Closed won", wonR.length, "good")}
      ${mini("Close rate", cr + "%", cr >= 40 ? "good" : cr < 30 && dec ? "accent" : "")}
      ${mini("Revenue", money(totalRev))}
    </div>
    <div class="tbl-wrap" style="background:transparent;border:none;padding:0;backdrop-filter:none"><table class="tbl">
      <thead><tr><th>Tier</th><th>Closed won</th><th>Revenue</th></tr></thead>
      <tbody>${byTier.map((t) => `<tr><td class="name">${t.label}</td><td>${t.count}</td><td>${money(t.revenue)}</td></tr>`).join("")}
      <tr><td class="name">Total</td><td>${wonR.length}</td><td>${money(totalRev)}</td></tr></tbody></table></div>
    <button class="btn sm" data-csv="summary" style="margin-top:14px">Export CSV</button></div>`;

  // 4. commission
  const comm = {};
  wonR.filter((d) => d.sourcing_setter).forEach((d) => { const c = comm[d.sourcing_setter] = comm[d.sourcing_setter] || { closes: 0, owed: 0 }; c.closes++; c.owed += COMMISSION[d.tier] || 0; });
  const commRows = Object.entries(comm).map(([id, c]) => ({ name: nameOf(id), ...c })).sort((a, b) => b.owed - a.owed);
  const commTotal = commRows.reduce((s, r) => s + r.owed, 0);
  const commission = `<div class="panel fade" style="animation-delay:.14s"><h3>Setter commission</h3>
    <p class="muted" style="margin:-6px 0 14px">Per sourced close · T1 ${money(COMMISSION.tier_1)} · T2 ${money(COMMISSION.tier_2)} · T3 ${money(COMMISSION.tier_3)}</p>
    <div class="tbl-wrap" style="background:transparent;border:none;padding:0;backdrop-filter:none"><table class="tbl">
      <thead><tr><th>Setter</th><th>Sourced closes</th><th>Commission owed</th></tr></thead>
      <tbody>${commRows.map((r) => `<tr><td class="name">${esc(r.name)}</td><td>${r.closes}</td><td>${money(r.owed)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No sourced closes in range</td></tr>`}
      ${commRows.length ? `<tr><td class="name">Total</td><td>${commRows.reduce((s, r) => s + r.closes, 0)}</td><td>${money(commTotal)}</td></tr>` : ""}</tbody></table></div>
    <button class="btn sm" data-csv="commission" style="margin-top:14px">Export CSV</button></div>`;

  main.innerHTML = head("Reports", "Performance", rangeSelect());
  document.getElementById("rangeSel").onchange = (e) => { state.range = e.target.value; renderReports(); };
  main.insertAdjacentHTML("beforeend", scorecard + leading + summary + commission);

  const csv = {
    scorecard: [["Rep", "Leads", "Forms", "Calls", "Won", "Close rate %", "Sourced"], ...scoreRows.map((r) => [r.name, r.leads, r.forms, r.taken, r.won, r.cr ?? "", r.sourced])],
    summary: [["Tier", "Closed won", "Revenue"], ...byTier.map((t) => [t.label, t.count, t.revenue]), ["Total", wonR.length, totalRev]],
    commission: [["Setter", "Sourced closes", "Commission owed"], ...commRows.map((r) => [r.name, r.closes, r.owed])],
    leading: A ? [["Setter", "Outreach", "Replies"], ...Object.entries(A.reduce((m2, a) => { if (!inRange(a.activity_date)) return m2; const x = m2[a.owner_id] = m2[a.owner_id] || [0, 0]; x[0] += a.outreach || 0; x[1] += a.replies || 0; return m2; }, {})).map(([id, x]) => [nameOf(id), x[0], x[1]])] : [["No activity data"]],
  };
  main.querySelectorAll("[data-csv]").forEach((b) => (b.onclick = () => downloadCSV(csv[b.dataset.csv], `shevlin-${b.dataset.csv}-${new Date().toISOString().slice(0, 10)}.csv`)));
}
const mini = (k, v, cls = "") => `<div class="metric ${cls}"><div class="k">${k}</div><div class="v" style="font-size:25px">${v}</div></div>`;
function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// ============================================================
// PROJECTS (admin)
// ============================================================
async function renderProjects() {
  const main = document.getElementById("main");
  main.innerHTML = head("Projects", "Workspace", `<button class="btn sm" id="newProj">+ New project</button>`);
  document.getElementById("newProj").onclick = () => projectModal();
  main.insertAdjacentHTML("beforeend", `<div class="empty">Loading…</div>`);

  const [{ data: projects }, { data: members }] = await Promise.all([
    supabase.from("projects").select("*").order("name"),
    supabase.from("project_members").select("project_id,user_id"),
  ]);
  const P = projects || [], M = members || [];
  const membersOf = (pid) => M.filter((m) => m.project_id === pid).map((m) => ownerName(m.user_id));
  const typeLabel = { campaign: "Campaign", client: "Client", pod: "Pod", other: "Other" };

  main.innerHTML = head("Projects", "Workspace", `<button class="btn sm" id="newProj2">+ New project</button>`);
  document.getElementById("newProj2").onclick = () => projectModal();
  main.insertAdjacentHTML("beforeend", `<div class="tbl-wrap fade"><table class="tbl">
    <thead><tr><th>Project</th><th>Type</th><th>Status</th><th>Reps</th><th></th></tr></thead>
    <tbody>${P.map((p) => `<tr>
      <td class="name">${esc(p.name)}${p.is_default ? ` <span class="tag">default</span>` : ""}</td>
      <td><span class="tag">${typeLabel[p.type] || p.type}</span></td>
      <td>${p.status === "active" ? `<span class="tag won">active</span>` : `<span class="tag lost">archived</span>`}</td>
      <td class="muted">${membersOf(p.id).map(esc).join(", ") || "—"}</td>
      <td><button class="btn mini" data-proj="${p.id}">Manage</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No projects yet</td></tr>`}
    </tbody></table></div>`);
  main.querySelectorAll("[data-proj]").forEach((b) => (b.onclick = () => projectModal(P.find((x) => x.id === b.dataset.proj), M.filter((m) => m.project_id === b.dataset.proj).map((m) => m.user_id))));
}

function projectModal(project = null, memberIds = []) {
  const editing = !!project;
  const setIds = new Set(memberIds);
  openModal(`${editing ? "Manage project" : "New project"}`, `
    ${field("Name", `<input id="p_name" value="${esc(project?.name || "")}"/>`)}
    <div class="row2">
      ${field("Type", select("p_type", [["campaign", "Campaign"], ["client", "Client"], ["pod", "Pod"], ["other", "Other"]], project?.type || "other"))}
      ${field("Status", select("p_status", [["active", "Active"], ["archived", "Archived"]], project?.status || "active"))}
    </div>
    ${field("External ref (for your management OS)", `<input id="p_ext" value="${esc(project?.external_ref || "")}" placeholder="optional"/>`)}
    <label class="check"><input type="checkbox" id="p_default" ${project?.is_default ? "checked" : ""}/> Inbound destination — website-form leads land in this project</label>
    <p class="muted" style="margin:-2px 0 8px">Exactly one project receives inbound forms. Ticking this moves it here.</p>
    <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);margin:6px 0 8px;font-family:var(--mono)">Assigned reps</label>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 12px">
      ${state.profiles.map((u) => `<label class="check"><input type="checkbox" class="p_mem" value="${u.id}" ${setIds.has(u.id) ? "checked" : ""}/> ${esc(u.full_name || "—")} <span class="muted">· ${esc(u.role)}</span></label>`).join("")}
    </div>
  `, [
    { label: editing ? "Save" : "Create", cls: "", act: async () => {
      const name = val("p_name");
      if (!name) return msgModal("Name is required.");
      const row = { name, type: val("p_type"), status: val("p_status"), external_ref: val("p_ext") || null };
      if (document.getElementById("p_default").checked) row.is_default = true;
      let pid = project?.id;
      if (editing) { const { error } = await supabase.from("projects").update(row).eq("id", pid); if (error) return msgModal(error.message); }
      else { const { data, error } = await supabase.from("projects").insert(row).select("id").single(); if (error) return msgModal(error.message); pid = data.id; }
      // reconcile members
      const checked = [...document.querySelectorAll(".p_mem:checked")].map((c) => c.value);
      const before = new Set(memberIds), after = new Set(checked);
      const toAdd = checked.filter((id) => !before.has(id)).map((id) => ({ project_id: pid, user_id: id }));
      const toRemove = memberIds.filter((id) => !after.has(id));
      if (toAdd.length) await supabase.from("project_members").insert(toAdd);
      for (const id of toRemove) await supabase.from("project_members").delete().eq("project_id", pid).eq("user_id", id);
      closeModal();
      const { data: projects } = await supabase.from("projects").select("*").eq("status", "active").order("name");
      state.projects = projects || [];
      renderShell();
    } },
  ]);
}

// ============================================================
// MY DAY (everyone)
// ============================================================
async function renderMyDay() {
  const main = document.getElementById("main");
  const meName = (state.profile?.full_name || "there").split(/\s+/)[0];
  main.innerHTML = head("My Day", `Hi ${esc(meName)}`);
  main.insertAdjacentHTML("beforeend", `<div class="empty">Loading…</div>`);

  const uid = state.user.id;
  const [{ data: leads }, { data: deals }] = await Promise.all([
    supabase.from("leads").select("*").eq("owner_id", uid),
    supabase.from("deals").select("*").or(`owner_id.eq.${uid},sourcing_setter.eq.${uid}`),
  ]);
  const L = leads || [], D = deals || [], now = Date.now();
  const myActive = L.filter((l) => LEAD_ACTIVE.includes(l.status));
  const stale = myActive.filter((l) => { const r = l.last_contact || l.created_at; return r && (now - new Date(r).getTime()) / 864e5 >= STALE_DAYS; });
  const formsMine = L.filter((l) => l.status === "form_submitted" && !l.converted);
  const myInPlay = D.filter((d) => ["call_booked", "no_show_followup", "pending"].includes(d.stage) && d.owner_id === uid);
  const chase = D.filter((d) => d.stage === "no_show_followup" && d.owner_id === uid);
  const myClosesWk = D.filter((d) => d.stage === WON && (d.sourcing_setter === uid || d.owner_id === uid) && inRange(d.closed_at || d.updated_at, "7d")).length;

  const stat = (k, v, cls = "") => `<div class="metric ${cls} fade"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const list = (title, dot, items, render) => `<div class="panel fade"><h3>${title} <span class="count">${items.length}</span></h3>${items.length ? items.map((x) => `<div class="remind"><span class="dot ${dot}"></span>${render(x)}</div>`).join("") : `<div class="muted" style="padding:6px">Nothing here — nice.</div>`}</div>`;

  main.innerHTML = head("My Day", `Hi ${esc(meName)}`);
  main.insertAdjacentHTML("beforeend", `
    <div class="metrics">
      ${stat("My active leads", myActive.length)}
      ${stat("Forms to convert", formsMine.length, "accent")}
      ${stat("My deals in play", myInPlay.length)}
      ${stat("My closes (7d)", myClosesWk, "good")}
    </div>
    ${list("Follow-ups due", "stale", stale, (l) => `<span class="nm">${esc(l.name)}</span> <span class="muted">${lbl(LEAD_STATUS, l.status)}</span><span class="meta">${Math.round((now - new Date(l.last_contact || l.created_at).getTime()) / 864e5)}d</span>`)}
    ${list("No-shows to chase", "chase", chase, (d) => `<span class="nm">${esc(d.contact_name)}</span><span class="meta">rebook</span>`)}
    ${list("Forms ready to convert", "stale", formsMine, (l) => `<span class="nm">${esc(l.name)}</span> <span class="muted">${tierLabel(l.tier)}</span><span class="meta">go to Leads</span>`)}`);
}

// ============================================================
// drag & drop (desktop) + timeline + CSV import
// ============================================================
function enableDragDrop(container, onDrop) {
  let dragId = null;
  container.querySelectorAll(".card[draggable]").forEach((card) => {
    card.addEventListener("dragstart", (e) => { dragId = card.dataset.id; card.style.opacity = ".45"; e.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => { card.style.opacity = ""; });
  });
  container.querySelectorAll("[data-col]").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.style.borderColor = "var(--red)"; });
    col.addEventListener("dragleave", () => { col.style.borderColor = ""; });
    col.addEventListener("drop", (e) => { e.preventDefault(); col.style.borderColor = ""; const key = col.dataset.key; if (dragId && key) onDrop(dragId, key); });
  });
}

const rel = (d) => { const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
const timelinePlaceholder = () => `<div style="margin-top:16px"><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);margin-bottom:8px;font-family:var(--mono)">Activity timeline</label><div id="tl" class="muted">Loading…</div></div>`;
async function loadTimeline(type, id) {
  const el = document.getElementById("tl"); if (!el) return;
  const { data, error } = await supabase.from("crm_events").select("event_type,summary,actor,created_at").eq("entity_type", type).eq("entity_id", id).order("created_at", { ascending: false }).limit(8);
  if (error) return (el.innerHTML = `<span class="muted">Timeline activates after the v4 migration is run.</span>`);
  if (!data.length) return (el.textContent = "No activity recorded yet.");
  el.innerHTML = data.map((ev) => `<div class="tl-row"><span class="tl-dot"></span><div><div style="font-size:13px">${esc(ev.summary || ev.event_type)}</div><div class="muted" style="font-size:11px">${esc(ownerName(ev.actor))} · ${rel(ev.created_at)}</div></div></div>`).join("");
}

function importModal() {
  const proj = state.currentProject !== "all" ? state.currentProject : postableProjects()[0]?.id;
  openModal("Import leads from CSV", `
    <p class="muted" style="margin:-6px 0 14px">CSV with a header row. Recognised columns: <b>name</b>, <b>email</b>, <b>tier</b> (1/2/3), <b>platform</b>, <b>status</b>, <b>notes</b>. Only <b>name</b> is required. Rows import into the selected project.</p>
    ${field("Project", select("imp_proj", postableProjects().map((p) => [p.id, p.name]), proj))}
    ${field("CSV file", `<input id="imp_file" type="file" accept=".csv,text/csv"/>`)}
    <div id="imp_status" class="muted"></div>
  `, [{ label: "Import", cls: "", act: async () => {
    const file = document.getElementById("imp_file").files[0];
    const pid = val("imp_proj");
    if (!file) return msgModal("Choose a CSV file.");
    if (!pid) return msgModal("Pick a project.");
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return msgModal("No rows found.");
    const tierMap = { "1": "tier_1", "2": "tier_2", "3": "tier_3", "tier 1": "tier_1", "tier 2": "tier_2", "tier 3": "tier_3" };
    const statusKeys = LEAD_STATUS.map((s) => s[0]);
    const payload = rows.map((r) => ({
      name: r.name || r.full_name || "Unknown",
      contact_link: r.email || r.contact || null,
      tier: tierMap[(r.tier || "").toLowerCase().trim()] || null,
      platform: PLATFORMS.includes(r.platform) ? r.platform : null,
      status: statusKeys.includes((r.status || "").toLowerCase()) ? r.status.toLowerCase() : "new",
      notes: r.notes || null,
      project_id: pid,
      owner_id: state.user.id,
    })).filter((r) => r.name);
    document.getElementById("imp_status").textContent = `Importing ${payload.length}…`;
    const { error } = await supabase.from("leads").insert(payload);
    if (error) return msgModal(error.message);
    closeModal(); renderLeads();
  } }]);
}
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const o = {}; headers.forEach((h, i) => (o[h] = (cells[i] || "").trim()));
    return o;
  });
}
function splitCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}

// ============================================================
// shared UI
// ============================================================
function head(title, crumb, actions = "") {
  return `<div class="page-head"><div><div class="crumb">${crumb}</div><h2>${title}</h2></div><div class="head-actions">${actions}</div></div>`;
}
const select = (id, opts, sel) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
const tierTag = (t) => (t ? `<span class="tag ${t === "tier_1" ? "t1" : t === "tier_2" ? "t2" : "t3"}">${tierLabel(t)}</span>` : `<span class="tag lost">—</span>`);
const ownerName = (id) => state.profiles.find((p) => p.id === id)?.full_name || "—";
const icon = (n) => ({
  dash: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
  user: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/></svg>`,
  deal: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-9M14 17H5M17 3l3 4-3 4M7 21l-3-4 3-4"/></svg>`,
  team: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
  chart: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>`,
  out: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  proj: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  sun: `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
}[n] || "");
const searchBox = (id) => `<div class="searchbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input id="${id}" placeholder="Search…" autocapitalize="none" autocorrect="off"/></div>`;

function wireBoardFilter(scope) {
  const main = document.getElementById("main");
  const search = document.getElementById(scope + "Search");
  const tier = document.getElementById(scope + "Tier");
  const apply = () => {
    const q = (search?.value || "").toLowerCase().trim();
    const t = tier?.value || "";
    main.querySelectorAll("[data-edit]").forEach((el) => {
      const okN = !q || (el.dataset.name || "").includes(q);
      const okT = !t || el.dataset.tier === t;
      el.style.display = okN && okT ? "" : "none";
    });
  };
  if (search) search.oninput = apply;
  if (tier) tier.onchange = apply;
}

function openModal(title, body, actions) {
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `<div class="modal"><h3>${title}</h3><div id="modalMsg"></div>${body}<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls}" data-a="${i}">${a.label}</button>`).join("")}</div></div>`;
  wrap.onclick = (e) => { if (e.target === wrap) closeModal(); };
  document.body.appendChild(wrap);
  actions.forEach((a, i) => (wrap.querySelector(`[data-a="${i}"]`).onclick = a.act));
  window._modal = wrap;
}
const closeModal = () => { window._modal?.remove(); window._modal = null; };
const msgModal = (t) => (document.getElementById("modalMsg").innerHTML = `<div class="err">${esc(t)}</div>`);
