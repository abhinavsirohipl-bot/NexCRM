(function(){
  'use strict';
  const ADMIN_EMAIL='abhinav.sirohi@nexfund.in';
  const ACCESS_LEVELS=new Set(['employee','limited_admin','admin','super_admin']);
  const PERMISSION_KEYS=['viewDashboard','viewAllData','manageLeads','manageMIS','manageCustomers','manageHRMS','manageReports','manageEmployees','manageSettings','manageAccess','exportData','editOwnProfile'];
  const ROLE_PERMISSIONS={
    employee:{viewDashboard:true,editOwnProfile:true},
    limited_admin:{viewDashboard:true,manageLeads:true,manageMIS:true,manageCustomers:true,manageReports:true,editOwnProfile:true},
    admin:Object.fromEntries(PERMISSION_KEYS.map(key=>[key,true])),
    super_admin:Object.fromEntries(PERMISSION_KEYS.map(key=>[key,true]))
  };
  const LOCAL_ONLY_KEYS=new Set([
    'nexcrm_session','nexcrm_logged_in','nexcrm_admin_session','nexcrm_last_requested_portal',
    'nexcrmTheme','nexcrm_theme','nexcrm-theme','nexcrm-finance-theme','nexcrm_finance_theme',
    'nexcrmDdrTheme','nexcrm-mis-theme','nexcrm-policy-theme','emp-cost-theme','hrms_payslip_theme',
    'nexcrm_admin_sidebar_collapsed_v3','nexcrm-bankcat-api-base','mca-api-base'
  ]);
  const KEY_PATHS={
    nexcrmLeads:'leads',
    nexcrm_sheet_leads:'leads',
    nexcrm_leads:'leads',
    crm_leads:'leads',
    nexcrm_lead_master:'leads',
    nexcrmLeadMaster:'leads',
    nexcrm_mis_cases:'mis',
    nexcrm_mis_cases_v1:'mis',
    nexcrm_mis_leads:'mis',
    nexcrm_mis_data:'mis',
    nexcrmMIS:'mis',
    nexcrm_mis:'mis',
    nexcrm_sheet_mis:'mis',
    nexcrmDetailsheets:'detailsheets',
    nexcrm_detailsheets:'detailsheets',
    nexcrm_customer_detailsheets:'detailsheets',
    nexcrmObligations:'obligations',
    nexcrm_obligations:'obligations',
    nexcrm_obligation_sheet:'obligations',
    nexcrm_dashboard_stats:'dashboardStats',
    nexcrm_activity_logs:'activityLogs',
    nexcrm_recent_activities:'activityLogs',
    nexcrm_admin_employees_v1:'hrms/employees',
    nexcrm_employee_master_final_custom:'hrms/employees',
    nexcrm_employee_master_v1:'hrms/employees',
    nexcrm_employee_add:'hrms/employees',
    nexcrm_employee_add_records:'hrms/employees',
    nexcrm_employees:'hrms/employees',
    nexcrm_employee_records:'hrms/employees',
    nexcrm_employee_master:'hrms/employees',
    nexcrm_hr_employees:'hrms/employees',
    nexcrmEmployees:'hrms/employees',
    nexcrmEmployeesMaster:'hrms/employees',
    employeeMaster:'hrms/employees',
    employeeList:'hrms/employees',
    employees:'hrms/employees',
    Employees:'hrms/employees',
    staffList:'hrms/employees',
    staff_records:'hrms/employees',
    nexcrm_deleted_employee_details:'hrms/deletedEmployees',
    nexcrm_joining_forms_v1:'hrms/joiningForms',
    nexcrm_offer_letters_v1:'hrms/offerLetters',
    nexcrm_payslips_v1:'hrms/payslips',
    nexcrm_attendance_premium_previous_theme_v2:'hrms/attendance',
    nexcrm_attendance_rows:'hrms/attendance',
    nexcrm_attendance_data:'hrms/attendance',
    nexcrm_attendance:'hrms/attendance',
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
    nexcrm_employee_profiles_v1:'profiles/employees',
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
  const CANONICAL_KEYS={
    'leads/localStorage':'nexcrmLeads',
    'mis/localStorage':'nexcrm_mis_cases',
    'detailsheets/localStorage':'nexcrmDetailsheets',
    'obligations/localStorage':'nexcrmObligations',
    'activityLogs/localStorage':'nexcrm_activity_logs',
    'hrms/employees/localStorage':'nexcrm_employee_master_final_custom',
    'hrms/attendance/localStorage':'nexcrm_attendance_premium_previous_theme_v2'
  };
  const EMPLOYEE_MASTER_KEYS=new Set(Object.keys(KEY_PATHS).filter(key=>KEY_PATHS[key]==='hrms/employees'));
  const state={ready:false,hydrating:false,db:null,auth:null,user:null,role:'',access:null,listeners:[],writeTimer:null,queue:new Map()};
  const native={setItem:localStorage.setItem.bind(localStorage),removeItem:localStorage.removeItem.bind(localStorage),clear:localStorage.clear.bind(localStorage)};
  const safe=s=>String(s||'').trim();
  const lower=s=>safe(s).toLowerCase();
  const clone=value=>JSON.parse(JSON.stringify(value));
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
  function normalizeAccessLevel(value,row){
    const raw=lower(value||row&&row.accessLevel||row&&row.role).replace(/[\s-]+/g,'_');
    if(raw==='superadmin')return 'super_admin';
    if(raw==='limitedadmin')return 'limited_admin';
    if(ACCESS_LEVELS.has(raw))return raw;
    return row&&(row.admin===true||lower(row.role)==='admin')?'admin':'employee';
  }
  function defaultPassword(row){
    const name=safe(row&&[row.name,row.employeeName,row.employee_name,row.displayName].find(Boolean));
    const first=(name.split(/\s+/)[0]||'User').replace(/[^a-z]/gi,'').slice(0,4)||'User';
    const word=first.charAt(0).toUpperCase()+first.slice(1).toLowerCase();
    const rawDob=safe(row&&[row.dob,row.dateOfBirth,row.date_of_birth,row.birthDate].find(Boolean));
    const id=safe(row&&[row.employeeId,row.employee_id,row.id,row.username,row.credential].find(Boolean));
    const year=(rawDob.match(/(19|20)\d{2}/)||id.match(/(19|20)\d{2}/)||[''])[0];
    const fallback=(id.match(/(\d+)$/)||['','001'])[1];
    return '@'+word+(year||fallback);
  }
  function userIdFor(row,index){
    const raw=safe(row&&[row.username,row.employeeId,row.employee_id,row.id,row.credential,row.code].find(Boolean)||('E-'+String((index||0)+1).padStart(3,'0')));
    return cleanEmployeeId(raw)||raw.toUpperCase();
  }
  function accessKeyFor(row){
    const raw=plainObject(row)?safe(row.username||row.employeeId||row.id):safe(row);
    return raw.replace(/[^a-z0-9]/gi,'').toUpperCase();
  }
  function authEmailFor(row,index){
    const explicit=lower(row&&[row.authEmail,row.firebaseEmail].find(Boolean));
    if(explicit.includes('@'))return explicit;
    const email=lower(row&&[row.email,row.officialMail,row.officialEmail].find(Boolean));
    if(email.endsWith('@nexfund.in'))return email;
    const username=userIdFor(row,index);
    if(lower(username)==='admin')return ADMIN_EMAIL;
    return lower(username)+'@nexfund.in';
  }
  function permissionsFor(level,custom){
    const normalized=normalizeAccessLevel(level);
    const base=Object.assign({},ROLE_PERMISSIONS[normalized]||ROLE_PERMISSIONS.employee);
    if(normalized==='limited_admin'&&plainObject(custom))PERMISSION_KEYS.forEach(key=>{if(typeof custom[key]==='boolean')base[key]=custom[key]});
    if(normalized==='employee')base.editOwnProfile=true;
    return Object.fromEntries(PERMISSION_KEYS.map(key=>[key,base[key]===true]));
  }
  function normalizeEmployee(row,index){
    const source=plainObject(row)?row:{};
    const username=userIdFor(source,index);
    const employeeId=safe(source.employeeId||source.employee_id||source.id||source.code||username);
    const authEmail=authEmailFor(Object.assign({},source,{username}),index);
    let accessLevel=normalizeAccessLevel(source.accessLevel||source.role,source);
    if(lower(authEmail)===lower(ADMIN_EMAIL)||lower(username)==='admin')accessLevel='super_admin';
    const normalized={
      employeeId,username,authEmail,
      password:safe(source.password||source.initialPassword||defaultPassword(Object.assign({},source,{employeeId,username}))),
      name:safe(source.name||source.employeeName||source.employee_name||source.displayName||username),
      email:safe(source.email||source.officialMail||source.officialEmail),mobile:safe(source.mobile||source.phone||source.contact),dob:safe(source.dob||source.dateOfBirth||source.date_of_birth),
      accessLevel,permissions:permissionsFor(accessLevel,source.permissions),active:source.active!==false&&!['inactive','leave the job','terminated','deleted'].includes(lower(source.status)),uid:safe(source.uid),updatedAt:safe(source.updatedAt)
    };
    normalized.role=accessLevel==='employee'?'Employee':'Admin';
    normalized.admin=accessLevel!=='employee';
    return normalized;
  }
  function mergeEmployeeList(rows){
    const map=new Map();
    (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
      const normalized=normalizeEmployee(row,index);const key=lower(normalized.employeeId||normalized.username||normalized.authEmail);
      const current=map.get(key);
      map.set(key,current?normalizeEmployee(Object.assign({},current,normalized,{permissions:Object.assign({},current.permissions,normalized.permissions)}),index):normalized);
    });
    return [...map.values()];
  }
  function normalizeEmployees(rows){return mergeEmployeeList(rows);}
  function mergeMasterRecord(current,incoming){
    if(!current)return incoming;if(!incoming)return current;
    const incomingIsNewer=rowTime(incoming)>=rowTime(current),preferred=incomingIsNewer?incoming:current,fallback=incomingIsNewer?current:incoming;
    const result=Object.assign({},fallback);
    Object.entries(preferred).forEach(([key,value])=>{if(value!==undefined&&value!==null&&(value!==''||!(key in result)))result[key]=value;});
    return result;
  }
  function normalizeEmployeeMaster(row,index){
    if(!plainObject(row))return null;
    const source=clone(row),id=safe(source.id||source.employeeId||source.employee_id||source.code||source.empCode||source.username);
    if(!id)return null;
    const status=safe(source.status||source.employeeStatus||'Active')||'Active';
    return Object.assign({},source,{
      id,employeeId:id,
      name:safe(source.name||source.employeeName||source.employee_name||source.fullName||id),
      department:safe(source.department||source.Department),designation:safe(source.designation||source.Designation),
      manager:safe(source.manager||source.reportingManager||source.reporting_manager||source['Reporting Manager']),
      officialMail:safe(source.officialMail||source.officialEmail||source.official_email||source.workEmail),
      email:safe(source.email||source.personalEmail),mobile:safe(source.mobile||source.phone||source.contact),
      dob:safe(source.dob||source.dateOfBirth||source.date_of_birth),status,
      active:source.active!==false&&!['inactive','leave the job','terminated','deleted'].includes(lower(status))
    });
  }
  function normalizeEmployeeMasterList(rows){
    const map=new Map(),order=[];
    (Array.isArray(rows)?rows:[]).forEach((row,index)=>{const normalized=normalizeEmployeeMaster(row,index);if(!normalized)return;const key=lower(cleanEmployeeId(normalized.id)||normalized.id);if(!map.has(key))order.push(key);map.set(key,mergeMasterRecord(map.get(key),normalized));});
    return order.map(key=>map.get(key));
  }
  function normalizeLoginConfig(raw){
    const cfg=plainObject(raw)?clone(raw):{};
    const rows=Array.isArray(cfg.employees)?cfg.employees.slice():[];
    const legacyAdmins=Array.isArray(cfg.admins)?cfg.admins.slice():[];
    if(plainObject(cfg.admin)&&(cfg.admin.credential||cfg.admin.username))legacyAdmins.push(cfg.admin);
    legacyAdmins.forEach((admin,index)=>rows.push(Object.assign({},admin,{employeeId:admin.employeeId||admin.id||admin.username||admin.credential||('ADMIN'+(index+1)),username:admin.username||admin.credential,accessLevel:'admin',admin:true})));
    let employees=mergeEmployeeList(rows);
    const ownerIndex=employees.findIndex(row=>lower(row.authEmail)===lower(ADMIN_EMAIL)||lower(row.username)==='admin'||row.accessLevel==='super_admin'||accessKeyFor(row)==='ETL001');
    const owner=normalizeEmployee({employeeId:'E-TL001',username:'Admin',authEmail:ADMIN_EMAIL,email:ADMIN_EMAIL,password:'Abhi1997',name:'Abhinav Sirohi',accessLevel:'super_admin',active:true},0);
    if(ownerIndex<0)employees.unshift(owner);else employees[ownerIndex]=normalizeEmployee(Object.assign({},employees[ownerIndex],{accessLevel:'super_admin',active:true}),ownerIndex);
    const adminRows=employees.filter(row=>row.accessLevel!=='employee').map(row=>({employeeId:row.employeeId,username:row.username,password:row.password,displayName:row.name,email:row.email||row.authEmail,authEmail:row.authEmail,active:row.active,accessLevel:row.accessLevel,permissions:row.permissions,uid:row.uid}));
    const primary=adminRows[0]||owner;
    return {
      version:2,updatedAt:safe(cfg.updatedAt),
      employee:Object.assign({role:'Employee',redirect:'employee-dashboard.html'},plainObject(cfg.employee)?cfg.employee:{}),
      admin:Object.assign({role:'Admin',redirect:'admin-dashboard.html'},plainObject(cfg.admin)?cfg.admin:{},{credential:primary.username,password:primary.password}),
      employees,admins:adminRows
    };
  }
  function normalizeValue(key,value){
    try{
      if(key==='nexcrm_login_config_v1')return JSON.stringify(normalizeLoginConfig(JSON.parse(value||'{}')));
      if(EMPLOYEE_MASTER_KEYS.has(key))return JSON.stringify(normalizeEmployeeMasterList(JSON.parse(value||'[]')));
    }catch(e){}
    return value;
  }
  function storageString(value){
    if(typeof value==='string')return value;
    try{return JSON.stringify(value)}catch(e){return String(value??'')}
  }
  function parseStored(value){
    if(typeof value!=='string')return value;
    try{return JSON.parse(value)}catch(e){return value}
  }
  function plainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function stableString(value){
    if(!plainObject(value))return JSON.stringify(value);
    const out={};Object.keys(value).sort().forEach(key=>{out[key]=value[key]});
    try{return JSON.stringify(out)}catch(e){return String(value)}
  }
  function rowIdentity(row){
    if(!plainObject(row))return typeof row+':'+String(row);
    const fields=['id','leadId','nexId','NexID','referenceNo','caseId','customerId','employeeId','employee_id','empId','empCode','employeeCode','code','uid','email','officialEmail','mobile','phone'];
    for(const field of fields){const value=safe(row[field]);if(value)return field+':'+lower(value);}
    const name=safe(row.customerName||row.employeeName||row.name);const date=safe(row.createdAt||row.date||row.loginDate||row.disbursementDate);
    if(name)return 'name:'+lower(name)+'|date:'+lower(date);
    return 'json:'+stableString(row);
  }
  function rowTime(row){
    if(!plainObject(row))return 0;
    const raw=row.updatedAt||row.modifiedAt||row.lastUpdated||row.createdAt||row.date||'';
    const time=Date.parse(raw);return Number.isFinite(time)?time:0;
  }
  function mergeRows(remoteRows,localRows){
    const map=new Map();
    [...remoteRows,...localRows].forEach(row=>{
      const token=rowIdentity(row);const current=map.get(token);
      if(!current||rowTime(row)>=rowTime(current))map.set(token,row);
    });
    return [...map.values()];
  }
  function mergeStorageValues(key,localValue,remoteValue){
    if(localValue==null||localValue==='')return storageString(remoteValue);
    if(remoteValue==null||remoteValue==='')return storageString(localValue);
    const localParsed=parseStored(localValue);const remoteParsed=parseStored(remoteValue);
    if(key==='nexcrm_login_config_v1'&&plainObject(localParsed)&&plainObject(remoteParsed)){
      const localCfg=normalizeLoginConfig(localParsed),remoteCfg=normalizeLoginConfig(remoteParsed);
      const localTime=Date.parse(localCfg.updatedAt||0)||0,remoteTime=Date.parse(remoteCfg.updatedAt||0)||0;
      return JSON.stringify(localTime>remoteTime?localCfg:remoteCfg);
    }
    if(EMPLOYEE_MASTER_KEYS.has(key)&&Array.isArray(localParsed)&&Array.isArray(remoteParsed))return JSON.stringify(normalizeEmployeeMasterList([...remoteParsed,...localParsed]));
    if(Array.isArray(localParsed)&&Array.isArray(remoteParsed))return JSON.stringify(mergeRows(remoteParsed,localParsed));
    if(plainObject(localParsed)&&plainObject(remoteParsed))return JSON.stringify(Object.assign({},localParsed,remoteParsed));
    return storageString(remoteValue);
  }
  function snapshotStorage(snapshot){
    if(!snapshot||typeof snapshot!=='object')return {};
    if(snapshot.localStorageRaw&&plainObject(snapshot.localStorageRaw))return snapshot.localStorageRaw;
    if(snapshot.localStorage&&plainObject(snapshot.localStorage))return snapshot.localStorage;
    if(snapshot.localStorageParsed&&plainObject(snapshot.localStorageParsed))return snapshot.localStorageParsed;
    return snapshot;
  }
  function snapshotUpdates(snapshot,user){
    const grouped=new Map();
    Object.entries(snapshotStorage(snapshot)).forEach(([key,value])=>{
      if(!isSyncKey(key))return;
      const path=pathForKey(key);const raw=normalizeValue(key,storageString(value));const existing=grouped.get(path);
      if(existing){existing.value=mergeStorageValues(existing.key,raw,existing.value);return;}
      grouped.set(path,{key:CANONICAL_KEYS[path]||key,value:raw});
    });
    const updates={};const now=new Date().toISOString();
    grouped.forEach((item,path)=>{updates[path]={key:item.key,value:normalizeValue(item.key,item.value),deleted:false,updatedAt:now,updatedBy:user&&user.uid||'',updatedByEmail:user&&user.email||''};});
    return updates;
  }
  function getLoginConfig(){try{return normalizeLoginConfig(JSON.parse(localStorage.getItem('nexcrm_login_config_v1')||'{}'))}catch(e){return normalizeLoginConfig({})}}
  function configuredEmployees(){return getLoginConfig().employees||[];}
  function findConfiguredEmployee(value){
    const raw=lower(value),clean=lower(cleanEmployeeId(value));
    if(!raw)return null;
    return configuredEmployees().find(row=>[row.username,row.employeeId,row.email,row.authEmail,row.mobile].some(item=>lower(item)===raw||lower(cleanEmployeeId(item))===clean))||null;
  }
  function configuredAdmins(){return configuredEmployees().filter(row=>row.accessLevel!=='employee');}
  function isAdminCredential(v){const row=findConfiguredEmployee(v);return !!row&&row.accessLevel!=='employee';}
  function isEmployeeCredential(v){return !!findConfiguredEmployee(v);}
  function credentialToEmail(credential){const raw=safe(credential);if(raw.includes('@'))return raw.toLowerCase();const row=findConfiguredEmployee(raw);if(row&&row.authEmail)return lower(row.authEmail);if(lower(raw)==='admin')return ADMIN_EMAIL;return lower(cleanEmployeeId(raw)||raw)+'@nexfund.in';}
  function isAdminAccess(access){return !!access&&['limited_admin','admin','super_admin'].includes(normalizeAccessLevel(access.accessLevel,access));}
  function sessionRole(access){return isAdminAccess(access)?'Admin':'Employee';}
  function localSession(access,user,remember,credential){
    const now=new Date().toISOString(),row=normalizeEmployee(access||{employeeId:credential,username:credential,email:user&&user.email},0);
    return {user:user&&user.email||user&&user.uid||row.authEmail||row.username,uid:user&&user.uid||row.uid||'',email:user&&user.email||row.authEmail||row.email||'',displayName:row.name||user&&user.displayName||row.username,employeeId:row.employeeId,credential:row.username||safe(credential),role:sessionRole(row),accessLevel:row.accessLevel,permissions:row.permissions,loginAt:now,lastActivity:now,persistent:!!remember,firebase:!!(user&&user.uid)};
  }
  function clearLocalSession(){native.removeItem('nexcrm_session');native.removeItem('nexcrm_logged_in');sessionStorage.removeItem('nexcrm_session');sessionStorage.removeItem('nexcrm_logged_in');}
  function setLocalSession(access,user,remember,credential){clearLocalSession();const s=localSession(access,user,remember,credential);(remember?localStorage:sessionStorage).setItem('nexcrm_session',JSON.stringify(s));localStorage.setItem('nexcrm_logged_in','true');return s;}
  function refForKey(key){const p=pathForKey(key);return p&&state.db?state.db.ref(p):null;}
  function dispatch(key,oldValue,newValue,source){try{window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage,url:location.href}))}catch(e){}window.dispatchEvent(new CustomEvent('nexcrm:data-updated',{detail:{key,oldValue,newValue,source}}));}
  function applyLocal(key,value,source){const old=localStorage.getItem(key);state.hydrating=true;try{value==null?native.removeItem(key):native.setItem(key,String(normalizeValue(key,value)));}finally{state.hydrating=false;}const now=localStorage.getItem(key);if(old!==now)dispatch(key,old,now,source||'rtdb');}
  function queueWrite(key,value,removed){
    if(state.hydrating||!isSyncKey(key))return;
    if(!state.auth||!state.auth.currentUser||!state.user||!state.access)return;
    const path=pathForKey(key);const existing=state.queue.get(path);let nextValue=normalizeValue(key,String(value??''));
    if(existing&&!existing.removed&&!removed&&existing.sourceKey!==key)nextValue=mergeStorageValues(key,nextValue,existing.value);
    state.queue.set(path,{path,key:CANONICAL_KEYS[path]||key,sourceKey:key,value:nextValue,removed:!!removed});
    if(state.db){clearTimeout(state.writeTimer);state.writeTimer=setTimeout(()=>flushWrites().catch(e=>console.warn('NexCRM Realtime DB write failed',e)),250);}
  }
  async function flushWrites(){
    if(!state.db||!state.auth||!state.auth.currentUser||!state.user||!state.access||!state.queue.size)return 0;
    const batch=[...state.queue.entries()];const updates={};const now=new Date().toISOString();state.queue.clear();
    batch.forEach(([path,item])=>{updates[path]=item.removed?{key:item.key,deleted:true,updatedAt:now,updatedBy:state.user&&state.user.uid||'',updatedByEmail:state.user&&state.user.email||''}:{key:item.key,value:item.value,deleted:false,updatedAt:now,updatedBy:state.user&&state.user.uid||'',updatedByEmail:state.user&&state.user.email||''};});
    try{await state.db.ref().update(updates);return batch.length;}catch(e){batch.forEach(([path,item])=>{if(!state.queue.has(path))state.queue.set(path,item)});throw e;}
  }
  async function loadKey(key){
    await init();const ref=refForKey(key);if(!ref)return false;
    if(!state.auth||!state.auth.currentUser||!state.user||!state.access)return false;
    try{
      const snap=await ref.once('value');const val=snap.val();
      if(val&&val.deleted===true){applyLocal(key,null,'rtdb-delete');return true;}
      if(val&&Object.prototype.hasOwnProperty.call(val,'value')){const merged=mergeStorageValues(key,localStorage.getItem(key),val.value);applyLocal(key,merged,'rtdb-load');return true;}
    }catch(e){console.warn('NexCRM Realtime DB load failed',key,e);}
    return false;
  }
  async function pullFirestoreToLocal(){return pullRealtimeToLocal();}
  async function pullRealtimeToLocal(){await init();if(!state.db)return 0;let count=0;const keys=Object.keys(KEY_PATHS);for(const key of keys){if(await loadKey(key))count++;}return count;}
  async function migrateLocalStorageToFirestore(){return migrateLocalStorageToRealtime();}
  async function migrateLocalStorageToRealtime(){
    await init();if(!state.db)throw new Error('Firebase Realtime Database is not available.');
    if(!state.auth||!state.auth.currentUser)throw new Error('Admin Firebase login required before upload.');
    const captured={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&isSyncKey(key))captured[key]=localStorage.getItem(key);}
    const updates=snapshotUpdates(captured,state.auth.currentUser);const count=Object.keys(updates).length;
    if(!count)throw new Error('No recognized NexCRM business data was found in this browser.');
    await state.db.ref().update(updates);return count;
  }
  async function migrateSnapshotToRealtime(snapshot,email,password){
    await init();
    if(!state.auth||!state.db)throw new Error('Firebase Authentication or Realtime Database is not available.');
    await state.auth.signInWithEmailAndPassword(safe(email).toLowerCase(),String(password||''));
    const updates=snapshotUpdates(snapshot,state.auth.currentUser);const count=Object.keys(updates).length;
    if(!count)throw new Error('No recognized NexCRM business data was found in this browser.');
    await state.db.ref().update(updates);
    await pullRealtimeToLocal();
    return count;
  }
  async function readArray(key){await loadKey(key);try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
  async function roleRecord(user){
    if(!state.db||!user||!user.uid)return null;
    try{const snap=await state.db.ref('roles/'+user.uid).once('value');return snap.val()||null}catch(e){return null}
  }
  async function accessRecordByEmployeeId(employeeId){
    const id=accessKeyFor(employeeId);if(!state.db||!id)return null;
    try{const snap=await state.db.ref('access/employees/'+id).once('value');const value=snap.val();return value?normalizeEmployee(value,0):null}catch(e){return null}
  }
  async function getUserAccess(user,credential){
    if(user&&lower(user.email)===lower(ADMIN_EMAIL))return normalizeEmployee({employeeId:'E-TL001',username:'Admin',authEmail:ADMIN_EMAIL,email:ADMIN_EMAIL,name:user.displayName||'Abhinav Sirohi',accessLevel:'super_admin',active:true,uid:user.uid},0);
    const role=await roleRecord(user);
    if(role&&role.employeeId){const byRole=await accessRecordByEmployeeId(role.employeeId);if(byRole)return Object.assign(byRole,{uid:user&&user.uid||byRole.uid});}
    const configured=findConfiguredEmployee(credential)||findConfiguredEmployee(user&&user.email);
    const id=accessKeyFor(configured||credential);
    const remote=await accessRecordByEmployeeId(id);
    if(remote&&user&&lower(remote.authEmail)!==lower(user.email))return null;
    const access=remote||configured;
    return access?normalizeEmployee(Object.assign({},access,{uid:user&&user.uid||access.uid}),0):null;
  }
  async function bootstrapRole(user,access){
    if(!state.db||!user||!access)return;
    const row=normalizeEmployee(access,0);
    const payload={employeeId:accessKeyFor(row),email:lower(user.email||row.authEmail),accessLevel:row.accessLevel,admin:isAdminAccess(row),updatedAt:new Date().toISOString()};
    try{await state.db.ref('roles/'+user.uid).set(payload)}catch(e){console.warn('NexCRM role bootstrap deferred',e)}
  }
  async function getRole(user,credential){const access=await getUserAccess(user,credential);return access?lower(sessionRole(access)):'';}
  async function signInWithRole(credential,password,mode,remember){
    await init();if(!state.auth)throw new Error('Firebase Auth is not available.');
    const requested=mode==='admin'?'admin':'employee',email=credentialToEmail(credential);
    await state.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);
    const result=await state.auth.signInWithEmailAndPassword(email,password);
    const access=await getUserAccess(result.user,credential);
    if(!access||access.active===false){await state.auth.signOut();clearLocalSession();throw new Error('This employee login is inactive or is not available in All Employees & Access Control.');}
    if(requested==='admin'&&!isAdminAccess(access)){await state.auth.signOut();clearLocalSession();throw new Error('Admin access is not allowed for this employee. Ask an Admin to change the employee access level.');}
    state.user=result.user;state.access=access;state.role=lower(sessionRole(access));
    await bootstrapRole(result.user,access);
    const session=setLocalSession(access,result.user,remember,credential);
    await pullRealtimeToLocal();
    return {user:result.user,role:state.role,email:result.user.email||email,access,session};
  }
  async function activateConfiguredCredential(credential,password,mode,remember){return signInWithRole(credential,password,mode,remember);}
  async function signInWithGoogle(mode,remember){
    await init();if(!state.auth)throw new Error('Firebase Auth is not available.');
    const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
    await state.auth.setPersistence(remember?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);
    const result=await state.auth.signInWithPopup(provider);const access=await getUserAccess(result.user,result.user.email);
    if(!access||access.active===false||(mode==='admin'&&!isAdminAccess(access))){await state.auth.signOut();clearLocalSession();throw new Error('This Google account does not have the selected NexCRM portal access.');}
    state.user=result.user;state.access=access;state.role=lower(sessionRole(access));await bootstrapRole(result.user,access);
    const session=setLocalSession(access,result.user,remember,result.user.email);await pullRealtimeToLocal();
    return {user:result.user,role:state.role,email:result.user.email||'',access,session};
  }
  function accessRecord(row){
    const normalized=normalizeEmployee(row,0);
    return {employeeId:normalized.employeeId,username:normalized.username,accessKey:accessKeyFor(normalized),authEmail:lower(normalized.authEmail),name:normalized.name,email:normalized.email,mobile:normalized.mobile,dob:normalized.dob,accessLevel:normalized.accessLevel,permissions:normalized.permissions,active:normalized.active,uid:normalized.uid,updatedAt:normalized.updatedAt||new Date().toISOString()};
  }
  async function loadAccessConfig(){await init();await loadKey('nexcrm_login_config_v1');const normalized=getLoginConfig();applyLocal('nexcrm_login_config_v1',JSON.stringify(normalized),'access-load');return normalized;}
  async function saveAccessConfig(input){
    await init();if(!state.db||!state.auth||!state.auth.currentUser)throw new Error('Admin Firebase login is required before access changes can be saved.');
    const normalized=normalizeLoginConfig(input);normalized.updatedAt=new Date().toISOString();
    normalized.employees=normalized.employees.map(row=>normalizeEmployee(Object.assign({},row,{updatedAt:normalized.updatedAt}),0));
    const records={};normalized.employees.forEach(row=>{records[accessKeyFor(row)]=accessRecord(row)});
    const wrapper={key:'nexcrm_login_config_v1',value:JSON.stringify(normalized),deleted:false,updatedAt:normalized.updatedAt,updatedBy:state.auth.currentUser.uid,updatedByEmail:state.auth.currentUser.email||''};
    const updates={'portal/settings/loginConfig/localStorage':wrapper,'access/employees':records};
    normalized.employees.filter(row=>row.uid).forEach(row=>{updates['roles/'+row.uid]={employeeId:accessKeyFor(row),email:lower(row.authEmail),accessLevel:row.accessLevel,admin:isAdminAccess(row),updatedAt:normalized.updatedAt}});
    await state.db.ref().update(updates);applyLocal('nexcrm_login_config_v1',JSON.stringify(normalized),'access-save');return normalized;
  }
  function applyEmployeeMasterLocal(rows,source){
    const normalized=normalizeEmployeeMasterList(rows),value=JSON.stringify(normalized);
    EMPLOYEE_MASTER_KEYS.forEach(key=>applyLocal(key,value,source||'employee-master'));
    window.dispatchEvent(new CustomEvent('nexcrm:employees-updated',{detail:{employees:clone(normalized),source:source||'employee-master'}}));
    return normalized;
  }
  async function readEmployeeMaster(){
    await init();await loadKey('nexcrm_employee_master_final_custom');
    let rows=[];try{rows=JSON.parse(localStorage.getItem('nexcrm_employee_master_final_custom')||'[]')}catch(e){}
    return applyEmployeeMasterLocal(rows,'employee-master-read');
  }
  async function saveEmployeeMaster(rows){
    await init();if(!state.db||!state.auth||!state.auth.currentUser)throw new Error('Admin Firebase login is required before employee details can be saved live.');
    const normalized=normalizeEmployeeMasterList(rows),value=JSON.stringify(normalized),now=new Date().toISOString();
    const wrapper={key:'nexcrm_employee_master_final_custom',value,deleted:false,updatedAt:now,updatedBy:state.auth.currentUser.uid,updatedByEmail:state.auth.currentUser.email||''};
    await state.db.ref('hrms/employees/localStorage').set(wrapper);applyEmployeeMasterLocal(normalized,'employee-master-save');return normalized;
  }
  async function syncEmployeeAccessFromMaster(input,options){
    const opts=Object.assign({provision:false},plainObject(options)?options:{}),masters=normalizeEmployeeMasterList(Array.isArray(input)?input:[input]);
    if(!masters.length)return {config:await loadAccessConfig(),employees:[],provisioned:[]};
    let config=await loadAccessConfig();const provisionQueue=[];
    masters.forEach((master,index)=>{
      const id=cleanEmployeeId(master.id||master.employeeId),username=userIdFor(Object.assign({},master,{employeeId:id}),index);
      const existingIndex=config.employees.findIndex(row=>cleanEmployeeId(row.employeeId)===id||cleanEmployeeId(row.username)===cleanEmployeeId(username));
      const existing=existingIndex>=0?config.employees[existingIndex]:null,owner=existing&&existing.accessLevel==='super_admin';
      const next=normalizeEmployee(Object.assign({},master,existing||{}, {
        employeeId:id,username:existing&&existing.username||username,authEmail:existing&&existing.authEmail||authEmailFor(Object.assign({},master,{employeeId:id,username}),index),
        password:existing&&existing.password||defaultPassword(Object.assign({},master,{employeeId:id,username})),
        name:master.name||existing&&existing.name||username,email:master.officialMail||master.email||existing&&existing.email||'',mobile:master.mobile||existing&&existing.mobile||'',dob:master.dob||existing&&existing.dob||'',
        accessLevel:owner?'super_admin':existing&&existing.accessLevel||'employee',permissions:existing&&existing.permissions,
        active:owner?true:master.active!==false,uid:existing&&existing.uid||'',updatedAt:new Date().toISOString()
      }),index);
      if(existingIndex>=0)config.employees[existingIndex]=next;else config.employees.push(next);
      if(opts.provision&&next.active!==false)provisionQueue.push(next);
    });
    config=await saveAccessConfig(config);const provisioned=[];
    for(const employee of provisionQueue){
      const result=await provisionEmployeeAccount(employee);provisioned.push(result);
      if(result&&result.uid){const match=config.employees.find(row=>cleanEmployeeId(row.employeeId)===cleanEmployeeId(employee.employeeId));if(match)match.uid=result.uid;}
    }
    if(provisioned.some(result=>result&&result.uid))config=await saveAccessConfig(config);
    return {config,employees:masters,provisioned};
  }
  async function deactivateEmployeeAccess(input){return syncEmployeeAccessFromMaster(Object.assign({},input,{status:'Inactive',active:false}),{provision:false});}
  async function provisionEmployeeAccount(input){
    await init();if(!state.auth||!state.db||!state.auth.currentUser)throw new Error('Admin Firebase login is required.');
    const row=normalizeEmployee(input,0),name='nexcrm-provisioning';let app=firebase.apps.find(item=>item.name===name);
    if(!app)app=firebase.initializeApp(cfg(),name);
    const auth=app.auth();let result;
    try{
      result=await auth.createUserWithEmailAndPassword(row.authEmail,row.password);
      try{await result.user.updateProfile({displayName:row.name})}catch(e){}
      row.uid=result.user.uid;row.updatedAt=new Date().toISOString();
      await state.db.ref().update({['access/employees/'+accessKeyFor(row)]:accessRecord(row),['roles/'+row.uid]:{employeeId:accessKeyFor(row),email:lower(row.authEmail),accessLevel:row.accessLevel,admin:isAdminAccess(row),updatedAt:row.updatedAt}});
      await auth.signOut();return {created:true,exists:false,uid:row.uid,email:row.authEmail,access:row};
    }catch(e){try{await auth.signOut()}catch(ignore){}if(e&&e.code==='auth/email-already-in-use')return {created:false,exists:true,email:row.authEmail,access:row};throw e;}
  }
  async function sendEmployeePasswordReset(input){await init();const row=normalizeEmployee(input,0);if(!state.auth)throw new Error('Firebase Auth is not available.');await state.auth.sendPasswordResetEmail(row.authEmail);return row.authEmail;}
  async function signOutAndRedirect(){try{await init();if(state.auth)await state.auth.signOut();}catch(e){}clearLocalSession();location.href=rootIndexPath();}
  function rootIndexPath(){return location.pathname.includes('/Admin%20Portal%20CRM%20NexFund/')||location.pathname.includes('/Admin Portal CRM NexFund/')||location.pathname.includes('/Bank%20Company%20Check%20Tool')||location.pathname.includes('/Pincode%20Tool')||location.pathname.includes('/FRP%20List')||location.pathname.includes('/Policy/')?'../index.html':'index.html';}
  function currentSession(){try{return JSON.parse(localStorage.getItem('nexcrm_session')||sessionStorage.getItem('nexcrm_session')||'null')}catch(e){return null}}
  function hasPermission(permission,session){const s=session||currentSession();if(!s)return false;if(lower(s.accessLevel)==='super_admin'||lower(s.accessLevel)==='admin')return true;return !!(s.permissions&&s.permissions[permission]===true);}
  function protect(role){const s=currentSession(),wanted=lower(role);const allowed=s&&(wanted==='admin'?isAdminAccess(s):lower(s.role)===wanted);if(!allowed){clearLocalSession();location.href=rootIndexPath();return false;}return true;}
  function protectAny(){const s=currentSession();if(!s){location.href=rootIndexPath();return false;}return true;}
  function startListeners(){Object.keys(KEY_PATHS).forEach(key=>{const ref=refForKey(key);if(!ref)return;const cb=snap=>{const val=snap.val();if(val&&val.deleted===true)applyLocal(key,null,'rtdb-delete');else if(val&&Object.prototype.hasOwnProperty.call(val,'value'))applyLocal(key,mergeStorageValues(key,localStorage.getItem(key),val.value),'rtdb-snapshot');};ref.on('value',cb);state.listeners.push(()=>ref.off('value',cb));});}
  async function init(){if(state.ready)return state;state.ready=true;if(!window.firebase||!firebase.initializeApp){state.ready=false;throw new Error('Firebase SDK must load before NexCRM data adapter.');}try{if(!firebase.apps.length)firebase.initializeApp(cfg());state.auth=firebase.auth?firebase.auth():null;state.db=firebase.database?firebase.database():null;if(!state.db)throw new Error('Firebase Realtime Database SDK is not available.');if(state.auth){state.auth.onAuthStateChanged(async user=>{state.user=user||null;state.access=user?await getUserAccess(user):null;state.role=state.access?lower(sessionRole(state.access)):'';state.listeners.forEach(fn=>{try{fn()}catch(e){}});state.listeners=[];if(user&&state.db){state.queue.clear();await pullRealtimeToLocal();startListeners();}window.dispatchEvent(new CustomEvent('nexcrm:auth-ready',{detail:{user:state.user,role:state.role,access:state.access,database:'realtime'}}));});}}catch(e){state.ready=false;console.error('NexCRM Firebase RTDB init failed',e);throw e;}return state;}
  localStorage.setItem=function(key,value){native.setItem(key,value);queueWrite(String(key),value,false);};
  localStorage.removeItem=function(key){native.removeItem(key);queueWrite(String(key),'',true);};
  window.NexCRMAccess={permissionKeys:PERMISSION_KEYS,rolePermissions:ROLE_PERMISSIONS,normalizeAccessLevel,normalizeEmployee,normalizeEmployeeMaster,normalizeEmployeeMasterList,normalizeConfig:normalizeLoginConfig,permissionsFor,isAdminAccess,hasPermission,defaultPassword,authEmailFor};
  window.NexCRMEmployees={keys:[...EMPLOYEE_MASTER_KEYS],all:()=>{try{return normalizeEmployeeMasterList(JSON.parse(localStorage.getItem('nexcrm_employee_master_final_custom')||'[]'))}catch(e){return []}},load:readEmployeeMaster,save:saveEmployeeMaster,syncAccess:syncEmployeeAccessFromMaster,deactivate:deactivateEmployeeAccess};
  window.NexCRMFirebase={init,signInWithRole,activateConfiguredCredential,signInWithGoogle,signOut:signOutAndRedirect,protect,protectAny,hasPermission,loadAccessConfig,saveAccessConfig,readEmployeeMaster,saveEmployeeMaster,syncEmployeeAccessFromMaster,deactivateEmployeeAccess,provisionEmployeeAccount,sendEmployeePasswordReset,migrateLocalStorageToFirestore,pullFirestoreToLocal,migrateLocalStorageToRealtime,migrateSnapshotToRealtime,pullRealtimeToLocal,loadKey,readArray,getRole:()=>state.role,getAccess:()=>state.access,adminEmail:ADMIN_EMAIL,isSyncKey,setLocalSession};
  init();
})();
