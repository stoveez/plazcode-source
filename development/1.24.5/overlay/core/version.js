// SPDX-License-Identifier: GPL-3.0-or-later
const PlazCodeVersion = (() => {
  let extensionPage = '';
  function browserPage(nav = {}) {
    const ua = String(nav.userAgent || '');
    const brands = (nav.userAgentData && nav.userAgentData.brands || []).map(item => String(item.brand));
    if (/Edg\//.test(ua) || brands.includes('Microsoft Edge')) return 'edge://extensions';
    if (brands.includes('Brave')) return 'brave://extensions';
    if (/OPR\/|Opera|Vivaldi|SamsungBrowser|YaBrowser|Firefox|CriOS|EdgiOS|EdgA\//i.test(ua)) return '';
    if (brands.includes('Google Chrome') || (!brands.length && /Chrome\//.test(ua))) return 'chrome://extensions';
    return '';
  }
  async function detectBrowser(nav = {}) {
    extensionPage = browserPage(nav);
    if (extensionPage !== 'edge://extensions' && nav.brave && typeof nav.brave.isBrave === 'function') {
      try { if (await nav.brave.isBrave()) extensionPage = 'brave://extensions'; } catch {}
    }
    return extensionPage;
  }
  function outdatedLabel(page = extensionPage) {
    return 'Outdated' + (page ? ', update the desktop app first, then go to ' + page + ' and reload the extension.' : '');
  }
  function version(value) {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    if (!parts.every(Number.isSafeInteger)) return null;
    while (parts.length < 4) parts.push(0);
    return parts;
  }
  function display(value) {
    const parts = version(value);
    if (!parts || parts[0] !== 1 || parts[1] < 19 || String(value).split('.').length !== 3) return value;
    return parts[0] + '.' + parts[1] + '.' + String(parts[2]).padStart(2, '0');
  }
  function describe(current, status, now = Date.now()) {
    const local = version(current), latest = version(status && status.latest);
    if (status && status.check_error) return {label:'Check unavailable',color:'#8598b1'};
    const checked = Number(status && status.checked_at);
    if (!local || !latest || !checked || now - checked > 15 * 60 * 1000 || checked > now + 60000) return {label:'Not checked',color:'#8598b1'};
    const difference = local.findIndex((part, index) => part !== latest[index]);
    const outdated = difference >= 0 && local[difference] < latest[difference];
    return {label:outdated?outdatedLabel():'Up to date',color:outdated?'#ff696c':'#31e0a4'};
  }
  function render(element, current, status, prefix = 'v', extra = '') {
    if (!element) return;
    const result = describe(current, status);
    element.textContent = prefix + display(current) + (result.label.startsWith('Outdated') ? ' - ' + result.label : ' (' + result.label + ')') + extra;
    if (element.style.setProperty) element.style.setProperty('color', result.color, 'important');
    else element.style.color = result.color;
    element.title = status && status.latest ? 'Latest published release: ' + display(status.latest) : 'Latest published release has not been checked.';
    element.setAttribute('aria-label', element.textContent);
    element.setAttribute('data-outdated', String(result.label.startsWith('Outdated')));
  }
  return {describe,render,display,browserPage,detectBrowser,outdatedLabel};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeVersion;
