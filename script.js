/* ============ Doce Controle — Gestão de Vendas de Docinhos ============ */

const STORAGE_KEY = 'doceControleDados';

let dados = {
  clientes: [],   // {id, nome, telefone}
  produtos: [],   // {id, nome, preco}
  vendas: []      // {id, clienteId, data, itens:[{produtoId,nome,preco,qtd}], total, pago, obs}
};

function gerarId(){
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function salvar(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

function carregar(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try{
      const parsed = JSON.parse(raw);
      dados.clientes = parsed.clientes || [];
      dados.produtos = parsed.produtos || [];
      dados.vendas = parsed.vendas || [];
    }catch(e){ console.error('Erro ao carregar dados', e); }
  }
  if(dados.produtos.length === 0){
    dados.produtos = [
      { id: gerarId(), nome: 'Brigadeiro', preco: 2.5 },
      { id: gerarId(), nome: 'Beijinho', preco: 2.5 },
      { id: gerarId(), nome: 'Bombom de morango', preco: 4 },
      { id: gerarId(), nome: 'Cookie', preco: 5 }
    ];
    salvar();
  }
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
  dashboard: ['Painel Geral', 'Resumo das vendas de docinhos da Confeitaria da Gabi'],
  clientes: ['Clientes', 'Todos os clientes que já compraram seus docinhos'],
  vendas: ['Encomendas', 'Histórico completo de encomendas, separado por mês'],
  pendencias: ['A Receber', 'Clientes com pagamentos pendentes'],
  produtos: ['Docinhos', 'Catálogo de docinhos e preços']
};

function irPara(view){
  views.forEach(v=>{
    document.getElementById('view-'+v).classList.toggle('hidden', v!==view);
  });
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view===view);
  });
  document.getElementById('viewTitle').textContent = titles[view][0];
  document.getElementById('viewSubtitle').textContent = titles[view][1];
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
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td>${escapeHtml(c.telefone||'—')}</td>
        <td>${formatarMoeda(comprado)}</td>
        <td>${formatarMoeda(pago)}</td>
        <td style="color:${saldo>0.001?'var(--red)':'var(--green)'}; font-weight:700;">${formatarMoeda(saldo)}</td>
        <td>${status}</td>
        <td><button class="icon-btn" data-ver-cliente="${c.id}" title="Ver encomendas">${icon('search')}</button></td>
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
          <td>${formatarData(v.data)}</td>
          <td><strong>${escapeHtml(cliente ? cliente.nome : '—')}</strong></td>
          <td>${escapeHtml(produtosTxt)}</td>
          <td>${qtdTotal}</td>
          <td>${formatarMoeda(total)}</td>
          <td>${formatarMoeda(v.pago||0)}</td>
          <td><span class="badge ${badge}">${label}</span></td>
          <td>
            ${st!=='pago' ? `<button class="icon-btn" data-pagar="${v.id}" title="Registrar pagamento">${icon('check-circle')}</button>` : ''}
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
        <td><strong>${escapeHtml(d.cliente.nome)}</strong></td>
        <td>${escapeHtml(d.cliente.telefone||'—')}</td>
        <td>${d.qtd}</td>
        <td style="color:var(--red); font-weight:700;">${formatarMoeda(d.saldo)}</td>
        <td><button class="secondary-btn" data-cobrar="${d.cliente.id}" data-mes="${filtroMes}">${icon('check-circle')} Registrar pagamento</button></td>
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
        <td><strong>${escapeHtml(p.nome)}</strong></td>
        <td>${formatarMoeda(p.preco)}</td>
        <td>${unidades}</td>
        <td>${formatarMoeda(totalGerado)}</td>
        <td><button class="icon-btn" data-excluir-produto="${p.id}" title="Excluir">${icon('trash')}</button></td>
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
const itensVendaEl = document.getElementById('itensVenda');
let contadorItens = 0;

function atualizarDatalistClientes(){
  const dl = document.getElementById('listaClientes');
  dl.innerHTML = dados.clientes.map(c=>`<option value="${escapeHtml(c.nome)}">`).join('');
}

function optionsProdutos(selectedId){
  return dados.produtos.map(p=>
    `<option value="${p.id}" data-preco="${p.preco}" ${p.id===selectedId?'selected':''}>${escapeHtml(p.nome)} (${formatarMoeda(p.preco)})</option>`
  ).join('');
}

