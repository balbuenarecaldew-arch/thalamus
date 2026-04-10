// =======================================
// ADMIN TOOLS / AUDIT / DAILY EXCEL EXPORT
// =======================================
const AUDIT_DOC_PATH='audit/history';
const AUDIT_LOCAL_KEY='th_audit_local';
const AUDIT_LIMIT=800;

const EXPORT_CFG_KEY='th_daily_excel_export_cfg';
const EXPORT_DB_NAME='thalamus_daily_export_db';
const EXPORT_STORE_NAME='handles';
const EXPORT_HANDLE_KEY='daily_excel_folder';

let _auditEntriesCache=null;
let _auditDepth=0;
let _auditExportTimer=null;

function adminIsOwner(){
  return typeof isAdmin==='function'?isAdmin():_currentUser==='wuilian';
}

function cloneAuditData(value){
  try{
    return JSON.parse(JSON.stringify(value));
  }catch{
    return null;
  }
}

function auditStateSnapshot(){
  try{
    return JSON.stringify({obras,gastos,certificados,retiros,gestorPagos,ayudaSocialPagos,contratistaPagos,cfg});
  }catch{
    return '';
  }
}

function auditDayFromTs(ts){
  const d=new Date(ts||Date.now());
  const local=new Date(d.getTime()-(d.getTimezoneOffset()*60000));
  return local.toISOString().slice(0,10);
}

function auditTimeLabel(ts){
  try{
    return new Date(ts).toLocaleString('es-PY');
  }catch{
    return '-';
  }
}

