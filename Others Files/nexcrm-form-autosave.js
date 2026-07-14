(function(){
  const key='nexcrm_form_autosave_'+location.pathname.replace(/[^a-z0-9]+/gi,'_').toLowerCase();
  const skipTypes=new Set(['button','submit','reset','file','password']);
  const fields=()=>[...document.querySelectorAll('input[id],select[id],textarea[id]')].filter(el=>!skipTypes.has(String(el.type||'').toLowerCase())&&!el.readOnly&&!el.disabled&&!el.closest('.recent-memory'));
  function read(){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(e){return {}}}
  function save(){const data={};fields().forEach(el=>{data[el.id]=el.type==='checkbox'?el.checked:el.value});localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),data}))}
  function restore(){const saved=read().data||{};fields().forEach(el=>{if(saved[el.id]===undefined||el.value)return;if(el.type==='checkbox')el.checked=!!saved[el.id];else el.value=saved[el.id];el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})}
  function clear(){localStorage.removeItem(key)}
  window.NexCRMFormAutosave={save,restore,clear,key};
  document.addEventListener('DOMContentLoaded',()=>{restore();let t=null;fields().forEach(el=>{const fn=()=>{clearTimeout(t);t=setTimeout(save,250)};el.addEventListener('input',fn);el.addEventListener('change',fn)});document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',()=>setTimeout(clear,0)))});
})();
