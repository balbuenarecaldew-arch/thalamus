// =======================================
// RESUMEN
// =======================================
function renderResumen(){
  if(!cur){
    toast('Selecciona una obra','err');
    navTo('obras');
    return;
  }

  const o=obras[cur];
  const r=calcRes(cur);
  gs('resumen-sub').innerHTML=
    (o.num?'<span style="font-size:1.2em;font-weight:800">N'+esc(o.num)+'</span> - ':'')+
    esc(o.nombre)+' · '+new Date().toLocaleDateString('es-PY');

  gs('rtbody').innerHTML=[
    ['MONTO CONTRATO',fGs(r.con),'y'],
    ['TOTAL DE GASTOS',fGs(r.tg),'r'],
    ['TOTAL BRUTO COBRADO',fGs(r.br),'b'],
    ['RETENCION TOTAL',fGs(r.re),''],
    ['TOTAL NETO COBRADO',fGs(r.ne),'g'],
    ['GANANCIA NETA (neto - gastos)',fGs(r.gan),r.gan>=0?'g':'r'],
    ['PARA FERNANDO ('+cfg.socios+'%)',fGs(r.corrCadaUno),'y'],
    ['PARA WUILIAN ('+cfg.socios+'%)',fGs(r.corrCadaUno),'b'],
    ['PORCENTAJE DE GANANCIA',fPct(r.pct),''],
    ['SALDO A COBRAR',fGs(r.scob),'b'],
  ].map(([label,value,color])=>`<tr>
    <td style="font-family:'Syne',sans-serif;color:var(--dim);padding:.48rem .6rem;border-bottom:1px solid var(--border)">${label}</td>
    <td style="text-align:right;padding:.48rem .6rem;border-bottom:1px solid var(--border)" class="${color?'m-val '+color:''}">${value}</td>
  </tr>`).join('');

  const gl=gastos[cur]||[];
  const gPagosRes=gestorPagosForObra(cur);
  const aPagosRes=ayudaSocialPagosForObra(cur);
  const ctPagosRes=contratistaPagosForObra(cur);
  const gtbody=gs('res-gtbody');

  if(gtbody){
    let rows='';

    if(aPagosRes.length){
      rows+=aPagosRes.map(p=>`<tr style="background:rgba(61,212,154,.04)">
        <td>${esc(p.fecha||'-')}</td>
        <td style="font-family:'Syne',sans-serif;color:var(--green);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">AS ${esc(p.concepto||'Ayuda Social')}</td>
        <td style="color:var(--green)">${fGs(p.monto)}</td>
        <td>-</td>
        <td>-</td>
        <td style="color:var(--green)">${fGs(p.monto)}</td>
      </tr>`).join('');
    }

    if(gPagosRes.length){
      rows+=gPagosRes.map(p=>`<tr class="gestor-row-in-gastos">
        <td>${esc(p.fecha||'-')}</td>
        <td style="font-family:'Syne',sans-serif;color:var(--amber);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">GESTOR ${esc(p.concepto||'Entrega al gestor')}</td>
        <td style="color:var(--amber)">${fGs(p.monto)}</td>
        <td>-</td>
        <td>-</td>
        <td style="color:var(--amber)">${fGs(p.monto)}</td>
      </tr>`).join('');
    }

    if(ctPagosRes.length){
      rows+=ctPagosRes.map(p=>{
        const cName=p.contratistaId&&obras[cur]?.contratistas
          ? (obras[cur].contratistas.find(c=>c.id===p.contratistaId)?.nombre||'')
          : '';
        return `<tr style="background:rgba(157,127,218,.04)">
          <td>${esc(p.fecha||'-')}</td>
          <td style="font-family:'Syne',sans-serif;color:var(--purple);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">CONTRAT ${esc(p.concepto||'Pago contratista')}${cName?' <span style="font-size:.6rem;opacity:.7">('+esc(cName)+')</span>':''}</td>
          <td style="color:var(--purple)">${fGs(p.monto)}</td>
          <td>-</td>
          <td>-</td>
          <td style="color:var(--purple)">${fGs(p.monto)}</td>
        </tr>`;
      }).join('');
    }

    if(gl.length){
      rows+=gl.map(g=>`<tr>
        <td>${esc(g.fecha||'-')}</td>
        <td style="font-family:'Syne',sans-serif;color:var(--txt);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.concepto)}</td>
        <td>${fGs(g.monto)}</td>
        <td>${fGs(g.montoCheque)}</td>
        <td>${fGs(g.devuelto)}</td>
        <td style="color:var(--gold)">${fGs(g.costoTotal)}</td>
      </tr>`).join('');
    }

    gtbody.innerHTML=rows||'<tr class="empty-row"><td colspan="6">Sin gastos</td></tr>';

    const gestorResTotal=gPagosRes.reduce((s,p)=>s+(parseFloat(p.monto)||0),0);
    const ayudaResTotal=aPagosRes.reduce((s,p)=>s+(parseFloat(p.monto)||0),0);
    const contratistaResTotal=ctPagosRes.reduce((s,p)=>s+(parseFloat(p.monto)||0),0);
    const tf1=gs('res-tf1');
    const tf3=gs('res-tf3');
    if(tf1) tf1.textContent=fGs(gl.reduce((s,g)=>s+(parseFloat(g.monto)||0),0)+gestorResTotal+ayudaResTotal+contratistaResTotal);
    if(tf3) tf3.textContent=fGs(gl.reduce((s,g)=>s+(parseFloat(g.costoTotal)||0),0)+gestorResTotal+ayudaResTotal+contratistaResTotal);
  }

  const cl=certificados[cur]||[];
  const ctbody=gs('res-ctbody');
  if(ctbody){
    ctbody.innerHTML=cl.length
      ? cl.map(c=>`<tr>
          <td>${esc(c.fecha||'-')}</td>
          <td style="font-family:'Syne',sans-serif;color:var(--txt)">${esc(c.concepto)}</td>
          <td style="color:var(--acc2)">${fGs(c.bruto)}</td>
          <td style="color:var(--green)">${fGs(c.neto)}</td>
          <td style="color:var(--acc3)">${fGs(c.retencion)}</td>
        </tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">Sin certificados</td></tr>';

    const ct=calcCertsT(cur);
    const rcb=gs('res-cb');
    const rcn=gs('res-cn');
    const rcr=gs('res-cr');
    if(rcb) rcb.textContent=fGs(ct.br);
    if(rcn) rcn.textContent=fGs(ct.ne);
    if(rcr) rcr.textContent=fGs(ct.re);
  }
}
