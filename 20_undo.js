// =======================================
// UNDO / CONTROL+Z
// =======================================
const LEGACY_UNDO_STACK_KEY='th_undo_stack_v1';
const UNDO_STACK_NS='th_undo_stack_v1';
const UNDO_LIMIT=10;

let _undoStack=[];
let _undoApplying=false;
let _undoDepth=0;

function currentPageName(){
  return document.querySelector('.page.active')?.id?.replace('page-','')||'obras';
}

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}

function undoStorageKey(userName){
  const user=String(userName||_currentUser||'').trim().toLowerCase();
  return user?`${UNDO_STACK_NS}:${user}`:'';
}

function sanitizeUndoEntries(entries){
  return (Array.isArray(entries)?entries:[]).filter(entry=>entry&&entry.data);
}

function migrateLegacyUndoStack(targetKey){
  const legacyKey=LEGACY_UNDO_STACK_KEY;
  if(!targetKey||targetKey===legacyKey) return [];
  try{
    const legacyEntries=sanitizeUndoEntries(JSON.parse(localStorage.getItem(legacyKey)||'[]'));
    if(!legacyEntries.length) return [];
    localStorage.setItem(targetKey,JSON.stringify(legacyEntries.slice(0,UNDO_LIMIT)));
    localStorage.removeItem(legacyKey);
    return legacyEntries.slice(0,UNDO_LIMIT);
  }catch{
    return [];
  }
}

function captureUndoData(){
  return cloneJson({
    obras,
    gastos,
    certificados,
    retiros,
    gestorPagos,
    ayudaSocialPagos,
    contratistaPagos,
    cfg
  });
}

function serializeUndoData(){
  try{
    return JSON.stringify(captureUndoData());
  }catch{
    return '';
  }
}

function buildUndoEntry(label){
  return {
    label:label||'Cambio',
    ts:Date.now(),
    page:currentPageName(),
    cur:cur||'',
    data:captureUndoData()
  };
}

function persistUndoStack(){
  const storageKey=undoStorageKey();
  let next=[..._undoStack].slice(0,UNDO_LIMIT);
  if(!storageKey){
    _undoStack=next;
    return;
  }
  while(next.length){
    try{
      localStorage.setItem(storageKey,JSON.stringify(next));
      _undoStack=next;
      return;
    }catch{
      next.pop();
    }
  }
  _undoStack=[];
  try{localStorage.removeItem(storageKey);}catch{}
}

function loadUndoStack(userName){
  const storageKey=undoStorageKey(userName);
  if(!storageKey){
    _undoStack=[];
    syncUndoUI();
    return;
  }
  try{
    const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');
    _undoStack=parsed===null?migrateLegacyUndoStack(storageKey):sanitizeUndoEntries(parsed);
  }catch{
    _undoStack=migrateLegacyUndoStack(storageKey);
  }
  syncUndoUI();
}

function pushUndoEntry(entry){
  if(!entry||!entry.data) return;
  _undoStack.unshift(entry);
  _undoStack=_undoStack.slice(0,UNDO_LIMIT);
  persistUndoStack();
  syncUndoUI();
}

function popUndoEntry(){
  const entry=_undoStack.shift()||null;
  persistUndoStack();
  syncUndoUI();
  return entry;
}

function canUseUndo(){
  return !!_currentUser;
}

function syncUndoUI(){
  const btn=gs('undoBtn');
  if(!btn) return;
  const hasUndo=_undoStack.length>0;
  btn.disabled=!canUseUndo()||!hasUndo||_undoApplying;
  btn.classList.toggle('has-undo',hasUndo&&!_undoApplying);
  if(_undoApplying){
    btn.title='Restaurando cambio...';
  }else if(hasUndo){
    btn.title='Deshacer: '+_undoStack[0].label+' (Ctrl+Z)';
  }else{
    btn.title='No hay cambios para deshacer';
  }
}

