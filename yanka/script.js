/* ============ Doces da Yanka — Gestão de Vendas de Docinhos ============ */
/* Dados sincronizados em tempo real via Supabase — mesma base para todos os dispositivos. */
/* Usa o mesmo projeto Supabase da Confeitaria da Gabi, mas em tabelas próprias (_yanka). */

const SUPABASE_URL = 'https://ixbanonhvcwjvnkclaeb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DKhObLXkviatUEUZNq5GGA_ftrDWk71';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dados = {
  clientes: [],   // {id, nome, telefone}
  produtos: [],   // {id, nome, preco}
  vendas: []      // {id, clienteId, data, itens:[{produtoId,nome,preco,qtd}], pago, obs, criadoEm}
};

function setSyncStatus(estado){
  const el = document.getElementById('syncStatus');
  const textos = { syncing: 'Sincronizando...', online: 'Sincronizado', error: 'Sem conexão' };
  el.className = 'sync-pill sync-' + estado;
  el.innerHTML = `<span class="dot"></span> ${textos[estado]}`;
}

async function carregarDoServidor(){
  const [rc, rp, rv] = await Promise.all([
    sb.from('clientes_yanka').select('*').order('criado_em'),
    sb.from('produtos_yanka').select('*').order('criado_em'),
    sb.from('vendas_yanka').select('*').order('criado_em')
  ]);
  if(rc.error) throw rc.error;
  if(rp.error) throw rp.error;
  if(rv.error) throw rv.error;

  dados.clientes = rc.data.map(c=>({ id:c.id, nome:c.nome, telefone:c.telefone||'' }));
  dados.produtos = rp.data.map(p=>({ id:p.id, nome:p.nome, preco:Number(p.preco) }));
  dados.vendas = rv.data.map(v=>({
    id:v.id, clienteId:v.cliente_id, data:v.data,
    itens: v.itens||[], pago:Number(v.pago)||0, obs:v.obs||'', criadoEm:Number(v.criado_em)
  }));
}

let debounceRecarregar = null;
function agendarRecarregar(){
  clearTimeout(debounceRecarregar);
  debounceRecarregar = setTimeout(async ()=>{
    try{
      await carregarDoServidor();
      setSyncStatus('online');
      renderAll();
    }catch(e){
      console.error(e);
      setSyncStatus('error');
    }
  }, 300);
}

function assinarRealtime(){
  sb.channel('doces-yanka-sync')
    .on('postgres_changes', { event:'*', schema:'public', table:'clientes_yanka' }, agendarRecarregar)
    .on('postgres_changes', { event:'*', schema:'public', table:'produtos_yanka' }, agendarRecarregar)
    .on('postgres_changes', { event:'*', schema:'public', table:'vendas_yanka' }, agendarRecarregar)
    .subscribe();
}

async function iniciar(){
  setSyncStatus('syncing');
  try{
    await carregarDoServidor();
    setSyncStatus('online');
  }catch(e){
    console.error(e);
    setSyncStatus('error');
    toast('Não foi possível conectar ao servidor. Verifique sua internet.');
  }
  renderAll();
  assinarRealtime();
}

function formatarMoeda(v){
  return (v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function formatarData(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function chaveMes(iso){
  return iso.slice(0,7); // 'AAAA-MM'
}

function nomeMes(iso){
  const [y,m] = iso.split('-');
  return `${NOMES_MESES[parseInt(m,10)-1]} de ${y}`;
}

function nomeMesPorChave(key){
  const [y,m] = key.split('-');
  return `${NOMES_MESES[parseInt(m,10)-1]} de ${y}`;
}

function icon(nome, extraClass=''){
  return `<svg class="icon ${extraClass}"><use href="#icon-${nome}"></use></svg>`;
}

/* ---------- Cálculos ---------- */

function totalVenda(venda){
  return venda.itens.reduce((s,i)=> s + (i.preco * i.qtd), 0);
}

function statusVenda(venda){
  const total = totalVenda(venda);
  const pago = venda.pago || 0;
  if(pago <= 0) return 'pendente';
  if(pago >= total) return 'pago';
  return 'parcial';
}

function saldoDevedorCliente(clienteId){
  return dados.vendas
    .filter(v => v.clienteId === clienteId)
    .reduce((s,v) => s + Math.max(0, totalVenda(v) - (v.pago||0)), 0);
}

function totalCompradoCliente(clienteId){
  return dados.vendas.filter(v=>v.clienteId===clienteId).reduce((s,v)=>s+totalVenda(v),0);
}

function totalPagoCliente(clienteId){
  return dados.vendas.filter(v=>v.clienteId===clienteId).reduce((s,v)=>s+(v.pago||0),0);
}

/* ---------- Navegação ---------- */

const views = ['dashboard','clientes','vendas','pendencias','produtos'];
const titles = {
  dashboard: ['Painel Geral', 'Resumo das vendas de docinhos da Doces da Yanka'],
  clientes: ['Clientes', 'Todos os clientes que já compraram seus docinhos'],
  vendas: ['Encomendas', 'Histórico completo de encomendas, separado por mês'],
  pendencias: ['A Receber', 'Clientes com pagamentos pendentes'],
  produtos: ['Docinhos', 'Catálogo de docinhos e preços']
};

const textoBotaoPrincipal = {
  dashboard: 'Nova encomenda',
  clientes: 'Novo cliente',
  vendas: 'Nova encomenda',
  pendencias: 'Nova encomenda',
  produtos: 'Novo docinho'
};

let viewAtual = 'dashboard';

function irPara(view){
  viewAtual = view;
  views.forEach(v=>{
    document.getElementById('view-'+v).classList.toggle('hidden', v!==view);
  });
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view===view);
  });
  document.getElementById('viewTitle').textContent = titles[view][0];
  document.getElementById('viewSubtitle').textContent = titles[view][1];
  document.getElementById('btnNovaVendaLabel').textContent = textoBotaoPrincipal[view];
  renderAll();
}

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=> irPara(btn.dataset.view));
});

