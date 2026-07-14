(function(){
  'use strict';
  const ADMIN_EMAIL='abhinav.sirohi@nexfund.in';
  const ALLOWED_EMPLOYEE_IDS=new Set(['E-TL001','E-SM001','E-TC001']);
  const ALLOWED_NAMES=new Set(['Abhinav Sirohi','Niraj Kumar Jha','Naina']);
  const LOCAL_ONLY_KEYS=new Set([
    'nexcrm_session','nexcrm_logged_in','nexcrm_admin_session','nexcrm_last_requested_portal',
    'nexcrmTheme','nexcrm_theme','nexcrm-theme','nexcrm-finance-theme','nexcrm_finance_theme',
    'nexcrmDdrTheme','nexcrm-mis-theme','nexcrm-policy-theme','emp-cost-theme','hrms_payslip_theme',
    'nexcrm_admin_sidebar_collapsed_v3','nexcrm-bankcat-api-base','mca-api-base'
  ]);
  const KEY_PATHS={
    nexcrmLeads:'leads',
    nexcrm_sheet_leads:'leads',
    nexcrm_mis_cases:'mis',
    nexcrmDetailsheets:'detailsheets',
    nexcrm_detailsheets:'detailsheets',
    nexcrmObligations:'obligations',
    nexcrm_obligations:'obligations',
    nexcrm_dashboard_stats:'dashboardStats',
    nexcrm_activity_logs:'activityLogs',
    nexcrm_admin_employees_v1:'hrms/employees',
    nexcrm_employee_master_final_custom:'hrms/employees',
    nexcrm_employee_master_v1:'hrms/employees',
    nexcrm_deleted_employee_details:'hrms/deletedEmployees',
    nexcrm_joining_forms_v1:'hrms/joiningForms',
    nexcrm_offer_letters_v1:'hrms/offerLetters',
    nexcrm_payslips_v1:'hrms/payslips',
    nexcrm_attendance_premium_previous_theme_v2:'hrms/attendance',
    nexcrm_employee_costing_entries_v4:'hrms/employeeCosting',
    nexcrm_ddr_mdr_v1:'hrms/ddrMdr',
    nexcrm_vault_v1:'hrms/vault',
    nexcrm_pending_leaves:'hrms/leaves',
    nexcrm_payslip_count:'hrms/payslipSummary',
    nexcrm_authorized_signature:'hrms/assets/authorizedSignature',
    nexfund_company_logo:'hrms/assets/companyLogo',
    nexfund_employee_signature:'hrms/assets/employeeSignature',
    nexhrms_payslip_company_name:'hrms/settings/payslipCompanyName',
    nexhrms_payslip_office_address:'hrms/settings/payslipOfficeAddress',
    nexcrm_profile_details:'profiles/current/details',
    nexcrm_profile_dp:'profiles/current/photo',
    nexcrm_admin_dp:'profiles/admin/photo',
    nexcrm_admin_name:'profiles/admin/name',
    nexcrm_employee_master_profile_cache:'profiles/current/employeeMaster',
    nexcrm_login_config_v1:'portal/settings/loginConfig',
    nexcrm_dropdown_manager_v1:'portal/settings/dropdowns',
    nexcrm_status_values:'portal/settings/statusValues',
    nexcrm_product_names:'portal/settings/productNames',
    nexcrm_bank_names:'portal/settings/bankNames'
  };
  const PREFIX_PATHS=[
    ['nexcrm_offer_share_emp_','hrms/offerLetters/byEmployee'],
    ['nexcrm_cibil_v3_draft_','obligations/drafts'],
    ['nexcrm_form_autosave_','personal/formAutosave'],
    ['nexcrm_recent_','personal/recent']
  ];
  const SYNC_PREFIXES=['nexcrm_','nexcrm-','nexfund_','nexhrms_','hrms_'];
  const state={ready:false,hydrating:false,db:null,auth:null,user:null,role:'',listeners:[],writeTimer:null,queue:new Map()};
  const native={setItem:localStorage.setItem.bind(localStorage),removeItem:localStorage.removeItem.bind(localStorage),clear:localStorage.clear.bind(localStorage)};
  const safe=s=>String(s||'').trim();
  const lower=s=>safe(s).toLowerCase();
  const keyId=key=>encodeURIComponent(String(key)).replace(/\./g,'%2E');
  const fromKeyId=id=>decodeURIComponent(String(id));
  function cfg(){return window.NEXCRM_FIREBASE_CONFIG||{};}
  function pathForKey(key){
    if(KEY_PATHS[key])return KEY_PATHS[key]+'/localStorage';
    for(const [prefix,path] of PREFIX_PATHS){if(String(key).startsWith(prefix))return path+'/'+keyId(String(key).slice(prefix.length));}
    if(SYNC_PREFIXES.some(prefix=>String(key).startsWith(prefix)))return 'shared/localStorage/'+keyId(key);
    return '';
  }
  function isSyncKey(key){return !!key && !LOCAL_ONLY_KEYS.has(key) && !!pathForKey(key);}
  function cleanEmployeeId(id){return safe(id).replace(/[^a-z0-9._-]/gi,'').toUpperCase();}
  function normalizeEmployees(rows){return rows;}
  function normalizeLoginConfig(cfg){return cfg&&typeof cfg==='object'?JSON.parse(JSON.stringify(cfg)):cfg;}
  function normalizeValue(key,value){
    try{
      if(key==='nexcrm_login_config_v1')return JSON.stringify(normalizeLoginConfig(JSON.parse(value||'{}')));
      if(['nexcrm_admin_employees_v1','nexcrm_employee_master_final_custom','nexcrm_employee_master_v1'].includes(key))return JSON.stringify(normalizeEmployees(JSON.parse(value||'[]')));
    }catch(e){}
    return value;
  }
  function getLoginConfig(){try{return JSON.parse(localStorage.getItem('nexcrm_login_config_v1')||'{}')}catch(e){return {}}}
  function configuredAdmins(){const c=getLoginConfig();const admins=Array.isArray(c.admins)?c.admins:[];const legacy=c.admin||{};return [...admins,{username:legacy.credential||legacy.username||'Admin',email:ADMIN_EMAIL}];}
  function configuredEmployees(){const c=getLoginConfig();return Array.isArray(c.employees)?c.employees:[];}
  function isAdminCredential(v){const raw=lower(v);if(raw===lower(ADMIN_EMAIL)||raw==='admin')return true;return configuredAdmins().some(a=>[a.username,a.credential,a.email,a.employeeId].some(x=>lower(x)===raw));}
  function isEmployeeCredential(v){const raw=lower(v);return configuredEmployees().some(e=>[e.username,e.employeeId,e.id,e.email,e.mobile].some(x=>lower(x)===raw));}
  function credentialToEmail(credential,mode){const raw=safe(credential);if(raw.includes('@'))return raw.toLowerCase();if(mode==='admin'&&lower(raw)==='admin')return ADMIN_EMAIL;return lower(raw)+'@nexfund.in';}
  function localSession(role,user,remember){const now=new Date().toISOString();return {user:user.email||user.uid||user.credential||'',uid:user.uid||'',email:user.email||'',displayName:user.displayName||user.name||user.email||user.credential||'',employeeId:user.employeeId||user.credential||'',credential:user.credential||'',role:role==='admin'?'Admin':'Employee',loginAt:now,lastActivity:now,persistent:!!remember,firebase:!!user.uid};}
  function clearLocalSession(){native.removeItem('nexcrm_session');native.removeItem('nexcrm_logged_in');sessionStorage.removeItem('nexcrm_session');sessionStorage.removeItem('nexcrm_logged_in');}
  function setLocalSession(role,user,remember){clearLocalSession();const s=localSession(role,user,remember);(remember?localStorage:sessionStorage).setItem('nexcrm_session',JSON.stringify(s));localStorage.setItem('nexcrm_logged_in','true');return s;}
  function refForKey(key){const p=pathForKey(key);return p&&state.db?state.db.ref(p):null;}
  function dispatch(key,oldValue,newValue,source){try{window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage,url:location.href}))}catch(e){}window.dispatchEvent(new CustomEvent('nexcrm:data-updated',{detail:{key,oldValue,newValue,source}}));}
  function applyLocal(key,value,source){const old=localStorage.getItem(key);state.hydrating=true;try{value==null?native.removeItem(key):native.setItem(key,String(normalizeValue(key,value)));}finally{state.hydrating=false;}const now=localStorage.getItem(key);if(old!==now)dispatch(key,old,now,source||'rtdb');}
  function queueWrite(key,value,removed){if(state.hydrating||!isSyncKey(key))return;const p=pathForKey(key);state.queue.set(key,{path:p,key,value:normalizeValue(key,String(value??'')),removed});if(state.db){clearTimeout(state.writeTimer);state.writeTimer=setTimeout(flushWrites,250);}}
  async function flushWrites(){if(!state.db||!state.queue.size)return;const updates={};[...state.queue.values()].forEach(item=>{updates[item.path]=item.removed?null:{key:item.key,value:item.value,updatedAt:new Date().toISOString(),updatedBy:state.user&&state.user.uid||'',updatedByEmail:state.user&&state.user.email||''};});state.queue.clear();try{await state.db.ref().update(updates);}catch(e){console.warn('NexCRM Realtime DB write failed',e);}}
  async function loadKey(key){await init();const ref=refForKey(key);if(!ref)return false;try{const snap=await ref.once('value');const val=snap.val();if(val&&Object.prototype.hasOwnProperty.call(val,'value')){applyLocal(key,val.value,'rtdb-load');return true;}applyLocal(key,null,'rtdb-empty');}catch(e){console.warn('NexCRM Realtime DB load failed',key,e);}return false;}
  async function pullFirestoreToLocal(){return pullRealtimeToLocal();}
  async function pullRealtimeToLocal(){await init();if(!state.db)return 0;let count=0;const keys=Object.keys(KEY_PATHS);for(const key of keys){if(await loadKey(key))count++;}return count;}
  async function migrateLocalStorageToFirestore(){return migrateLocalStorageToRealtime();}
  async function migrateLocalStorageToRealtime(){await init();if(!state.db)throw new Error('Firebase Realtime Database is not available.');let count=0;for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!isSyncKey(key))continue;queueWrite(key,localStorage.getItem(key),false);count++;}await flushWrites();return count;}
  async function readArray(key){await loadKey(key);try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
  async function getRole(user,credential){if(!user&&!credential)return '';if(isAdminCredential(credential)||isAdminCredential(user&&user.email))return 'admin';if(isEmployeeCredential(credential)||isEmployeeCredential(user&&user.email))return 'employee';return (user&&lower(user.email)===lower(ADMIN_EMAIL))?'admin':'employee';}
  async function signInWithRole(credential,password,mode,remember){await init();if(!state.auth)throw new Error('Firebase Auth is not available.');const requested=mode==='admin'?'admin':'employee';const email=credentialToEmail(credential,requested);await state.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);const result=await state.auth.signInWithEmailAndPassword(email,password);const actual=await getRole(result.user,credential);if(requested==='admin'&&actual!=='admin'){await state.auth.signOut();clearLocalSession();throw new Error('Access denied: this credential is not allowed for Admin Portal.');}if(requested==='employee'&&actual==='admin'){await state.auth.signOut();clearLocalSession();throw new Error('Access denied: admin credential cannot open Employee Portal.');}state.user=result.user;state.role=actual;setLocalSession(actual,result.user,remember);await pullRealtimeToLocal();return {user:result.user,role:actual,email:result.user.email||email};}
  async function activateConfiguredCredential(credential,password,mode,remember){await init();if(!state.auth)throw new Error('Firebase Auth is not available.');const email=credentialToEmail(credential,mode);try{return await signInWithRole(credential,password,mode,remember);}catch(err){if(!(err&&err.code==='auth/user-not-found'))throw err;}await state.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);const result=await state.auth.createUserWithEmailAndPassword(email,password);try{await result.user.updateProfile({displayName:safe(credential)})}catch(e){}state.user=result.user;state.role=mode==='admin'?'admin':'employee';setLocalSession(state.role,result.user,remember);await state.db.ref('roles/'+result.user.uid).set({role:state.role,admin:state.role==='admin',credential:safe(credential),email,updatedAt:new Date().toISOString()});return {user:result.user,role:state.role,email,created:true};}
  async function signInWithGoogle(mode,remember){await init();if(!state.auth)throw new Error('Firebase Auth is not available.');const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await state.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);const result=await state.auth.signInWithPopup(provider);state.user=result.user;state.role=mode==='admin'?'admin':'employee';await pullRealtimeToLocal();return {user:result.user,role:state.role,email:result.user.email||''};}
  async function signOutAndRedirect(){try{await init();if(state.auth)await state.auth.signOut();}catch(e){}clearLocalSession();location.href=rootIndexPath();}
  function rootIndexPath(){return location.pathname.includes('/Admin%20Portal%20CRM%20NexFund/')||location.pathname.includes('/Admin Portal CRM NexFund/')||location.pathname.includes('/Bank%20Company%20Check%20Tool')||location.pathname.includes('/Pincode%20Tool')||location.pathname.includes('/FRP%20List')||location.pathname.includes('/Policy/')?'../index.html':'index.html';}
  function protect(role){const s=JSON.parse(localStorage.getItem('nexcrm_session')||sessionStorage.getItem('nexcrm_session')||'null');if(!s||lower(s.role)!==lower(role)){clearLocalSession();location.href=rootIndexPath();return false;}return true;}
  function protectAny(){const s=JSON.parse(localStorage.getItem('nexcrm_session')||sessionStorage.getItem('nexcrm_session')||'null');if(!s){location.href=rootIndexPath();return false;}return true;}
  function startListeners(){Object.keys(KEY_PATHS).forEach(key=>{const ref=refForKey(key);if(!ref)return;const cb=snap=>{const val=snap.val();if(val&&Object.prototype.hasOwnProperty.call(val,'value'))applyLocal(key,val.value,'rtdb-snapshot');else applyLocal(key,null,'rtdb-delete');};ref.on('value',cb);state.listeners.push(()=>ref.off('value',cb));});}
  async function init(){if(state.ready)return state;state.ready=true;if(!window.firebase||!firebase.initializeApp){state.ready=false;throw new Error('Firebase SDK must load before NexCRM data adapter.');}try{if(!firebase.apps.length)firebase.initializeApp(cfg());state.auth=firebase.auth?firebase.auth():null;state.db=firebase.database?firebase.database():null;if(!state.db)throw new Error('Firebase Realtime Database SDK is not available.');if(state.auth){state.auth.onAuthStateChanged(async user=>{state.user=user||null;state.role=user?await getRole(user):'';state.listeners.forEach(fn=>{try{fn()}catch(e){}});state.listeners=[];if(user&&state.db){state.queue.clear();await pullRealtimeToLocal();startListeners();}window.dispatchEvent(new CustomEvent('nexcrm:auth-ready',{detail:{user:state.user,role:state.role,database:'realtime'}}));});}}catch(e){state.ready=false;console.error('NexCRM Firebase RTDB init failed',e);throw e;}return state;}
  localStorage.setItem=function(key,value){native.setItem(key,value);queueWrite(String(key),value,false);};
  localStorage.removeItem=function(key){native.removeItem(key);queueWrite(String(key),'',true);};
  window.NexCRMFirebase={init,signInWithRole,activateConfiguredCredential,signInWithGoogle,signOut:signOutAndRedirect,protect,protectAny,migrateLocalStorageToFirestore,pullFirestoreToLocal,migrateLocalStorageToRealtime,pullRealtimeToLocal,loadKey,readArray,getRole:()=>state.role,adminEmail:ADMIN_EMAIL,isSyncKey,setLocalSession};
  init();
})();