function safeFileSegment(value,fallback='sin_nombre',maxLen=80){
  const base=String(value??'').trim();
  const normalized=(base.normalize?base.normalize('NFD'):base).replace(/[\u0300-\u036f]/g,'');
  let cleaned=normalized
    .replace(/[<>:"/\\|?*\x00-\x1F]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/[ .]+$/g,'')
    .replace(/\s/g,'_');
  if(maxLen&&cleaned.length>maxLen){
    cleaned=cleaned.slice(0,maxLen).replace(/[_ .-]+$/g,'');
  }
  return cleaned||fallback;
}

function shortObraRef(obra, obraId){
  return safeFileSegment(`N${obra?.num||obraId||'obra'}`,'obra',24);
}

function exportNamesForObra(obra, obraId, day){
  const base=`${obra?.num?`N${obra.num}_`:''}${obra?.nombre||obraId||'obra'}`;
  return {
    folderName:safeFileSegment(base,'obra',48),
    fallbackFolder:shortObraRef(obra,obraId),
    fileName:`${safeFileSegment(`Planilla_${base}_${day}`,'planilla',72)}.xlsx`,
    fallbackFile:`${safeFileSegment(`Planilla_${obra?.num||obraId||'obra'}_${day}`,'planilla',40)}.xlsx`
  };
}

function exportNamesForDeletedObra(obra, day){
  const base=`${obra?.num?`N${obra.num}_`:''}${obra?.nombre||'obra'}`;
  return {
    fileName:`${safeFileSegment(`ELIMINADA_${base}_${day}`,'eliminada',72)}.xlsx`,
    fallbackFile:`${safeFileSegment(`ELIMINADA_${obra?.num||'obra'}_${day}`,'eliminada',40)}.xlsx`
  };
}

function getDailyExportConfig(){
  try{
    const parsed=JSON.parse(localStorage.getItem(EXPORT_CFG_KEY)||'{}');
    return {
      enabled:!!parsed.enabled,
      folderLabel:parsed.folderLabel||'',
      lastExportDay:parsed.lastExportDay||''
    };
  }catch{
    return {enabled:false,folderLabel:'',lastExportDay:''};
  }
}

function saveDailyExportConfig(patch){
  const next={...getDailyExportConfig(),...(patch||{})};
  localStorage.setItem(EXPORT_CFG_KEY,JSON.stringify(next));
  return next;
}

function updateDailyExportStatus(msg,color='var(--muted)'){
  const el=gs('dailyExportStatus');
  if(!el) return;
  el.textContent=msg;
  el.style.color=color;
}

function updateDailyExportUi(){
  const cfg=getDailyExportConfig();
  const chooseBtn=gs('dailyExportChooseBtn');
  const clearBtn=gs('dailyExportClearBtn');
  const enableBtn=gs('dailyExportEnableBtn');
  const disableBtn=gs('dailyExportDisableBtn');

  if(chooseBtn) chooseBtn.disabled=!adminIsOwner();
  if(clearBtn) clearBtn.disabled=!adminIsOwner()||!cfg.folderLabel;
  if(enableBtn) enableBtn.disabled=!adminIsOwner()||cfg.enabled||!cfg.folderLabel;
  if(disableBtn) disableBtn.disabled=!adminIsOwner()||!cfg.enabled;

  const folderTxt=cfg.folderLabel?`Carpeta: ${cfg.folderLabel}`:'Carpeta: no configurada';
  const autoTxt=cfg.enabled?'Auto diario activo':'Auto diario inactivo';
  const lastTxt=cfg.lastExportDay?` | Ultima exportacion: ${cfg.lastExportDay}`:'';
  updateDailyExportStatus(`${folderTxt} | ${autoTxt}${lastTxt}`,cfg.enabled?'var(--green)':'var(--muted)');
}

function openExportDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(EXPORT_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(EXPORT_STORE_NAME)){
        db.createObjectStore(EXPORT_STORE_NAME);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveExportFolderHandle(handle){
  const db=await openExportDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(EXPORT_STORE_NAME,'readwrite');
    tx.objectStore(EXPORT_STORE_NAME).put(handle,EXPORT_HANDLE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

async function getExportFolderHandle(){
  const db=await openExportDb();
  const result=await new Promise((resolve,reject)=>{
    const tx=db.transaction(EXPORT_STORE_NAME,'readonly');
    const req=tx.objectStore(EXPORT_STORE_NAME).get(EXPORT_HANDLE_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  return result;
}

async function clearExportFolderHandle(){
  const db=await openExportDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(EXPORT_STORE_NAME,'readwrite');
    tx.objectStore(EXPORT_STORE_NAME).delete(EXPORT_HANDLE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

async function queryFolderPermission(handle,request=false){
  if(!handle) return 'denied';
  try{
    const opts={mode:'readwrite'};
    if(typeof handle.queryPermission==='function'){
      const current=await handle.queryPermission(opts);
      if(current==='granted') return current;
      if(request&&typeof handle.requestPermission==='function'){
        return await handle.requestPermission(opts);
      }
      return current;
    }
  }catch{}
  return 'denied';
}

async function getWritableDirectory(parentHandle, preferredName, fallbackName){
  try{
    return await parentHandle.getDirectoryHandle(preferredName,{create:true});
  }catch(err){
    if(fallbackName&&fallbackName!==preferredName&&(err?.name==='NotFoundError'||err?.name==='TypeError')){
      return await parentHandle.getDirectoryHandle(fallbackName,{create:true});
    }
    throw err;
  }
}

function dailyExportErrorMessage(err){
  if(err?.name==='NotFoundError'){
    return 'No se pudo escribir en la carpeta. Reelegi la carpeta o usa una ruta mas corta, por ejemplo C:\\BackupThalamus.';
  }
  if(err?.name==='NotAllowedError'||err?.name==='SecurityError'){
    return 'El navegador no tiene permiso para escribir en esa carpeta. Volve a elegirla.';
  }
  return 'Fallo la exportacion diaria.';
}

async function loadAuditEntries(force=false){
  if(!force&&Array.isArray(_auditEntriesCache)) return _auditEntriesCache;
  try{
    const remote=await fbGetDoc(AUDIT_DOC_PATH);
    if(Array.isArray(remote?.entries)){
      _auditEntriesCache=remote.entries.slice(0,AUDIT_LIMIT);
      try{localStorage.setItem(AUDIT_LOCAL_KEY,JSON.stringify(_auditEntriesCache));}catch{}
      return _auditEntriesCache;
    }
  }catch{}

  try{
    _auditEntriesCache=JSON.parse(localStorage.getItem(AUDIT_LOCAL_KEY)||'[]');
  }catch{
    _auditEntriesCache=[];
  }
  return _auditEntriesCache;
}

async function saveAuditEntries(entries){
  const safe=(Array.isArray(entries)?entries:[]).slice(0,AUDIT_LIMIT);
  _auditEntriesCache=safe;
  try{localStorage.setItem(AUDIT_LOCAL_KEY,JSON.stringify(safe));}catch{}
  if(window.isLocalOnlyMode&&window.isLocalOnlyMode()) return false;
  try{
    await fbSet(AUDIT_DOC_PATH,{entries:safe});
    return true;
  }catch{
    return false;
  }
}

function auditEntriesForDay(day){
  const entries=Array.isArray(_auditEntriesCache)?_auditEntriesCache:[];
  return entries.filter(entry=>auditDayFromTs(entry.time)===day);
}

function resolveObraFromForm(actionName){
  if(['saveAllRows','delG','borrarTodosGastos','saveCert','delC','borrarTodosCerts','saveEditG','saveEditC','importAll','importPaste'].includes(actionName)){
    return cur&&obras[cur]?cur:'';
  }
  if(actionName==='saveGestorPago') return gs('gp-obra')?.value||'';
  if(actionName==='saveAyudaPago') return gs('as-obra')?.value||'';
  if(actionName==='saveContratistaPago') return gs('ct-obra')?.value||'';
  return '';
}

function captureAuditContext(actionName,args){
  const firstArg=String(args?.[0]||'').trim();
  const ctx={
    obraId:'',
    obraNombre:'',
    targetType:'general',
    deleted:false,
    detail:'',
    snapshot:null
  };

  if(actionName==='delObra'){
    const obraId=firstArg;
    const o=obras[obraId];
    ctx.obraId=obraId;
    ctx.obraNombre=o?.nombre||'';
    ctx.targetType='obra';
    ctx.deleted=true;
    ctx.snapshot={
      obra:cloneAuditData(o),
      gastos:cloneAuditData(gastos[obraId]||[]),
      certificados:cloneAuditData(certificados[obraId]||[]),
      gestor:cloneAuditData(gestorPagos.filter(p=>p.obraId===obraId)),
      ayudaSocial:cloneAuditData(ayudaSocialPagos.filter(p=>p.obraId===obraId)),
      contratistas:{
        catalogo:cloneAuditData(getObraContratistas(obraId)),
        pagos:cloneAuditData(contratistaPagosForObra(obraId))
      }
    };
    return ctx;
  }

  if(actionName==='delG'){
    const row=(gastos[cur]||[]).find(item=>item.id===firstArg);
    ctx.obraId=cur||'';
    ctx.obraNombre=obras[cur]?.nombre||'';
    ctx.targetType='gasto';
    ctx.deleted=true;
    ctx.detail=row?.concepto||'';
    ctx.snapshot=cloneAuditData(row);
    return ctx;
  }

  if(actionName==='delC'){
    const row=(certificados[cur]||[]).find(item=>item.id===firstArg);
    ctx.obraId=cur||'';
    ctx.obraNombre=obras[cur]?.nombre||'';
    ctx.targetType='certificado';
    ctx.deleted=true;
    ctx.detail=row?.concepto||'';
    ctx.snapshot=cloneAuditData(row);
    return ctx;
  }

  if(actionName==='delGestorPago'||actionName==='saveEditGestor'){
    const pago=gestorPagos.find(item=>item.id===firstArg)||gestorPagos.find(item=>item.id===gs('egs-id')?.value);
    ctx.obraId=pago?.obraId||'';
    ctx.obraNombre=obras[ctx.obraId]?.nombre||'';
    ctx.targetType='gestor';
    ctx.deleted=actionName==='delGestorPago';
    ctx.detail=pago?.concepto||'';
    ctx.snapshot=ctx.deleted?cloneAuditData(pago):null;
    return ctx;
  }

  if(actionName==='delAyudaPago'||actionName==='saveEditAyuda'){
    const pago=ayudaSocialPagos.find(item=>item.id===firstArg)||ayudaSocialPagos.find(item=>item.id===gs('eas-id')?.value);
    ctx.obraId=pago?.obraId||'';
    ctx.obraNombre=obras[ctx.obraId]?.nombre||'';
    ctx.targetType='ayuda_social';
    ctx.deleted=actionName==='delAyudaPago';
    ctx.detail=pago?.concepto||'';
    ctx.snapshot=ctx.deleted?cloneAuditData(pago):null;
    return ctx;
  }

  if(actionName==='delContratistaPago'||actionName==='saveEditContratista'){
    const pago=contratistaPagos.find(item=>item.id===firstArg)||contratistaPagos.find(item=>item.id===gs('ect-id')?.value);
    ctx.obraId=getPagoContratistaObraId(pago);
    ctx.obraNombre=obras[ctx.obraId]?.nombre||'';
    ctx.targetType='contratista_pago';
    ctx.deleted=actionName==='delContratistaPago';
    ctx.detail=pago?.concepto||'';
    ctx.snapshot=ctx.deleted?cloneAuditData(pago):null;
    return ctx;
  }

  let obraId='';
  if(firstArg&&obras[firstArg]) obraId=firstArg;
  if(!obraId) obraId=resolveObraFromForm(actionName);
  if(!obraId&&cur&&obras[cur]) obraId=cur;
  ctx.obraId=obraId;
  ctx.obraNombre=obras[obraId]?.nombre||'';

  if(['saveObra','removeContratistaFromObra','addContratistaToObra','updateContratistaNombre','updateContratistaMonto','quickAddContratistaObra','limpiarContratistaObra'].includes(actionName)){
    ctx.targetType='obra';
  }else if(['saveAllRows','delG','saveEditG','borrarTodosGastos'].includes(actionName)){
    ctx.targetType='gasto';
  }else if(['saveCert','delC','saveEditC','borrarTodosCerts'].includes(actionName)){
    ctx.targetType='certificado';
  }else if(['saveGestorPago','delGestorPago','saveEditGestor','quickAddGestorObra','limpiarGestorObra','activarObraGestor'].includes(actionName)){
    ctx.targetType='gestor';
  }else if(['saveAyudaPago','delAyudaPago','saveEditAyuda','quickAddAyudaObra','limpiarAyudaObra'].includes(actionName)){
    ctx.targetType='ayuda_social';
  }else if(['saveContratistaPago','delContratistaPago','saveEditContratista','quickAddContratistaObra'].includes(actionName)){
    ctx.targetType='contratista_pago';
  }

  return ctx;
}

function buildAuditEntry(actionName,label,args,context){
  return {
    id:uid(),
    time:Date.now(),
    day:today(),
    user:_currentUser||'',
    role:_currentRole||'',
    action:label||actionName,
    obraId:context?.obraId||'',
    obraNombre:context?.obraNombre||'',
    targetType:context?.targetType||'general',
    deleted:!!context?.deleted,
    detail:context?.detail||'',
    snapshot:context?.snapshot||null,
    mode:(window.isLocalOnlyMode&&window.isLocalOnlyMode())?'local':'firebase'
  };
}

async function appendAuditEntry(entry){
  const current=await loadAuditEntries();
  current.unshift(entry);
  await saveAuditEntries(current);
}

function wrapAuditAction(name,label){
  const original=window[name];
  if(typeof original!=='function'||original._auditWrapped) return;

  const wrapped=async function(...args){
    const isRootAction=_auditDepth===0;
    const beforeState=isRootAction?auditStateSnapshot():'';
    const beforeContext=isRootAction?captureAuditContext(name,args):null;
    let result;
    let thrown;
    _auditDepth++;
    try{
      result=await original.apply(this,args);
    }catch(err){
      thrown=err;
    }finally{
      _auditDepth=Math.max(0,_auditDepth-1);
    }

    const afterState=isRootAction?auditStateSnapshot():'';
    if(isRootAction&&beforeState&&afterState&&beforeState!==afterState&&_currentUser){
      try{
        await appendAuditEntry(buildAuditEntry(name,label,args,beforeContext));
      }catch(err){
        console.warn('Audit log error:',err);
      }
      renderAdminAuditCard();
      scheduleDailyExportRefresh();
    }

    if(thrown) throw thrown;
    return result;
  };

  wrapped._auditWrapped=true;
  window[name]=wrapped;
}

function installAuditWrappers(){
  const labels={
    saveObra:'Guardar obra',
    delObra:'Eliminar obra',
    saveAllRows:'Guardar gastos',
    delG:'Eliminar gasto',
    borrarTodosGastos:'Borrar todos los gastos',
    saveCert:'Guardar certificado',
    delC:'Eliminar certificado',
    borrarTodosCerts:'Borrar todos los certificados',
    saveEditG:'Editar gasto',
    saveEditC:'Editar certificado',
    saveRetiro:'Guardar retiro',
    delRetiro:'Eliminar retiro',
    saveGestorPago:'Guardar entrega al gestor',
    delGestorPago:'Eliminar entrega del gestor',
    saveEditGestor:'Editar entrega del gestor',
    updateGestorMontoObra:'Actualizar monto del gestor',
    resetGestorMontoObra:'Resetear monto del gestor',
    quickAddGestorObra:'Carga rapida del gestor',
    limpiarGestorObra:'Limpiar gestor de obra',
    activarObraGestor:'Activar gestor de obra',
    resetTodosGestorAuto:'Resetear gestor automatico',
    borrarTodosGestor:'Borrar entregas del gestor',
    saveAyudaPago:'Guardar ayuda social',
    delAyudaPago:'Eliminar ayuda social',
    saveEditAyuda:'Editar ayuda social',
    updateAyudaMontoObra:'Actualizar ayuda social',
    resetAyudaMontoObra:'Resetear ayuda social',
    quickAddAyudaObra:'Carga rapida de ayuda social',
    limpiarAyudaObra:'Limpiar ayuda social de obra',
    resetTodosAyudaAuto:'Resetear ayuda social automatica',
    borrarTodosAyuda:'Borrar entregas de ayuda social',
    addContratistaToObra:'Agregar contratista',
    removeContratistaFromObra:'Eliminar contratista',
    updateContratistaNombre:'Renombrar contratista',
    updateContratistaMonto:'Actualizar monto de contratista',
    saveContratistaPago:'Guardar pago de contratista',
    delContratistaPago:'Eliminar pago de contratista',
    saveEditContratista:'Editar pago de contratista',
    quickAddContratistaObra:'Carga rapida de contratista',
    limpiarContratistaObra:'Limpiar contratistas de obra',
    borrarTodosContratista:'Borrar pagos de contratista',
    saveCfgP:'Guardar configuracion',
    restoreBackup:'Restaurar backup local',
    restoreFromFirebase:'Restaurar backup remoto',
    importAll:'Importar datos desde IA',
    importPaste:'Importar datos pegados'
  };

  Object.entries(labels).forEach(([name,label])=>wrapAuditAction(name,label));
}

function changedCurrentObraIdsForDay(day){
  const ids=new Set();
  Object.values(obras).forEach(o=>{
    if(o?.id&&o.lastModified&&auditDayFromTs(o.lastModified)===day){
      ids.add(o.id);
    }
  });
  auditEntriesForDay(day).forEach(entry=>{
    if(entry?.obraId&&obras[entry.obraId]) ids.add(entry.obraId);
  });
  return [...ids].sort((a,b)=>{
    const ao=obras[a]||{};
    const bo=obras[b]||{};
    return (parseInt(ao.num)||9999)-(parseInt(bo.num)||9999) || (ao.nombre||'').localeCompare(bo.nombre||'');
  });
}

function deletedWorkSnapshotsForDay(day){
  return auditEntriesForDay(day)
    .filter(entry=>entry.deleted&&entry.targetType==='obra'&&entry.snapshot?.obra)
    .map(entry=>({
      entry,
      obra:entry.snapshot.obra,
      gastos:entry.snapshot.gastos||[],
      certificados:entry.snapshot.certificados||[],
      gestor:entry.snapshot.gestor||[],
      ayudaSocial:entry.snapshot.ayudaSocial||[],
      contratistas:entry.snapshot.contratistas||{catalogo:[],pagos:[]}
    }));
}

async function ensureExcelJs(){
  if(window.ExcelJS) return window.ExcelJS;
  await new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>String(s.src||'').includes('exceljs'));
    if(existing){
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',()=>reject(new Error('No se pudo cargar ExcelJS')),{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload=resolve;
    s.onerror=()=>reject(new Error('No se pudo cargar ExcelJS'));
    document.head.appendChild(s);
  });
  return window.ExcelJS;
}

function applyHeaderStyle(row, fillColor='1F3864'){
  row.eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'},name:'Calibri'};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+fillColor}};
    cell.alignment={horizontal:'center',vertical:'middle'};
  });
}

function autosizeWorksheet(ws, widths={}){
  ws.columns.forEach((column,index)=>{
    const manual=widths[index+1];
    if(manual){
      column.width=manual;
      return;
    }
    let max=10;
    column.eachCell({includeEmpty:true},cell=>{
      const raw=cell.value;
      const value=raw==null?'':String(raw.text||raw.result||raw);
      max=Math.max(max,Math.min(40,value.length+2));
    });
    column.width=max;
  });
}

function addTableSheet(wb,name,columns,rows,emptyText='Sin datos'){
  const ws=wb.addWorksheet(name);
  ws.addRow(columns.map(col=>col.label));
  applyHeaderStyle(ws.getRow(1));
  if(rows.length){
    rows.forEach(row=>{
      ws.addRow(columns.map(col=>{
        const value=col.value(row);
        return value==null?'':value;
      }));
    });
  }else{
    ws.addRow([emptyText]);
    if(columns.length>1) ws.mergeCells(2,1,2,columns.length);
  }
  autosizeWorksheet(ws);
  ws.views=[{state:'frozen',ySplit:1}];
  return ws;
}

function deletedRowsForObra(day, obraId, targetType){
  return auditEntriesForDay(day)
    .filter(entry=>entry.deleted&&entry.obraId===obraId&&entry.targetType===targetType&&entry.snapshot)
    .map(entry=>({
      ...(cloneAuditData(entry.snapshot)||{}),
      _deletedBy:entry.user||'',
      _deletedAt:auditTimeLabel(entry.time)
    }));
}

function createArchiveWorkbookForObra(ExcelJS, obraId, day){
  const wb=new ExcelJS.Workbook();
  const obra=obras[obraId];
  const resumen=calcRes(obraId);
  const cambios=auditEntriesForDay(day).filter(entry=>entry.obraId===obraId);
  const gastosBorrados=deletedRowsForObra(day,obraId,'gasto');
  const certificadosBorrados=deletedRowsForObra(day,obraId,'certificado');
  const gestorBorrado=deletedRowsForObra(day,obraId,'gestor');
  const ayudaBorrada=deletedRowsForObra(day,obraId,'ayuda_social');
  const pagosContratistaBorrados=deletedRowsForObra(day,obraId,'contratista_pago');
  wb.creator='Thalamus Finanzas';
  wb.created=new Date();

  const summary=wb.addWorksheet('Resumen');
  summary.addRow(['Campo','Valor']);
  applyHeaderStyle(summary.getRow(1));
  [
    ['ID',obra.id],
    ['Numero',obra.num||''],
    ['Obra',obra.nombre||''],
    ['Estado',obra.estado||''],
    ['Fecha inicio',obra.fecha||''],
    ['Contrato',parseFloat(obra.contrato)||0],
    ['Adenda',parseFloat(obra.adenda)||0],
    ['Total contrato',resumen.con],
    ['Bruto cobrado',resumen.br],
    ['Retenciones',resumen.re],
    ['Neto cobrado',resumen.ne],
    ['Total gastos',resumen.tg],
    ['Ganancia neta',resumen.gan],
    ['Para socios',resumen.corrCadaUno],
    ['Saldo a cobrar',resumen.scob],
    ['Ultima modificacion',auditTimeLabel(obra.lastModified||Date.now())],
    ['Dia exportado',day]
  ].forEach(row=>summary.addRow(row));
  summary.getColumn(2).numFmt='#,##0';
  autosizeWorksheet(summary,{1:22,2:24});

  addTableSheet(wb,'Gastos',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Cantidad',value:r=>r.cantidad},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Registro',value:r=>r.registro||''},
    {label:'Monto cheque',value:r=>parseFloat(r.montoCheque)||0},
    {label:'Devuelto',value:r=>parseFloat(r.devuelto)||0},
    {label:'Saldo total',value:r=>parseFloat(r.saldoTotal)||0},
    {label:'Saldo cheque',value:r=>parseFloat(r.saldoCheque)||0}
  ],gastos[obraId]||[]);

  addTableSheet(wb,'Certificados',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Bruto',value:r=>parseFloat(r.bruto)||0},
    {label:'Neto',value:r=>parseFloat(r.neto)||0}
  ],certificados[obraId]||[]);

  addTableSheet(wb,'Gestor',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0}
  ],gestorPagosForObra(obraId));

  addTableSheet(wb,'Ayuda Social',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0}
  ],ayudaSocialPagosForObra(obraId));

  addTableSheet(wb,'Contratistas',[
    {label:'Contratista',value:r=>r.nombre},
    {label:'Monto pactado',value:r=>parseFloat(r.monto)||0}
  ],getObraContratistas(obraId));

  addTableSheet(wb,'Pagos Contratista',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Contratista ID',value:r=>r.contratistaId||''}
  ],contratistaPagosForObra(obraId));

  addTableSheet(wb,'Gastos borrados hoy',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Borrado por',value:r=>r._deletedBy||''},
    {label:'Hora de borrado',value:r=>r._deletedAt||''}
  ],gastosBorrados,'Sin gastos borrados hoy');

  addTableSheet(wb,'Certificados borrados hoy',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Bruto',value:r=>parseFloat(r.bruto)||0},
    {label:'Neto',value:r=>parseFloat(r.neto)||0},
    {label:'Borrado por',value:r=>r._deletedBy||''},
    {label:'Hora de borrado',value:r=>r._deletedAt||''}
  ],certificadosBorrados,'Sin certificados borrados hoy');

  addTableSheet(wb,'Gestor borrado hoy',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Borrado por',value:r=>r._deletedBy||''},
    {label:'Hora de borrado',value:r=>r._deletedAt||''}
  ],gestorBorrado,'Sin pagos de gestor borrados hoy');

  addTableSheet(wb,'Ayuda borrada hoy',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Borrado por',value:r=>r._deletedBy||''},
    {label:'Hora de borrado',value:r=>r._deletedAt||''}
  ],ayudaBorrada,'Sin pagos de ayuda social borrados hoy');

  addTableSheet(wb,'Pagos contratista borrados',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Contratista ID',value:r=>r.contratistaId||''},
    {label:'Borrado por',value:r=>r._deletedBy||''},
    {label:'Hora de borrado',value:r=>r._deletedAt||''}
  ],pagosContratistaBorrados,'Sin pagos de contratista borrados hoy');

  addTableSheet(wb,'Cambios del dia',[
    {label:'Hora',value:r=>auditTimeLabel(r.time)},
    {label:'Usuario',value:r=>r.user},
    {label:'Accion',value:r=>r.action},
    {label:'Detalle',value:r=>r.detail||''},
    {label:'Eliminado',value:r=>r.deleted?'SI':'NO'},
    {label:'Modo',value:r=>r.mode}
  ],cambios);

  return wb;
}