/* ---------- Toast ---------- */

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove('show'), 2600);
}

/* ---------- Render: Dashboard ---------- */

function renderDashboard(){
  const totalVendido = dados.vendas.reduce((s,v)=>s+totalVenda(v),0);
  const totalRecebido = dados.vendas.reduce((s,v)=>s+(v.pago||0),0);
  const aReceber = totalVendido - totalRecebido;
  const clientesAtivos = new Set(dados.vendas.map(v=>v.clienteId)).size;

  document.getElementById('statTotalVendido').textContent = formatarMoeda(totalVendido);
  document.getElementById('statTotalRecebido').textContent = formatarMoeda(totalRecebido);
  document.getElementById('statAReceber').textContent = formatarMoeda(aReceber);
  document.getElementById('statClientes').textContent = clientesAtivos;

  // Maiores devedores
  const devedores = dados.clientes
    .map(c => ({ cliente: c, saldo: saldoDevedorCliente(c.id) }))
    .filter(d => d.saldo > 0.001)
    .sort((a,b)=>b.saldo-a.saldo)
    .slice(0,6);

  const elDev = document.getElementById('topDevedores');
  elDev.innerHTML = '';
  if(devedores.length===0){
    elDev.innerHTML = `<div class="empty-hint">${icon('check-circle')} Nenhum devedor no momento.</div>`;
  }else{
    devedores.forEach(d=>{
      elDev.innerHTML += `
        <div class="list-item">
          <div>
            <div class="name">${escapeHtml(d.cliente.nome)}</div>
            <div class="sub">${escapeHtml(d.cliente.telefone||'sem telefone')}</div>
          </div>
          <div class="amount" style="color:var(--red)">${formatarMoeda(d.saldo)}</div>
        </div>`;
    });
  }

  // Últimas encomendas, com separação clara por mês
  const ultimas = [...dados.vendas]
    .sort((a,b)=> a.data===b.data ? (b.criadoEm||0)-(a.criadoEm||0) : (a.data<b.data?1:-1))
    .slice(0,6);
  const elUlt = document.getElementById('ultimasVendas');
  elUlt.innerHTML = '';
  if(ultimas.length===0){
    elUlt.innerHTML = '<div class="empty-hint">Nenhuma encomenda registrada ainda.</div>';
  }else{
    let ultimoMes = null;
    ultimas.forEach(v=>{
      const mesAtual = chaveMes(v.data);
      if(mesAtual !== ultimoMes){
        elUlt.innerHTML += `<div class="mini-month-label">${nomeMes(v.data)}</div>`;
        ultimoMes = mesAtual;
      }
      const cliente = dados.clientes.find(c=>c.id===v.clienteId);
      elUlt.innerHTML += `
        <div class="list-item">
          <div>
            <div class="name">${escapeHtml(cliente ? cliente.nome : '—')}</div>
            <div class="sub">${formatarData(v.data)} · ${v.itens.length} item(ns)</div>
          </div>
          <div class="amount">${formatarMoeda(totalVenda(v))}</div>
        </div>`;
    });
  }
}

/* ---------- Render: Clientes ---------- */

function renderClientes(filtro=''){
  const tbody = document.querySelector('#tabelaClientes tbody');
  tbody.innerHTML = '';
  const termo = filtro.trim().toLowerCase();

  const lista = dados.clientes
    .filter(c => c.nome.toLowerCase().includes(termo))
    .sort((a,b)=> saldoDevedorCliente(b.id) - saldoDevedorCliente(a.id));

  document.getElementById('clientesEmpty').classList.toggle('hidden', dados.clientes.length>0);

  lista.forEach(c=>{
    const comprado = totalCompradoCliente(c.id);
    const pago = totalPagoCliente(c.id);
    const saldo = comprado - pago;
    const status = saldo <= 0.001 ? '<span class="badge badge-pago">Em dia</span>' : '<span class="badge badge-pendente">Deve</span>';
    tbody.innerHTML += `
      <tr>
        <td data-label="Nome"><strong>${escapeHtml(c.nome)}</strong></td>
        <td data-label="Telefone">${escapeHtml(c.telefone||'—')}</td>
        <td data-label="Total comprado">${formatarMoeda(comprado)}</td>
        <td data-label="Total pago">${formatarMoeda(pago)}</td>
        <td data-label="Saldo devedor" style="color:${saldo>0.001?'var(--red)':'var(--green)'}; font-weight:700;">${formatarMoeda(saldo)}</td>
        <td data-label="Status">${status}</td>
        <td data-label="Ações">
          <button class="icon-btn" data-ver-cliente="${c.id}" title="Ver encomendas">${icon('search')}</button>
          <button class="icon-btn" data-editar-cliente="${c.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-excluir-cliente="${c.id}" title="Excluir">${icon('trash')}</button>
        </td>
      </tr>`;
  });
}

