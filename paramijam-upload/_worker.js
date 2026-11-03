// Paramijam checkout worker (Cloudflare Workers + KV). Replaces cvent-count-worker.js.
// Endpoints:
//   GET  /count                   -> {"sold": n, "left": n}   (point the Drop 1 page's liveCountUrl here)
//   POST /validate                -> checks a Stripe promotion code against the cart
//   POST /checkout                -> stores the order, creates a Stripe Checkout Session, returns {url}
//   POST /webhook                 -> Stripe webhook (checkout.session.completed / async_payment_succeeded)
//   GET  /order/:id               -> order status + attendees for the confirmation page
//   POST /order/:id/attendees     -> saves "finish later" attendee details
//   GET  /export.csv?key=ADMIN_KEY -> every paid attendee as CSV
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ADMIN_KEY, RESEND_API_KEY (confirmation emails; optional), HUBSPOT_TOKEN (follow-ups; optional)
// Vars:    PRICE_GA, PRICE_PREFERRED, PRICE_VIP, PRICE_BLACK, PRICE_ADDON_WINTER, PRICE_ADDON_WORKSHOPS, SITE_CHECKOUT_URL,
//          EMAIL_FROM (e.g. "Paramijam <tickets@paramijam.com>"), EMAIL_REPLY_TO, LODGING_URL, LODGING_URL_ADVISORY
// KV binding: ORDERS