function createDeletedWorkWorkbook(ExcelJS, deletedInfo, day){
  const wb=new ExcelJS.Workbook();
  const obra=deletedInfo.obra||{};
  const entry=deletedInfo.entry;
  wb.creator='Thalamus Finanzas';
  wb.created=new Date();

  const summary=wb.addWorksheet('Obra eliminada');
  summary.addRow(['Campo','Valor']);
  applyHeaderStyle(summary.getRow(1),'8B0000');
  [
    ['Obra',obra.nombre||''],
    ['Numero',obra.num||''],
    ['Estado',obra.estado||''],
    ['Fecha de eliminacion',auditTimeLabel(entry.time)],
    ['Eliminado por',entry.user||''],
    ['Dia exportado',day]
  ].forEach(row=>summary.addRow(row));
  autosizeWorksheet(summary,{1:24,2:26});

  addTableSheet(wb,'Gastos borrados',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0}
  ],deletedInfo.gastos||[]);

  addTableSheet(wb,'Certificados borrados',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Bruto',value:r=>parseFloat(r.bruto)||0},
    {label:'Neto',value:r=>parseFloat(r.neto)||0}
  ],deletedInfo.certificados||[]);

  addTableSheet(wb,'Gestor borrado',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0}
  ],deletedInfo.gestor||[]);

  addTableSheet(wb,'Ayuda social borrada',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0}
  ],deletedInfo.ayudaSocial||[]);

  addTableSheet(wb,'Contratistas borrados',[
    {label:'Contratista',value:r=>r.nombre||''},
    {label:'Monto pactado',value:r=>parseFloat(r.monto)||0}
  ],deletedInfo.contratistas?.catalogo||[]);

  addTableSheet(wb,'Pagos contratista borrados',[
    {label:'Fecha',value:r=>r.fecha},
    {label:'Concepto',value:r=>r.concepto},
    {label:'Monto',value:r=>parseFloat(r.monto)||0},
    {label:'Contratista ID',value:r=>r.contratistaId||''}
  ],deletedInfo.contratistas?.pagos||[]);

  return wb;
}

