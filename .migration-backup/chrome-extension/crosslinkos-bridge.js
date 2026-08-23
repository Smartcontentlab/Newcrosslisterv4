function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

window.addEventListener('crosslinkos:extension-handoff', async (event) => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'QUEUE_DRAFTS', payload: event.detail });
    dispatch('crosslinkos:extension-handoff-status', response?.ok ? { ok: true } : { ok: false, error: response?.error || 'The extension could not accept this draft handoff.' });
  } catch {
    dispatch('crosslinkos:extension-handoff-status', { ok: false, error: 'The CrossLinkOS extension is not available in this browser profile.' });
  }
});

window.addEventListener('crosslinkos:connection-request', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE' });
    dispatch('crosslinkos:connection-status', {
      detected: Boolean(response?.ok),
      marketplaces: response?.connections ?? {},
      updatedAt: new Date().toISOString(),
    });
  } catch {
    dispatch('crosslinkos:connection-status', { detected: false, marketplaces: {}, updatedAt: new Date().toISOString() });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'FILL_STATUS' && message.update?.draftId && message.update?.status) {
    dispatch('crosslinkos:extension-fill-status', { draftId: message.update.draftId, status: message.update.status });
  }
});
