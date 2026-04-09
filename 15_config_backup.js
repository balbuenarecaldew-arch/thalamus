// =======================================
// CONFIG
// =======================================
window.saveCfgP=function(){
  if(!requireSocio('Solo socios pueden cambiar la configuracion')) return;
  const _ay=parseFloat(gs('p-ay').value);
  const _he=parseFloat(gs('p-he').value);
  const _so=parseFloat(gs('p-so').value);
  cfg={
    ...cfg,
    ayuda:isNaN(_ay)?10:_ay,
    heri:isNaN(_he)?1:_he,
    socios:isNaN(_so)?50:_so
  };
  localStorage.setItem('ocCfg',JSON.stringify(cfg));
  saveCache();
  toast('Parametros guardados','ok');
  if(gs('page-gestor')?.classList.contains('active')) renderGestor();
  if(gs('page-ayudaSocial')?.classList.contains('active')) renderAyudaSocial();
  if(gs('page-contratista')?.classList.contains('active')) renderContratista();
};

window.exportJSON=function(){
  if(!requireSocio('Solo socios pueden exportar datos')) return;
  const data=JSON.stringify({obras,gastos,certificados,retiros,gestorPagos,ayudaSocialPagos,contratistaPagos,cfg},null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download='thalamus_'+today()+'.json';
  a.click();
  toast('Exportado','ok');
};

// =======================================
// BACKUP Y RESTORE
// =======================================
function buildBackupData(){
  return {
    _meta:{
      version:1,
      date:new Date().toISOString(),
      user:_currentUser,
      timestamp:Date.now()
    },
    obras,
    gastos,
    certificados,
    retiros,
    gestorPagos,
    ayudaSocialPagos,
    contratistaPagos,
    cfg
  };
}

function applyBackupData(data){
  const newObras=data.obras||{};
  for(const [id,o] of Object.entries(newObras)){
    if(o&&!o.id) o.id=id;
  }
  obras=newObras;
  gastos=data.gastos||{};
  certificados=data.certificados||{};
  retiros=data.retiros||{fernando:[],wuilian:[]};
  gestorPagos=data.gestorPagos||[];
  ayudaSocialPagos=data.ayudaSocialPagos||[];
  contratistaPagos=data.contratistaPagos||[];
  if(data.cfg){
    cfg=data.cfg;
    localStorage.setItem('ocCfg',JSON.stringify(cfg));
  }
  if(window.sanitizeStateData) window.sanitizeStateData();
  cur=null;
  saveCache();
  populateSel();
  navTo('obras');
  applyRole();
}

async function syncCurrentStateToStorage(){
  const startedRemote=!!window._fbOk;
  const existingFB=await fbGetAll('obras');
  for(const oid of Object.keys(existingFB||{})){
    if(!obras[oid]){
      const fbGastos=await fbGetAll('obras/'+oid+'/gastos');
      for(const gid of Object.keys(fbGastos||{})) await fbDel('obras/'+oid+'/gastos/'+gid);
      const fbCerts=await fbGetAll('obras/'+oid+'/certificados');
      for(const cid of Object.keys(fbCerts||{})) await fbDel('obras/'+oid+'/certificados/'+cid);
      await fbDel('obras/'+oid);
    }
  }

  for(const [id,o] of Object.entries(obras)) await fbSet('obras/'+id,o);

  for(const [obraId,lista] of Object.entries(gastos)){
    const fbGastos=await fbGetAll('obras/'+obraId+'/gastos');
    for(const gid of Object.keys(fbGastos||{})){
      if(!(lista||[]).find(g=>g.id===gid)) await fbDel('obras/'+obraId+'/gastos/'+gid);
    }
    for(const g of (lista||[])){
      if(g.id) await fbSet('obras/'+obraId+'/gastos/'+g.id,g);
    }
  }

  for(const [obraId,lista] of Object.entries(certificados)){
    const fbCerts=await fbGetAll('obras/'+obraId+'/certificados');
    for(const cid of Object.keys(fbCerts||{})){
      if(!(lista||[]).find(c=>c.id===cid)) await fbDel('obras/'+obraId+'/certificados/'+cid);
    }
    for(const c of (lista||[])){
      if(c.id) await fbSet('obras/'+obraId+'/certificados/'+c.id,c);
    }
  }

  await fbSet('retiros/socios',retiros);
  await fbSet('gestor/pagos',{lista:gestorPagos});
  await fbSet('ayudaSocial/pagos',{lista:ayudaSocialPagos});
  await fbSet('contratista/pagos',{lista:contratistaPagos});
  return {startedRemote,endedRemote:!!window._fbOk};
}

function summarizeBackup(data){
  return {
    obraCount:Object.keys(data.obras||{}).length,
    gastoCount:Object.values(data.gastos||{}).reduce((s,arr)=>s+(arr?.length||0),0),
    certCount:Object.values(data.certificados||{}).reduce((s,arr)=>s+(arr?.length||0),0)
  };
}

function getRestoreWarning(counts,data){
  let msg='Restaurar este backup?\n\n';
  msg+='Obras: '+counts.obraCount+'\n';
  msg+='Gastos: '+counts.gastoCount+'\n';
  msg+='Certificados: '+counts.certCount+'\n';
  if(data._meta?.date) msg+='\nFecha: '+new Date(data._meta.date).toLocaleString('es-PY');
  if(data._meta?.user) msg+='\nUsuario: '+data._meta.user;
  msg+='\n\nEsto reemplaza todos los datos actuales.';
  return msg;
}

window.downloadBackup=function(){
  if(!requireSocio('Solo socios pueden descargar backups')) return;
  const data=buildBackupData();
  const json=JSON.stringify(data,null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const fecha=today().replace(/-/g,'');
  a.download='backup_thalamus_'+fecha+'.json';
  a.click();
  toast('Backup descargado','ok');
};

window.restoreBackup=async function(e){
  if(!requireSocio('Solo socios pueden restaurar backups')){
    e.target.value='';
    return;
  }
  const f=e.target.files[0];
  if(!f) return;

  try{
    const text=await f.text();
    const data=JSON.parse(text);
    if(!data.obras&&!data.gastos){
      toast('Archivo invalido: no contiene datos de Thalamus','err');
      return;
    }

    const counts=summarizeBackup(data);
    if(!confirm(getRestoreWarning(counts,data))) return;

    const check=prompt('Escribi RESTAURAR para confirmar:');
    if(!check||check.trim().toUpperCase()!=='RESTAURAR'){
      toast('Operacion cancelada','err');
      return;
    }

    toast('Restaurando datos...','info');
    applyBackupData(data);

    let syncMsg='Backup restaurado: '+counts.obraCount+' obras, '+counts.gastoCount+' gastos, '+counts.certCount+' certificados';
    try{
      const syncStatus=await syncCurrentStateToStorage();
      if(syncStatus.startedRemote&&!syncStatus.endedRemote){
        syncMsg+=' (solo en modo local; Firebase no respondio)';
      }
    }catch(fbErr){
      console.warn('Error sincronizando restore con Firebase:',fbErr);
      syncMsg+=' (sincronizacion remota incompleta)';
    }
    toast(syncMsg,'ok');
  }catch(err){
    console.error('Restore error:',err);
    toast('Error al restaurar: '+err.message,'err');
  }

  e.target.value='';
};

// =======================================
// AUTO BACKUP EN FIREBASE
// =======================================
async function autoBackup(){
  try{
    const data=buildBackupData();
    const backups=await fbGetDoc('backups/list')||{items:[]};
    const items=backups.items||[];
    const todayStr=today();
    if(items.length&&items[0].date===todayStr) return;

    const backupId='bk_'+todayStr.replace(/-/g,'');
    await fbSet('backups/'+backupId,data);
    items.unshift({
      id:backupId,
      date:todayStr,
      time:new Date().toLocaleString('es-PY'),
      user:_currentUser
    });

    if(items.length>5){
      for(const old of items.slice(5)){
        try{await fbDel('backups/'+old.id);}catch{}
      }
    }
    await fbSet('backups/list',{items:items.slice(0,5)});
    console.log('Auto-backup completado:',backupId);
  }catch(e){
    console.warn('Auto-backup error:',e);
  }
}

window.loadBackupList=async function(){
  if(!requireSocio('Solo socios pueden ver backups')) return;
  const el=gs('backupList');
  if(!el) return;
  el.innerHTML='<div style="padding:.5rem;color:var(--muted);font-size:.7rem">Cargando...</div>';

  try{
    const backups=await fbGetDoc('backups/list')||{items:[]};
    const items=backups.items||[];
    if(!items.length){
      el.innerHTML='<div style="padding:.5rem;color:var(--muted);font-size:.7rem">Sin backups automaticos aun</div>';
      return;
    }

    el.innerHTML=items.map((b,i)=>`
      <div class="user-row">
        <span style="font-size:.78rem;margin-right:4px">${i===0?'REC':'-'}</span>
        <span class="u-name" style="flex:1;font-size:.72rem">
          ${esc(b.date)} <span style="color:var(--muted)">${esc(b.time||'')}</span>
        </span>
        <span style="font-size:.6rem;color:var(--dim)">${esc(b.user||'')}</span>
        <button class="btn-logout" style="margin-left:6px;border-color:var(--green);color:var(--green)" onclick="restoreFromFirebase('${sanitizeText(b.id,40)}')">Restaurar</button>
        <button class="btn-logout" style="margin-left:4px" onclick="downloadFirebaseBackup('${sanitizeText(b.id,40)}','${sanitizeText(b.date,20)}')">Descargar</button>
      </div>
    `).join('');
  }catch(e){
    el.innerHTML='<div style="padding:.5rem;color:var(--acc3);font-size:.7rem">Error cargando backups</div>';
  }
};

window.downloadFirebaseBackup=async function(id,fecha){
  if(!requireSocio('Solo socios pueden descargar backups')) return;
  toast('Descargando backup...','info');
  try{
    const data=await fbGetDoc('backups/'+id);
    if(!data){
      toast('Backup no encontrado','err');
      return;
    }
    const json=JSON.stringify(data,null,2);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    a.download='backup_thalamus_'+fecha.replace(/-/g,'')+'.json';
    a.click();
    toast('Backup descargado','ok');
  }catch(e){
    toast('Error: '+e.message,'err');
  }
};

window.restoreFromFirebase=async function(id){
  if(!requireSocio('Solo socios pueden restaurar backups')) return;
  if(!confirm('Restaurar desde este backup?\n\nEsto reemplaza todos los datos actuales.')) return;
  const check=prompt('Escribi RESTAURAR para confirmar:');
  if(!check||check.trim().toUpperCase()!=='RESTAURAR'){
    toast('Cancelado','err');
    return;
  }

  toast('Descargando backup...','info');
  try{
    const data=await fbGetDoc('backups/'+id);
    if(!data){
      toast('Backup no encontrado','err');
      return;
    }

    const counts=summarizeBackup(data);
    applyBackupData(data);

    let syncMsg='Backup restaurado: '+counts.obraCount+' obras';
    try{
      const syncStatus=await syncCurrentStateToStorage();
      if(syncStatus.startedRemote&&!syncStatus.endedRemote){
        syncMsg+=' (solo en modo local; Firebase no respondio)';
      }
    }catch(fbErr){
      console.warn('Error sync restore:',fbErr);
      syncMsg+=' (sincronizacion remota incompleta)';
    }
    toast(syncMsg,'ok');
  }catch(e){
    toast('Error: '+e.message,'err');
  }
};