function createDailyChangesWorkbook(ExcelJS, day){
  const wb=new ExcelJS.Workbook();
  wb.creator='Thalamus Finanzas';
  wb.created=new Date();

  const entries=auditEntriesForDay(day);
  const currentWorks=changedCurrentObraIdsForDay(day).map(id=>obras[id]).filter(Boolean);
  const deletedWorks=deletedWorkSnapshotsForDay(day);

  addTableSheet(wb,'Cambios del dia',[
    {label:'Hora',value:r=>auditTimeLabel(r.time)},
    {label:'Usuario',value:r=>r.user},
    {label:'Accion',value:r=>r.action},
    {label:'Obra',value:r=>r.obraNombre||r.obraId||'General'},
    {label:'Tipo',value:r=>r.targetType||''},
    {label:'Detalle',value:r=>r.detail||''},
    {label:'Borrado',value:r=>r.deleted?'SI':'NO'},
    {label:'Modo',value:r=>r.mode||''}
  ],entries);

  addTableSheet(wb,'Obras activas exportadas',[
    {label:'Numero',value:r=>r.num||''},
    {label:'Obra',value:r=>r.nombre||''},
    {label:'Estado',value:r=>r.estado||''},
    {label:'Ultima modificacion',value:r=>auditTimeLabel(r.lastModified||Date.now())}
  ],currentWorks);

  addTableSheet(wb,'Obras eliminadas',[
    {label:'Numero',value:r=>r.obra?.num||''},
    {label:'Obra',value:r=>r.obra?.nombre||''},
    {label:'Eliminado por',value:r=>r.entry?.user||''},
    {label:'Fecha de eliminacion',value:r=>auditTimeLabel(r.entry?.time||Date.now())}
  ],deletedWorks);

  return wb;
}

