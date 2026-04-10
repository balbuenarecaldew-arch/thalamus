// =======================================
// STATE
// =======================================
let obras={}, gastos={}, certificados={}, retiros={fernando:[],wuilian:[]}, gestorPagos=[], ayudaSocialPagos=[], contratistaPagos=[];
let cfg={ayuda:10,heri:1,socios:50};
let cur=null, qrows=[], pendAI=[], _importing=false;

// =======================================
// UTILS
// =======================================
const gs=id=>document.getElementById(id);
const v=id=>sanitizeText(gs(id)?.value?.trim()||'',500);
const LOCAL_ONLY_KEY='th_local_only';

function fGs(x){
  if(!x||isNaN(x)) x=0;
  return 'Gs '+Math.round(x).toLocaleString('es-PY');
}

function fPct(x){
  return (x*100).toFixed(1)+'%';
}

function uid(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2);
}

function today(){
  const now=new Date();
  const local=new Date(now.getTime()-(now.getTimezoneOffset()*60000));
  return local.toISOString().split('T')[0];
}

function esc(value){
  return String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function escAttr(value){
  return esc(value).replace(/`/g,'&#96;');
}

function encArg(value){
  return encodeURIComponent(String(value??''));
}

function sanitizeText(value,maxLen=160){
  const cleaned=String(value??'')
    .replace(/[<>]/g,'')
    .replace(/&/g,' y ')
    .replace(/\s+/g,' ')
    .trim();
  return cleaned.slice(0,maxLen);
}

window.esc=esc;
window.escAttr=escAttr;
window.encArg=encArg;
window.sanitizeText=sanitizeText;

function toast(msg,type='ok'){
  const t=gs('toast');
  t.textContent=msg;
  t.className='toast show '+type;
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),3200);
}

function openM(id){
  gs(id).classList.add('open');
}

function closeM(id){
  gs(id).classList.remove('open');
}

window.closeM=closeM;

function doConfirm(title,msg,cb){
  gs('mCTitle').textContent=title;
  gs('mCMsg').textContent=msg;
  gs('mCOk').onclick=()=>{
    closeM('mConfirm');
    cb();
  };
  openM('mConfirm');
}

async function requireAuth(msg,cb){
  if(!_currentUser){
    toast('Inicia sesion para continuar','err');
    return false;
  }

  const pw=prompt(msg+'\n\nIngresa tu clave de confirmacion:');
  if(pw===null) return false;
  const typed=pw.trim();
  if(!typed){
    toast('Clave incorrecta','err');
    return false;
  }

  const currentOk=window.verifyCurrentPassword?await window.verifyCurrentPassword(typed):false;
  const legacyOk=typed.toUpperCase()==='THALAMUS';
  if(!currentOk&&!legacyOk){
    toast('Clave incorrecta','err');
    return false;
  }

  await cb();
  return true;
}

window.requireAuth=requireAuth;

const _busyActions=new Set();

function isLocalOnlyMode(){
  try{
    return localStorage.getItem(LOCAL_ONLY_KEY)==='1';
  }catch{
    return false;
  }
}

function updateFirebaseBadge(text,isOk=false){
  const dot=gs('fbDot');
  const txt=gs('fbTxt');
  if(dot) dot.classList.toggle('ok',!!isOk);
  if(txt) txt.textContent=text;
}

function updateLocalModeUi(){
  const active=isLocalOnlyMode();
  const status=gs('localModeTxt');
  const onBtn=gs('localModeOnBtn');
  const offBtn=gs('localModeOffBtn');
  if(status){
    status.textContent=active
      ? 'ACTIVO: esta copia no toca Firebase. Todo queda solo en este navegador.'
      : 'Inactivo: esta copia usa la base real de Firebase.';
    status.style.color=active?'var(--acc3)':'var(--green)';
  }
  if(onBtn) onBtn.disabled=active;
  if(offBtn) offBtn.disabled=!active;
}

window.isLocalOnlyMode=isLocalOnlyMode;
window.updateFirebaseBadge=updateFirebaseBadge;
window.updateLocalModeUi=updateLocalModeUi;

window.setLocalOnlyMode=async function(enabled){
  const active=!!enabled;
  try{
    if(active) localStorage.setItem(LOCAL_ONLY_KEY,'1');
    else localStorage.removeItem(LOCAL_ONLY_KEY);
  }catch{}

  if(active){
    window._db=null;
    window._fbOk=false;
    try{
      if(window._FBM?.getApps&&window._FBM?.deleteApp){
        for(const app of window._FBM.getApps()){
          try{ await window._FBM.deleteApp(app); }catch{}
        }
      }
    }catch{}
    try{
      if(typeof saveCache==='function') saveCache();
    }catch{}
    updateFirebaseBadge('Prueba local',false);
    updateLocalModeUi();
    toast('Modo prueba local activado. Esta copia ya no toca Firebase.','ok');
    return true;
  }

  updateLocalModeUi();
  toast('Modo prueba local desactivado. Reconectando Firebase...','info');
  if(typeof window.saveAndConnect==='function'){
    return !!(await window.saveAndConnect());
  }
  return false;
};

window.clearLocalAppDataCache=function(){
  const keysToRemove=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key) continue;
      if(key.startsWith('oc/')||key==='th_cache'||key==='th_audit_local'){
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key=>localStorage.removeItem(key));
  }catch{}
};

window.discardLocalTestChangesAndReconnect=async function(){
  const active=isLocalOnlyMode();
  if(!active){
    if(confirm('Esto va a borrar el cache local de la app en este navegador y volver a cargar desde Firebase.\n\nTus usuarios locales y configuraciones del navegador no se borran.')){
      window.clearLocalAppDataCache();
      toast('Cache local descartado. Recargando datos reales...','info');
      if(typeof window.initApp==='function'&&_currentUser){
        await window.initApp();
      }
    }
    return true;
  }

  if(!confirm('Descartar todas las pruebas locales y volver a la base real de Firebase?\n\nSe van a borrar solo los datos locales de esta copia de prueba.')) return false;
  window.clearLocalAppDataCache();
  try{ localStorage.removeItem(LOCAL_ONLY_KEY); }catch{}
  updateLocalModeUi();
  toast('Pruebas locales descartadas. Reconectando Firebase...','info');
  if(typeof window.saveAndConnect==='function'){
    return !!(await window.saveAndConnect());
  }
  return false;
};

function setActionButtonsBusy(actionName,busy){
  try{
    document.querySelectorAll(`button[onclick*="${actionName}("]`).forEach(btn=>{
      btn.disabled=busy;
      btn.classList.toggle('is-busy',busy);
      btn.setAttribute('aria-busy',busy?'true':'false');
    });
  }catch{}
}

async function runLocked(actionName,fn,waitMsg='Espera a que termine el guardado'){
  if(_busyActions.has(actionName)){
    toast(waitMsg,'info');
    return false;
  }
  _busyActions.add(actionName);
  setActionButtonsBusy(actionName,true);
  try{
    return await fn();
  }finally{
    setActionButtonsBusy(actionName,false);
    _busyActions.delete(actionName);
  }
}

window.runLocked=runLocked;
updateLocalModeUi();