function restoreUndoSelection(entry){
  const targetCur=entry?.cur&&obras[entry.cur]?entry.cur:null;
  if(targetCur) cur=targetCur;
  else if(cur&&!obras[cur]) cur=null;
  if(gs('obraSelect')) gs('obraSelect').value=cur||'';

  const requestedPage=entry?.page||'obras';
  const needsObra=['dashboard','gastos','certificados','resumen'];
  const safePage=needsObra.includes(requestedPage)&&!cur?'obras':requestedPage;
  navTo(safePage);
}

window.undoLastAction=async function(){
  if(_undoApplying){
    toast('Ya se esta restaurando un cambio','info');
    return false;
  }
  if(!canUseUndo()){
    toast('Inicia sesion para deshacer cambios','err');
    return false;
  }

  const entry=popUndoEntry();
  if(!entry){
    toast('No hay cambios para deshacer','info');
    return false;
  }

  _undoApplying=true;
  syncUndoUI();
  try{
    applyBackupData(cloneJson(entry.data));
    restoreUndoSelection(entry);
    try{
      await syncCurrentStateToStorage();
    }catch(syncErr){
      console.warn('Undo sync error:',syncErr);
      toast('Cambio deshecho solo en modo local','info');
    }
    toast('Deshecho: '+entry.label,'ok');
    return true;
  }catch(err){
    console.error('Undo restore error:',err);
    _undoStack.unshift(entry);
    persistUndoStack();
    toast('No se pudo deshacer: '+err.message,'err');
    return false;
  }finally{
    _undoApplying=false;
    syncUndoUI();
  }
};

function wrapUndoAction(name,label){
  const original=window[name];
  if(typeof original!=='function'||original._undoWrapped) return;

  const wrapped=async function(...args){
    if(_undoApplying) return original.apply(this,args);

    const isRootAction=_undoDepth===0;
    const beforeState=isRootAction?serializeUndoData():'';
    const beforeEntry=isRootAction&&beforeState?buildUndoEntry(label):null;
    let result;
    let thrown;
    _undoDepth++;
    try{
      result=await original.apply(this,args);
    }catch(err){
      thrown=err;
    }finally{
      _undoDepth=Math.max(0,_undoDepth-1);
    }

    const afterState=isRootAction?serializeUndoData():'';
    if(isRootAction&&beforeEntry&&beforeState&&afterState&&beforeState!==afterState){
      pushUndoEntry(beforeEntry);
    }

    if(thrown){
      throw thrown;
    }
    return result;
  };

  wrapped._undoWrapped=true;
  window[name]=wrapped;
}

function installUndoWrappers(){
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

  Object.entries(labels).forEach(([name,label])=>wrapUndoAction(name,label));
}

function shouldHandleUndoShortcut(event){
  if(!(event.ctrlKey||event.metaKey)) return false;
  if(event.altKey||event.shiftKey) return false;
  if(String(event.key||'').toLowerCase()!=='z') return false;

  const target=event.target;
  if(target&&(
    target.tagName==='INPUT'||
    target.tagName==='TEXTAREA'||
    target.tagName==='SELECT'||
    target.isContentEditable
  )){
    return false;
  }
  return true;
}

document.addEventListener('keydown',event=>{
  if(!shouldHandleUndoShortcut(event)) return;
  event.preventDefault();
  window.undoLastAction();
});

(function wrapAuthForUndoUi(){
  const originalLogin=window.doLogin;
  if(typeof originalLogin==='function'&&!originalLogin._undoUiWrapped){
    const wrapped=async function(...args){
      const result=await originalLogin.apply(this,args);
      loadUndoStack();
      return result;
    };
    wrapped._undoUiWrapped=true;
    window.doLogin=wrapped;
  }

  const originalLogout=window.doLogout;
  if(typeof originalLogout==='function'&&!originalLogout._undoUiWrapped){
    const wrapped=function(...args){
      _undoStack=[];
      syncUndoUI();
      return originalLogout.apply(this,args);
    };
    wrapped._undoUiWrapped=true;
    window.doLogout=wrapped;
  }
})();

installUndoWrappers();
loadUndoStack();
