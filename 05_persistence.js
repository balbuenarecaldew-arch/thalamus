// =======================================
// PERSISTENCE
// =======================================
function handleFirebaseFallback(action){
  window._fbOk=false;
  window._db=null;
  const dot=document.getElementById('fbDot');
  const txt=document.getElementById('fbTxt');
  if(dot) dot.classList.remove('ok');
  if(txt) txt.textContent='Modo local';
  if(!window._fbFallbackNotified){
    window._fbFallbackNotified=true;
    toast('Firebase no responde. La app siguio en modo local en este navegador.','err');
  }
  console.warn('Firebase fallback after trying to '+action);
}
window.handleFirebaseFallback=handleFirebaseFallback;

async function fbSet(path,data){
  if(window._fbOk&&window._db){
    try{
      const p=path.split('/');
      await window._FBM.setDoc(window._FBM.doc(window._db,...p),data);
      localStorage.setItem('oc/'+path,JSON.stringify(data));
      return;
    }catch(e){
      console.warn('fbSet error:',e);
      handleFirebaseFallback('guardar cambios');
    }
  }
  localStorage.setItem('oc/'+path,JSON.stringify(data));
}

async function fbDel(path){
  if(window._fbOk&&window._db){
    try{
      const p=path.split('/');
      await window._FBM.deleteDoc(window._FBM.doc(window._db,...p));
      localStorage.removeItem('oc/'+path);
      return;
    }catch(e){
      console.warn('fbDel error:',e);
      handleFirebaseFallback('eliminar cambios');
    }
  }
  localStorage.removeItem('oc/'+path);
}

async function fbGetAll(col){
  if(window._fbOk&&window._db){
    try{
      const snap=await window._FBM.getDocs(window._FBM.collection(window._db,...col.split('/')));
      const res={};
      snap.forEach(d=>{res[d.id]=d.data();});
      return res;
    }catch(e){
      console.warn('fbGetAll error:',e);
      handleFirebaseFallback('leer datos');
    }
  }
  const res={};
  const prefix='oc/'+col+'/';
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(prefix)){
      try{
        res[k.slice(prefix.length)]=JSON.parse(localStorage.getItem(k));
      }catch{}
    }
  }
  return res;
}

async function fbGetDoc(path){
  if(window._fbOk&&window._db){
    try{
      const p=path.split('/');
      const snap=await window._FBM.getDoc(window._FBM.doc(window._db,...p));
      return snap.exists()?snap.data():null;
    }catch(e){
      console.warn('fbGetDoc error:',e);
      handleFirebaseFallback('leer datos');
    }
  }
  try{
    return JSON.parse(localStorage.getItem('oc/'+path));
  }catch{
    return null;
  }
}

// =======================================
// INIT
// =======================================
function saveCache(){
  try{
    localStorage.setItem('th_cache',JSON.stringify({
      obras,
      gastos,
      certificados,
      retiros,
      gestorPagos,
      ayudaSocialPagos,
      contratistaPagos,
      cfg,
      _ts:Date.now()
    }));
  }catch{}
}

function loadCache(){
  try{
    return JSON.parse(localStorage.getItem('th_cache'));
  }catch{
    return null;
  }
}

function sanitizeId(value){
  return String(value??'').replace(/[^a-zA-Z0-9_-]/g,'');
}

