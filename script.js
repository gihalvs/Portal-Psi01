/* Portal Psi — lógica da aplicação e simulador de banco de dados */
'use strict';

const KEY = 'portalpsi-db-v8';
const KEY_PAC = 'portalpsi-paciente';

/* Salário mínimo vigente em 2026 (Decreto 12.797/2025). ATUALIZE todo ano:
   o critério de baixa renda é calculado a partir dele. */
const SALARIO_MINIMO = 1621;

/* ===== CONFIGURAÇÃO DE VÍDEOS =====
   Preencha UM dos campos por vídeo:
   - youtube: link completo do vídeo ou só o ID (ex.: 'abc123XYZ00')
   - arquivo: caminho de um MP4 dentro do repositório (ex.: 'videos/tutorial.mp4')
   Deixe os dois vazios para mostrar o espaço reservado. */
const VIDEOS = [
  {titulo:'Tutorial: primeiros passos', descricao:'Cadastro, diário e agendamento em 3 minutos.', youtube:'', arquivo:''},
  {titulo:'Nosso modelo de atendimento', descricao:'Como o acolhimento humanizado funciona na prática.', youtube:'', arquivo:''}
];

const MOODS = [['😄','Feliz'],['🙂','Calmo'],['😐','Neutro'],['😟','Ansioso'],['😢','Triste']];
const COLORS = ['#2D7D77','#5B6FB5','#A4577A','#7A8A3A','#B5703A'];

/* Dados iniciais do simulador (uma "tabela" por entidade do modelo relacional) */
const seed = () => ({
  usuario: [
    {id:1, nome:'Ana Souza', email:'ana@exemplo.com', tipo_usuario:'paciente'},
    {id:2, nome:'Carlos Lima', email:'carlos@exemplo.com', tipo_usuario:'atendente'},
    {id:3, nome:'Admin Psi', email:'admin@exemplo.com', tipo_usuario:'administrador'}],
  paciente: [{id:1, id_usuario:1, cpf:'52998224725', data_nascimento:'1998-04-12', nome_responsavel:'', renda_familiar:2400, num_pessoas:3,
    renda_per_capita:800, cadunico:'sim', nis:'', beneficio:'nenhum', baixa_renda:true, status_verificacao:'pendente'}],
  especialista: [
    {id:1, nome:'Dra. Marina Alves Souza', crp:'CRP 06/210987', especialidade:'Psicologia Clínica, TCC e Luto', foto:'img/marina-alves.jpg'},
    {id:2, nome:'Dr. Rafael Nunes Pereira', crp:'CRP 06/112345', especialidade:'Psicologia do Esporte e Análise do Comportamento Aplicada (ABA)', foto:'img/rafael-nunes.jpg'},
    {id:3, nome:'Dra. Helena Prado Martins', crp:'CRP 06/99876', especialidade:'Psicologia Infantil e Juvenil, Orientação Familiar', foto:'img/helena-prado.jpg'},
    {id:4, nome:'Dra. Camila Torres Ribeiro', crp:'CRP 06/310456', especialidade:'Terapia de Casal e Família', foto:'img/camila-torres.jpg'},
    {id:5, nome:'Dr. André Costa Lima', crp:'CRP 06/411789', especialidade:'Psicologia Hospitalar e da Saúde', foto:'img/andre-lima.jpg'},
    {id:6, nome:'Dra. Beatriz Fontes Almeida', crp:'CRP 06/512321', especialidade:'Neuropsicologia e Avaliação Psicológica', foto:'img/beatriz-almeida.jpg'}],
  agendamento: [],
  registro_humor: []
});

/* ---------- Utilidades ---------- */
let db, humor = null, espAtual = null, tabAtiva = 'usuario', pacienteId = 1;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nextId = t => Math.max(0, ...db[t].map(r => r.id)) + 1;
/* Data local (toISOString usaria UTC e viraria o dia à noite no Brasil) */
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const br = iso => String(iso).split('-').reverse().join('/');
const ytId = v => {
  const t = String(v || '').trim();
  const m = t.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : (/^[\w-]{11}$/.test(t) ? t : '');
};

