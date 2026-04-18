const express = require('express');
const router = express.Router();
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function metaInsights(params) {
  const token = process.env.META_ADS_TOKEN;
  const adAccount = process.env.AD_ACCOUNT_ID;
  if (!token || !adAccount) return [];
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/${adAccount}/insights`, {
      params: { ...params, access_token: token },
      timeout: 15000,
    });
    return r.data.data || [];
  } catch (e) {
    console.error('Meta insights error:', e.response?.data?.error?.message || e.message);
    return [];
  }
}

function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtPeso(n) { return '$' + parseFloat(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }); }
function fmtNum(n) { return parseInt(n || 0).toLocaleString('es-MX'); }
function pct(a, b) {
  const va = parseFloat(a || 0), vb = parseFloat(b || 0);
  if (!vb) return null;
  const d = ((va - vb) / vb * 100);
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
}
function extractLeads(item) {
  const actions = (item && item.actions) || [];
  const types = ['lead', 'onsite_conversion.messaging_conversation_started_7d', 'offsite_conversion.fb_pixel_lead'];
  for (const t of types) {
    const a = actions.find(x => x.action_type === t);
    if (a) return parseInt(a.value || 0);
  }
  return 0;
}

router.get('/', async (req, res) => {
  if (req.query.secret !== 'daniel2024') return res.status(403).json({ error: 'No autorizado' });

  try {
    const hoy = new Date();
    const hace7  = new Date(hoy - 7  * 86400000);
    const hace14 = new Date(hoy - 14 * 86400000);

    const semanaRange   = { since: fmt(hace7),  until: fmt(hoy) };
    const anteriorRange = { since: fmt(hace14), until: fmt(hace7) };
    const fields7d = 'spend,impressions,clicks,ctr,cpc,reach,frequency,actions,cost_per_action_type';

    const [
      semana, anterior,
      adsetsSemana, adsetsAnterior,
      edadGenero, placements,
    ] = await Promise.all([
      metaInsights({ fields: fields7d, time_range: JSON.stringify(semanaRange) }),
      metaInsights({ fields: fields7d, time_range: JSON.stringify(anteriorRange) }),
      metaInsights({ fields: fields7d + ',adset_name', time_range: JSON.stringify(semanaRange),   level: 'adset' }),
      metaInsights({ fields: fields7d + ',adset_name', time_range: JSON.stringify(anteriorRange), level: 'adset' }),
      metaInsights({ fields: 'spend,clicks,ctr,impressions', time_range: JSON.stringify(semanaRange), breakdowns: 'age,gender' }),
      metaInsights({ fields: 'spend,clicks,ctr,impressions,actions', time_range: JSON.stringify(semanaRange), breakdowns: 'publisher_platform' }),
    ]);

    const s = semana[0] || {};
    const a = anterior[0] || {};
    const leadsS = extractLeads(s);
    const leadsA = extractLeads(a);

    const resumen = {
      periodo: `${fmt(hace7)} → ${fmt(hoy)}`,
      gasto:       fmtPeso(s.spend),
      impresiones: fmtNum(s.impressions),
      clicks:      fmtNum(s.clicks),
      alcance:     fmtNum(s.reach),
      ctr:         parseFloat(s.ctr || 0).toFixed(2) + '%',
      cpc:         fmtPeso(s.cpc),
      frecuencia:  parseFloat(s.frequency || 0).toFixed(2),
      leads:       leadsS,
      costoPorLead: leadsS > 0 ? fmtPeso(parseFloat(s.spend || 0) / leadsS) : 'sin datos',
    };

    const comparacion = {
      gastoAnterior:       fmtPeso(a.spend),
      leadsAnterior:       leadsA,
      deltaCTR:            pct(s.ctr, a.ctr)    || 'sin datos',
      deltaCPC:            pct(s.cpc, a.cpc)    || 'sin datos',
      deltaGasto:          pct(s.spend, a.spend) || 'sin datos',
      deltaLeads:          leadsA ? pct(leadsS, leadsA) : 'sin datos',
      deltaFrecuencia:     pct(s.frequency, a.frequency) || 'sin datos',
    };

    const adsets = adsetsSemana.map(ad => {
      const prev     = adsetsAnterior.find(p => p.adset_name === ad.adset_name) || {};
      const leadsAd  = extractLeads(ad);
      const leadsPrev = extractLeads(prev);
      return {
        nombre:        ad.adset_name,
        gasto:         fmtPeso(ad.spend),
        impresiones:   fmtNum(ad.impressions),
        clicks:        fmtNum(ad.clicks),
        ctr:           parseFloat(ad.ctr || 0).toFixed(2) + '%',
        cpc:           fmtPeso(ad.cpc),
        frecuencia:    parseFloat(ad.frequency || 0).toFixed(1),
        leads:         leadsAd,
        costoPorLead:  leadsAd > 0 ? fmtPeso(parseFloat(ad.spend || 0) / leadsAd) : 'sin conversiones',
        tendenciaGasto: pct(ad.spend, prev.spend) || 'nuevo',
        tendenciaLeads: leadsAd && leadsPrev ? pct(leadsAd, leadsPrev) : 'sin referencia',
      };
    });

    const audiencia = edadGenero
      .sort((a, b) => parseInt(b.clicks || 0) - parseInt(a.clicks || 0))
      .slice(0, 10)
      .map(g => ({
        segmento:    `${g.age} ${g.gender}`,
        clicks:      parseInt(g.clicks || 0),
        ctr:         parseFloat(g.ctr || 0).toFixed(2) + '%',
        gasto:       fmtPeso(g.spend),
        impresiones: parseInt(g.impressions || 0),
      }));

    const placementsData = placements
      .sort((a, b) => parseInt(b.clicks || 0) - parseInt(a.clicks || 0))
      .map(p => ({
        plataforma: p.publisher_platform,
        clicks:     parseInt(p.clicks || 0),
        ctr:        parseFloat(p.ctr || 0).toFixed(2) + '%',
        gasto:      fmtPeso(p.spend),
        leads:      extractLeads(p),
      }));

    const prompt = `Eres un experto en Meta Ads especializado en bienes raíces de alto valor en México. Analiza estos datos y genera un análisis DETALLADO y ACCIONABLE. Usa números concretos. Sé directo.

CONTEXTO DEL NEGOCIO:
- Proyecto: Privada Encino, Montemorelos NL (45 min de Monterrey)
- Producto: Terrenos residenciales campestres $1.7M - $1.9M MXN
- Lotes: Lote 1 ($1.7M), Lote 3B ($1.785M), Lote 4 Premium ($1.9M)
- Objetivo: leads calificados → visita al terreno → venta
- Un solo lead cerrado vale millones — calidad > cantidad

SEMANA ANALIZADA: ${resumen.periodo}

RESUMEN GENERAL:
${JSON.stringify(resumen, null, 2)}

COMPARACIÓN VS SEMANA ANTERIOR:
${JSON.stringify(comparacion, null, 2)}

RENDIMIENTO POR AD SET:
${JSON.stringify(adsets, null, 2)}

AUDIENCIA (quién hace clic, ordenado por volumen):
${JSON.stringify(audiencia, null, 2)}

PLACEMENTS (dónde aparece el anuncio):
${JSON.stringify(placementsData, null, 2)}

---

Genera el análisis con EXACTAMENTE esta estructura en markdown:

## 📊 Resumen ejecutivo
2-3 oraciones: qué pasó en dinero, clicks y leads esta semana vs la anterior. Tono directo.

## ✅ Qué está funcionando
Los 2-3 elementos con mejor performance. Explica POR QUÉ funcionan y qué los diferencia.

## ⚠️ Problemas detectados
Lo que desperdicia presupuesto, tiene mal CTR, frecuencia muy alta, o no genera leads. Sé específico con nombres de ad sets.

## 👥 Audiencia ideal
Qué segmento de edad/género tiene mejor CTR y menor CPC. Qué segmento ignorar. Insight sobre el comprador de Privada Encino.

## 📍 Mejores placements
Dónde invertir más (Feed, Reels, Stories) y dónde recortar, con base en los datos.

## 💰 Redistribución de presupuesto
Sé concreto: si el presupuesto total es X, cuánto poner en cada ad set. Da porcentajes o montos estimados.

## 🎯 5 acciones concretas esta semana
Ordenadas por impacto. MUY específicas: no "optimizar audiencia" sino "en el Ad Set [nombre], agregar segmento mujeres 35-44 y subir bid 15%". Una acción por línea numerada.

## 📈 Predicción a 7 días
Si implementas estas acciones, qué cambio esperar en CTR, CPC y leads. Sé realista.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const analisis = response.content[0].text;
    console.log('Análisis generado, tokens:', response.usage);

    res.json({ ok: true, periodo: resumen.periodo, datos: { resumen, comparacion, adsets, audiencia, placements: placementsData }, analisis });

  } catch (e) {
    console.error('Error /analizar-ads:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