const CAP = 120, MAX_PER_ORDER = 10, ADDON = 150;
const ALLOW_ORIGINS = ['https://www.paramijam.com', 'https://paramijam.com'];
const TIERS = { ga: 399, preferred: 599, vip: 849, black: 1199 }; // must match the Stripe prices
const TIER_ENV = { ga: 'PRICE_GA', preferred: 'PRICE_PREFERRED', vip: 'PRICE_VIP', black: 'PRICE_BLACK' };
const SDRS = { mwall: 'McKay Wall', bhancock: 'Britton Hancock', cfrandsen: 'Caze Frandsen', cdean: 'Colby Dean', dturner: 'Dallin Turner', mhammond: 'Meredith Hammond', tporter: 'Tyler Porter', abrady: 'Alex Brady' };
const COUNTED_SOURCES = ['drop1']; // advisory/partner orders don't count toward the 120
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const s = v => String(v ?? '').slice(0, 200).trim();
function cors(req) {
  const o = req.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(o) ? o : ALLOW_ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', Vary: 'Origin' };
}
const json = (req, data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(req), ...extra } });

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(env, method, path, params) {
  const qs = method === 'GET' && params ? '?' + form(params) : '';
  const r = await fetch('https://api.stripe.com/v1/' + path + qs, {
    method,
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? form(params || {}) : undefined
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'stripe ' + r.status);
  return j;
}

function clean(body) {
  const attendees = (Array.isArray(body.attendees) ? body.attendees : []).slice(0, MAX_PER_ORDER).filter(a => a && TIERS[a.tier]).map(a => ({
    tier: a.tier, first: s(a.first), last: s(a.last), email: s(a.email).toLowerCase(), title: s(a.title), company: s(a.company), phone: s(a.phone),
    diet: s(a.diet), access: s(a.access), fit: a.fit === 'womens' ? 'womens' : a.fit === 'mens' ? 'mens' : '', size: s(a.size).slice(0, 4), know: s(a.know), fw: Array.isArray(a.fw) ? a.fw.map(s).slice(0, 6) : [], fwOther: s(a.fwOther),
    wType: s(a.wType), sport: s(a.sport), lesson: s(a.lesson), equip: s(a.equip), tue: s(a.tue), wed: s(a.wed),
    ws: Array.isArray(a.ws) ? a.ws.map(s).slice(0, 6) : [], addW: !!a.addW, addK: !!a.addK
  }));
  const fill = body.fill === 'later' && attendees.length > 1 ? 'later' : 'all';
  const buyer = Math.min(Math.max(0, body.buyer | 0), Math.max(0, attendees.length - 1));
  const at = body.attribution || {};
  const attr = { ref: String(at.ref || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40), refSource: ['link', 'dropdown'].includes(at.refSource) ? at.refSource : '', utm_source: s(at.utm_source), utm_medium: s(at.utm_medium), utm_campaign: s(at.utm_campaign), utm_content: s(at.utm_content), utm_term: s(at.utm_term), landing: s(at.landing) };
  return { attendees, fill, buyer, source: body.source === 'advisory' ? 'advisory' : 'drop1', code: s(body.code).slice(0, 64), attr };
}
const full = (o, i) => o.fill === 'all' || i === o.buyer;
function cart(o) {
  const qty = { ga: 0, preferred: 0, vip: 0, black: 0 }; let w = 0, k = 0;
  o.attendees.forEach((a, i) => {
    qty[a.tier]++;
    if (a.tier !== 'ga') return;
    if (full(o, i)) { if (a.wType && a.wType !== 'none') w++; if (a.ws.some(x => x !== 'na')) k++; }
    else { if (a.addW) w++; if (a.addK) k++; }
  });
  const sub = Object.entries(qty).reduce((t, [id, n]) => t + TIERS[id] * n, 0) + (w + k) * ADDON;
  return { qty, w, k, sub, tickets: o.attendees.length };
}

// Promotion codes live in Stripe. Optional metadata on the coupon or promo code:
//   per_ticket=true  -> amount_off is applied once per ticket (e.g. kennyeatworld: $300 off every ticket)
//   max_tickets=N    -> only the N most expensive eligible tickets are discounted (e.g. 100% off, max_tickets=1)
//   tiers=ga,vip     -> limits which tiers the code applies to
async function discount(env, code, o, c) {
  if (!code) return null;
  const list = await stripe(env, 'GET', 'promotion_codes', { code, active: 'true', limit: 1 });
  const p = list.data && list.data[0];
  if (!p) return { error: "That code isn't valid." };
  let cp = p.coupon;
  if (!cp || typeof cp !== 'object') cp = await stripe(env, 'GET', 'coupons/' + ((p.promotion && p.promotion.coupon) || p.coupon));
  if (!cp || !cp.valid) return { error: 'That code has expired.' };
  const m = { ...(cp.metadata || {}), ...(p.metadata || {}) };
  const custom = m.per_ticket === 'true' || !!m.max_tickets || !!m.tiers;
  if (custom && p.max_redemptions) {
    const used = (p.times_redeemed || 0) + parseInt((await env.ORDERS.get('uses:' + p.id)) || '0', 10);
    if (used >= p.max_redemptions) return { error: 'That code has been fully used.' };
  }
  const tiers = (m.tiers || '').split(',').map(x => x.trim()).filter(Boolean);
  let prices = o.attendees.filter(a => !tiers.length || tiers.includes(a.tier)).map(a => TIERS[a.tier]).sort((a, b) => b - a);
  if (m.max_tickets) prices = prices.slice(0, parseInt(m.max_tickets, 10) || prices.length);
  if (!prices.length) return { error: "That code doesn't apply to these tickets." };
  let amount = 0;
  if (m.per_ticket === 'true' && cp.amount_off) amount = prices.length * cp.amount_off / 100;
  else if (cp.percent_off) amount = (custom ? prices.reduce((a, b) => a + b, 0) : c.sub) * cp.percent_off / 100;
  else if (cp.amount_off) amount = cp.amount_off / 100;
  amount = Math.min(c.sub, Math.round(amount * 100) / 100);
  return { code: p.code, promo: p.id, label: cp.name || p.code, amount, custom };
}

async function onPaid(env, order) {
  try { await sendConfirmation(env, order); } catch (e) {}
  try { await hubspotSync(env, order); } catch (e) {}
  if (COUNTED_SOURCES.includes(order.source)) {
    const sold = parseInt((await env.ORDERS.get('sold')) || '0', 10);
    await env.ORDERS.put('sold', String(sold + order.attendees.length));
  }
  if (order.customDiscount && order.promo) {
    const u = parseInt((await env.ORDERS.get('uses:' + order.promo)) || '0', 10);
    await env.ORDERS.put('uses:' + order.promo, String(u + 1));
  }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIER_NAMES = { ga: 'General Admission', preferred: 'Preferred', vip: 'VIP', black: 'Black' };
const usd = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function sendConfirmation(env, o) {
  if (!env.RESEND_API_KEY || !o.email) return;
  const buyer = o.attendees[o.buyer] || {};
  const lodging = o.source === 'advisory' ? (env.LODGING_URL_ADVISORY || 'https://book.passkey.com/event/51368377/owner/50282924/home') : (env.LODGING_URL || 'https://book.passkey.com/event/51361247/owner/50282924/home');
  const mono = "font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-weight:700;letter-spacing:.06em";
  const btn = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#20FC8F;color:#000000;text-decoration:none;padding:14px 20px;${mono};font-size:13px">&gt; ${esc(label)}</a>`;
  const rows = o.attendees.map((a, i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #2A2A2A;color:#FFFFFF;font-size:15px">${esc((a.first + ' ' + a.last).trim() || 'Ticket ' + (i + 1))}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #2A2A2A;color:#BFBFBF;${mono};font-size:11px">${esc(TIER_NAMES[a.tier].toUpperCase())}</td></tr>`).join('');
  const team = o.finishUrl ? `
    <tr><td style="padding:28px 32px 0"><div style="${mono};font-size:11px;color:#20FC8F">02 / GET YOUR CREW'S INFO</div>
      <div style="color:#FFFFFF;font-size:20px;font-weight:700;padding:8px 0 6px">Finish details for ${o.attendees.length - 1} ${o.attendees.length - 1 === 1 ? 'ticket' : 'tickets'}.</div>
      <div style="color:#BFBFBF;font-size:15px;line-height:1.45;padding-bottom:14px">We still need winter activity and workshop picks for your team. Fill them in yourself, or forward this link so they can add their own.</div>
      ${btn(o.finishUrl, 'FINISH TEAM DETAILS')}
      <div style="color:#8C8C8C;font-size:12px;line-height:1.5;padding-top:12px;word-break:break-all">${esc(o.finishUrl)}</div></td></tr>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#000000"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0B0A0A;border:1px solid #2A2A2A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
    <tr><td style="padding:32px 32px 0"><div style="${mono};font-size:11px;color:#20FC8F">&gt; ORDER ${esc(o.id)} · CONFIRMED</div>
      <div style="color:#FFFFFF;font-size:40px;line-height:1;font-weight:700;letter-spacing:-1.5px;padding:14px 0 10px">You're in.</div>
      <div style="color:#BFBFBF;font-size:16px;line-height:1.45">${o.attendees.length} ${o.attendees.length === 1 ? 'ticket' : 'tickets'} to Paramijam 2027 · Park City, UT · Jan 26–28.</div></td></tr>
    <tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #FFFFFF">${rows}
      <tr><td style="padding:12px 0;color:#BFBFBF;${mono};font-size:11px">TOTAL PAID</td><td align="right" style="padding:12px 0;color:#FFFFFF;${mono};font-size:20px">${usd(o.paidTotal ?? o.total)}</td></tr></table></td></tr>
    <tr><td style="padding:28px 32px 0"><div style="${mono};font-size:11px;color:#20FC8F">01 / BOOK YOUR ROOM</div>
      <div style="color:#FFFFFF;font-size:20px;font-weight:700;padding:8px 0 6px">Get our Pendry discount.</div>
      <div style="color:#BFBFBF;font-size:15px;line-height:1.45;padding-bottom:14px">Lodging isn't included, but our room block at Pendry Park City has a discounted nightly rate when you book through this link.</div>
      ${btn(lodging, 'BOOK YOUR ROOM')}</td></tr>${team}
    <tr><td style="padding:32px;color:#8C8C8C;font-size:12px;line-height:1.5">${(o.paidTotal ?? o.total) > 0 ? 'Your Stripe receipt arrives separately. ' : ''}Questions? Just reply to this email.<br>Paramify · Paramijam 2027</td></tr>
  </table></td></tr></table></body></html>`;
  const text = `You're in. Order ${o.id}: ${o.attendees.length} ticket(s) to Paramijam 2027, Park City, Jan 26-28.\n\nBook your room (Pendry discount): ${lodging}` + (o.finishUrl ? `\n\nFinish your team's details (or forward this link to them): ${o.finishUrl}` : '');
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'Paramijam <tickets@paramijam.com>', to: [o.email], reply_to: env.EMAIL_REPLY_TO || undefined, subject: `You're in: Paramijam 2027 (order ${o.id})`, html, text })
  });
}