const brl = n => Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const soDigitos = t => String(t).replace(/\D/g, '');
const fmtCpf = d => {
  d = d.slice(0, 11); let o = d.slice(0, 3);
  if (d.length > 3) o += '.' + d.slice(3, 6);
  if (d.length > 6) o += '.' + d.slice(6, 9);
  if (d.length > 9) o += '-' + d.slice(9, 11);
  return o;
};
const mascaraCpf = d => d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : d;
function cpfValido(c){
  c = soDigitos(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => { let t = 0; for (let i = 0; i < n; i++) t += +c[i] * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
function idadeDe(iso){
  const [y, m, d] = iso.split('-').map(Number), h = new Date();
  let i = h.getFullYear() - y;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) i--;
  return i;
}
function lerPaciente(){ try { return Number(localStorage.getItem(KEY_PAC)) || 1; } catch { return 1; } }
function gravarPaciente(){ try { localStorage.setItem(KEY_PAC, String(pacienteId)); } catch { /* indisponível */ } }

function load(){ try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* armazenamento indisponível */ } }

let timerAviso;
function avisar(txt){
  const el = $('#toast'); el.textContent = txt; el.hidden = false;
  clearTimeout(timerAviso); timerAviso = setTimeout(() => el.hidden = true, 5000);
}

/* ---------- Diário de humor ---------- */
function renderMoods(){
  $('#moods').innerHTML = MOODS.map(([e, n]) =>
    `<button type="button" class="mood" aria-pressed="false" data-m="${n}"><span aria-hidden="true">${e}</span><small>${n}</small></button>`).join('');
}
function marcarHumor(){
  document.querySelectorAll('.mood').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === humor)));
}
function renderHistorico(){
  $('#historico').innerHTML = db.registro_humor.slice(-3).reverse().map(r =>
    `<li class="border-t border-line pt-2"><strong>${esc(r.sentimento)}</strong> (${r.intensidade}/5) em ${br(r.data)}${r.notas ? ': ' + esc(r.notas) : ''}</li>`).join('');
}
$('#moods').addEventListener('click', e => {
  const b = e.target.closest('.mood'); if (!b) return;
  humor = b.dataset.m; marcarHumor();
});
$('#intensidade').addEventListener('input', e => $('#int-val').textContent = e.target.value);
$('#form-humor').addEventListener('submit', e => {
  e.preventDefault();
  const msg = $('#humor-msg');
  if (!humor){ msg.textContent = 'Escolha como você está antes de salvar.'; return; }
  db.registro_humor.push({id:nextId('registro_humor'), id_paciente:pacienteId, sentimento:humor,
    intensidade:+$('#intensidade').value, notas:$('#notas').value.trim(), data:hoje()});
  save(); $('#notas').value = ''; humor = null; marcarHumor();
  msg.textContent = 'Registro salvo.';
  renderHistorico(); renderTabela();
});

/* ---------- Cadastro e verificação de baixa renda ----------
   Critério (Decreto 6.135/2007, usado pelo CadÚnico): renda por pessoa de até
   1/2 salário mínimo OU renda familiar total de até 3 salários mínimos.
   Os dados são autodeclarados: o resultado é preliminar e fica "pendente"
   até um atendente conferir os documentos. */