async function writeWorkbookToFile(dirHandle, filename, workbook, fallbackName='archivo.xlsx'){
  const buffer=await workbook.xlsx.writeBuffer();
  let fileHandle;
  try{
    fileHandle=await dirHandle.getFileHandle(filename,{create:true});
  }catch(err){
    if(fallbackName&&fallbackName!==filename&&(err?.name==='NotFoundError'||err?.name==='TypeError')){
      fileHandle=await dirHandle.getFileHandle(fallbackName,{create:true});
    }else{
      throw err;
    }
  }
  const writable=await fileHandle.createWritable();
  await writable.write(buffer);
  await writable.close();
}

async function performDailyExcelExport(day, manual=false){
  if(!adminIsOwner()) return false;
  const cfg=getDailyExportConfig();
  if(!cfg.folderLabel){
    if(manual) toast('Primero elegi una carpeta de exportacion','err');
    updateDailyExportUi();
    return false;
  }

  let handle=null;
  try{
    handle=await getExportFolderHandle();
  }catch{
    handle=null;
  }
  if(!handle){
    if(manual) toast('No se encontro la carpeta guardada. Elegila de nuevo.','err');
    updateDailyExportStatus('Carpeta perdida. Volve a seleccionarla.', 'var(--acc3)');
    return false;
  }

  const permission=await queryFolderPermission(handle,manual);
  if(permission!=='granted'){
    if(manual) toast('El navegador no tiene permiso para escribir en esa carpeta','err');
    updateDailyExportStatus('Falta permiso para escribir en la carpeta elegida.', 'var(--acc3)');
    return false;
  }

  await loadAuditEntries();
  const ExcelJS=await ensureExcelJs();
  const activeIds=changedCurrentObraIdsForDay(day);
  const deletedWorks=deletedWorkSnapshotsForDay(day);
  if(!activeIds.length&&!deletedWorks.length){
    if(manual) toast('No hay cambios para exportar hoy','info');
    saveDailyExportConfig({lastExportDay:day});
    updateDailyExportUi();
    return true;
  }

  try{
    const dayFolderName=`Thalamus_${day}`;
    const dayDir=await getWritableDirectory(handle,dayFolderName,`Thalamus_${day.replace(/-/g,'')}`);

    const dailyWb=createDailyChangesWorkbook(ExcelJS,day);
    await writeWorkbookToFile(
      dayDir,
      `00_Cambios_del_dia_${day.replace(/-/g,'')}.xlsx`,
      dailyWb,
      `cambios_${day.replace(/-/g,'')}.xlsx`
    );

    for(const obraId of activeIds){
      if(!obras[obraId]) continue;
      const obra=obras[obraId];
      const names=exportNamesForObra(obra,obraId,day);
      const obraDir=await getWritableDirectory(dayDir,names.folderName,names.fallbackFolder);
      const wb=createArchiveWorkbookForObra(ExcelJS,obraId,day);
      await writeWorkbookToFile(obraDir,names.fileName,wb,names.fallbackFile);
    }

    if(deletedWorks.length){
      const deletedDir=await getWritableDirectory(dayDir,'_ELIMINADAS','ELIMINADAS');
      for(const deletedInfo of deletedWorks){
        const obra=deletedInfo.obra||{};
        const names=exportNamesForDeletedObra(obra,day);
        const wb=createDeletedWorkWorkbook(ExcelJS,deletedInfo,day);
        await writeWorkbookToFile(deletedDir,names.fileName,wb,names.fallbackFile);
      }
    }
  }catch(err){
    console.warn('Daily export filesystem error:',err);
    const msg=dailyExportErrorMessage(err);
    updateDailyExportStatus(msg,'var(--acc3)');
    if(manual) toast(msg,'err');
    return false;
  }

  saveDailyExportConfig({lastExportDay:day});
  updateDailyExportUi();
  if(manual){
    toast(`Excel diario exportado: ${activeIds.length} obra(s) activa(s) y ${deletedWorks.length} obra(s) eliminada(s).`,'ok');
  }
  return true;
}