/* ---------- Render: Vendas ---------- */

function atualizarFiltroMeses(selectId){
  const sel = document.getElementById(selectId);
  const valorAtual = sel.value || 'todos';
  const chaves = Array.from(new Set(dados.vendas.map(v=>chaveMes(v.data)))).sort().reverse();

  let html = '<option value="todos">Todos os meses</option>';
  chaves.forEach(k=>{
    const exemplo = dados.vendas.find(v=>chaveMes(v.data)===k);
    html += `<option value="${k}">${nomeMes(exemplo.data)}</option>`;
  });
  sel.innerHTML = html;
  sel.value = chaves.includes(valorAtual) || valorAtual==='todos' ? valorAtual : 'todos';
}

function renderVendas(){
  const tbody = document.querySelector('#tabelaVendas tbody');
  tbody.innerHTML = '';

  atualizarFiltroMeses('filtroMesVenda');

  const filtroStatus = document.getElementById('filtroStatusVenda').value;
  const filtroMes = document.getElementById('filtroMesVenda').value;
  const busca = document.getElementById('buscaVenda').value.trim().toLowerCase();

  // Ordena por data (mais recente primeiro) para agrupar por mês de forma cronológica
  let lista = [...dados.vendas].sort((a,b)=>{
    if(a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (b.criadoEm||0)-(a.criadoEm||0);
  });

  lista = lista.filter(v=>{
    const cliente = dados.clientes.find(c=>c.id===v.clienteId);
    const nomeOk = !busca || (cliente && cliente.nome.toLowerCase().includes(busca));
    const st = statusVenda(v);
    const statusOk = filtroStatus==='todos' || st===filtroStatus;
    const mesOk = filtroMes==='todos' || chaveMes(v.data)===filtroMes;
    return nomeOk && statusOk && mesOk;
  });

  document.getElementById('vendasEmpty').classList.toggle('hidden', dados.vendas.length>0);

  if(dados.vendas.length>0 && lista.length===0){
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhuma encomenda encontrada com esses filtros.</td></tr>`;
    return;
  }

  // Agrupa por mês, com subtotal de cada grupo
  const grupos = [];
  let grupoAtual = null;
  lista.forEach(v=>{
    const key = chaveMes(v.data);
    if(!grupoAtual || grupoAtual.key!==key){
      grupoAtual = { key, label: nomeMes(v.data), itens: [] };
      grupos.push(grupoAtual);
    }
    grupoAtual.itens.push(v);
  });

  grupos.forEach(g=>{
    const totalMes = g.itens.reduce((s,v)=>s+totalVenda(v),0);
    const recebidoMes = g.itens.reduce((s,v)=>s+(v.pago||0),0);
    const pendenteMes = totalMes - recebidoMes;

    tbody.innerHTML += `
      <tr class="month-row">
        <td colspan="8">
          <div class="month-row-inner">
            <span class="month-label">${g.label}</span>
            <span class="month-stats">
              <span>${g.itens.length} encomenda${g.itens.length>1?'s':''}</span>
              <span>Total ${formatarMoeda(totalMes)}</span>
              <span class="month-stat-green">Recebido ${formatarMoeda(recebidoMes)}</span>
              <span class="month-stat-red">Pendente ${formatarMoeda(pendenteMes)}</span>
            </span>
          </div>
        </td>
      </tr>`;

    g.itens.forEach(v=>{
      const cliente = dados.clientes.find(c=>c.id===v.clienteId);
      const total = totalVenda(v);
      const st = statusVenda(v);
      const badge = { pago:'badge-pago', pendente:'badge-pendente', parcial:'badge-parcial' }[st];
      const label = { pago:'Pago', pendente:'Pendente', parcial:'Parcial' }[st];
      const produtosTxt = v.itens.map(i=>`${i.nome} x${i.qtd}`).join(', ');
      const qtdTotal = v.itens.reduce((s,i)=>s+i.qtd,0);

      tbody.innerHTML += `
        <tr>
          <td data-label="Data">${formatarData(v.data)}</td>
          <td data-label="Cliente"><strong>${escapeHtml(cliente ? cliente.nome : '—')}</strong></td>
          <td data-label="Docinho(s)">${escapeHtml(produtosTxt)}</td>
          <td data-label="Qtd">${qtdTotal}</td>
          <td data-label="Valor">${formatarMoeda(total)}</td>
          <td data-label="Pago">${formatarMoeda(v.pago||0)}</td>
          <td data-label="Status"><span class="badge ${badge}">${label}</span></td>
          <td data-label="Ações">
            ${st!=='pago' ? `<button class="icon-btn" data-pagar="${v.id}" title="Registrar pagamento">${icon('check-circle')}</button>` : ''}
            <button class="icon-btn" data-editar-venda="${v.id}" title="Editar">${icon('edit')}</button>
            <button class="icon-btn" data-excluir-venda="${v.id}" title="Excluir">${icon('trash')}</button>
          </td>
        </tr>`;
    });
  });
}

/* ---------- Render: Pendências ---------- */

function renderPendencias(){
  const tbody = document.querySelector('#tabelaPendencias tbody');
  tbody.innerHTML = '';

  atualizarFiltroMeses('filtroMesPendencias');
  const filtroMes = document.getElementById('filtroMesPendencias').value;

  const porCliente = dados.clientes.map(c=>{
    const vendasPendentes = dados.vendas.filter(v=>
      v.clienteId===c.id &&
      statusVenda(v)!=='pago' &&
      (filtroMes==='todos' || chaveMes(v.data)===filtroMes)
    );
    const saldo = vendasPendentes.reduce((s,v)=> s + (totalVenda(v)-(v.pago||0)), 0);
    return { cliente:c, qtd: vendasPendentes.length, saldo };
  }).filter(d=>d.saldo>0.001).sort((a,b)=>b.saldo-a.saldo);

  const totalGeral = porCliente.reduce((s,d)=>s+d.saldo,0);
  const sufixoMes = filtroMes==='todos' ? ' em aberto' : ` em aberto · ${nomeMesPorChave(filtroMes)}`;
  document.getElementById('totalPendenciasPill').textContent = formatarMoeda(totalGeral) + sufixoMes;
  document.getElementById('pendenciasEmpty').classList.toggle('hidden', porCliente.length>0);

  porCliente.forEach(d=>{
    tbody.innerHTML += `
      <tr>
        <td data-label="Cliente"><strong>${escapeHtml(d.cliente.nome)}</strong></td>
        <td data-label="Telefone">${escapeHtml(d.cliente.telefone||'—')}</td>
        <td data-label="Encomendas pendentes">${d.qtd}</td>
        <td data-label="Valor devido" style="color:var(--red); font-weight:700;">${formatarMoeda(d.saldo)}</td>
        <td data-label="Ações">
          <button class="secondary-btn" data-cobrar="${d.cliente.id}" data-mes="${filtroMes}">${icon('check-circle')} Registrar pagamento</button>
          <button class="icon-btn" data-editar-cliente="${d.cliente.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-excluir-cliente="${d.cliente.id}" title="Excluir">${icon('trash')}</button>
        </td>
      </tr>`;
  });
}

/* ---------- Render: Produtos ---------- */

function renderProdutos(){
  const tbody = document.querySelector('#tabelaProdutos tbody');
  tbody.innerHTML = '';
  document.getElementById('produtosEmpty').classList.toggle('hidden', dados.produtos.length>0);

  dados.produtos.forEach(p=>{
    let unidades = 0, totalGerado = 0;
    dados.vendas.forEach(v=>{
      v.itens.forEach(i=>{
        if(i.produtoId===p.id){ unidades += i.qtd; totalGerado += i.qtd*i.preco; }
      });
    });
    tbody.innerHTML += `
      <tr>
        <td data-label="Docinho"><strong>${escapeHtml(p.nome)}</strong></td>
        <td data-label="Preço unitário">${formatarMoeda(p.preco)}</td>
        <td data-label="Unidades vendidas">${unidades}</td>
        <td data-label="Total gerado">${formatarMoeda(totalGerado)}</td>
        <td data-label="Ações">
          <button class="icon-btn" data-editar-produto="${p.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn" data-excluir-produto="${p.id}" title="Excluir">${icon('trash')}</button>
        </td>
      </tr>`;
  });
}

function renderAll(){
  renderDashboard();
  renderClientes(document.getElementById('buscaCliente').value);
  renderVendas();
  renderPendencias();
  renderProdutos();
  atualizarDatalistClientes();
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ============ Modal: Nova Venda ============ */

const modalVenda = document.getElementById('modalVenda');
const modalVendaTitulo = document.querySelector('#modalVenda .modal-header h3');
const itensVendaEl = document.getElementById('itensVenda');
let contadorItens = 0;
let vendaEditandoId = null;

function atualizarDatalistClientes(){
  const dl = document.getElementById('listaClientes');
  dl.innerHTML = dados.clientes.map(c=>`<option value="${escapeHtml(c.nome)}">`).join('');
}

function optionsProdutos(selectedId){
  return dados.produtos.map(p=>
    `<option value="${p.id}" data-preco="${p.preco}" ${p.id===selectedId?'selected':''}>${escapeHtml(p.nome)} (${formatarMoeda(p.preco)})</option>`
  ).join('');
}

function addLinhaItem(produtoIdInicial, qtdInicial){
  contadorItens++;
  const linhaId = 'item_'+contadorItens;
  const div = document.createElement('div');
  div.className = 'item-linha';
  div.id = linhaId;
  div.innerHTML = `
    <select class="sel-produto">${optionsProdutos(produtoIdInicial)}</select>
    <input type="number" class="inp-qtd" min="1" value="${qtdInicial||1}">
    <input type="text" class="inp-subtotal" disabled>
    <button type="button" class="item-remove">✕</button>
  `;
  itensVendaEl.appendChild(div);

  const selProduto = div.querySelector('.sel-produto');
  const inpQtd = div.querySelector('.inp-qtd');
  const inpSubtotal = div.querySelector('.inp-subtotal');
  const btnRemove = div.querySelector('.item-remove');

  function atualizarSubtotal(){
    const opt = selProduto.options[selProduto.selectedIndex];
    const preco = opt ? parseFloat(opt.dataset.preco) : 0;
    const qtd = parseInt(inpQtd.value)||0;
    inpSubtotal.value = formatarMoeda(preco*qtd);
    atualizarTotalVenda();
  }

  selProduto.addEventListener('change', atualizarSubtotal);
  inpQtd.addEventListener('input', atualizarSubtotal);
  btnRemove.addEventListener('click', ()=>{ div.remove(); atualizarTotalVenda(); });

  atualizarSubtotal();
}

function atualizarTotalVenda(){
  let total = 0;
  itensVendaEl.querySelectorAll('.item-linha').forEach(div=>{
    const sel = div.querySelector('.sel-produto');
    const opt = sel.options[sel.selectedIndex];
    const preco = opt ? parseFloat(opt.dataset.preco) : 0;
    const qtd = parseInt(div.querySelector('.inp-qtd').value)||0;
    total += preco*qtd;
  });
  document.getElementById('valorTotalVenda').textContent = formatarMoeda(total);
  return total;
}

document.getElementById('btnAddItem').addEventListener('click', addLinhaItem);

function abrirModalVenda(){
  vendaEditandoId = null;
  modalVendaTitulo.textContent = 'Registrar encomenda';
  itensVendaEl.innerHTML = '';
  contadorItens = 0;
  document.getElementById('formVenda').reset();
  document.getElementById('inputClienteNome').disabled = false;
  document.getElementById('inputData').value = new Date().toISOString().slice(0,10);
  addLinhaItem();
  atualizarTotalVenda();
  modalVenda.classList.remove('hidden');
}

function abrirModalVendaEdicao(venda){
  vendaEditandoId = venda.id;
  modalVendaTitulo.textContent = 'Editar encomenda';
  const cliente = dados.clientes.find(c=>c.id===venda.clienteId);
  itensVendaEl.innerHTML = '';
  contadorItens = 0;
  document.getElementById('formVenda').reset();
  document.getElementById('inputClienteNome').value = cliente ? cliente.nome : '';
  document.getElementById('inputClienteNome').disabled = true;
  document.getElementById('inputClienteTelefone').value = cliente ? cliente.telefone : '';
  document.getElementById('inputData').value = venda.data;
  venda.itens.forEach(i=> addLinhaItem(i.produtoId, i.qtd));
  atualizarTotalVenda();
  document.getElementById('inputValorPago').value = venda.pago||0;
  document.getElementById('inputObs').value = venda.obs||'';
  modalVenda.classList.remove('hidden');
}

document.getElementById('btnNovaVenda').addEventListener('click', ()=>{
  if(viewAtual==='clientes'){ abrirModalClienteNovo(); }
  else if(viewAtual==='produtos'){ abrirModalProdutoNovo(); }
  else{ abrirModalVenda(); }
});

document.getElementById('formVenda').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const nome = document.getElementById('inputClienteNome').value.trim();
  const telefone = document.getElementById('inputClienteTelefone').value.trim();
  const data = document.getElementById('inputData').value;
  const obs = document.getElementById('inputObs').value.trim();
  const valorPago = parseFloat(document.getElementById('inputValorPago').value)||0;

  if(!nome){ toast('Informe o nome do cliente.'); return; }

  const linhas = [...itensVendaEl.querySelectorAll('.item-linha')];
  if(linhas.length===0){ toast('Adicione ao menos um produto.'); return; }

  const itens = linhas.map(div=>{
    const sel = div.querySelector('.sel-produto');
    const opt = sel.options[sel.selectedIndex];
    const produto = dados.produtos.find(p=>p.id===opt.value);
    const qtd = parseInt(div.querySelector('.inp-qtd').value)||1;
    return { produtoId: produto.id, nome: produto.nome, preco: produto.preco, qtd };
  });

  const btnSalvar = e.target.querySelector('button[type="submit"]');
  btnSalvar.disabled = true;
  try{
    let cliente = dados.clientes.find(c=> c.nome.toLowerCase()===nome.toLowerCase());
    let clienteId;
    if(!cliente){
      const { data:novo, error } = await sb.from('clientes_yanka').insert({ nome, telefone: telefone||null }).select().single();
      if(error) throw error;
      clienteId = novo.id;
      dados.clientes.push({ id:novo.id, nome:novo.nome, telefone:novo.telefone||'' });
    }else{
      clienteId = cliente.id;
      if(telefone && telefone!==cliente.telefone){
        const { error } = await sb.from('clientes_yanka').update({ telefone }).eq('id', clienteId);
        if(error) throw error;
        cliente.telefone = telefone;
      }
    }

    if(vendaEditandoId){
      const { error: errUpdate } = await sb.from('vendas_yanka')
        .update({ data, itens, pago: valorPago, obs: obs||null })
        .eq('id', vendaEditandoId);
      if(errUpdate) throw errUpdate;

      const v = dados.vendas.find(v=>v.id===vendaEditandoId);
      if(v){ v.data = data; v.itens = itens; v.pago = valorPago; v.obs = obs; }
      toast('Encomenda atualizada!');
    }else{
      const { data:novaVenda, error:errVenda } = await sb.from('vendas_yanka').insert({
        cliente_id: clienteId, data, itens, pago: valorPago, obs: obs||null, criado_em: Date.now()
      }).select().single();
      if(errVenda) throw errVenda;

      dados.vendas.push({
        id: novaVenda.id, clienteId, data, itens, pago: valorPago, obs, criadoEm: Number(novaVenda.criado_em)
      });
      toast('Encomenda registrada com sucesso!');
    }

    modalVenda.classList.add('hidden');
    renderAll();
  }catch(err){
    console.error(err);
    toast('Erro ao salvar a encomenda. Verifique sua internet.');
  }finally{
    btnSalvar.disabled = false;
  }
});

/* ============ Modal: Novo Produto ============ */

const modalProduto = document.getElementById('modalProduto');
const modalProdutoTitulo = document.querySelector('#modalProduto .modal-header h3');
let produtoEditandoId = null;

function abrirModalProdutoNovo(){
  produtoEditandoId = null;
  modalProdutoTitulo.textContent = 'Novo docinho';
  document.getElementById('formProduto').reset();
  modalProduto.classList.remove('hidden');
}

document.getElementById('btnNovoProduto').addEventListener('click', abrirModalProdutoNovo);

document.getElementById('formProduto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const nome = document.getElementById('inputProdutoNome').value.trim();
  const preco = parseFloat(document.getElementById('inputProdutoPreco').value);
  if(!nome || isNaN(preco)){ toast('Preencha nome e preço.'); return; }
  try{
    if(produtoEditandoId){
      const { data:atualizado, error } = await sb.from('produtos_yanka').update({ nome, preco }).eq('id', produtoEditandoId).select().single();
      if(error) throw error;
      const p = dados.produtos.find(p=>p.id===produtoEditandoId);
      if(p){ p.nome = atualizado.nome; p.preco = Number(atualizado.preco); }
      toast('Docinho atualizado!');
    }else{
      const { data:novo, error } = await sb.from('produtos_yanka').insert({ nome, preco }).select().single();
      if(error) throw error;
      dados.produtos.push({ id:novo.id, nome:novo.nome, preco:Number(novo.preco) });
      toast('Docinho cadastrado!');
    }
    modalProduto.classList.add('hidden');
    renderAll();
  }catch(err){
    console.error(err);
    toast('Erro ao salvar o docinho.');
  }
});

/* ============ Modal: Cliente ============ */

const modalCliente = document.getElementById('modalCliente');
const modalClienteTitulo = document.querySelector('#modalCliente .modal-header h3');
let clienteEditandoId = null;

function abrirModalClienteNovo(){
  clienteEditandoId = null;
  modalClienteTitulo.textContent = 'Novo cliente';
  document.getElementById('formCliente').reset();
  modalCliente.classList.remove('hidden');
}

function abrirModalClienteEdicao(cliente){
  clienteEditandoId = cliente.id;
  modalClienteTitulo.textContent = 'Editar cliente';
  document.getElementById('inputClienteEditNome').value = cliente.nome;
  document.getElementById('inputClienteEditTelefone').value = cliente.telefone||'';
  modalCliente.classList.remove('hidden');
}

document.getElementById('formCliente').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const nome = document.getElementById('inputClienteEditNome').value.trim();
  const telefone = document.getElementById('inputClienteEditTelefone').value.trim();
  if(!nome){ toast('Informe o nome do cliente.'); return; }
  try{
    if(clienteEditandoId){
      const { data:atualizado, error } = await sb.from('clientes_yanka').update({ nome, telefone: telefone||null }).eq('id', clienteEditandoId).select().single();
      if(error) throw error;
      const c = dados.clientes.find(c=>c.id===clienteEditandoId);
      if(c){ c.nome = atualizado.nome; c.telefone = atualizado.telefone||''; }
      toast('Cliente atualizado!');
    }else{
      const { data:novo, error } = await sb.from('clientes_yanka').insert({ nome, telefone: telefone||null }).select().single();
      if(error) throw error;
      dados.clientes.push({ id:novo.id, nome:novo.nome, telefone:novo.telefone||'' });
      toast('Cliente cadastrado!');
    }
    modalCliente.classList.add('hidden');
    renderAll();
  }catch(err){
    console.error(err);
    toast('Erro ao salvar o cliente.');
  }
});

/* ============ Modal: Pagamento ============ */

const modalPagamento = document.getElementById('modalPagamento');
let pagamentoContexto = null; // { tipo: 'venda'|'cliente', id, mes }

function abrirModalPagamento(tipo, id, mes='todos'){
  pagamentoContexto = { tipo, id, mes };
  const form = document.getElementById('formPagamento');
  form.reset();
  const infoEl = document.getElementById('pagamentoInfo');

  if(tipo==='venda'){
    const venda = dados.vendas.find(v=>v.id===id);
    const cliente = dados.clientes.find(c=>c.id===venda.clienteId);
    const restante = totalVenda(venda) - (venda.pago||0);
    infoEl.textContent = `${cliente.nome} deve ${formatarMoeda(restante)} nesta encomenda de ${formatarData(venda.data)}.`;
    document.getElementById('inputPagamentoValor').value = restante.toFixed(2);
  }else{
    const cliente = dados.clientes.find(c=>c.id===id);
    const vendasNoFiltro = dados.vendas.filter(v=>
      v.clienteId===id && statusVenda(v)!=='pago' && (mes==='todos' || chaveMes(v.data)===mes)
    );
    const restante = vendasNoFiltro.reduce((s,v)=> s + (totalVenda(v)-(v.pago||0)), 0);
    const contexto = mes==='todos' ? 'no total' : `em ${nomeMesPorChave(mes)}`;
    infoEl.textContent = `${cliente.nome} deve ${formatarMoeda(restante)} ${contexto}.`;
    document.getElementById('inputPagamentoValor').value = restante.toFixed(2);
  }
  modalPagamento.classList.remove('hidden');
}

document.getElementById('formPagamento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  let valor = parseFloat(document.getElementById('inputPagamentoValor').value);
  if(isNaN(valor) || valor<=0){ toast('Informe um valor válido.'); return; }

  const btnConfirmar = e.target.querySelector('button[type="submit"]');
  btnConfirmar.disabled = true;
  try{
    if(pagamentoContexto.tipo==='venda'){
      const venda = dados.vendas.find(v=>v.id===pagamentoContexto.id);
      const novoPago = (venda.pago||0) + valor;
      const { error } = await sb.from('vendas_yanka').update({ pago: novoPago }).eq('id', venda.id);
      if(error) throw error;
      venda.pago = novoPago;
    }else{
      // Aplica pagamento nas encomendas pendentes do cliente (e do mês filtrado, se houver), da mais antiga pra mais nova
      const vendasPendentes = dados.vendas
        .filter(v=>
          v.clienteId===pagamentoContexto.id &&
          statusVenda(v)!=='pago' &&
          (pagamentoContexto.mes==='todos' || chaveMes(v.data)===pagamentoContexto.mes)
        )
        .sort((a,b)=>(a.criadoEm||0)-(b.criadoEm||0));

      for(const v of vendasPendentes){
        if(valor<=0) break;
        const restante = totalVenda(v) - (v.pago||0);
        const aplica = Math.min(restante, valor);
        const novoPago = (v.pago||0) + aplica;
        const { error } = await sb.from('vendas_yanka').update({ pago: novoPago }).eq('id', v.id);
        if(error) throw error;
        v.pago = novoPago;
        valor -= aplica;
      }
    }

    modalPagamento.classList.add('hidden');
    toast('Pagamento registrado!');
    renderAll();
  }catch(err){
    console.error(err);
    toast('Erro ao registrar o pagamento.');
  }finally{
    btnConfirmar.disabled = false;
  }
});

/* ============ Eventos globais (delegação) ============ */

document.addEventListener('click', (e)=>{
  const fechar = e.target.closest('[data-close]');
  if(fechar){
    fechar.closest('.modal-overlay').classList.add('hidden');
  }
  if(e.target.classList.contains('modal-overlay')){
    e.target.classList.add('hidden');
  }

  const btnPagar = e.target.closest('[data-pagar]');
  if(btnPagar){
    abrirModalPagamento('venda', btnPagar.dataset.pagar);
  }
  const btnCobrar = e.target.closest('[data-cobrar]');
  if(btnCobrar){
    abrirModalPagamento('cliente', btnCobrar.dataset.cobrar, btnCobrar.dataset.mes||'todos');
  }
  const btnEditarVenda = e.target.closest('[data-editar-venda]');
  if(btnEditarVenda){
    const venda = dados.vendas.find(v=>v.id===btnEditarVenda.dataset.editarVenda);
    if(venda) abrirModalVendaEdicao(venda);
  }
  const btnExcluirVenda = e.target.closest('[data-excluir-venda]');
  if(btnExcluirVenda){
    const idVenda = btnExcluirVenda.dataset.excluirVenda;
    if(confirm('Excluir esta encomenda? Essa ação não pode ser desfeita.')){
      sb.from('vendas_yanka').delete().eq('id', idVenda).then(({error})=>{
        if(error){ console.error(error); toast('Erro ao excluir a encomenda.'); return; }
        dados.vendas = dados.vendas.filter(v=>v.id!==idVenda);
        toast('Encomenda excluída.');
        renderAll();
      });
    }
  }
  const btnEditarProduto = e.target.closest('[data-editar-produto]');
  if(btnEditarProduto){
    const produto = dados.produtos.find(p=>p.id===btnEditarProduto.dataset.editarProduto);
    if(produto){
      produtoEditandoId = produto.id;
      modalProdutoTitulo.textContent = 'Editar docinho';
      document.getElementById('inputProdutoNome').value = produto.nome;
      document.getElementById('inputProdutoPreco').value = produto.preco;
      modalProduto.classList.remove('hidden');
    }
  }
  const btnExcluirProduto = e.target.closest('[data-excluir-produto]');
  if(btnExcluirProduto){
    const idProduto = btnExcluirProduto.dataset.excluirProduto;
    if(confirm('Excluir este docinho do catálogo?')){
      sb.from('produtos_yanka').delete().eq('id', idProduto).then(({error})=>{
        if(error){ console.error(error); toast('Erro ao excluir o docinho.'); return; }
        dados.produtos = dados.produtos.filter(p=>p.id!==idProduto);
        toast('Docinho excluído.');
        renderAll();
      });
    }
  }
  const btnVerCliente = e.target.closest('[data-ver-cliente]');
  if(btnVerCliente){
    document.getElementById('buscaVenda').value = dados.clientes.find(c=>c.id===btnVerCliente.dataset.verCliente)?.nome || '';
    irPara('vendas');
  }
  const btnEditarCliente = e.target.closest('[data-editar-cliente]');
  if(btnEditarCliente){
    const cliente = dados.clientes.find(c=>c.id===btnEditarCliente.dataset.editarCliente);
    if(cliente) abrirModalClienteEdicao(cliente);
  }
  const btnExcluirCliente = e.target.closest('[data-excluir-cliente]');
  if(btnExcluirCliente){
    const idCliente = btnExcluirCliente.dataset.excluirCliente;
    if(confirm('Excluir este cliente? Todas as encomendas dele também serão excluídas. Essa ação não pode ser desfeita.')){
      sb.from('clientes_yanka').delete().eq('id', idCliente).then(({error})=>{
        if(error){ console.error(error); toast('Erro ao excluir o cliente.'); return; }
        dados.clientes = dados.clientes.filter(c=>c.id!==idCliente);
        dados.vendas = dados.vendas.filter(v=>v.clienteId!==idCliente);
        toast('Cliente excluído.');
        renderAll();
      });
    }
  }
});

// Fecha modal clicando fora
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click', (e)=>{
    if(e.target === ov) ov.classList.add('hidden');
  });
});

document.getElementById('buscaCliente').addEventListener('input', (e)=> renderClientes(e.target.value));
document.getElementById('buscaVenda').addEventListener('input', renderVendas);
document.getElementById('filtroStatusVenda').addEventListener('change', renderVendas);
document.getElementById('filtroMesVenda').addEventListener('change', renderVendas);
document.getElementById('filtroMesPendencias').addEventListener('change', renderPendencias);

/* ============ Backup: exportar / importar ============ */

document.getElementById('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `doces-yanka-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado!');
});

document.getElementById('btnImport').addEventListener('click', ()=>{
  document.getElementById('fileImport').click();
});

document.getElementById('fileImport').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!parsed.clientes || !parsed.produtos || !parsed.vendas) throw new Error('Formato inválido');
      if(!confirm('Importar este backup vai substituir os dados de TODOS os dispositivos conectados. Continuar?')){
        e.target.value = '';
        return;
      }

      toast('Importando backup...');
      const NULO = '00000000-0000-0000-0000-000000000000';
      await sb.from('vendas_yanka').delete().neq('id', NULO);
      await sb.from('clientes_yanka').delete().neq('id', NULO);
      await sb.from('produtos_yanka').delete().neq('id', NULO);

      const mapaProdutos = {};
      for(const p of parsed.produtos){
        const { data:novo, error } = await sb.from('produtos_yanka').insert({ nome:p.nome, preco:p.preco }).select().single();
        if(error) throw error;
        mapaProdutos[p.id] = novo.id;
      }

      const mapaClientes = {};
      for(const c of parsed.clientes){
        const { data:novo, error } = await sb.from('clientes_yanka').insert({ nome:c.nome, telefone:c.telefone||null }).select().single();
        if(error) throw error;
        mapaClientes[c.id] = novo.id;
      }

      for(const v of parsed.vendas){
        const itensRemapeados = (v.itens||[]).map(i=>({ ...i, produtoId: mapaProdutos[i.produtoId] || i.produtoId }));
        const { error } = await sb.from('vendas_yanka').insert({
          cliente_id: mapaClientes[v.clienteId],
          data: v.data,
          itens: itensRemapeados,
          pago: v.pago||0,
          obs: v.obs||null,
          criado_em: v.criadoEm || Date.now()
        });
        if(error) throw error;
      }

      await carregarDoServidor();
      renderAll();
      toast('Backup importado com sucesso!');
    }catch(err){
      console.error(err);
      toast('Erro ao importar backup. Verifique o arquivo.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ============ Inicialização ============ */

iniciar();
