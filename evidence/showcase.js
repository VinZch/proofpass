// Display saved evidence only. No wallet access, RPC queries, or state changes.
for (const gallery of document.querySelectorAll('[data-proof-gallery]')) {
  const buttons = [...gallery.querySelectorAll('[data-proof-select]')];
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const candidate of buttons) {
        const active = candidate === button;
        candidate.setAttribute('aria-pressed', String(active));
        gallery.querySelector('#' + candidate.getAttribute('aria-controls')).hidden = !active;
      }
    });
  }
  // Blob downloads work in embedded browsers too; retain native file:// links offline.
  for (const link of gallery.querySelectorAll('[data-proof-download]')) {
    link.addEventListener('click', async (event) => {
      if (location.protocol === 'file:') return;
      event.preventDefault();
      const status = gallery.querySelector('.proof-download-status');
      status.textContent = '正在准备原始文件…';
      try {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const url = URL.createObjectURL(await response.blob());
        const download = document.createElement('a');
        download.href = url;
        download.download = new URL(link.href).pathname.split('/').pop();
        document.body.append(download);
        download.click();
        download.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = '原始文件已准备好，下载已发起。';
      } catch {
        status.replaceChildren('下载暂未成功，请 ');
        const fallback = document.createElement('a');
        fallback.href = link.href;
        fallback.target = '_blank';
        fallback.rel = 'noopener';
        fallback.textContent = '打开原始文件';
        status.append(fallback);
      }
    });
  }
}
