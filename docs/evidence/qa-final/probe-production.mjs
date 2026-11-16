// Sondeo de solo lectura (sin credenciales) del despliegue. Nunca envía cookies ni datos.
const base = globalThis.process.argv[2];
const pages = ['/', '/resumen', '/historial', '/tarjetas', '/fondos', '/presupuestos', '/estadisticas', '/informes', '/deudas', '/recurrentes', '/beneficios', '/catalogo', '/categorias', '/etiquetas', '/avisos', '/ayuda', '/account', '/auth/sign-in'];
const apis = ['/api/account', '/api/account/backup', '/api/bank-balances', '/api/bank-balances/adjustments', '/api/bank-benefits', '/api/budgets', '/api/cards', '/api/cards/cycles', '/api/cards/operations', '/api/catalog', '/api/categories', '/api/classification', '/api/cron/card-push', '/api/cron/contributions', '/api/display-currency', '/api/export', '/api/funds', '/api/funds/contributions', '/api/history-filters', '/api/loans', '/api/manual-exchange-rate', '/api/movements', '/api/recurrences', '/api/refunds', '/api/shared-expenses', '/api/statistics-favorites', '/api/auth/get-session', '/api/auth/sign-out'];
const rows = [];
async function hit(method, path, extra = {}) {
  const res = await globalThis.fetch(base + path, { method, redirect: 'manual', headers: extra.headers, body: extra.body, signal: globalThis.AbortSignal.timeout(30000) });
  const text = await res.text();
  rows.push({ method, path, status: res.status, location: res.headers.get('location') ?? '', cache: res.headers.get('cache-control') ?? '', bytes: text.length, leaksJson: /"(owner_id|amount|balance)"/.test(text) });
}
for (const p of pages) await hit('GET', p);
for (const p of apis) await hit('GET', p);
await hit('POST', '/api/movements', { headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
await hit('POST', '/api/movements', { headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
await hit('POST', '/api/auth/sign-out', { headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
for (const r of rows) globalThis.console.log(`${r.method} ${r.path} -> ${r.status} ${r.location} | ${r.cache} | ${r.bytes}B${r.leaksJson ? ' LEAK?' : ''}`);
const bad = rows.filter((r) => (r.status === 200 && !['/auth/sign-in', '/api/auth/sign-out'].includes(r.path)) || r.leaksJson);
globalThis.console.log('\nrespuestas 200 distintas de /auth/sign-in o con claves financieras:', JSON.stringify(bad));