function scheduleDailyExportRefresh(){
  const cfg=getDailyExportConfig();
  if(!cfg.enabled||!adminIsOwner()) return;
  clearTimeout(_auditExportTimer);
  _auditExportTimer=setTimeout(()=>{
    performDailyExcelExport(today(),false).catch(err=>console.warn('Daily export refresh error:',err));
  },1500);
}

window.chooseDailyExportFolder=async function(){
  if(!adminIsOwner()){
    toast('Solo el administrador puede configurar la carpeta diaria','err');
    return false;
  }
  if(!('showDirectoryPicker' in window)){
    toast('Este navegador no soporta carpetas locales automaticas','err');
    return false;
  }
  try{
    const handle=await window.showDirectoryPicker({mode:'readwrite'});
    await saveExportFolderHandle(handle);
    saveDailyExportConfig({folderLabel:handle.name||'carpeta'});
    updateDailyExportUi();
    toast('Carpeta diaria guardada','ok');
    return true;
  }catch(err){
    if(err?.name!=='AbortError'){
      toast('No se pudo guardar la carpeta','err');
    }
    return false;
  }
};

window.clearDailyExportFolder=async function(){
  if(!adminIsOwner()) return false;
  await clearExportFolderHandle();
  saveDailyExportConfig({folderLabel:'',enabled:false});
  updateDailyExportUi();
  toast('Carpeta diaria eliminada','info');
  return true;
};

