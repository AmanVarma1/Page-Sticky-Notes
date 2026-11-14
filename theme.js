// Applies the saved theme (auto / light / dark) to extension pages
(async () => {
  const apply = (t) => {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  };
  try {
    const { settings } = await chrome.storage.local.get('settings');
    apply(settings && settings.theme);
  } catch {}
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      apply(changes.settings.newValue && changes.settings.newValue.theme);
    }
  });
})();
