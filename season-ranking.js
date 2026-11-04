/* Apocalypse Run | Top 10 atual | extensão não-invasiva da Sala de Guerra.
 * Só consulta a Edge Function pública. Nunca usa chaves administrativas. */
(() => {
  'use strict';
  const ENDPOINT = 'https://uhafxqvaetsrwobpyuak.supabase.co/functions/v1/season-ranking-public';
  const ROOT = document.getElementById('root');
  if (!ROOT) return;
  const ICONS = { all: '◉', human: '⬡', zombie: '☣' };
  const LABELS = { all: 'Todos', human: 'Resistência', zombie: 'Horda' };
  const MEDALS = ['🥇', '🥈', '🥉'];
  const format = n => new Intl.NumberFormat('pt-BR').format(n);
  const state = { data: null, selected: 'all', loading: false, error: '', sequence: 0, animation: 0 };
  let section = null;
  let list = null;
  let status = null;
  let summary = null;
  let refreshButton = null;
  let seasonLabel = null;
  let switchTimer = 0;
  let errorAction = null;

  function element(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = String(content);
    return el;
  }
  function append(parent, tag, className, content) {
    const el = element(tag, className, content);
    parent.appendChild(el);
    return el;
  }
  function valid(data) {
    if (!data || data.schemaVersion !== 1 || !data.season ||
        !Number.isInteger(data.season.number) || !Array.isArray(data.leaders) ||
        !data.participants || !['all','human','zombie'].every(k => Number.isInteger(data.participants[k])) ||
        data.leaders.length > 30) return false;
    return data.leaders.every(row => row && typeof row.name === 'string' && row.name.length <= 32 &&
      ['HUMAN','ZOMBIE'].includes(row.faction) && Number.isSafeInteger(row.points) &&
      Number.isInteger(row.patrols) && Number.isInteger(row.globalRank) && Number.isInteger(row.factionRank));
  }
  function mounted() { return Boolean(section && section.isConnected && list && list.isConnected); }
  function mount() {
    if (mounted()) return;
    const parent = ROOT.querySelector('main .main-grid');
    if (!parent) return;
    section = element('section', 'panel ar-season-ranking');
    section.id = 'ar-season-ranking';
    section.setAttribute('aria-labelledby', 'ar-ranking-heading');

    const heading = append(section, 'div', 'ar-rank-heading');
    const intro = append(heading, 'div', 'ar-rank-intro');
    append(intro, 'div', 'eyebrow', 'OPERAÇÕES DA TEMPORADA');
    const title = append(intro, 'h3', 'ar-rank-title');
    append(title, 'span', 'ar-rank-trophy', '🏆').setAttribute('aria-hidden', 'true');
    append(title, 'span', '', 'TOP 10 DA TEMPORADA');
    append(intro, 'p', 'ar-rank-description', 'Os dez jogadores com mais pontos competitivos na campanha atual.');

    const toolbox = append(heading, 'div', 'ar-rank-toolbox');
    seasonLabel = append(toolbox, 'span', 'ar-rank-season', 'TEMPORADA --');
    refreshButton = append(toolbox, 'button', 'ar-rank-refresh', '↻ Atualizar');
    refreshButton.type = 'button';
    refreshButton.setAttribute('aria-label', 'Atualizar ranking da temporada');
    refreshButton.addEventListener('click', () => void update(true));

    const controls = append(section, 'div', 'ar-rank-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Filtrar classificação por facção');
    for (const key of ['all', 'human', 'zombie']) {
      const button = append(controls, 'button', 'ar-rank-tab ar-rank-tab--' + key);
      button.type = 'button';
      button.dataset.scope = key;
      button.setAttribute('aria-pressed', String(key === state.selected));
      append(button, 'span', 'ar-rank-tab-icon', ICONS[key]).setAttribute('aria-hidden', 'true');
      append(button, 'span', '', LABELS[key]);
      append(button, 'span', 'ar-rank-filter-count', '0');
      button.addEventListener('click', () => choose(key));
    }
    summary = append(section, 'div', 'ar-rank-summary', 'Consultando a classificação oficial...');
    list = append(section, 'div', 'ar-rank-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-live', 'polite');
    status = append(section, 'div', 'ar-rank-status');
    const note = append(status, 'span', 'ar-rank-note', 'Pontos da temporada, não do mapa. NPCs não participam deste ranking.');
    note.setAttribute('title', 'Classificação calculada por eventos pontuados de jogadores e patrulhas válidas.');
    errorAction = append(status, 'span', 'ar-rank-last-sync', 'Consultando servidor...');
    parent.insertAdjacentElement('afterend', section);
    render();
  }
  function scopeEntries() {
    if (!state.data) return [];
    const faction = state.selected === 'human' ? 'HUMAN' : state.selected === 'zombie' ? 'ZOMBIE' : null;
    const sortKey = faction ? 'factionRank' : 'globalRank';
    return state.data.leaders.filter(row => !faction || row.faction === faction)
      .filter(row => row[sortKey] <= 10)
      .sort((a,b) => a[sortKey] - b[sortKey]).slice(0,10);
  }
  function renderRows() {
    if (!mounted()) return;
    list.replaceChildren();
    if (!state.data) {
      const empty = append(list, 'div', 'ar-rank-empty');
      append(empty, 'span', 'ar-rank-empty-icon', state.error ? '⚠' : '⌛');
      append(empty, 'strong', '', state.error ? 'Ranking indisponível' : 'Recebendo dados da temporada...');
      append(empty, 'p', '', state.error ? 'A classificação não pôde ser consultada. Tente atualizar.' : 'Consultando os pontos oficiais no servidor.');
      return;
    }
    const entries = scopeEntries();
    if (!entries.length) {
      const empty = append(list, 'div', 'ar-rank-empty');
      append(empty, 'span', 'ar-rank-empty-icon', state.selected === 'zombie' ? '☣' : '⬡');
      append(empty, 'strong', '', state.selected === 'zombie' ? 'A Horda aguarda seus primeiros competidores' : 'Nenhum jogador classificado neste filtro');
      append(empty, 'p', '', 'Ainda não há jogadores com patrulhas válidas ou eventos pontuados desta facção na temporada.');
      return;
    }
    const max = Math.max(1, ...entries.map(r => Math.max(0,r.points)));
    const rankKey = state.selected === 'all' ? 'globalRank' : 'factionRank';
    for (const [i, row] of entries.entries()) {
      const rank = row[rankKey];
      const item = append(list, 'div', 'ar-rank-row' + (i < 3 ? ' ar-rank-row--podium' : '') + (row.faction === 'ZOMBIE' ? ' ar-rank-row--horde' : ''));
      item.setAttribute('role', 'listitem');
      item.style.setProperty('--ar-row-index', Math.min(i,9));
      const position = append(item, 'span', 'ar-rank-position', i < 3 ? MEDALS[i] : String(rank).padStart(2,'0'));
      position.setAttribute('aria-label', rank + 'º lugar');
      const player = append(item, 'div', 'ar-rank-player');
      append(player, 'strong', 'ar-rank-name', row.name || 'Sobrevivente');
      const meta = append(player, 'div', 'ar-rank-meta');
      const faction = append(meta, 'span', 'ar-rank-faction ' + (row.faction === 'HUMAN' ? 'ar-rank-faction--human' : 'ar-rank-faction--zombie'));
      append(faction, 'span', 'ar-rank-faction-symbol', row.faction === 'HUMAN' ? '⬡' : '☣').setAttribute('aria-hidden','true');
      append(faction, 'span', '', row.faction === 'HUMAN' ? 'Resistência' : 'Horda');
      append(meta, 'span', 'ar-rank-patrols', row.patrols + (row.patrols === 1 ? ' patrulha' : ' patrulhas'));
      const score = append(item, 'div', 'ar-rank-score');
      const strong = append(score, 'strong', '', format(row.points));
      strong.setAttribute('aria-label', format(row.points) + ' pontos');
      append(score, 'small', '', 'PONTOS');
      const progress = append(item, 'div', 'ar-rank-track');
      progress.setAttribute('aria-hidden', 'true');
      const fill = append(progress, 'span', 'ar-rank-fill');
      fill.style.width = (Math.max(0,row.points) / max * 100).toFixed(2) + '%';
    }
  }
  function render() {
    if (!mounted()) return;
    section.classList.toggle('ar-rank-has-error', Boolean(state.error));
    const labels = { all:'competidores na temporada', human:'jogadores da Resistência', zombie:'jogadores da Horda' };
    for (const button of section.querySelectorAll('.ar-rank-tab')) {
      const key = button.dataset.scope;
      button.setAttribute('aria-pressed',String(key===state.selected));
      const count = button.querySelector('.ar-rank-filter-count');
      if(count) count.textContent = state.data ? format(state.data.participants[key]) : '·';
    }
    seasonLabel.textContent = state.data ? 'TEMPORADA ' + String(state.data.season.number).padStart(2,'0') : 'TEMPORADA --';
    const entries = scopeEntries();
    summary.textContent = state.data ? `${entries.length} de ${state.data.participants[state.selected]} ${labels[state.selected]} · TOP 10` : 'Aguardando a classificação oficial';
    refreshButton.disabled=state.loading;
    refreshButton.classList.toggle('ar-rank-refresh--busy',state.loading);
    if (state.error) errorAction.textContent = state.data ? 'Atualização falhou; exibindo última leitura.' : 'Falha ao consultar o servidor. Atualize para tentar novamente.';
    else if (state.loading) errorAction.textContent='Sincronizando...';
    else if (state.data) errorAction.textContent='Atualizado ' + new Date(state.data.asOf).toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
    else errorAction.textContent='Conectando ao servidor...';
    renderRows();
  }
  function choose(key) {
    if (!['all','human','zombie'].includes(key) || key === state.selected) return;
    state.selected = key;
    if (!mounted()) return;
    for (const button of section.querySelectorAll('.ar-rank-tab')) button.setAttribute('aria-pressed',String(button.dataset.scope===key));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    clearTimeout(switchTimer);
    if (reduced) { list.classList.remove('ar-rank-list--switch'); render(); return; }
    list.classList.add('ar-rank-list--switch');
    const sequence = ++state.animation;
    switchTimer = window.setTimeout(() => {
      if (sequence !== state.animation) return;
      render();
      requestAnimationFrame(() => list.classList.remove('ar-rank-list--switch'));
    }, 135);
  }
  async function update(force=false) {
    if (state.loading) return;
    if (document.hidden && !force) return;
    state.loading=true;state.error='';
    if (mounted()) render();
    try {
      const res=await fetch(ENDPOINT,{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error('HTTP '+res.status);
      const payload=await res.json();
      if(!valid(payload))throw Error('Contrato inválido');
      state.data=payload;
    }catch(e){state.error='Não foi possível atualizar o ranking.';}
    finally{state.loading=false;render();}
  }
  const observer = new MutationObserver(() => mount());
  observer.observe(ROOT,{childList:true,subtree:true});
  mount();
  void update();
  window.setInterval(() => { if (state.data && Date.parse(state.data.season.endsAt) <= Date.now()) state.data=null; void update(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void update(); });
})();
