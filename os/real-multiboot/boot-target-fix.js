(() => {
  const select = document.getElementById('os-select');
  const target = document.getElementById('boot-target');
  if (!select || !target) return;
  const params = new URLSearchParams(location.search);
  const requested = params.get('preset') || location.hash.replace(/^#/, '');
  if (requested && Array.from(select.options).some((option) => option.value === requested)) {
    select.value = requested;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const sync = () => {
    const option = select.options[select.selectedIndex];
    target.textContent = option ? option.textContent : 'GORICS Web Linux GUI OS';
  };
  select.addEventListener('change', sync);
  sync();
})();
