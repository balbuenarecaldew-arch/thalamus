// =======================================
// CERTIFICADOS
// =======================================
window.updCert=function(){
  const b=parseFloat(gs('c-b').value)||0;
  const n=parseFloat(gs('c-n').value)||0;
  gs('c-rc').textContent=fGs(b-n);
};

window.clrCert=function(){
  gs('c-f').value=today();
  gs('c-c').value='';
  gs('c-b').value='';
  gs('c-n').value='';
  gs('c-rc').textContent='Gs 0';
};

window.saveCert=async function(){
  return runLocked('saveCert',async()=>{
    if(!cur){
      toast('Selecciona una obra','err');
      return;
    }
    if(obras[cur]?.estado==='FINALIZADA'){
      toast('Obra finalizada. Desbloqueala desde editar obra.','err');
      return;
    }

    const conc=sanitizeText(v('c-c'),160);
    if(!conc){
      toast('Ingresa el concepto','err');
      return;
    }

    if(!certificados[cur]) certificados[cur]=[];
    const c={
      id:uid(),
      fecha:v('c-f'),
      concepto:conc,
      bruto:parseFloat(gs('c-b').value)||0,
      neto:parseFloat(gs('c-n').value)||0
    };
    c.retencion=c.bruto-c.neto;

    certificados[cur].push(c);
    await fbSet('obras/'+cur+'/certificados/'+c.id,c);
    window.clrCert();
    renderCerts();
    await touchObra();
    toast('Certificado registrado','ok');
  },'El certificado ya se esta guardando');
};

window.delC=function(id){
  requireAuth('Eliminar este certificado.',async()=>{
    certificados[cur]=(certificados[cur]||[]).filter(c=>c.id!==id);
    renderCerts();
    try{ await fbDel('obras/'+cur+'/certificados/'+id); }catch(e){}
    try{ localStorage.removeItem('oc/obras/'+cur+'/certificados/'+id); }catch(e){}
    await touchObra();
    toast('Eliminado','info');
  });
};

window.borrarTodosCerts=function(){
  if(!cur||!obras[cur]) return;
  const list=certificados[cur]||[];
  if(!list.length){
    toast('No hay certificados para borrar','info');
    return;
  }
  const nombre=obras[cur].nombre||'';
  requireAuth('Vas a borrar los '+list.length+' certificados de "'+nombre+'".\nEsta accion no se puede deshacer.',async()=>{
    const toDelete=[...list];
    certificados[cur]=[];
    renderCerts();
    toast('Borrando de la base de datos...','info');
    for(const c of toDelete){
      const cid=c.id;
      if(!cid) continue;
      try{ await fbDel('obras/'+cur+'/certificados/'+cid); }catch(e){ console.warn('fbDel error:',e); }
      try{ localStorage.removeItem('oc/obras/'+cur+'/certificados/'+cid); }catch(e){}
    }
    await touchObra();
    toast('Todos los certificados de "'+nombre+'" eliminados','ok');
  });
};

// =======================================
// EDITAR GASTO INDIVIDUAL
// =======================================
window.editG=function(id,num){
  if(obras[cur]?.estado==='FINALIZADA'){
    toast('Obra finalizada. Desbloqueala desde editar obra.','err');
    return;
  }
  const g=(gastos[cur]||[]).find(row=>row.id===id);
  if(!g){
    toast('Gasto no encontrado','err');
    return;
  }
  gs('eg-id').value=id;
  gs('editGNum').textContent='#'+num;
  gs('eg-fecha').value=g.fecha||'';
  gs('eg-concepto').value=g.concepto||'';
  gs('eg-cantidad').value=g.cantidad||'';
  gs('eg-monto').value=g.monto||0;
  gs('eg-registro').value=g.registro||'';
  gs('eg-montoCheque').value=g.montoCheque||0;
  gs('eg-devuelto').value=g.devuelto||0;
  gs('eg-saldoTotal').value=g.saldoTotal||0;
  gs('eg-saldoCheque').value=g.saldoCheque||0;
  openM('mEditG');
};

