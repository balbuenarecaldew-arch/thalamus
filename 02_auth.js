// =======================================
// AUTH AND ROLES
// =======================================
const ADMIN_USER='wuilian';

let _currentUser=null;
let _currentRole='socio';

function isAdmin(){
  return _currentUser===ADMIN_USER;
}

function isSocioRole(){
  return _currentRole!=='operador';
}

async function hashPass(p){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+'_thalamus2024'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function generateSalt(len=16){
  const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s='';
  for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function getUsers(){
  try{return JSON.parse(localStorage.getItem('th_users'))||{};}catch{return {};}
}

function saveUsersDB(u){
  localStorage.setItem('th_users',JSON.stringify(u));
}

async function verifyPasswordForUser(user,pw){
  const users=getUsers();
  const uData=users[user];
  if(!uData||!pw) return false;
  const computedHash=uData.salt
    ? await hashPass(pw+uData.salt)
    : await hashPass(pw);
  return uData.hash===computedHash;
}

window.verifyPasswordForUser=verifyPasswordForUser;
window.verifyCurrentPassword=function(pw){
  return verifyPasswordForUser(_currentUser,pw);
};

window.requireSocio=function(msg='Sin permisos para esta accion'){
  if(isSocioRole()) return true;
  toast(msg,'err');
  return false;
};

(async function seedUsers(){
  const u=getUsers();
  if(Object.keys(u).length===0){
    const saltF=generateSalt();
    const saltW=generateSalt();
    u.fernando={hash:await hashPass('fernando'+saltF),salt:saltF,role:'socio'};
    u.wuilian={hash:await hashPass('wuilian'+saltW),salt:saltW,role:'socio'};
    saveUsersDB(u);
  }
})();

window.doLogin=async function(){
  const el=id=>document.getElementById(id);
  const user=el('login-user').value.trim().toLowerCase();
  const pass=el('login-pass').value;

  if(!user||!pass){
    el('login-err').textContent='Completa usuario y contrasena';
    return;
  }

  const users=getUsers();
  if(!users[user]){
    el('login-err').textContent='Usuario no encontrado';
    return;
  }

  const uData=users[user];
  if(!await verifyPasswordForUser(user,pass)){
    el('login-err').textContent='Contrasena incorrecta';
    return;
  }

  if(!uData.salt){
    const newSalt=generateSalt();
    uData.hash=await hashPass(pass+newSalt);
    uData.salt=newSalt;
    users[user]=uData;
    saveUsersDB(users);
  }

  _currentUser=user;
  _currentRole=uData.role||'socio';
  localStorage.setItem('th_last_user',user);
  el('loginOverlay').classList.add('hidden');
  applyRole();
  if(window.initApp) window.initApp();
};

window.doLogout=function(){
  _currentUser=null;
  _currentRole='socio';
  location.reload();
};

function applyRole(){
  const el=id=>document.getElementById(id);
  el('topAvatar').textContent=_currentUser?_currentUser.charAt(0).toUpperCase():'?';
  el('topUser').textContent=_currentUser||'';

  const isOp=_currentRole==='operador';
  document.querySelectorAll('.socio-only').forEach(node=>{
    if(isOp) node.classList.add('role-restricted');
    else node.classList.remove('role-restricted');
  });

  document.querySelectorAll('.owner-only').forEach(node=>{
    if(!isAdmin()) node.classList.add('role-restricted');
    else node.classList.remove('role-restricted');
  });

  const newBtn=document.querySelector('.btn-new');
  if(newBtn){
    if(isOp) newBtn.classList.add('role-restricted');
    else newBtn.classList.remove('role-restricted');
  }

  renderUserList();
}

function renderUserList(){
  const list=document.getElementById('userList');
  if(!list) return;
  const users=getUsers();
  const admin=isAdmin();
  let h='';

  for(const [name,data] of Object.entries(users)){
    const self=name===_currentUser;
    const role=data.role||'socio';
    const safeName=esc(name);
    const encName=encArg(name);
    h+='<div class="user-row">';
    h+='<span class="u-name">'+(self?'<b>'+safeName+'</b> (vos)':safeName)+'</span>';
    h+='<span style="font-size:.64rem;color:var(--muted);font-family:\'JetBrains Mono\',monospace;">****</span>';
    h+='<span class="u-role '+role+'">'+(role==='operador'?'Operador':'Socio')+'</span>';

    if(admin&&!self){
      const nextRole=role==='operador'?'socio':'operador';
      const nextLabel=nextRole==='operador'?'-> Operador':'-> Socio';
      h+=' <button class="btn-logout" style="margin-left:6px;border-color:var(--accent);color:var(--accent)" onclick="adminSetRole(decodeURIComponent(\''+encName+'\'),\''+nextRole+'\')">'+nextLabel+'</button>';
      h+=' <button class="btn-logout" style="margin-left:4px;border-color:var(--gold);color:var(--gold)" onclick="adminResetPass(decodeURIComponent(\''+encName+'\'))">Reset</button>';
      h+=' <button class="btn-logout" style="margin-left:4px" onclick="adminDelUser(decodeURIComponent(\''+encName+'\'))">Borrar</button>';
    }

    h+='</div>';
  }

  list.innerHTML=h;
  renderLoginHistory();
}

window.adminAddUser=async function(){
  if(!isAdmin()){
    toast('Solo el administrador puede crear usuarios','err');
    return;
  }
  const name=document.getElementById('adm-user').value.trim().toLowerCase();
  const pass=document.getElementById('adm-pass').value;
  const role=document.getElementById('adm-role').value;
  if(!name||!pass){
    toast('Completa usuario y contrasena','err');
    return;
  }
  if(name.length<2){
    toast('Usuario: minimo 2 caracteres','err');
    return;
  }
  if(!/^[a-z0-9._-]+$/.test(name)){
    toast('Usuario invalido','err');
    return;
  }
  if(pass.length<4){
    toast('Contrasena: minimo 4 caracteres','err');
    return;
  }
  const users=getUsers();
  if(users[name]){
    toast('Ese usuario ya existe','err');
    return;
  }
  const salt=generateSalt();
  users[name]={hash:await hashPass(pass+salt),salt,role};
  saveUsersDB(users);
  document.getElementById('adm-user').value='';
  document.getElementById('adm-pass').value='';
  renderUserList();
  toast('Usuario "'+name+'" creado como '+role,'ok');
};

window.adminDelUser=function(name){
  if(!isAdmin()){
    toast('Sin permisos','err');
    return;
  }
  requireAuth('Eliminar usuario "'+name+'".',()=>{
    const users=getUsers();
    delete users[name];
    saveUsersDB(users);
    renderUserList();
    toast('Usuario eliminado','ok');
  });
};

window.adminResetPass=async function(name){
  if(!isAdmin()){
    toast('Solo el administrador puede cambiar contrasenas','err');
    return;
  }
  const np=prompt('Nueva contrasena para "'+name+'" (minimo 4):');
  if(!np||np.length<4){
    toast('Contrasena muy corta','err');
    return;
  }
  const users=getUsers();
  const salt=generateSalt();
  users[name].hash=await hashPass(np+salt);
  users[name].salt=salt;
  saveUsersDB(users);
  toast('Contrasena de "'+name+'" actualizada','ok');
};

window.adminSetRole=function(name,newRole){
  if(!isAdmin()){
    toast('Sin permisos','err');
    return;
  }
  const users=getUsers();
  if(!users[name]){
    toast('Usuario no encontrado','err');
    return;
  }
  users[name].role=newRole;
  saveUsersDB(users);
  renderUserList();
  toast('"'+name+'" ahora es '+newRole,'ok');
};

document.addEventListener('DOMContentLoaded',()=>{
  const lastUser=localStorage.getItem('th_last_user');
  const userInput=document.getElementById('login-user');
  if(lastUser&&userInput&&!userInput.value) userInput.value=lastUser;
});

document.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    const a=document.activeElement;
    if(a&&(a.id==='login-user'||a.id==='login-pass')) doLogin();
  }
});