function sanitizeDateValue(value){
  const s=String(value??'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}

function normalizeEstado(value){
  const raw=String(value??'').trim();
  const folded=(raw.normalize?raw.normalize('NFD'):raw).replace(/[\u0300-\u036f]/g,'');
  const upper=folded.toUpperCase();
  if(upper.includes('FINALIZ')) return 'FINALIZADA';
  if(upper.includes('PARALIZ')) return 'PARALIZADA';
  if(upper.includes('LICIT')) return 'EN LICITACIÓN';
  return 'EN EJECUCIÓN';
}

function normalizeRetList(list){
  return (Array.isArray(list)?list:[]).map(r=>({
    ...r,
    id:sanitizeId(r?.id),
    fecha:sanitizeDateValue(r?.fecha),
    concepto:sanitizeText(r?.concepto||'Retiro',120)||'Retiro',
    monto:parseFloat(r?.monto)||0
  })).filter(r=>r.id);
}

function normalizePagoList(list,fallbackConcept){
  return (Array.isArray(list)?list:[]).map(p=>({
    ...p,
    id:sanitizeId(p?.id),
    fecha:sanitizeDateValue(p?.fecha),
    concepto:sanitizeText(p?.concepto||fallbackConcept,120)||fallbackConcept,
    obraId:sanitizeId(p?.obraId),
    contratistaId:sanitizeId(p?.contratistaId),
    monto:parseFloat(p?.monto)||0
  })).filter(p=>p.id);
}

function sanitizeStateData(){
  const cleanObras={};
  for(const [rawId,obra] of Object.entries(obras||{})){
    const id=sanitizeId(rawId||obra?.id);
    if(!id) continue;
    const clean={...obra,id};
    clean.nombre=sanitizeText(clean.nombre||'Sin nombre',120)||'Sin nombre';
    clean.num=sanitizeText(clean.num||'',40);
    clean.fecha=sanitizeDateValue(clean.fecha);
    clean.estado=normalizeEstado(clean.estado);
    if(Array.isArray(clean.contratistas)){
      clean.contratistas=clean.contratistas.map(c=>({
        ...c,
        id:sanitizeId(c?.id),
        nombre:sanitizeText(c?.nombre||'Contratista',80)||'Contratista',
        monto:parseFloat(c?.monto)||0
      })).filter(c=>c.id);
    }
    cleanObras[id]=clean;
  }
  obras=cleanObras;

  const cleanGastos={};
  for(const [obraId,list] of Object.entries(gastos||{})){
    const safeObraId=sanitizeId(obraId);
    if(!safeObraId) continue;
    cleanGastos[safeObraId]=(Array.isArray(list)?list:[]).map(g=>({
      ...g,
      id:sanitizeId(g?.id),
      fecha:sanitizeDateValue(g?.fecha),
      concepto:sanitizeText(g?.concepto||'',160),
      registro:sanitizeText(g?.registro||'',80),
      tipo:sanitizeText(g?.tipo||'transferencia',40)||'transferencia',
      cantidad:parseFloat(g?.cantidad)||0,
      monto:parseFloat(g?.monto)||0,
      montoCheque:parseFloat(g?.montoCheque)||0,
      devuelto:parseFloat(g?.devuelto)||0,
      saldoTotal:parseFloat(g?.saldoTotal)||0,
      saldoCheque:parseFloat(g?.saldoCheque)||0,
      costoTotal:parseFloat(g?.costoTotal)||0
    })).filter(g=>g.id);
  }
  gastos=cleanGastos;

  const cleanCerts={};
  for(const [obraId,list] of Object.entries(certificados||{})){
    const safeObraId=sanitizeId(obraId);
    if(!safeObraId) continue;
    cleanCerts[safeObraId]=(Array.isArray(list)?list:[]).map(c=>({
      ...c,
      id:sanitizeId(c?.id),
      fecha:sanitizeDateValue(c?.fecha),
      concepto:sanitizeText(c?.concepto||'',160),
      bruto:parseFloat(c?.bruto)||0,
      neto:parseFloat(c?.neto)||0,
      retencion:parseFloat(c?.retencion)||0
    })).filter(c=>c.id);
  }
  certificados=cleanCerts;

  retiros={
    fernando:normalizeRetList(retiros?.fernando),
    wuilian:normalizeRetList(retiros?.wuilian)
  };

  gestorPagos=normalizePagoList(gestorPagos,'Entrega semanal');
  ayudaSocialPagos=normalizePagoList(ayudaSocialPagos,'Ayuda social');
  contratistaPagos=normalizePagoList(contratistaPagos,'Pago contratista');
}
window.sanitizeStateData=sanitizeStateData;

function applyCfgInputs(){
  if(gs('p-ay')) gs('p-ay').value=cfg.ayuda;
  if(gs('p-he')) gs('p-he').value=cfg.heri;
  if(gs('p-so')) gs('p-so').value=cfg.socios;
}

function showWelcomeToast(){
  if(_currentUser==='fernando') toast('Bienvenido mi querido bro','ok');
  else toast('Bienvenido, '+_currentUser,'ok');
}

window.initApp=async function(){
  if(!_currentUser) return;

  const persistedCfg=localStorage.getItem('ocCfg');
  if(persistedCfg){
    try{cfg=JSON.parse(persistedCfg);}catch{}
  }
  applyCfgInputs();

  const cache=loadCache();
  let fromCache=false;
  if(cache&&cache.obras&&Object.keys(cache.obras).length){
    obras=cache.obras;
    gastos=cache.gastos||{};
    certificados=cache.certificados||{};
    retiros=cache.retiros||{fernando:[],wuilian:[]};
    gestorPagos=cache.gestorPagos||[];
    ayudaSocialPagos=cache.ayudaSocialPagos||[];
    contratistaPagos=cache.contratistaPagos||[];
    if(cache.cfg) cfg=cache.cfg;
    sanitizeStateData();
    saveCache();
    applyCfgInputs();
    fromCache=true;
    populateSel();
    navTo('obras');
    applyRole();
    renderUserList();
    showWelcomeToast();
  }

  try{
    const raw=await fbGetAll('obras');
    const newObras={};
    for(const [id,d] of Object.entries(raw||{})){
      newObras[id]={...d,id};
      if(!newObras[id].lastModified){
        newObras[id].lastModified=Date.now()-(Object.keys(raw).length*1000);
      }
    }

    const ids=Object.keys(newObras);
    const [gastosArr,certsArr,rd,gp,asp,ctp]=await Promise.all([
      Promise.all(ids.map(id=>fbGetAll('obras/'+id+'/gastos').then(gr=>({id,data:gr})))),
      Promise.all(ids.map(id=>fbGetAll('obras/'+id+'/certificados').then(cr=>({id,data:cr})))),
      fbGetDoc('retiros/socios'),
      fbGetDoc('gestor/pagos'),
      fbGetDoc('ayudaSocial/pagos'),
      fbGetDoc('contratista/pagos')
    ]);

    obras=newObras;
    gastos={};
    certificados={};
    gastosArr.forEach(({id,data})=>{
      gastos[id]=Object.entries(data||{}).map(([gid,gd])=>({...gd,id:gd.id||gid}));
    });
    certsArr.forEach(({id,data})=>{
      certificados[id]=Object.entries(data||{}).map(([cid,cd])=>({...cd,id:cd.id||cid}));
    });
    if(rd) retiros={fernando:rd.fernando||[],wuilian:rd.wuilian||[]};
    if(gp) gestorPagos=gp.lista||[];
    if(asp) ayudaSocialPagos=asp.lista||[];
    if(ctp) contratistaPagos=ctp.lista||[];

    sanitizeStateData();
    saveCache();
    applyCfgInputs();
    populateSel();

    const activePage=document.querySelector('.page.active');
    if(activePage){
      navTo(activePage.id.replace('page-',''));
    }else{
      navTo('obras');
    }
    applyRole();
    renderUserList();

    if(!fromCache) showWelcomeToast();
  }catch(e){
    console.warn('Firebase sync error:',e);
    if(!fromCache) toast('Error cargando datos de Firebase','err');
    else toast('Usando datos del cache porque Firebase no responde','info');
  }

  trackLogin(_currentUser);
  autoBackup();
};

window.saveAndConnect=async function(){
  const c={
    apiKey:v('cfg-ak'),
    authDomain:v('cfg-ad'),
    projectId:v('cfg-pid'),
    storageBucket:v('cfg-bk'),
    messagingSenderId:v('cfg-ms'),
    appId:v('cfg-ai2')
  };
  if(!c.apiKey){
    toast('Ingresa API Key','err');
    return;
  }
  localStorage.setItem('fbCfg',JSON.stringify(c));
  const ok=await window.connectFB(c);
  if(ok){
    window._fbFallbackNotified=false;
    await window.initApp();
    toast('Firebase reconectado','ok');
  }else{
    toast('No se pudo conectar','err');
  }
};
