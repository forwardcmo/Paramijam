(function () {
  var K = 'pj-attr', D = 60 * 864e5;
  try {
    var q = new URLSearchParams(location.search), cur = JSON.parse(localStorage.getItem(K) || 'null');
    if (cur && Date.now() - cur.ts > D) cur = null;
    var ref = (q.get('ref') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40), u = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { var v = q.get(k); if (v) u[k] = v.slice(0, 100); });
    if (ref) cur = Object.assign({}, u, { ref: ref, ts: Date.now(), landing: location.pathname });
    else if (Object.keys(u).length) cur = Object.assign({}, cur || {}, u, { ts: cur && cur.ref ? cur.ts : Date.now() });
    if (cur) localStorage.setItem(K, JSON.stringify(cur));
  } catch (e) {}
  window.pjAttr = function () { try { var c = JSON.parse(localStorage.getItem(K) || 'null'); return c && Date.now() - c.ts <= D ? c : null; } catch (e) { return null; } };
})();
