// Variable global para memorizar el scroll de cada sección
const _scrollMemory = {};
function navTo(name){
  // --- 1. GUARDAR POSICIÓN ACTUAL ---
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const currentId = activePage.id.replace('page-', '');
    _scrollMemory[currentId] = activePage.scrollTop;
  }

  // Operador restrictions (Tu lógica original)
  const restricted=['global','dashboard','resumen','utilidades','gestor','ayudaSocial','contratista','ai','config'];
  if(_currentRole==='operador'&&restricted.includes(name)){name='obras';}

  // Limpieza de activos (Tu lógica original)
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));

  const targetPage = gs('page-'+name);
  targetPage?.classList.add('active');
  gs('nav-'+name)?.classList.add('active');
  gs('bn-'+name)?.classList.add('active');
  closeSidebar();

  // --- 2. RENDER SEGÚN PÁGINA (Tu lógica original) ---
  if(name==='obras') renderObrasGrid();
  else if(name==='dashboard') renderDash();
  else if(name==='gastos') renderGastosPage();
  else if(name==='certificados') renderCerts();
  else if(name==='resumen') renderResumen();
  else if(name==='global') renderGlobal();
  else if(name==='utilidades') renderUtilidades();
  else if(name==='gestor') renderGestor();
  else if(name==='ayudaSocial') renderAyudaSocial();
  else if(name==='contratista') renderContratista();
  else if(name==='config'){ loadBackupList(); }

  // --- 3. RESTAURAR POSICIÓN GUARDADA ---
  if (_scrollMemory[name] !== undefined) {
    // Usamos un pequeño delay para que el renderizado termine de dibujar los elementos
    setTimeout(() => {
      if(targetPage) targetPage.scrollTop = _scrollMemory[name];
    }, 60);
  }
}
