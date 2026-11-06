/** Progressive navigation enhancement. No changes to the War Room's React code. */
(() => {
  'use strict';
  const root = document.getElementById('root');
  if (!root) return;
  function mount() {
    const links = root.querySelector('.header-quicklinks');
    if (!links || links.querySelector('.ar-patrol-entry-link')) return;
    const a = document.createElement('a');
    a.className = 'ar-patrol-entry-link';
    a.href = new URL('patrulha.html', document.baseURI).toString();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Planeje sua patrulha no mapa, sem armazenar rotas no servidor';
    a.setAttribute('aria-label', 'Abrir Planejador de Patrulha em nova aba');
    const symbol = document.createElement('span');
    symbol.className = 'ar-patrol-entry-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = '⌖';
    const label = document.createElement('span');
    label.className = 'ar-patrol-entry-label';
    label.textContent = 'PLANEJAR PATRULHA';
    a.append(symbol, label);
    const guide = links.querySelector('.guide-entry-link');
    if (guide) links.insertBefore(a, guide);
    else links.prepend(a);
  }
  const observer = new MutationObserver(mount);
  observer.observe(root,{childList:true,subtree:true});
  mount();
})();
