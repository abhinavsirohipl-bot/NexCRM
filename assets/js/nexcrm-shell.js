const ROOT = new URL("../../", import.meta.url);
const url = path => new URL(path, ROOT).href;
const norm = value => decodeURIComponent(String(value || "")).replace(/\\/g, "/").toLowerCase();
const session = (() => { try { return JSON.parse(localStorage.getItem("nexcrm_session") || sessionStorage.getItem("nexcrm_session") || "null"); } catch { return null; } })();
const role = String(session?.role || "Employee").toLowerCase();
const isAdmin = role === "admin";
const dashboardPath = isAdmin ? "admin-dashboard.html" : "employee-dashboard.html";
const pageTitle = document.title.replace(/\s*[|–—-]\s*NexCRM.*$/i, "") || "NexCRM Module";

const groups = [
  ["Dashboard", [[isAdmin ? "Admin Dashboard" : "Employee Dashboard", dashboardPath, "⌂"]]],
  ["Lead & Customer", [
    ["Add New Lead", "CRM Admin/leads.html", "+"], ["All Lead's View", "CRM Admin/lead-view.html", "▤"],
    ["Customer Details Sheet", "CRM Admin/detailsheet.html", "▧"], ["Customer Dashboard", "CRM Admin/dashboard.html", "◉"],
    ["MIS Dashboard", "CRM Admin/mis.html", "▦"], ["Report", "CRM Admin/report.html", "◫"],
    ["DDR / MDR", "CRM Admin/ddr-mdr.html", "↗"], ["Costing", "CRM Admin/employee-costing-chart.html", "◔"],
    ["Vault", "CRM Admin/vault.html", "◆"], ["Obligation Sheet", "CRM Admin/obligation.html", "₹"],
    ["Individual Report", "CRM Employee/indi-report.html", "◎"]
  ]],
  ["Financial Tools", [
    ["EMI Calculator", "Financial Tools/EMI-Calc.html", "₹"], ["Eligibility Calculator", "Financial Tools/eligibility-calc.html", "✓"],
    ["BT Calculator", "Financial Tools/BT-Calc.html", "⇄"], ["BAJAJ PF Calculator", "Financial Tools/Bajaj-Pf-Calc.html", "%"],
    ["OD Limit Calculator", "Financial Tools/Od-Calc.html", "↗"], ["Bank Company Check", "Financial Tools/Bank Company Check Tool's/Bank-Cat-checker-live.html", "⌕"],
    ["Pincode Finder", "Financial Tools/Pincode Tool's/pincode-india-live.html", "⌖"], ["FPR Location Check", "Financial Tools/FPR-list.html", "◈"]
  ]],
  ["HRMS", [
    ["HRMS Portal", "HRMS/hrms-portal.html", "♙"], ["Employee Management", "HRMS/employee-add.html", "+"],
    ["Joining Form", "HRMS/employee-joining-form.html", "▤"], ["Attendance", "HRMS/attendance-chart.html", "▦"],
    ["Payslip", "HRMS/payslip.html", "₹"], ["Offer Letter", "HRMS/offer-latter.html", "✎"], ["Portal Settings", "HRMS/portal-settings.html", "⚙"]
  ]],
  ["Bank Policy", [["Bajaj Policy", "Bank Policy/bajaj.html", "B"], ["Bandhan Policy", "Bank Policy/bandhan.html", "BN"], ["Chola Policy", "Bank Policy/chola.html", "C"], ["USFB Policy", "Bank Policy/usfb.html", "U"]]]
];

