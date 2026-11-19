/* Paramijam site helper: on paramijam.com, links work as written (/tickets).
   Anywhere else (design previews, local files), site links like /tickets are
   routed to the matching file (tickets/index.html) relative to this site's root. */
(function () {
  var host = location.hostname.replace(/^www\./, '');
  if (host === 'paramijam.com') return;
  var me = document.currentScript && document.currentScript.src;
  if (!me) return;
  var root = me.replace(/site\.js(\?.*)?$/, '');
  var FILES = /\.(pdf|png|jpe?g|svg|webp|avif|ico|js|css|html)$/i;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/' || href.charAt(1) === '/') return;
    var m = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/), p = m[1].replace(/^\/+|\/+$/g, '');
    var url = root + (p === '' ? 'index.html' : FILES.test(p) ? p : p + '/index.html') + (m[2] || '') + (m[3] || '');
    e.preventDefault();
    if (a.target === '_blank') window.open(url, '_blank', 'noopener'); else location.href = url;
  }, true);
})();
