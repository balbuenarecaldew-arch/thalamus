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