async function trackLogin(user){
  try{
    const log=await fbGetDoc('logins/history')||{};
    if(!log[user]) log[user]=[];
    log[user].unshift({time:Date.now(),date:new Date().toLocaleString('es-PY')});
    if(log[user].length>10) log[user]=log[user].slice(0,10);
    await fbSet('logins/history',log);
  }catch(e){
    const log=JSON.parse(localStorage.getItem('th_logins')||'{}');
    if(!log[user]) log[user]=[];
    log[user].unshift({time:Date.now(),date:new Date().toLocaleString('es-PY')});
    if(log[user].length>10) log[user]=log[user].slice(0,10);
    localStorage.setItem('th_logins',JSON.stringify(log));
  }
}

async function getLogins(){
  try{
    const log=await fbGetDoc('logins/history');
    if(log) return log;
  }catch(e){}
  try{return JSON.parse(localStorage.getItem('th_logins')||'{}');}catch{return {};}
}

async function renderLoginHistory(){
  const el=document.getElementById('loginHistory');
  if(!el) return;
  const log=await getLogins();
  const users=getUsers();
  let h='';
  for(const [name] of Object.entries(users)){
    const entries=log[name]||[];
    const last=entries[0];
    const isSelf=name===_currentUser;
    const dot=last?'OK':'--';
    const ago=last?timeAgo(last.time):'Nunca se conecto';
    const safeName=esc(name);
    h+='<div class="user-row">';
    h+='<span style="font-size:.8rem;margin-right:4px">'+dot+'</span>';
    h+='<span class="u-name" style="flex:1">'+(isSelf?'<b>'+safeName+'</b> (vos)':safeName)+'</span>';
    h+='<span style="font-size:.66rem;color:var(--dim)">'+ago+'</span>';
    if(last) h+='<span style="font-size:.58rem;color:var(--muted);margin-left:6px">'+esc(last.date)+'</span>';
    h+='</div>';
  }
  el.innerHTML=h;
}