function avaliarRenda(total, pessoas, beneficio){
  const perCapita = total / pessoas;
  const limitePessoa = SALARIO_MINIMO / 2, limiteTotal = SALARIO_MINIMO * 3;
  const porPessoa = perCapita <= limitePessoa, porTotal = total <= limiteTotal;
  const beneficiario = beneficio === 'bolsa_familia' || beneficio === 'bpc';
  let motivo = '';
  if (porPessoa) motivo = `a renda por pessoa (${brl(perCapita)}) está dentro do limite de ${brl(limitePessoa)}`;
  else if (porTotal) motivo = `a renda total da família está dentro do limite de ${brl(limiteTotal)}`;
  else if (beneficiario) motivo = 'a família recebe benefício social de renda';
  return {perCapita, limitePessoa, baixa: porPessoa || porTotal || beneficiario, motivo};
}
function nomeDoPaciente(){
  const p = db.paciente.find(x => x.id === pacienteId) || db.paciente[0];
  return p ? (db.usuario.find(u => u.id === p.id_usuario)?.nome || '') : '';
}
function renderAtivo(){
  const n = nomeDoPaciente();
  $('#cad-ativo').textContent = n ? `Paciente ativo na demonstração: ${n}` : '';
}
$('#cad-nasc').max = hoje();
$('#cad-cpf').addEventListener('input', e => e.target.value = fmtCpf(soDigitos(e.target.value)));
$('#cad-nis').addEventListener('input', e => e.target.value = soDigitos(e.target.value).slice(0, 11));
$('#cad-nasc').addEventListener('change', e => {
  const menor = e.target.value && idadeDe(e.target.value) < 18;
  $('#bloco-resp').hidden = !menor; $('#cad-resp').required = menor;
});
$('#form-cad').addEventListener('submit', e => {
  e.preventDefault();
  const erro = $('#cad-erro'), falha = m => { erro.textContent = m; };
  const nome = $('#cad-nome').value.trim().replace(/\s+/g, ' '), cpf = soDigitos($('#cad-cpf').value);
  const nasc = $('#cad-nasc').value, resp = $('#cad-resp').value.trim();
  const renda = parseFloat($('#cad-renda').value), pessoas = parseInt($('#cad-pessoas').value, 10);
  const nis = soDigitos($('#cad-nis').value), beneficio = $('#cad-beneficio').value;

  if (nome.split(' ').length < 2) return falha('Informe nome e sobrenome.');
  if (!cpfValido(cpf)) return falha('CPF inválido. Confira os números.');
  if (db.paciente.some(p => p.cpf === cpf)) return falha('Já existe um cadastro com este CPF.');
  if (!nasc || nasc > hoje() || idadeDe(nasc) > 120) return falha('Informe uma data de nascimento válida.');
  const menor = idadeDe(nasc) < 18;
  if (menor && resp.split(' ').length < 2) return falha('Informe o nome completo do responsável legal.');
  if (!(renda >= 0)) return falha('Informe a renda mensal total da família (pode ser 0).');
  if (!(pessoas >= 1 && pessoas <= 30)) return falha('Informe quantas pessoas moram na casa (de 1 a 30).');
  if (nis && nis.length !== 11) return falha('O NIS tem 11 números. Deixe em branco se não souber.');
  if (!$('#cad-consent').checked) return falha('Marque a concordância para continuar.');
  erro.textContent = '';

  const r = avaliarRenda(renda, pessoas, beneficio);
  const idU = nextId('usuario'), idP = nextId('paciente');
  db.usuario.push({id:idU, nome, email:$('#cad-email').value.trim(), tipo_usuario:'paciente'});
  db.paciente.push({id:idP, id_usuario:idU, cpf, data_nascimento:nasc, nome_responsavel:menor ? resp : '',
    renda_familiar:renda, num_pessoas:pessoas, renda_per_capita:Math.round(r.perCapita * 100) / 100,
    cadunico:$('#cad-cadunico').value, nis, beneficio, baixa_renda:r.baixa, status_verificacao:'pendente'});
  pacienteId = idP; gravarPaciente(); save();

  const box = $('#cad-resultado');
  box.innerHTML = `<h3 class="font-display text-2xl">Cadastro recebido, ${esc(nome.split(' ')[0])}.</h3>
    <p class="mt-2">Renda por pessoa informada: <strong>${brl(r.perCapita)}</strong> (limite de baixa renda: ${brl(r.limitePessoa)}).</p>
    <p class="mt-2"><strong>Resultado preliminar:</strong> ${r.baixa
      ? `seu perfil é compatível com baixa renda, porque ${esc(r.motivo)}.`
      : 'seu perfil não se enquadra nos critérios de baixa renda, mas você continua podendo agendar consultas.'}</p>
    <p class="mt-2 text-sm text-ink/70">Situação: pendente. Um atendente vai confirmar suas informações antes de aplicar qualquer condição especial.</p>`;
  box.hidden = false; box.focus();
  e.target.reset(); $('#bloco-resp').hidden = true; $('#cad-resp').required = false;
  renderAtivo(); renderTabela();
});

/* ---------- Especialistas e agendamento ---------- */
function renderEsp(){
  $('#lista-esp').innerHTML = db.especialista.map((s, i) => {
    const ini = s.nome.replace(/^Dra?\.\s*/, '').split(' ').map(p => p[0]).join('').slice(0, 2);
    const cor = COLORS[i % COLORS.length];
    const avatar = s.foto
      ? `<img class="avatar" src="${esc(s.foto)}" alt="Foto de ${esc(s.nome)}" width="80" height="80" loading="lazy" data-ini="${esc(ini)}" data-cor="${cor}">`
      : `<div class="avatar" style="background:${cor}" aria-hidden="true">${esc(ini)}</div>`;
    return `<article class="card flex flex-col gap-3">
      <div class="flex items-center gap-3">${avatar}
        <div><h3 class="font-bold">${esc(s.nome)}</h3><p class="text-sm text-ink/70">${esc(s.crp)}</p></div>
      </div>
      <p class="text-sm">${esc(s.especialidade)}</p>
      <button class="btn mt-auto" data-ag="${s.id}">Agendar consulta</button></article>`;
  }).join('');
}
/* Se a foto não carregar, mostra as iniciais no lugar */
$('#lista-esp').addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.classList.contains('avatar')) return;
  const d = document.createElement('div');
  d.className = 'avatar'; d.style.background = img.dataset.cor; d.textContent = img.dataset.ini;
  d.setAttribute('aria-hidden', 'true');
  img.replaceWith(d);
}, true);
$('#lista-esp').addEventListener('click', e => {
  const b = e.target.closest('[data-ag]'); if (!b) return;
  espAtual = db.especialista.find(s => s.id === Number(b.dataset.ag));
  $('#ag-nome').textContent = espAtual.nome;
  $('#ag-erro').textContent = '';
  $('#ag-data').min = hoje();
  abrir('#modal-ag');
});
$('#form-ag').addEventListener('submit', e => {
  e.preventDefault();
  const data = $('#ag-data').value, hora = $('#ag-hora').value, erro = $('#ag-erro');
  if (data < hoje()){ erro.textContent = 'Escolha uma data de hoje em diante.'; return; }
  if (db.agendamento.some(a => a.id_especialista === espAtual.id && a.data === data && a.hora === hora && a.estado === 'agendado')){
    erro.textContent = 'Esse horário já está ocupado. Escolha outro.'; return;
  }
  db.agendamento.push({id:nextId('agendamento'), id_paciente:pacienteId, id_especialista:espAtual.id, data, hora, estado:'agendado'});
  save(); fecharTodos(); renderTabela();
  avisar(`Consulta agendada com ${espAtual.nome} em ${br(data)} às ${hora}.`);
});