const hasPicks = a => !!a.wType && Array.isArray(a.ws) && a.ws.length > 0;
const missing = o => o.attendees.filter((a, i) => i !== o.buyer && !hasPicks(a));

// Upserts the buyer + every ticket holder as HubSpot contacts. Create these contact properties first (see LIVE-COUNT-SETUP.md).
async function hubspotSync(env, o) {
  if (!env.HUBSPOT_TOKEN) return;
  const miss = o.fill === 'later' ? missing(o) : [];
  const day = Date.UTC(...new Date(o.paidAt || Date.now()).toISOString().slice(0, 10).split('-').map((v, i) => i === 1 ? v - 1 : +v));
  const seen = new Set(), inputs = [];
  const add = (a, role) => {
    const email = (a.email || '').toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) return;
    seen.add(email);
    const props = { email, firstname: a.first, lastname: a.last, jobtitle: a.title, pj_order_id: o.id, pj_role: role, pj_tier: TIER_NAMES[a.tier], pj_source: o.source, pj_purchase_date: String(day) };
    if (a.company) props.company = a.company;
    if (a.know) props.pj_relationship = a.know;
    if (o.attr && o.attr.ref) props.pj_sdr = SDRS[o.attr.ref] || o.attr.ref;
    if ((a.fw || []).length) props.pj_frameworks = a.fw.join(';');
    if (a.fwOther) props.pj_frameworks_other = a.fwOther;
    if (a.size) props.pj_shirt = 'Unisex ' + a.size;
    if (role === 'buyer') Object.assign(props, {
      pj_tickets: String(o.attendees.length), pj_team_link: o.finishUrl || '',
      pj_details_complete: miss.length ? 'false' : 'true',
      pj_missing_details: miss.map(m => `${(m.first + ' ' + m.last).trim()} (${TIER_NAMES[m.tier]})`).join('\n')
    });
    else props.pj_details_complete = hasPicks(a) ? 'true' : 'false';
    inputs.push({ id: email, idProperty: 'email', properties: props });
  };
  add(o.attendees[o.buyer] || {}, 'buyer');
  o.attendees.forEach((a, i) => { if (i !== o.buyer) add(a, 'teammate'); });
  if (!inputs.length) return;
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs })
  });
  if (!r.ok) throw new Error('hubspot ' + r.status);
}