function timeAgo(ts){
  const diff=Date.now()-ts;
  const mins=Math.floor(diff/60000);
  if(mins<1) return 'Ahora mismo';
  if(mins<60) return 'Hace '+mins+' min';
  const hrs=Math.floor(mins/60);
  if(hrs<24) return 'Hace '+hrs+' h';
  const days=Math.floor(hrs/24);
  if(days===1) return 'Ayer';
  return 'Hace '+days+' dias';
}

window.addEventListener('load',()=>{
  const socioOnlyFns=[
    'openNuevaObra','editObra','saveObra','delObra',
    'saveRetiro','delRetiro',
    'saveGestorPago','delGestorPago','saveEditGestor','updateGestorMontoObra','resetGestorMontoObra','quickAddGestorObra','limpiarGestorObra','activarObraGestor','resetTodosGestorAuto','borrarTodosGestor',
    'saveAyudaPago','delAyudaPago','saveEditAyuda','updateAyudaMontoObra','resetAyudaMontoObra','quickAddAyudaObra','limpiarAyudaObra','resetTodosAyudaAuto','borrarTodosAyuda',
    'addContratistaToObra','removeContratistaFromObra','updateContratistaNombre','updateContratistaMonto','saveContratistaPago','delContratistaPago','saveEditContratista','quickAddContratistaObra','limpiarContratistaObra','borrarTodosContratista',
    'runAI'
  ];

  socioOnlyFns.forEach(name=>{
    const original=window[name];
    if(typeof original!=='function'||original._socioWrapped) return;
    const wrapped=function(...args){
      if(!requireSocio('Solo socios pueden usar esta funcion')) return;
      return original.apply(this,args);
    };
    wrapped._socioWrapped=true;
    window[name]=wrapped;
  });

  const preSanitizeDom={
    saveEditGestor:()=>{const el=gs('egs-concepto'); if(el) el.value=sanitizeText(el.value,120);},
    saveEditAyuda:()=>{const el=gs('eas-concepto'); if(el) el.value=sanitizeText(el.value,120);},
    saveEditContratista:()=>{const el=gs('ect-concepto'); if(el) el.value=sanitizeText(el.value,120);},
    quickAddGestorObra:(obraId)=>{const el=gs('gqa-c-'+obraId); if(el) el.value=sanitizeText(el.value,120);},
    quickAddAyudaObra:(obraId)=>{const el=gs('aqa-c-'+obraId); if(el) el.value=sanitizeText(el.value,120);},
    quickAddContratistaObra:(obraId,contratistaId)=>{const el=gs('cqa-c-'+obraId+'-'+contratistaId); if(el) el.value=sanitizeText(el.value,120);}
  };

  Object.entries(preSanitizeDom).forEach(([name,before])=>{
    const original=window[name];
    if(typeof original!=='function'||original._sanitizeWrapped) return;
    const wrapped=function(...args){
      before(...args);
      return original.apply(this,args);
    };
    wrapped._sanitizeWrapped=true;
    window[name]=wrapped;
  });

  if(typeof window.updateContratistaNombre==='function'){
    const original=window.updateContratistaNombre;
    if(!original._sanitizeWrapped){
      const wrapped=function(obraId,cId,nombre){
        return original.call(this,obraId,cId,sanitizeText(nombre,80)||'Contratista');
      };
      wrapped._sanitizeWrapped=true;
      window.updateContratistaNombre=wrapped;
    }
  }

  window.addContratistaToObra=async function(obraId){
    if(!requireSocio('Solo socios pueden usar esta funcion')) return;
    const o=obras[obraId];
    if(!o) return;
    if(!o.contratistas) o.contratistas=[];
    const nombre=prompt('Nombre del contratista:');
    const cleanName=sanitizeText(nombre,80);
    if(!cleanName) return;
    o.contratistas.push({id:uid(),nombre:cleanName,monto:0});
    await fbSet('obras/'+obraId,o);
    saveCache();
    renderContratista();
    toast('Contratista "'+cleanName+'" agregado','ok');
  };
});