window.saveEditG=async function(){
  return runLocked('saveEditG',async()=>{
    const id=gs('eg-id').value;
    const g=(gastos[cur]||[]).find(row=>row.id===id);
    if(!g){
      toast('Gasto no encontrado','err');
      return;
    }
    g.fecha=/^\d{4}-\d{2}-\d{2}$/.test(gs('eg-fecha').value||'')?gs('eg-fecha').value:'';
    g.concepto=sanitizeText(gs('eg-concepto').value,160);
    g.cantidad=parseFloat(gs('eg-cantidad').value)||0;
    g.monto=parseFloat(gs('eg-monto').value)||0;
    g.registro=sanitizeText(gs('eg-registro').value,80);
    g.montoCheque=parseFloat(gs('eg-montoCheque').value)||0;
    g.devuelto=parseFloat(gs('eg-devuelto').value)||0;
    g.saldoTotal=parseFloat(gs('eg-saldoTotal').value)||0;
    g.saldoCheque=parseFloat(gs('eg-saldoCheque').value)||0;
    g.costoTotal=(g.monto||0)+(g.saldoTotal||0)+(g.saldoCheque||0);
    await fbSet('obras/'+cur+'/gastos/'+id,g);
    closeM('mEditG');
    updGStrip();
    renderGSaved();
    await touchObra();
    toast('Gasto actualizado','ok');
  },'El gasto ya se esta actualizando');
};

// =======================================
// EDITAR CERTIFICADO INDIVIDUAL
// =======================================
window.editC=function(id,num){
  if(obras[cur]?.estado==='FINALIZADA'){
    toast('Obra finalizada. Desbloqueala desde editar obra.','err');
    return;
  }
  const c=(certificados[cur]||[]).find(row=>row.id===id);
  if(!c){
    toast('Certificado no encontrado','err');
    return;
  }
  gs('ec-id').value=id;
  gs('editCNum').textContent='#'+num;
  gs('ec-fecha').value=c.fecha||'';
  gs('ec-concepto').value=c.concepto||'';
  gs('ec-bruto').value=c.bruto||0;
  gs('ec-neto').value=c.neto||0;
  gs('ec-ret').textContent=fGs((c.bruto||0)-(c.neto||0));
  gs('ec-bruto').oninput=gs('ec-neto').oninput=function(){
    const b=parseFloat(gs('ec-bruto').value)||0;
    const n=parseFloat(gs('ec-neto').value)||0;
    gs('ec-ret').textContent=fGs(b-n);
  };
  openM('mEditC');
};

window.saveEditC=async function(){
  return runLocked('saveEditC',async()=>{
    const id=gs('ec-id').value;
    const c=(certificados[cur]||[]).find(row=>row.id===id);
    if(!c){
      toast('Certificado no encontrado','err');
      return;
    }
    c.fecha=/^\d{4}-\d{2}-\d{2}$/.test(gs('ec-fecha').value||'')?gs('ec-fecha').value:'';
    c.concepto=sanitizeText(gs('ec-concepto').value,160);
    c.bruto=parseFloat(gs('ec-bruto').value)||0;
    c.neto=parseFloat(gs('ec-neto').value)||0;
    c.retencion=c.bruto-c.neto;
    await fbSet('obras/'+cur+'/certificados/'+id,c);
    closeM('mEditC');
    renderCerts();
    await touchObra();
    toast('Certificado actualizado','ok');
  },'El certificado ya se esta actualizando');
};

function renderCerts(){
  if(!cur){
    toast('Selecciona una obra','err');
    navTo('obras');
    return;
  }

  const o=obras[cur];
  gs('cstrip').style.display='flex';
  gs('csn').textContent=o.nombre;

  const {br,ne,re}=calcCertsT(cur);
  gs('csb').textContent=fGs(br);
  gs('csr').textContent=fGs(re);
  gs('csne').textContent=fGs(ne);

  const list=certificados[cur]||[];
  const tbody=gs('ctbody');
  const cnt=gs('cSavedCount');
  if(cnt) cnt.textContent=list.length?'('+list.length+')':'';

  if(!list.length){
    tbody.innerHTML='<tr class="empty-row"><td colspan="7">Sin certificados</td></tr>';
    gs('ctb').textContent=gs('ctn').textContent=gs('ctr').textContent='Gs 0';
    return;
  }

  tbody.innerHTML=list.map((c,i)=>{
    const certIdArg=encArg(c.id);
    return `<tr>
      <td style="color:var(--muted);font-size:.68rem;text-align:center;font-weight:600">${i+1}</td>
      <td>${esc(c.fecha||'-')}</td>
      <td style="font-family:'Syne',sans-serif;color:var(--txt)">${esc(c.concepto)}</td>
      <td style="color:var(--acc2)">${fGs(c.bruto)}</td>
      <td style="color:var(--green)">${fGs(c.neto)}</td>
      <td style="color:var(--acc3)">${fGs(c.retencion)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-xs" onclick="editC(decodeURIComponent('${certIdArg}'),${i+1})" title="Editar">Editar</button>
        <button class="btn btn-danger btn-xs" onclick="delC(decodeURIComponent('${certIdArg}'))">Borrar</button>
      </td>
    </tr>`;
  }).join('');

  gs('ctb').textContent=fGs(br);
  gs('ctn').textContent=fGs(ne);
  gs('ctr').textContent=fGs(re);
}