function returnUrl(body, env) {
  const r = s(body.returnUrl);
  try { const u = new URL(r); if (ALLOW_ORIGINS.includes(u.origin)) return u.origin + u.pathname; } catch (e) {}
  return env.SITE_CHECKOUT_URL || 'https://www.paramijam.com/checkout';
}

async function checkout(req, env) {
  const body = await req.json(), o = clean(body), c = cart(o);
  if (!c.tickets) return json(req, { error: 'Add at least one ticket.' }, 400);
  for (const [i, a] of o.attendees.entries()) {
    if (!a.first || !a.last || !EMAIL.test(a.email)) return json(req, { error: `Ticket ${i + 1} needs a name and a valid email.` }, 400);
  }
  if (COUNTED_SOURCES.includes(o.source)) {
    const sold = parseInt((await env.ORDERS.get('sold')) || '0', 10);
    if (sold + c.tickets > CAP) return json(req, { error: `Only ${Math.max(0, CAP - sold)} tickets left in Drop 1.` }, 409);
  }
  const d = await discount(env, o.code, o, c);
  if (d && d.error) return json(req, { error: d.error }, 400);
  const id = 'PJ-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const total = Math.max(0, Math.round((c.sub - (d ? d.amount : 0)) * 100) / 100);
  const order = { id, ...o, qty: c.qty, addons: { winter: c.w, workshops: c.k }, subtotal: c.sub, discount: d ? d.amount : 0, discountLabel: d ? d.label : '', promo: d ? d.promo : '', customDiscount: d ? d.custom : false, total, status: 'pending', email: o.attendees[o.buyer].email, created: new Date().toISOString() };
  const ret = returnUrl(body, env), back = o.source === 'advisory' ? '&from=advisory' : '';
  order.finishUrl = o.fill === 'later' && c.tickets > 1 ? `${ret}?order=${id}&finish=1${back}` : '';

  if (total === 0) {
    order.status = 'paid'; order.paidAt = new Date().toISOString();
    await env.ORDERS.put('order:' + id, JSON.stringify(order));
    await onPaid(env, order);
    return json(req, { url: `${ret}?order=${id}${back}` });
  }

  const line_items = [];
  for (const [t, n] of Object.entries(c.qty)) if (n) line_items.push({ price: env[TIER_ENV[t]], quantity: n });
  if (c.w) line_items.push({ price: env.PRICE_ADDON_WINTER, quantity: c.w });
  if (c.k) line_items.push({ price: env.PRICE_ADDON_WORKSHOPS, quantity: c.k });
  let discounts;
  if (d) {
    if (d.custom) {
      const cp = await stripe(env, 'POST', 'coupons', { amount_off: Math.round(d.amount * 100), currency: 'usd', duration: 'once', max_redemptions: 1, name: d.label.slice(0, 40), metadata: { order_id: id, promo: d.promo } });
      discounts = [{ coupon: cp.id }];
    } else discounts = [{ promotion_code: d.promo }];
  }
  const sess = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment', line_items, discounts, customer_email: order.email, client_reference_id: id,
    metadata: { order_id: id, tickets: c.tickets, source: o.source, sdr: o.attr.ref ? (SDRS[o.attr.ref] || o.attr.ref) : '', sdr_source: o.attr.refSource, utm_source: o.attr.utm_source, utm_campaign: o.attr.utm_campaign }, payment_intent_data: { metadata: { order_id: id }, receipt_email: order.email, description: ('Paramijam 2027 · Order ' + id + (order.finishUrl ? ' · Finish your team’s details: ' + order.finishUrl : '')).slice(0, 1000) },
    success_url: `${ret}?order=${id}${back}`, cancel_url: ret + (back ? '?from=advisory' : ''),
    expires_at: Math.floor(Date.now() / 1000) + 1800
  });
  order.session = sess.id;
  await env.ORDERS.put('order:' + id, JSON.stringify(order));
  return json(req, { url: sess.url });
}

