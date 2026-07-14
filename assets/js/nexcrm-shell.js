const ROOT = new URL("../../", import.meta.url);
const url = path => new URL(path, ROOT).href;
const safe = value => String(value ?? "").trim();
const lower = value => safe(value).toLowerCase();
const compact = value => lower(value).replace(/[^a-z0-9@._-]/g, "");
const normPath = value => decodeURIComponent(String(value || "")).replace(/\\/g, "/").toLowerCase();
const readJSON = (key, fallback, store = localStorage) => {
  try {
    const parsed = JSON.parse(store.getItem(key) || "null");
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
};
const getSession = () => readJSON("nexcrm_session", null, localStorage) || readJSON("nexcrm_session", null, sessionStorage);
const isAdminSession = value => lower((value || getSession())?.role).includes("admin");
const employeeIdOf = value => safe(value?.employeeId || value?.empId || value?.employeeCode || value?.id || value?.credential || value?.username);
const employeeNameOf = value => safe(value?.name || value?.employeeName || value?.empName || value?.fullName || value?.displayName || value?.userName);
const emailOf = value => safe(value?.officialEmail || value?.officialMail || value?.email || value?.companyEmail || value?.mailId);
const phoneOf = value => safe(value?.mobile || value?.mobileNo || value?.phone || value?.phoneNo || value?.contact || value?.contactNo);
const EMPLOYEE_KEYS = ["nexcrm_employee_master_final_custom", "nexcrm_employee_master_v1", "nexcrm_admin_employees_v1"];
const PROFILE_KEY = "nexcrm_employee_profiles_v1";

function employeeRows() {
  const rows = [];
  const seen = new Set();
  EMPLOYEE_KEYS.forEach(key => {
    const value = readJSON(key, []);
    (Array.isArray(value) ? value : []).forEach(row => {
      const token = compact(employeeIdOf(row) || emailOf(row) || employeeNameOf(row));
      if (!token || seen.has(token)) return;
      seen.add(token);
      rows.push(row);
    });
  });
  return rows;
}

function employeeMatches(row, reference) {
  const refIds = [employeeIdOf(reference), reference?.credential, reference?.username].map(compact).filter(Boolean);
  const rowIds = [employeeIdOf(row), row?.credential, row?.username].map(compact).filter(Boolean);
  if (refIds.some(id => rowIds.includes(id))) return true;
  const refEmail = compact(emailOf(reference));
  const rowEmail = compact(emailOf(row));
  if (refEmail && rowEmail && refEmail === rowEmail) return true;
  const refName = compact(employeeNameOf(reference));
  return !!refName && refName === compact(employeeNameOf(row));
}

function profileMap() {
  const map = readJSON(PROFILE_KEY, {});
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

function profileKey(session = getSession()) {
  return compact(employeeIdOf(session) || emailOf(session) || employeeNameOf(session) || "current") || "current";
}

function normalizeProfile(row = {}) {
  return {
    name: employeeNameOf(row),
    employeeId: employeeIdOf(row),
    designation: safe(row.designation || row.jobTitle || row.post || row.roleTitle || row.role),
    department: safe(row.department || row.team || row.vertical),
    mobile: phoneOf(row),
    email: emailOf(row),
    personalEmail: safe(row.personalEmail || row.personalMail || row.alternateEmail),
    location: safe(row.location || row.branch || row.office || row.city || row.workLocation),
    address: safe(row.address || row.currentAddress || row.residentialAddress),
    emergencyContact: safe(row.emergencyContact || row.emergencyMobile || row.alternateMobile),
    reportingManager: safe(row.reportingManager || row.manager || row.tlName || row.teamLeader),
    about: safe(row.about || row.bio || row.remarks),
    dp: safe(row.dp || row.photo || row.photoUrl || row.profileImage || row.profilePhoto)
  };
}

function getProfile() {
  const session = getSession() || {};
  const master = employeeRows().find(row => employeeMatches(row, session)) || {};
  const key = profileKey(session);
  const saved = normalizeProfile(profileMap()[key] || {});
  const base = normalizeProfile(master);
  const sessionProfile = normalizeProfile(session);
  const merged = { ...base, ...sessionProfile };
  Object.entries(saved).forEach(([name, value]) => { if (safe(value)) merged[name] = value; });
  merged.name = merged.name || safe(session.displayName || session.user) || (isAdminSession(session) ? "Administrator" : "Employee");
  merged.employeeId = base.employeeId || sessionProfile.employeeId || safe(session.credential);
  merged.designation = merged.designation || (isAdminSession(session) ? "Administrator" : "Employee");
  merged.role = isAdminSession(session) ? "Admin" : "Employee";
  return merged;
}

function persistSessionProfile(profile) {
  [localStorage, sessionStorage].forEach(store => {
    const current = readJSON("nexcrm_session", null, store);
    if (!current) return;
    const next = {
      ...current,
      displayName: profile.name || current.displayName,
      name: profile.name || current.name,
      employeeId: profile.employeeId || current.employeeId,
      email: profile.email || current.email,
      mobile: profile.mobile || current.mobile,
      designation: profile.designation || current.designation,
      location: profile.location || current.location,
      photoURL: profile.dp || current.photoURL,
      lastActivity: new Date().toISOString()
    };
    store.setItem("nexcrm_session", JSON.stringify(next));
  });
}

function saveProfile(changes) {
  const session = getSession() || {};
  const current = getProfile();
  const next = { ...current, ...changes, employeeId: current.employeeId || changes.employeeId, updatedAt: new Date().toISOString() };
  const map = profileMap();
  map[profileKey(session)] = next;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(map));
  persistSessionProfile(next);
  window.dispatchEvent(new CustomEvent("nexcrm:profile-updated", { detail: next }));
  return next;
}

const OWNER_ID_FIELDS = ["employeeId", "employeeUserId", "empId", "empCode", "employeeCode", "createdById", "assignedToId", "staffId", "userId", "Employee ID", "Emp ID", "Employee Code"];
const OWNER_NAME_FIELDS = ["employeeName", "empName", "owner", "createdBy", "assignedTo", "userName", "tlName", "Employee Name", "Created By", "Assigned To"];
const OWNER_EMAIL_FIELDS = ["employeeEmail", "officialEmail", "officialMail", "createdByEmail", "assignedToEmail", "email"];

function belongsToEmployee(row, reference = getProfile()) {
  if (isAdminSession()) return true;
  if (!row || typeof row !== "object") return false;
  const refIds = [reference.employeeId, getSession()?.credential].map(compact).filter(Boolean);
  const rowIds = OWNER_ID_FIELDS.map(field => compact(row[field])).filter(Boolean);
  if (refIds.some(id => rowIds.includes(id))) return true;
  const refEmails = [reference.email, reference.personalEmail, getSession()?.email].map(compact).filter(Boolean);
  const rowEmails = OWNER_EMAIL_FIELDS.map(field => compact(row[field])).filter(Boolean);
  if (refEmails.some(email => rowEmails.includes(email))) return true;
  const refNames = [reference.name, getSession()?.displayName].map(compact).filter(Boolean);
  const rowNames = OWNER_NAME_FIELDS.map(field => compact(row[field])).filter(Boolean);
  return refNames.some(name => rowNames.includes(name));
}

function filterRows(rows, reference = getProfile()) {
  const list = Array.isArray(rows) ? rows : [];
  return isAdminSession() ? list : list.filter(row => belongsToEmployee(row, reference));
}

function normalizedStatus(row) {
  return lower(row?.status || row?.disposition || row?.caseStatus || row?.currentStatus || row?.["Status"]).replace(/\s+/g, " ");
}
function isPerformanceCase(row) {
  const status = normalizedStatus(row);
  return status === "approved" || status === "disbursed";
}
function performanceRows(rows) { return (Array.isArray(rows) ? rows : []).filter(isPerformanceCase); }

window.NexCRMAccess = {
  getSession,
  isAdmin: isAdminSession,
  getProfile,
  saveProfile,
  belongs: belongsToEmployee,
  filterRows,
  normalizedStatus,
  isPerformanceCase,
  performanceRows,
  employeeRows
};

const BACKUP_SECTIONS = ["hrms", "leads", "mis", "detailsheets", "obligations", "portal", "profiles", "dashboardStats", "activityLogs", "shared"];
function backupSectionFor(key) {
  const name = lower(key);
  if (/employee|joining|attendance|payslip|offer|leave|costing|ddr|mdr|vault|signature|company_logo|hrms/.test(name)) return "hrms";
  if (/lead/.test(name)) return "leads";
  if (/\bmis\b|mis_/.test(name)) return "mis";
  if (/detailsheet|detail_sheet/.test(name)) return "detailsheets";
  if (/obligation|cibil/.test(name)) return "obligations";
  if (/login_config|dropdown|status_values|product_names|bank_names|portal/.test(name)) return "portal";
  if (/profile|_dp$|admin_name/.test(name)) return "profiles";
  if (/dashboard.*stat|dashboard_stats/.test(name)) return "dashboardStats";
  if (/activity|audit|history|log/.test(name)) return "activityLogs";
  return "shared";
}
function backupValue(value) {
  try { return JSON.parse(value); } catch { return value; }
}
function createCompleteBackup() {
  const sections = Object.fromEntries(BACKUP_SECTIONS.map(name => [name, {}]));
  const raw = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || ["nexcrm_session", "nexcrm_logged_in"].includes(key)) continue;
    const value = localStorage.getItem(key);
    raw[key] = value;
    sections[backupSectionFor(key)][key] = backupValue(value);
  }
  const counts = Object.fromEntries(BACKUP_SECTIONS.map(name => [name, Object.keys(sections[name]).length]));
  return {
    meta: {
      format: "NexCRM Complete Backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      project: "NexCRM",
      employee: getProfile().employeeId || "Admin",
      sections: BACKUP_SECTIONS,
      counts,
      totalKeys: Object.keys(raw).length,
      note: "Authentication session tokens are intentionally excluded. Keep this file private because portal settings can contain credentials."
    },
    sections,
    localStorage: raw
  };
}
function downloadCompleteBackup() {
  const backup = createCompleteBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `NexCRM-Complete-Backup-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
  return backup;
}
window.NexCRMBackup = { create: createCompleteBackup, download: downloadCompleteBackup, sections: BACKUP_SECTIONS };

const currentSession = getSession();
const isAdmin = isAdminSession(currentSession);
const dashboardPath = isAdmin ? "admin-dashboard.html" : "employee-dashboard.html";
const pageTitle = document.title.replace(/\s*[|–—-]\s*NexCRM.*$/i, "") || "NexCRM Module";

const groups = [
  ["Dashboard", [[isAdmin ? "Admin Dashboard" : "Employee Dashboard", dashboardPath, "fa-house", false]]],
  ["Lead & Customer", [
    ["Add New Lead", "CRM Admin/leads.html", "fa-user-plus", false], ["All Lead's View", "CRM Admin/lead-view.html", "fa-address-book", false],
    ["Customer Details Sheet", "CRM Admin/detailsheet.html", "fa-id-card", false], ["Customer Dashboard", "CRM Admin/dashboard.html", "fa-chart-pie", false],
    ["MIS Dashboard", "CRM Admin/mis.html", "fa-table-columns", false], ["Individual Report", "CRM Employee/indi-report.html", "fa-chart-line", false],
    ["Report", "CRM Admin/report.html", "fa-file-export", false], ["DDR / MDR", "CRM Admin/ddr-mdr.html", "fa-arrow-trend-up", false],
    ["Costing", "CRM Admin/employee-costing-chart.html", "fa-coins", false], ["Vault", "CRM Admin/vault.html", "fa-vault", false],
    ["Obligation Sheet", "CRM Admin/obligation.html", "fa-scale-balanced", false]
  ]],
  ["Financial Tools", [
    ["EMI Calculator", "Financial Tools/EMI-Calc.html", "fa-calculator", false], ["Eligibility Calculator", "Financial Tools/eligibility-calc.html", "fa-circle-check", false],
    ["BT Calculator", "Financial Tools/BT-Calc.html", "fa-right-left", false], ["BAJAJ PF Calculator", "Financial Tools/Bajaj-Pf-Calc.html", "fa-percent", false],
    ["OD Limit Calculator", "Financial Tools/Od-Calc.html", "fa-arrow-trend-up", false], ["Bank Company Check", "Financial Tools/Bank Company Check Tool's/Bank-Cat-checker-live.html", "fa-building-columns", false],
    ["Pincode Finder", "Financial Tools/Pincode Tool's/pincode-india-live.html", "fa-location-dot", false], ["FPR Location Check", "Financial Tools/FPR-list.html", "fa-map", false]
  ]],
  ["HRMS", [
    ["HRMS Portal", "HRMS/hrms-portal.html", "fa-users", true], ["Employee Management", "HRMS/employee-add.html", "fa-user-gear", true],
    ["Joining Form", "HRMS/employee-joining-form.html", "fa-file-signature", false], ["Attendance", "HRMS/attendance-chart.html", "fa-calendar-check", false],
    ["Payslip", "HRMS/payslip.html", "fa-receipt", false], ["Offer Letter", "HRMS/offer-latter.html", "fa-file-circle-check", true],
    ["Portal Settings", "HRMS/portal-settings.html", "fa-gears", true]
  ]],
  ["Bank Policy", [
    ["Bajaj Policy", "Bank Policy/bajaj.html", "fa-building-shield", false], ["Bandhan Policy", "Bank Policy/bandhan.html", "fa-building-shield", false],
    ["Chola Policy", "Bank Policy/chola.html", "fa-building-shield", false], ["USFB Policy", "Bank Policy/usfb.html", "fa-building-shield", false]
  ]]
];

function initials(name) {
  return safe(name || "NexCRM").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = safe(value);
  return div.innerHTML;
}
function icon(name) { return `<i class="fa-solid ${name}" aria-hidden="true"></i>`; }
function avatarMarkup(profile, className = "nx-avatar") {
  return `<span class="${className}">${profile.dp ? `<img src="${escapeHtml(profile.dp)}" alt="${escapeHtml(profile.name)}">` : `<b>${escapeHtml(initials(profile.name))}</b>`}</span>`;
}

function navMarkup() {
  const current = normPath(location.pathname);
  return groups.map(([title, items]) => `<section class="nx-nav-group"><div class="nx-group-title">${title}</div>${items.map(([label, path, iconName, adminOnly]) => {
    const href = url(path);
    const active = current === normPath(new URL(href).pathname);
    const locked = adminOnly && !isAdmin;
    return `<a class="nx-nav-link${active ? " active" : ""}${locked ? " locked" : ""}" href="${href}" ${locked ? 'data-admin-only="1" aria-disabled="true"' : ""}><span class="nx-nav-icon">${icon(iconName)}</span><span>${escapeHtml(label)}</span>${locked ? '<i class="fa-solid fa-lock nx-lock"></i>' : ""}</a>`;
  }).join("")}</section>`).join("");
}

function profileModalMarkup(profile) {
  const input = (id, label, value, type = "text", readonly = false) => `<label><span>${label}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${readonly ? "readonly" : ""}></label>`;
  return `<div class="nx-profile-modal" role="dialog" aria-modal="true" aria-labelledby="nxProfileTitle">
    <div class="nx-profile-card">
      <button class="nx-profile-close" type="button" aria-label="Close profile">×</button>
      <div class="nx-profile-head">${avatarMarkup(profile, "nx-profile-avatar")}<div><small>MY NEXCRM PROFILE</small><h2 id="nxProfileTitle">${escapeHtml(profile.name)}</h2><p>${escapeHtml(profile.employeeId || profile.role)} · Changes sync through Firebase</p></div><label class="nx-photo-button">${icon("fa-camera")} Change Photo<input id="nxProfilePhoto" type="file" accept="image/*"></label></div>
      <div class="nx-profile-grid">
        ${input("nxProfileName", "Full Name", profile.name)}
        ${input("nxProfileEmployeeId", "Employee Code", profile.employeeId, "text", true)}
        ${input("nxProfileMobile", "Mobile Number", profile.mobile, "tel")}
        ${input("nxProfileEmail", "Official Email", profile.email, "email")}
        ${input("nxProfilePersonalEmail", "Personal Email", profile.personalEmail, "email")}
        ${input("nxProfileLocation", "Branch / Location", profile.location)}
        ${input("nxProfileEmergency", "Emergency Contact", profile.emergencyContact, "tel")}
        ${input("nxProfileDesignation", "Designation", profile.designation, "text", true)}
        <label class="nx-profile-wide"><span>Contact Address</span><input id="nxProfileAddress" value="${escapeHtml(profile.address)}"></label>
        <label class="nx-profile-wide"><span>About Me</span><textarea id="nxProfileAbout" rows="3">${escapeHtml(profile.about)}</textarea></label>
      </div>
      <div class="nx-profile-note">Your employee code and designation are controlled by HRMS. Name, photo and contact details can be updated here.</div>
      <div class="nx-profile-actions"><button class="nx-profile-cancel" type="button">Cancel</button><button class="nx-profile-save" type="button">${icon("fa-cloud-arrow-up")} Save & Sync Profile</button></div>
    </div>
  </div>`;
}

function applyEmployeeFormScope(profile = getProfile()) {
  if (isAdminSession()) return;
  const setField = (selectors, value, locked = false) => {
    if (!safe(value)) return;
    document.querySelectorAll(selectors).forEach(field => {
      if (field.tagName === "SELECT" && ![...field.options].some(option => compact(option.value) === compact(value))) {
        field.add(new Option(`${value}${profile.name ? ` - ${profile.name}` : ""}`, value));
      }
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      if (locked) {
        field.readOnly = true;
        field.dataset.employeeLocked = "true";
        if (field.tagName === "SELECT") field.style.pointerEvents = "none";
      }
    });
  };
  setField("#employeeId,#employeeIdDropdown,#empCode,#employeeCode,[name='employeeId'],[name='empCode']", profile.employeeId, true);
  setField("#employeeName,#empName,[name='employeeName'],[name='empName']", profile.name, true);
  setField("#employeeEmail,[name='employeeEmail']", profile.email, true);
}

function mount() {
  if (document.getElementById("nexcrmShell")) return;
  document.body.classList.add("nexcrm-shell-page");
  let profile = getProfile();
  const shell = document.createElement("div");
  shell.id = "nexcrmShell";
  shell.innerHTML = `<div class="nx-shade"></div>
    <nav class="nx-rail" aria-label="NexCRM shortcut rail">
      <button class="nx-rail-profile nx-open-profile" type="button" title="Edit Profile">${avatarMarkup(profile, "nx-rail-avatar")}</button>
      <button class="nx-menu active" type="button" aria-expanded="false" title="All Shortcuts">${icon("fa-bars-staggered")}</button>
      <a href="${url(dashboardPath)}" title="Dashboard">${icon("fa-house")}</a>
      <a href="${url("CRM Admin/lead-view.html")}" title="Lead View">${icon("fa-chart-line")}</a>
      <button class="nx-menu nx-grid-menu" type="button" title="All Modules">${icon("fa-grip")}</button>
      <a href="${url("CRM Admin/leads.html")}" title="New Lead">${icon("fa-plus")}</a>
      <a href="${url("CRM Admin/detailsheet.html")}" title="Customer Details">${icon("fa-address-card")}</a>
      <div class="nx-rail-sep"></div>
      <a href="${url("Bank Policy/bajaj.html")}" title="Bank Policy">${icon("fa-building-columns")}</a>
      <a href="${url("Financial Tools/EMI-Calc.html")}" title="Financial Tools">${icon("fa-calculator")}</a>
      <div class="nx-rail-grow"></div>
      <a href="${url(isAdmin ? "HRMS/portal-settings.html" : "employee-dashboard.html#employeeProfile")}" title="Settings">${icon("fa-gear")}</a>
    </nav>
    <aside class="nx-drawer" aria-label="NexCRM navigation drawer"><div class="nx-drawer-head"><div class="nx-brand"><img src="${url("Meterial/FB-logo.png")}" alt="NexCRM"><span><b>NexCRM</b><small>${isAdmin ? "ADMIN CONTROL CENTER" : "EMPLOYEE WORKSPACE"}</small></span></div><button class="nx-close" type="button" aria-label="Close menu">×</button></div><div class="nx-search">${icon("fa-magnifying-glass")}<input type="search" placeholder="Search all shortcuts..."></div><div class="nx-nav">${navMarkup()}</div>${isAdmin ? `<div class="nx-backup-panel"><a class="nx-backup-button" href="${url("nexcrm-local-backup.html")}">${icon("fa-download")}<span><b>Complete System Backup</b><small>HRMS · Leads · MIS · IndexedDB · All Data</small></span></a><p>Opens the read-only backup center for this browser.</p></div>` : ""}</aside>
    <header class="nx-topbar">
      <a class="nx-page-brand" href="${url(dashboardPath)}"><img src="${url("Meterial/FB-logo.png")}" alt="NexCRM"><span><b>${escapeHtml(pageTitle)}</b><small>${isAdmin ? "NexCRM Admin Control" : "NexCRM Employee Workspace"}</small></span></a>
      <div class="nx-actions">
        <button class="nx-pill nx-user nx-open-profile" type="button" title="Edit Profile">${avatarMarkup(profile)}<span class="nx-user-copy"><small>Logged in as</small><b class="nx-header-name">${escapeHtml(profile.name)}</b></span></button>
        <div class="nx-pill nx-status"><span class="nx-live-dot"></span><span>${isAdmin ? "Admin" : "Employee"} Active</span></div>
        <button class="nx-pill nx-manage" type="button" title="Open all shortcuts">${avatarMarkup(profile, "nx-manage-avatar")}<span><b>Manage</b><small>Profile · Modules</small></span>${icon("fa-chevron-down")}</button>
        <button class="nx-pill nx-theme" type="button" title="Change Theme">${icon("fa-moon")}</button>
        <a class="nx-pill nx-home" href="${url(dashboardPath)}" title="Dashboard">${icon("fa-house")}</a>
        <button class="nx-pill nx-logout" type="button" title="Logout">${icon("fa-right-from-bracket")}</button>
      </div>
    </header>
    <div class="nx-toast" role="status"></div>
    ${profileModalMarkup(profile)}`;
  document.body.appendChild(shell);
  applyEmployeeFormScope(profile);

  const setOpen = open => {
    shell.classList.toggle("open", !!open);
    shell.querySelector(".nx-menu").setAttribute("aria-expanded", open ? "true" : "false");
  };
  const setProfileOpen = open => shell.classList.toggle("profile-open", !!open);
  const toast = message => {
    const element = shell.querySelector(".nx-toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove("show"), 2800);
  };
  const updateShellProfile = next => {
    profile = next;
    shell.querySelectorAll(".nx-header-name").forEach(node => { node.textContent = profile.name; });
    shell.querySelectorAll(".nx-avatar,.nx-rail-avatar,.nx-manage-avatar,.nx-profile-avatar").forEach(node => {
      node.innerHTML = profile.dp ? `<img src="${escapeHtml(profile.dp)}" alt="${escapeHtml(profile.name)}">` : `<b>${escapeHtml(initials(profile.name))}</b>`;
    });
    const title = shell.querySelector("#nxProfileTitle");
    if (title) title.textContent = profile.name;
    applyEmployeeFormScope(profile);
  };

  shell.querySelectorAll(".nx-menu,.nx-grid-menu,.nx-manage").forEach(button => { button.onclick = () => setOpen(!shell.classList.contains("open")); });
  shell.querySelector(".nx-close").onclick = () => setOpen(false);
  shell.querySelector(".nx-shade").onclick = () => { setOpen(false); setProfileOpen(false); };
  shell.querySelectorAll(".nx-open-profile").forEach(button => { button.onclick = () => setProfileOpen(true); });
  shell.querySelector(".nx-profile-close").onclick = () => setProfileOpen(false);
  shell.querySelector(".nx-profile-cancel").onclick = () => setProfileOpen(false);
  shell.querySelectorAll("[data-admin-only='1']").forEach(link => {
    link.onclick = event => { event.preventDefault(); toast("This shortcut is visible, but only an Admin can open it."); };
  });

  let pendingPhoto = profile.dp;
  shell.querySelector("#nxProfilePhoto").onchange = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 900000) { toast("Please select a profile image smaller than 900 KB."); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { pendingPhoto = String(reader.result || ""); updateShellProfile({ ...profile, dp: pendingPhoto }); };
    reader.readAsDataURL(file);
  };
  shell.querySelector(".nx-profile-save").onclick = () => {
    const value = id => safe(shell.querySelector(`#${id}`)?.value);
    if (!value("nxProfileName")) { toast("Full Name is required."); return; }
    if (value("nxProfileEmail") && !/^\S+@\S+\.\S+$/.test(value("nxProfileEmail"))) { toast("Enter a valid official email."); return; }
    const next = saveProfile({
      name: value("nxProfileName"), mobile: value("nxProfileMobile"), email: value("nxProfileEmail"),
      personalEmail: value("nxProfilePersonalEmail"), location: value("nxProfileLocation"),
      emergencyContact: value("nxProfileEmergency"), address: value("nxProfileAddress"),
      about: value("nxProfileAbout"), dp: pendingPhoto
    });
    updateShellProfile(next);
    setProfileOpen(false);
    toast("Profile saved and queued for Firebase sync.");
  };

  const applyTheme = dark => {
    document.documentElement.classList.toggle("nx-shell-dark", dark);
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("nexcrm_theme", dark ? "dark" : "light");
    shell.querySelector(".nx-theme i").className = `fa-solid ${dark ? "fa-sun" : "fa-moon"}`;
  };
  applyTheme(["dark", "1"].includes(localStorage.getItem("nexcrm_theme") || localStorage.getItem("nexcrmTheme")));
  shell.querySelector(".nx-theme").onclick = () => applyTheme(!document.documentElement.classList.contains("nx-shell-dark"));
  shell.querySelector(".nx-logout").onclick = async () => {
    try { if (window.NexCRMFirebase?.signOut) return window.NexCRMFirebase.signOut(); } catch {}
    localStorage.removeItem("nexcrm_session");
    localStorage.removeItem("nexcrm_logged_in");
    sessionStorage.removeItem("nexcrm_session");
    sessionStorage.removeItem("nexcrm_logged_in");
    location.assign(url("index.html"));
  };
  shell.querySelector(".nx-search input").oninput = event => {
    const query = lower(event.target.value);
    shell.querySelectorAll(".nx-nav-group").forEach(group => {
      let visible = 0;
      group.querySelectorAll(".nx-nav-link").forEach(link => {
        const show = !query || lower(link.textContent).includes(query);
        link.style.display = show ? "flex" : "none";
        if (show) visible++;
      });
      group.style.display = visible ? "block" : "none";
    });
  };
  document.addEventListener("keydown", event => { if (event.key === "Escape") { setOpen(false); setProfileOpen(false); } });
  window.addEventListener("nexcrm:profile-updated", event => updateShellProfile(event.detail || getProfile()));
  window.addEventListener("nexcrm:data-updated", () => {
    const status = shell.querySelector(".nx-status span:last-child");
    if (status) status.textContent = "Firebase Synced";
    setTimeout(() => { if (status) status.textContent = `${isAdmin ? "Admin" : "Employee"} Active`; }, 1800);
  });
}

function mountNativeBackup() {
  if (!isAdminSession() || document.querySelector(".nx-native-backup")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nx-native-backup";
  button.innerHTML = `${icon("fa-download")}<span><b>Complete Backup</b><small>All NexCRM local data</small></span>`;
  button.onclick = () => location.assign(url("nexcrm-local-backup.html"));
  document.body.appendChild(button);
}

if (document.documentElement.dataset.nexcrmNativeShell !== "true") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountNativeBackup);
} else {
  mountNativeBackup();
}
window.dispatchEvent(new CustomEvent("nexcrm:access-ready", { detail: { profile: getProfile(), admin: isAdminSession() } }));
if (/\/mis\.html$/i.test(location.pathname) && typeof window.renderTable === "function") {
  setTimeout(() => window.renderTable(), 0);
  setTimeout(() => window.renderTable(), 600);
}
