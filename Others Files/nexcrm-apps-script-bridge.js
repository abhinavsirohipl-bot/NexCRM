(function(){
  const URL='https://script.google.com/macros/s/AKfycbyph-OkCaC9e-2weYf1vYgSw8K6W39IMwBJOD5VKZx6GcbsVC-D2gnWtIQlbyCgpLLHEw/exec';
  function jsonp(params){
    return new Promise(resolve=>{
      const cb='nexcrmAppsCb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const query=new URLSearchParams({...params,callback:cb,t:Date.now()});
      window[cb]=res=>{cleanup();resolve(res||{success:false,data:{}})};
      function cleanup(){try{delete window[cb]}catch(e){window[cb]=undefined}script.remove()}
      script.onerror=()=>{cleanup();resolve({success:false,error:'Apps Script read failed'})};
      script.src=URL+'?'+query.toString();
      document.body.appendChild(script);
    });
  }
  function val(data,...keys){for(const key of keys){if(data&&data[key]!=null&&data[key]!=='')return data[key]}return ''}
  function compatFields(tab,data){
    data=data||{};
    const type=tab||data.tab||data.sheet||data.action||'NexCRM';
    return {
      'Data Type':type,
      'Date':val(data,'Date','Login Date','Updated At')||new Date().toISOString(),
      'Employee ID':val(data,'Employee ID','Employee Code','employeeId','empCode','id'),
      'Employee Name':val(data,'Employee Name','employeeName','empName','name'),
      'Customer Name':val(data,'Customer Name','customerName'),
      'Mobile':val(data,'Mobile','Mobile No.','mobile'),
      'Bank':val(data,'Bank','Login Bank','bank','loginBank'),
      'City':val(data,'City','city'),
      'Pincode':val(data,'Pincode','pincode'),
      'Salary':val(data,'Salary','Net Salary','salary','netSalary'),
      'Company Name':val(data,'Company Name','companyName'),
      'Email':val(data,'Email','Email ID','Employee Email','Customer Email','email','emailId'),
      'DOB':val(data,'DOB','dob'),
      'Pan No':val(data,'Pan No','PAN No','panNo','pan'),
      'Status':val(data,'Status','status','Disposition','disposition'),
      'Remarks':val(data,'Remarks','Remark','remarks','remark'),
      'Lead ID':val(data,'Lead ID','leadId'),
      'Customer ID':val(data,'Customer ID','customerId'),
      'NexID':val(data,'NexID','nexId'),
      'Loan Amount':val(data,'Loan Amount','loanAmount'),
      'Product':val(data,'Product','product')
    };
  }
  async function post(payload){
    try{
      const data=(payload&&payload.data)||(payload&&payload.record)||(payload&&payload.row)||{};
      const body={...compatFields(payload&&payload.tab,data),...(payload||{})};
      await fetch(URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
      return {success:true,queued:true};
    }catch(error){
      console.warn('NexCRM Apps Script post failed',error);
      return {success:false,error:error&&error.message||String(error)};
    }
  }
  function read(tab){return jsonp({action:'read',tab})}
  function readAll(){return jsonp({action:'readAll'})}
  function realtimeSave(tab,data){return post({action:'realtimeSave',tab,data})}
  function saveRecord(tab,data){return post({action:'saveRecord',tab,data})}
  function replaceTab(tab,rows){return post({action:'replaceTab',tab,data:Array.isArray(rows)?rows:[]})}
  async function bulkSync(data){
    const jobs=[];
    Object.keys(data||{}).forEach(tab=>(Array.isArray(data[tab])?data[tab]:[]).forEach(row=>jobs.push(saveRecord(tab,row))));
    await Promise.all(jobs);
    return {success:true,count:jobs.length};
  }
  window.NEXCRM_APPS_SCRIPT_URL=URL;
  window.NexCRMAppsScript={URL,read,readAll,post,realtimeSave,saveRecord,replaceTab,bulkSync};
})();