/* ---------- Vídeos ---------- */
function renderVideos(){
  $('#lista-videos').innerHTML = VIDEOS.map(v => {
    const yt = ytId(v.youtube);
    const midia = yt
      ? `<iframe class="video" src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(v.titulo)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : v.arquivo
        ? `<video class="video" controls preload="metadata" src="${esc(v.arquivo)}" aria-label="${esc(v.titulo)}"></video>`
        : `<div class="video" role="img" aria-label="Espaço reservado para o vídeo">Vídeo em breve</div>`;
    return `<figure class="card">${midia}<figcaption class="mt-3 font-bold">${esc(v.titulo)}</figcaption><p class="text-sm text-ink/70">${esc(v.descricao)}</p></figure>`;
  }).join('');
}

/* ---------- Modais (foco preso dentro, Esc fecha, devolve o foco) ---------- */
const FOCAVEIS = 'input, select, button, a[href]';
let ultimoFoco = null;
function abrir(sel){
  const m = $(sel); ultimoFoco = document.activeElement;
  m.hidden = false; document.body.classList.add('overflow-hidden');
  m.querySelector(FOCAVEIS)?.focus();
}
function fecharTodos(){
  document.querySelectorAll('.modal').forEach(m => m.hidden = true);
  document.body.classList.remove('overflow-hidden');
  ultimoFoco?.focus();
}
$('#btn-sos').addEventListener('click', () => abrir('#modal-sos'));
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) fecharTodos(); });
});
document.addEventListener('keydown', e => {
  const m = document.querySelector('.modal:not([hidden])'); if (!m) return;
  if (e.key === 'Escape') return fecharTodos();
  if (e.key !== 'Tab') return;
  const f = [...m.querySelectorAll(FOCAVEIS)], a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a){ e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z){ e.preventDefault(); a.focus(); }
});

/* ---------- Simulador do banco ---------- */
function renderTabela(){
  $('#tabs').innerHTML = Object.keys(db).map(n =>
    `<button type="button" class="tab" aria-pressed="${n === tabAtiva}" data-t="${n}">${n} (${db[n].length})</button>`).join('');
  const rows = db[tabAtiva], cols = rows.length ? Object.keys(rows[0]) : [];
  const legenda = `<caption class="sr-only">Registros da tabela ${esc(tabAtiva)}</caption>`;
  $('#tabela').innerHTML = rows.length
    ? `${legenda}<thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r =>
        `<tr>${cols.map(c => `<td>${esc(c === 'cpf' ? mascaraCpf(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`
    : `${legenda}<tbody><tr><td>Tabela vazia. Registre um humor ou agende uma consulta.</td></tr></tbody>`;
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  tabAtiva = b.dataset.t; renderTabela();
  $(`.tab[data-t="${tabAtiva}"]`).focus();
});
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Apagar os registros criados e restaurar os dados de exemplo?')) return;
  db = seed(); pacienteId = 1; gravarPaciente(); save(); humor = null; marcarHumor();
  $('#cad-resultado').hidden = true; renderAtivo();
  renderEsp(); renderHistorico(); renderTabela(); avisar('Dados de exemplo restaurados.');
});

/* ---------- Início ---------- */
load(); pacienteId = lerPaciente(); renderMoods(); renderEsp(); renderVideos(); renderHistorico(); renderTabela(); renderAtivo();