async function verify(req, env) {
  const sig = req.headers.get('Stripe-Signature') || '', body = await req.text();
  const t = (sig.split(',').find(x => x.startsWith('t=')) || '').slice(2);
  const v1 = sig.split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + body));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!t || !v1.includes(hex) || Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
  return JSON.parse(body);
}

async function webhook(req, env) {
  const evt = await verify(req, env);
  if (!evt) return new Response('bad signature', { status: 400 });
  if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
    const sess = evt.data.object;
    if (sess.payment_status === 'paid' || sess.payment_status === 'no_payment_required') {
      const id = sess.metadata && sess.metadata.order_id, raw = id && await env.ORDERS.get('order:' + id);
      if (raw) {
        const order = JSON.parse(raw);
        if (order.status !== 'paid') {
          order.status = 'paid'; order.paidAt = new Date().toISOString(); order.paidTotal = sess.amount_total / 100;
          await env.ORDERS.put('order:' + id, JSON.stringify(order));
          await onPaid(env, order);
        }
      }
    }
  }
  return new Response('ok');
}

function publicOrder(o) {
  const { session, promo, customDiscount, ...rest } = o;
  return rest;
}

async function saveAttendees(req, env, id) {
  const raw = await env.ORDERS.get('order:' + id);
  if (!raw) return json(req, { error: 'not found' }, 404);
  const order = JSON.parse(raw);
  if (order.status !== 'paid') return json(req, { error: 'Order is not paid yet.' }, 409);
  const incoming = clean({ attendees: (await req.json()).attendees, fill: 'all' }).attendees;
  order.attendees = order.attendees.map((a, i) => {
    if (i === order.buyer || !incoming[i]) return a;
    const n = incoming[i];
    return { ...a, first: n.first || a.first, last: n.last || a.last, email: n.email || a.email, title: n.title || a.title, company: n.company, phone: n.phone, diet: n.diet, access: n.access, fit: n.fit, size: n.size, know: n.know, fw: n.fw, fwOther: n.fwOther, wType: n.wType, sport: n.sport, lesson: n.lesson, equip: n.equip, tue: n.tue, wed: n.wed, ws: n.ws };
  });
  order.updated = new Date().toISOString();
  await env.ORDERS.put('order:' + id, JSON.stringify(order));
  try { await hubspotSync(env, order); } catch (e) {}
  return json(req, { ok: true });
}