window.enableDailyExcelAutoExport=async function(){
  if(!adminIsOwner()){
    toast('Solo el administrador puede activar la exportacion automatica','err');
    return false;
  }
  const cfg=getDailyExportConfig();
  if(!cfg.folderLabel){
    toast('Primero elegi la carpeta de destino','err');
    return false;
  }
  saveDailyExportConfig({enabled:true});
  updateDailyExportUi();
  toast('Exportacion automatica diaria activada','ok');
  await performDailyExcelExport(today(),false);
  return true;
};

window.disableDailyExcelAutoExport=function(){
  if(!adminIsOwner()) return false;
  saveDailyExportConfig({enabled:false});
  updateDailyExportUi();
  toast('Exportacion automatica diaria desactivada','info');
  return true;
};

window.exportTodayExcelNow=async function(){
  if(!adminIsOwner()){
    toast('Solo el administrador puede exportar','err');
    return false;
  }
  try{
    updateDailyExportStatus('Exportando excels del dia...', 'var(--gold)');
    const ok=await performDailyExcelExport(today(),true);
    updateDailyExportUi();
    return ok;
  }catch(err){
    console.warn('Manual excel export error:',err);
    updateDailyExportStatus('Fallo la exportacion diaria.', 'var(--acc3)');
    toast('No se pudo exportar el Excel diario','err');
    return false;
  }
};