function initials(name) { return String(name || "NexCRM").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
function escapeHtml(value) { const d = document.createElement("div"); d.textContent = String(value || ""); return d.innerHTML; }
function navMarkup() {
  const current = norm(location.pathname);
  return groups.map(([title, items]) => `<section class="nx-nav-group"><div class="nx-group-title">${title}</div>${items.map(([label, path, icon]) => {
    const href = url(path), active = current === norm(new URL(href).pathname);
    return `<a class="nx-nav-link${active ? " active" : ""}" href="${href}"><span class="nx-nav-icon">${icon}</span><span>${label}</span></a>`;
  }).join("")}</section>`).join("");
}

function mount() {
  if (document.getElementById("nexcrmShell")) return;
  document.body.classList.add("nexcrm-shell-page");
  const displayName = session?.displayName || session?.name || session?.user || (isAdmin ? "Administrator" : "Employee");
  const shell = document.createElement("div"); shell.id = "nexcrmShell";
  shell.innerHTML = `<div class="nx-shade"></div><nav class="nx-rail" aria-label="Quick navigation">
    <a class="nx-logo" href="${url(dashboardPath)}" title="NexCRM"><img src="${url("Meterial/FB-logo.png")}" alt="NexCRM"></a>
    <button class="nx-menu" type="button" aria-expanded="false" title="Open menu">☰</button>
    <a href="${url(dashboardPath)}" title="Dashboard">⌂</a><a href="${url("CRM Admin/leads.html")}" title="New Lead">＋</a><a href="${url("CRM Admin/lead-view.html")}" title="Lead View">▤</a>
    <div class="nx-rail-sep"></div><a href="${url("Financial Tools/EMI-Calc.html")}" title="Financial Tools">₹</a><a href="${url("HRMS/hrms-portal.html")}" title="HRMS">♙</a>
    <div class="nx-rail-grow"></div><a href="${url("HRMS/portal-settings.html")}" title="Settings">⚙</a></nav>
    <aside class="nx-drawer" aria-label="NexCRM navigation drawer"><div class="nx-drawer-head"><div class="nx-brand"><img src="${url("Meterial/FB-logo.png")}" alt="NexCRM"><span><b>NexCRM</b><small>${isAdmin ? "ADMIN PANEL" : "EMPLOYEE PANEL"}</small></span></div><button class="nx-close" type="button" aria-label="Close menu">×</button></div><div class="nx-search"><input type="search" placeholder="Search all modules..."></div><div class="nx-nav">${navMarkup()}</div></aside>
    <header class="nx-topbar"><div class="nx-page-title"><b>${escapeHtml(pageTitle)}</b><small>NexCRM unified workspace</small></div><div class="nx-actions">
      <div class="nx-pill nx-user"><span class="nx-avatar">${initials(displayName)}</span><span class="nx-user-copy"><small>Logged in as</small><b>${escapeHtml(displayName)}</b></span></div>
      <a class="nx-pill" href="${url(dashboardPath)}" title="Dashboard"><b>⌂</b><span>Dashboard</span></a><button class="nx-pill nx-back" type="button" title="Back"><b>←</b><span>Back</span></button>
      <button class="nx-pill nx-theme" type="button" title="Theme">◐</button><button class="nx-pill nx-logout" type="button" title="Logout"><b>⇥</b><span>Logout</span></button></div></header>`;
  document.body.appendChild(shell);
  const setOpen = open => { shell.classList.toggle("open", !!open); shell.querySelector(".nx-menu").setAttribute("aria-expanded", open ? "true" : "false"); };
  shell.querySelector(".nx-menu").onclick = () => setOpen(!shell.classList.contains("open")); shell.querySelector(".nx-close").onclick = () => setOpen(false); shell.querySelector(".nx-shade").onclick = () => setOpen(false);
  shell.querySelector(".nx-back").onclick = () => history.length > 1 ? history.back() : location.assign(url(dashboardPath));
  const applyTheme = dark => { document.documentElement.classList.toggle("nx-shell-dark", dark); document.body.classList.toggle("dark", dark); localStorage.setItem("nexcrm_theme", dark ? "dark" : "light"); };
  applyTheme(["dark", "1"].includes(localStorage.getItem("nexcrm_theme") || localStorage.getItem("nexcrmTheme"))); shell.querySelector(".nx-theme").onclick = () => applyTheme(!document.documentElement.classList.contains("nx-shell-dark"));
  shell.querySelector(".nx-logout").onclick = async () => { try { if (window.NexCRMFirebase?.signOut) return window.NexCRMFirebase.signOut(); } catch {} localStorage.removeItem("nexcrm_session"); localStorage.removeItem("nexcrm_logged_in"); sessionStorage.clear(); location.assign(url("index.html")); };
  shell.querySelector(".nx-search input").oninput = event => { const q = event.target.value.toLowerCase().trim(); shell.querySelectorAll(".nx-nav-group").forEach(group => { let visible = 0; group.querySelectorAll(".nx-nav-link").forEach(a => { const show = !q || a.textContent.toLowerCase().includes(q); a.style.display = show ? "flex" : "none"; if (show) visible++; }); group.style.display = visible ? "block" : "none"; }); };
  document.addEventListener("keydown", event => { if (event.key === "Escape") setOpen(false); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