async function exportCsv(env) {
  const rows = [['order', 'status', 'source', 'paid_at', 'ticket', 'tier', 'first', 'last', 'email', 'title', 'company', 'phone', 'shirt_fit', 'shirt_size', 'knows_paramify', 'frameworks', 'winter', 'sport', 'lesson', 'equipment', 'tue', 'wed', 'workshops', 'ga_addon_winter', 'ga_addon_workshops', 'dietary', 'accessibility', 'order_total', 'discount_code', 'sdr', 'sdr_source', 'utm_source', 'utm_medium', 'utm_campaign']];
  let cursor;
  do {
    const page = await env.ORDERS.list({ prefix: 'order:', cursor });
    for (const k of page.keys) {
      const o = JSON.parse(await env.ORDERS.get(k.name));
      if (o.status !== 'paid') continue;
      o.attendees.forEach((a, i) => {
        const isFull = full(o, i) || !!a.wType;
        const w = a.tier === 'ga' ? (isFull ? !!a.wType && a.wType !== 'none' : a.addW) : true;
        const ks = a.tier === 'ga' ? (isFull ? a.ws.some(x => x !== 'na') : a.addK) : true;
        rows.push([o.id, o.status, o.source, o.paidAt, i + 1, a.tier, a.first, a.last, a.email, a.title, a.company, a.phone, a.fit, a.size, a.know, (a.fw || []).map(f => f === 'Other' && a.fwOther ? 'Other: ' + a.fwOther : f).join('|'), a.wType || 'pending', a.sport, a.lesson, a.equip, a.tue, a.wed, a.ws.join('|'), a.tier === 'ga' ? w : 'included', a.tier === 'ga' ? ks : 'included', a.diet, a.access, o.total, o.code, o.attr && o.attr.ref ? (SDRS[o.attr.ref] || o.attr.ref) : '', o.attr ? o.attr.refSource : '', o.attr ? o.attr.utm_source : '', o.attr ? o.attr.utm_medium : '', o.attr ? o.attr.utm_campaign : '']);
      });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="paramijam-attendees.csv"' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.replace(/\/$/, '');
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    try {
      if (p === '/count') {
        const sold = Math.min(CAP, parseInt((await env.ORDERS.get('sold')) || '0', 10));
        return json(req, { sold, left: CAP - sold }, 200, { 'Cache-Control': 'public, max-age=15' });
      }
      if (p === '/admin/orders') {
        if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json(req, { error: 'forbidden' }, 403);
        const orders = []; let cursor;
        do {
          const page = await env.ORDERS.list({ prefix: 'order:', cursor });
          for (const k of page.keys) { const o = JSON.parse(await env.ORDERS.get(k.name)); if (o.status === 'paid') orders.push(publicOrder(o)); }
          cursor = page.list_complete ? null : page.cursor;
        } while (cursor);
        const sold = Math.min(CAP, parseInt((await env.ORDERS.get('sold')) || '0', 10));
        return json(req, { sold, cap: CAP, left: CAP - sold, orders }, 200, { 'Cache-Control': 'no-store' });
      }
      if (p === '/validate' && req.method === 'POST') {
        const o = clean(await req.json()), d = await discount(env, o.code, o, cart(o));
        if (!d) return json(req, { error: 'Enter a code.' }, 400);
        if (d.error) return json(req, d, 400);
        return json(req, { code: d.code, label: d.label, amount: d.amount });
      }
      if (p === '/checkout' && req.method === 'POST') return await checkout(req, env);
      if (p === '/webhook' && req.method === 'POST') return await webhook(req, env);
      if (p === '/export.csv') {
        if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return new Response('forbidden', { status: 403 });
        return await exportCsv(env);
      }
      const m = p.match(/^\/order\/(PJ-[A-Z0-9]{10})(\/attendees)?$/);
      if (m && m[2] && req.method === 'POST') return await saveAttendees(req, env, m[1]);
      if (m && req.method === 'GET') {
        const raw = await env.ORDERS.get('order:' + m[1]);
        return raw ? json(req, publicOrder(JSON.parse(raw))) : json(req, { error: 'not found' }, 404);
      }
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'Checkout is unavailable right now. Try again in a minute.' }, 502);
    }
  }
};
