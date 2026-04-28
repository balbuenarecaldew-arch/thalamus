// =======================================
// THEME SWITCHER
// =======================================
function syncThemeSelects(css){
  document.querySelectorAll('.theme-select-sync').forEach(sel=>{
    try{ sel.value=css; }catch{}
  });
}

window.switchTheme=function(css){
  const oldLink=document.getElementById('themeCSS');
  if(!oldLink) return;
  const newLink=document.createElement('link');
  newLink.rel='stylesheet';
  newLink.href=css;
  newLink.id='themeCSS_new';
  newLink.onload=function(){
    oldLink.remove();
    newLink.id='themeCSS';
    localStorage.setItem('th_theme',css);
    syncThemeSelects(css);
  };
  newLink.onerror=function(){
    newLink.remove();
    syncThemeSelects(oldLink.href.split('/').pop());
    toast('No se pudo cargar "'+css+'" - verifica que el archivo existe en tu repo','err');
  };
  document.head.appendChild(newLink);
};

(function loadSavedTheme(){
  const saved=localStorage.getItem('th_theme');
  const link=document.getElementById('themeCSS');
  if(!link){
    return;
  }
  const current=link.href.split('/').pop();
  syncThemeSelects(saved||current||'oscuro.css');
  if(!saved||current===saved){
    return;
  }
  const newLink=document.createElement('link');
  newLink.rel='stylesheet';
  newLink.href=saved;
  newLink.id='themeCSS_init';
  newLink.onload=function(){
    link.remove();
    newLink.id='themeCSS';
    syncThemeSelects(saved);
  };
  newLink.onerror=function(){
    newLink.remove();
    localStorage.removeItem('th_theme');
    syncThemeSelects(current);
  };
  document.head.appendChild(newLink);
})();