function addLinhaItem(){
  contadorItens++;
  const linhaId = 'item_'+contadorItens;
  const primeiroProduto = dados.produtos[0];
  const div = document.createElement('div');
  div.className = 'item-linha';
  div.id = linhaId;
  div.innerHTML = `
    <select class="sel-produto">${optionsProdutos()}</select>
    <input type="number" class="inp-qtd" min="1" value="1">
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
  itensVendaEl.innerHTML = '';
  contadorItens = 0;
  document.getElementById('formVenda').reset();
  document.getElementById('inputData').value = new Date().toISOString().slice(0,10);
  addLinhaItem();
  atualizarTotalVenda();
  modalVenda.classList.remove('hidden');
}

document.getElementById('btnNovaVenda').addEventListener('click', abrirModalVenda);

document.getElementById('formVenda').addEventListener('submit', (e)=>{
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

  let cliente = dados.clientes.find(c=> c.nome.toLowerCase()===nome.toLowerCase());
  if(!cliente){
    cliente = { id: gerarId(), nome, telefone };
    dados.clientes.push(cliente);
  }else if(telefone){
    cliente.telefone = telefone;
  }

  dados.vendas.push({
    id: gerarId(),
    clienteId: cliente.id,
    data,
    itens,
    pago: valorPago,
    obs,
    criadoEm: Date.now()
  });

  salvar();
  modalVenda.classList.add('hidden');
  toast('Encomenda registrada com sucesso!');
  renderAll();
});

/* ============ Modal: Novo Produto ============ */

const modalProduto = document.getElementById('modalProduto');
document.getElementById('btnNovoProduto').addEventListener('click', ()=>{
  document.getElementById('formProduto').reset();
  modalProduto.classList.remove('hidden');
});

document.getElementById('formProduto').addEventListener('submit', (e)=>{
  e.preventDefault();
  const nome = document.getElementById('inputProdutoNome').value.trim();
  const preco = parseFloat(document.getElementById('inputProdutoPreco').value);
  if(!nome || isNaN(preco)){ toast('Preencha nome e preço.'); return; }
  dados.produtos.push({ id: gerarId(), nome, preco });
  salvar();
  modalProduto.classList.add('hidden');
  toast('Docinho cadastrado!');
  renderAll();
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

document.getElementById('formPagamento').addEventListener('submit', (e)=>{
  e.preventDefault();
  let valor = parseFloat(document.getElementById('inputPagamentoValor').value);
  if(isNaN(valor) || valor<=0){ toast('Informe um valor válido.'); return; }

  if(pagamentoContexto.tipo==='venda'){
    const venda = dados.vendas.find(v=>v.id===pagamentoContexto.id);
    venda.pago = (venda.pago||0) + valor;
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
      v.pago = (v.pago||0) + aplica;
      valor -= aplica;
    }
  }

  salvar();
  modalPagamento.classList.add('hidden');
  toast('Pagamento registrado!');
  renderAll();
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
  const btnExcluirVenda = e.target.closest('[data-excluir-venda]');
  if(btnExcluirVenda){
    if(confirm('Excluir esta encomenda? Essa ação não pode ser desfeita.')){
      dados.vendas = dados.vendas.filter(v=>v.id!==btnExcluirVenda.dataset.excluirVenda);
      salvar();
      toast('Encomenda excluída.');
      renderAll();
    }
  }
  const btnExcluirProduto = e.target.closest('[data-excluir-produto]');
  if(btnExcluirProduto){
    if(confirm('Excluir este docinho do catálogo?')){
      dados.produtos = dados.produtos.filter(p=>p.id!==btnExcluirProduto.dataset.excluirProduto);
      salvar();
      toast('Docinho excluído.');
      renderAll();
    }
  }
  const btnVerCliente = e.target.closest('[data-ver-cliente]');
  if(btnVerCliente){
    document.getElementById('buscaVenda').value = dados.clientes.find(c=>c.id===btnVerCliente.dataset.verCliente)?.nome || '';
    irPara('vendas');
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
  a.download = `doce-controle-backup-${new Date().toISOString().slice(0,10)}.json`;
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
  reader.onload = (ev)=>{
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!parsed.clientes || !parsed.produtos || !parsed.vendas) throw new Error('Formato inválido');
      if(confirm('Importar este backup vai substituir todos os dados atuais. Continuar?')){
        dados = parsed;
        salvar();
        renderAll();
        toast('Backup importado com sucesso!');
      }
    }catch(err){
      toast('Arquivo inválido. Verifique o backup.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ============ Inicialização ============ */

carregar();
renderAll();
