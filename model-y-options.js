// Model Y additions are kept in a tiny follow-up module so the main workshop
// stays compatible with old cached HTML while the new selector options arrive.
const select = document.querySelector('#modelSelect');
if (select) {
  const options = [
    ['model-y-legacy', 'Photoreal Model Y · legacy'],
    ['model-y-juniper', 'Photoreal Model Y · Juniper 2025'],
  ];
  const anchor = select.querySelector('option[value="cybertruck"]');
  options.forEach(([value, label]) => {
    if (!select.querySelector(`option[value="${value}"]`)) {
      const option = new Option(label, value);
      select.insertBefore(option, anchor);
    }
  });
  select.value = 'model-y-juniper';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
document.querySelector('#modeTitle')?.closest('.viewport-head')?.querySelector('.eyebrow')?.replaceChildren('WHITE PEARL / TESLA');
document.querySelector('#scene')?.setAttribute('aria-label', 'Interactive 3D Tesla workshop');
document.querySelector('#panelTitle')?.replaceChildren('Take the Model Y Juniper 2025 apart');