window.renderAdminAuditCard=async function(force=false){
  ensureAdminToolsUi();
  const card=gs('adminAuditCard');
  const list=gs('adminAuditList');
  if(!card||!list) return;

  card.style.display=adminIsOwner()?'block':'none';
  if(!adminIsOwner()) return;

  if(force) _auditEntriesCache=null;
  const entries=await loadAuditEntries(force);
  const day=today();
  const filtered=(entries||[]).filter(entry=>auditDayFromTs(entry.time)===day);

  if(!filtered.length){
    list.innerHTML='<div style="padding:.8rem;color:var(--muted);font-size:.72rem">Sin cambios registrados hoy.</div>';
    return;
  }

  list.innerHTML=filtered.slice(0,120).map(entry=>`
    <div class="user-row" style="align-items:flex-start">
      <span style="font-size:.62rem;color:var(--muted);min-width:132px">${esc(auditTimeLabel(entry.time))}</span>
      <span class="u-name" style="flex:1">${esc(entry.user||'-')} - ${esc(entry.action||'-')}</span>
      <span style="font-size:.64rem;color:var(--dim);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(entry.obraNombre||entry.obraId||'General')}</span>
      <span style="font-size:.6rem;color:${entry.deleted?'var(--acc3)':'var(--green)'}">${entry.deleted?'BORRADO':'CAMBIO'}</span>
    </div>
  `).join('');
};

function ensureAdminToolsUi(){
  const configPage=gs('page-config');
  if(!configPage) return;

  if(!gs('dailyExcelCard')){
    const card=document.createElement('div');
    card.className='card';
    card.id='dailyExcelCard';
    card.style.background='rgba(61,212,154,.04)';
    card.style.borderColor='rgba(61,212,154,.18)';
    card.innerHTML=`
      <div class="card-title">Backup diario automatico en Excel</div>
      <div style="font-size:.72rem;color:var(--dim);margin-bottom:.6rem;line-height:1.6">
        Elegis una carpeta una vez. Desde ahi, esta copia va guardando cada dia solo las obras modificadas en Excel. Tambien deja un Excel general de cambios, hojas con gastos o certificados borrados y una carpeta _ELIMINADAS para obras borradas.
      </div>
      <div id="dailyExportStatus" style="font-size:.72rem;margin-bottom:.65rem">Carpeta: no configurada | Auto diario inactivo</div>
      <div class="row-btns">
        <button class="btn btn-secondary" id="dailyExportChooseBtn" onclick="chooseDailyExportFolder()">Elegir carpeta</button>
        <button class="btn btn-primary" id="dailyExportEnableBtn" onclick="enableDailyExcelAutoExport()">Activar auto diario</button>
        <button class="btn btn-ghost" id="dailyExportDisableBtn" onclick="disableDailyExcelAutoExport()">Desactivar auto</button>
        <button class="btn btn-ghost" onclick="exportTodayExcelNow()">Exportar hoy ahora</button>
        <button class="btn btn-ghost" id="dailyExportClearBtn" onclick="clearDailyExportFolder()">Quitar carpeta</button>
      </div>
      <div style="font-size:.66rem;color:var(--muted);margin-top:.55rem;line-height:1.5">
        Nota: esto funciona mientras abris la app en este navegador. Si un dia la app no se abre, el navegador no puede exportar solo en segundo plano.
      </div>
    `;
    configPage.appendChild(card);
  }

  if(!gs('adminAuditCard')){
    const card=document.createElement('div');
    card.className='card';
    card.id='adminAuditCard';
    card.style.background='rgba(200,168,75,.04)';
    card.style.borderColor='rgba(200,168,75,.18)';
    card.innerHTML=`
      <div class="card-title">Registro de cambios de hoy</div>
      <div style="font-size:.72rem;color:var(--dim);margin-bottom:.6rem;line-height:1.6">
        Visible solo para el administrador. Muestra cambios y borrados del dia.
      </div>
      <div class="row-btns" style="margin-bottom:.55rem">
        <button class="btn btn-ghost" onclick="renderAdminAuditCard(true)">Actualizar registro</button>
      </div>
      <div id="adminAuditList" style="background:var(--surf);border:1px solid var(--border);border-radius:var(--r-sm);max-height:260px;overflow:auto"></div>
    `;
    configPage.appendChild(card);
  }

  updateDailyExportUi();
}

function refreshAdminToolsVisibility(){
  ensureAdminToolsUi();
  const dailyCard=gs('dailyExcelCard');
  if(dailyCard) dailyCard.style.display=adminIsOwner()?'block':'none';
  renderAdminAuditCard();
}

(function hookAdminToolsUiRefresh(){
  const originalApplyRole=window.applyRole;
  if(typeof originalApplyRole==='function'&&!originalApplyRole._adminToolsWrapped){
    const wrapped=function(...args){
      const result=originalApplyRole.apply(this,args);
      refreshAdminToolsVisibility();
      return result;
    };
    wrapped._adminToolsWrapped=true;
    window.applyRole=wrapped;
  }

  const originalNavTo=window.navTo;
  if(typeof originalNavTo==='function'&&!originalNavTo._adminToolsWrapped){
    const wrapped=function(...args){
      const result=originalNavTo.apply(this,args);
      refreshAdminToolsVisibility();
      return result;
    };
    wrapped._adminToolsWrapped=true;
    window.navTo=wrapped;
  }

  const originalInitApp=window.initApp;
  if(typeof originalInitApp==='function'&&!originalInitApp._adminToolsWrapped){
    const wrapped=async function(...args){
      const result=await originalInitApp.apply(this,args);
      refreshAdminToolsVisibility();
      const cfg=getDailyExportConfig();
      if(adminIsOwner()&&cfg.enabled){
        performDailyExcelExport(today(),false).catch(err=>console.warn('Auto daily export error:',err));
      }
      return result;
    };
    wrapped._adminToolsWrapped=true;
    window.initApp=wrapped;
  }
})();

ensureAdminToolsUi();
installAuditWrappers();
setTimeout(()=>{
  installAuditWrappers();
  refreshAdminToolsVisibility();
},0);
