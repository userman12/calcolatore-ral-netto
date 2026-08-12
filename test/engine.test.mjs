/**
 * Test del motore di calcolo in isolamento.
 *
 *   node --test test/
 *
 * Il prototipo è volutamente un singolo file HTML senza build step. Per testare
 * il motore senza browser, questo file estrae da index.html le sole sezioni
 * (A) configurazione e (B) motore — che sono JavaScript puro, senza JSX e senza
 * alcun riferimento al DOM — e le valuta in Node. Se un giorno il motore
 * dovesse dipendere dal DOM, questo file smetterebbe di funzionare: è la
 * garanzia che la separazione motore/UI resti reale e non solo dichiarata.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function caricaMotore() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const apertura = "<" + 'script type="text/babel" data-presets="react"' + ">";
  const chiusura = "<" + "/script" + ">";
  const script = html.split(apertura)[1].split(chiusura)[0];

  // Taglia via la sezione (C) UI e il banner di commento non chiuso che la apre.
  const soloMotore = script
    .slice(0, script.lastIndexOf("   (C) UI"))
    .split("/* ====")
    .slice(0, -1)
    .join("/* ===");

  globalThis.window = {};
  return new Function(soloMotore + "\nreturn window.JetHR;")();
}

const JetHR = caricaMotore();
const cfg2026 = JetHR.TAX_CONFIG[2026];
const cfg2025 = JetHR.TAX_CONFIG[2025];
const calcola = (ral, config = cfg2026, mensilita = 13) =>
  JetHR.calcolaNetto({ ral, mensilita, config });

const RAL_CAMPIONE = [20000, 35000, 55000, 80000];

// -----------------------------------------------------------------------------

test("il motore non tocca il DOM: si carica in Node senza browser", () => {
  assert.ok(JetHR.calcolaNetto);
  assert.ok(JetHR.TAX_CONFIG[2026]);
});

test("identità di bilancio: netto = RAL − contributi − imposte + bonus", () => {
  for (const ral of [0, 5000, 12000, 20000, 28000, 35000, 55000, 80000, 150000, 400000]) {
    const r = calcola(ral);
    const atteso = ral - r.contributi.totale - r.totaleImposte + r.bonusNetti;
    assert.ok(Math.abs(atteso - r.nettoAnnuo) < 1e-9, `RAL ${ral}`);
  }
});

test("il netto non supera mai la RAL né scende sotto zero", () => {
  for (let ral = 0; ral <= 200000; ral += 1000) {
    const r = calcola(ral);
    assert.ok(r.nettoAnnuo >= 0, `netto negativo a RAL ${ral}`);
    // Sotto le soglie dei bonus il netto PUÒ superare la RAL al netto delle
    // imposte, ma mai la RAL stessa più i bonus spettanti.
    assert.ok(r.nettoAnnuo <= ral + r.bonusNetti + 1e-9, `netto > RAL a RAL ${ral}`);
  }
});

test("contributi c/dipendente: aliquota base + 1% oltre la prima fascia", () => {
  const c = cfg2026.inps;
  const ral = 80000;
  const atteso = ral * c.aliquotaDipendente + (ral - c.primaFasciaPensionabile) * c.aliquotaAggiuntiva;
  assert.ok(Math.abs(calcola(ral).contributi.totale - atteso) < 1e-9);
});

test("contributi c/dipendente: sotto la prima fascia non c'è contributo aggiuntivo", () => {
  const r = calcola(cfg2026.inps.primaFasciaPensionabile - 1000);
  assert.equal(r.contributi.quotaAggiuntiva, 0);
});

test("contributi c/dipendente: si fermano al massimale", () => {
  const a = calcola(cfg2026.inps.massimaleAnnuo).contributi.totale;
  const b = calcola(cfg2026.inps.massimaleAnnuo * 3).contributi.totale;
  assert.ok(Math.abs(a - b) < 1e-9, "i contributi crescono oltre il massimale");
});

test("IRPEF lorda: coincide con il calcolo manuale per scaglioni", () => {
  const r = calcola(35000);
  const imp = r.imponibileFiscale;
  const atteso = 28000 * 0.23 + (imp - 28000) * 0.33;
  assert.ok(Math.abs(r.irpefLorda.totale - atteso) < 1e-9);
});

test("IRPEF lorda: la somma degli scaglioni copre tutto l'imponibile", () => {
  for (const ral of RAL_CAMPIONE) {
    const r = calcola(ral);
    const somma = r.irpefLorda.dettaglio.reduce((s, d) => s + d.imponibileNelloScaglione, 0);
    assert.ok(Math.abs(somma - r.imponibileFiscale) < 1e-9, `RAL ${ral}`);
  }
});

test("detrazione art. 13: valori agli estremi delle fasce", () => {
  const d = (R) => JetHR.calcolaDetrazioneLavoro(R, cfg2026).teorica;
  assert.ok(Math.abs(d(10000) - 1955) < 1e-9);
  assert.ok(Math.abs(d(15000) - 1955) < 1e-9);
  assert.ok(Math.abs(d(15000.01) - 3100) < 0.01, "salto normativo 1.955 → 3.100 a 15.000 €");
  assert.ok(Math.abs(d(28000) - 1910) < 1e-9);
  assert.ok(Math.abs(d(28000.01) - 1910) < 0.01, "la detrazione deve essere continua a 28.000 €");
  assert.ok(Math.abs(d(50000)) < 1e-9, "azzeramento a 50.000 €");
  assert.equal(d(60000), 0);
});

test("detrazione art. 13: maggiorazione di 65 € solo nella fascia 25.000–35.000", () => {
  const m = (R) => JetHR.calcolaDetrazioneLavoro(R, cfg2026).maggiorazione;
  assert.equal(m(24999), 0);
  assert.equal(m(25001), 65);
  assert.equal(m(35000), 65);
  assert.equal(m(35001), 0);
});

test("le detrazioni non generano mai credito d'imposta", () => {
  for (let ral = 0; ral <= 40000; ral += 500) {
    assert.ok(calcola(ral).irpefNetta >= 0, `IRPEF netta negativa a RAL ${ral}`);
  }
});

test("addizionali dovute solo se l'IRPEF netta è dovuta", () => {
  for (let ral = 0; ral <= 20000; ral += 250) {
    const r = calcola(ral);
    if (r.irpefNetta === 0) {
      assert.equal(r.addizionali.totale, 0, `addizionali dovute con IRPEF netta nulla a RAL ${ral}`);
    }
  }
});

test("addizionale comunale Milano: la soglia opera come cliff, non come franchigia", () => {
  const soglia = cfg2026.addizionaleComunale.sogliaEsenzione;
  const ralSotto = JetHR.ralDaImponibile(soglia - 10, cfg2026);
  const ralSopra = JetHR.ralDaImponibile(soglia + 10, cfg2026);
  assert.equal(calcola(ralSotto).addizionali.comunale, 0);
  const sopra = calcola(ralSopra).addizionali.comunale;
  // Se fosse una franchigia l'importo sarebbe ~0,08 €; essendo un cliff è ~184 €.
  assert.ok(sopra > 100, `atteso cliff, ottenuto ${sopra}`);
});

test("somma integrativa: spetta solo fino a 20.000 € di reddito complessivo", () => {
  const soglia = cfg2026.sommaIntegrativa.sogliaRedditoComplessivo;
  assert.ok(calcola(JetHR.ralDaImponibile(soglia - 10, cfg2026)).sommaIntegrativa.spetta);
  assert.ok(!calcola(JetHR.ralDaImponibile(soglia + 10, cfg2026)).sommaIntegrativa.spetta);
});

test("ulteriore detrazione: 1.000 € piatti fino a 32.000, poi décalage fino a 40.000", () => {
  const u = (imp) => JetHR.calcolaNetto({
    ral: JetHR.ralDaImponibile(imp, cfg2026), mensilita: 13, config: cfg2026,
  }).ulteriore.importo;
  assert.ok(Math.abs(u(25000) - 1000) < 0.01);
  assert.ok(Math.abs(u(32000) - 1000) < 0.01);
  assert.ok(Math.abs(u(36000) - 500) < 0.01, "punto medio del décalage");
  assert.ok(Math.abs(u(40000)) < 0.01);
  assert.equal(u(45000), 0);
});

test("trattamento integrativo: non spetta oltre 28.000 € di reddito complessivo", () => {
  assert.ok(!calcola(35000).trattamentoIntegrativo.spetta);
  assert.equal(calcola(35000).trattamentoIntegrativo.importo, 0);
});

test("modalità inversa: round-trip netto mensile → RAL → netto mensile", () => {
  for (const target of [1000, 1200, 1500, 1800, 2200, 2500, 3000, 4000]) {
    const inv = JetHR.ralDaNettoMensile({ nettoMensileTarget: target, mensilita: 13, config: cfg2026 });
    assert.ok(inv.trovata, `target ${target} non raggiunto`);
    const back = calcola(inv.ral).nettoMensile;
    assert.ok(Math.abs(back - target) < 1.0, `target ${target}: ottenuto ${back.toFixed(2)}`);
  }
});

test("il numero di mensilità ridistribuisce il netto annuo, non lo cambia", () => {
  const a = calcola(35000, cfg2026, 12);
  const b = calcola(35000, cfg2026, 14);
  assert.ok(Math.abs(a.nettoAnnuo - b.nettoAnnuo) < 1e-9);
  assert.ok(Math.abs(a.nettoMensile * 12 - b.nettoMensile * 14) < 1e-9);
});

test("conversione imponibile → RAL è esatta e invertibile", () => {
  for (const imp of [8500, 15000, 20000, 23000, 28000, 35000, 50000, 56224, 90000]) {
    const ral = JetHR.ralDaImponibile(imp, cfg2026);
    assert.ok(Math.abs(calcola(ral).imponibileFiscale - imp) < 0.01, `imponibile ${imp}`);
  }
});

test("i cliff rilevati coincidono con soglie normative note", () => {
  const cliff = JetHR.trovaCliff(cfg2026, { da: 0, a: 100000, passo: 50 });
  const soglie = JetHR.soglieNotevoli(cfg2026);
  assert.ok(cliff.length > 0, "atteso almeno un cliff nel modello 2026");
  for (const c of cliff) {
    const vicina = soglie.some((s) => Math.abs(s.ral - c.ral) < 120);
    assert.ok(vicina, `cliff a RAL ${c.ral} non riconducibile ad alcuna soglia di config`);
  }
});

test("il taglio IRPEF 35% → 33% aumenta il netto sopra i 28.000 € di imponibile", () => {
  for (const ral of [35000, 55000, 80000]) {
    const a = calcola(ral, cfg2025).nettoAnnuo;
    const b = calcola(ral, cfg2026).nettoAnnuo;
    assert.ok(b > a, `RAL ${ral}: 2026 (${b}) non migliore del 2025 (${a})`);
  }
});

test("il beneficio del solo taglio IRPEF non supera i 440 € teorici", () => {
  // Il confronto diretto 2025 vs 2026 sconta anche il diverso limite della prima
  // fascia pensionabile, che sposta i contributi. Per isolare l'effetto della sola
  // aliquota si costruisce una config 2026 con gli scaglioni IRPEF del 2025:
  // il risparmio massimo è 2% × 22.000 = 440 €, al lordo delle addizionali.
  const cfgIbrida = { ...cfg2026, irpef: cfg2025.irpef };
  for (const ral of [35000, 55000, 80000, 150000]) {
    const a = calcola(ral, cfgIbrida).nettoAnnuo;
    const b = calcola(ral, cfg2026).nettoAnnuo;
    assert.ok(b >= a, `RAL ${ral}: il taglio peggiora il netto`);
    assert.ok(b - a <= 440 + 1e-6, `RAL ${ral}: beneficio ${(b - a).toFixed(2)} oltre il massimo teorico di 440 €`);
  }
  // A pieno regime (imponibile oltre 50.000) il beneficio deve valere esattamente 440 €.
  const pieno = calcola(80000, cfg2026).nettoAnnuo - calcola(80000, cfgIbrida).nettoAnnuo;
  assert.ok(Math.abs(pieno - 440) < 1e-6, `atteso 440 €, ottenuto ${pieno.toFixed(2)}`);
});

test("il taglio IRPEF non cambia nulla sotto i 28.000 € di imponibile", () => {
  const a = calcola(20000, cfg2025).nettoAnnuo;
  const b = calcola(20000, cfg2026).nettoAnnuo;
  assert.ok(Math.abs(a - b) < 1e-9);
});

test("costo azienda = RAL + contributi c/azienda + accantonamento TFR", () => {
  for (const ral of RAL_CAMPIONE) {
    const r = calcola(ral);
    const atteso = ral + r.costoAzienda.contributiDatore + r.costoAzienda.accantonamentoTfr;
    assert.ok(Math.abs(r.costoAzienda.costoTotale - atteso) < 1e-9);
    assert.ok(r.costoAzienda.costoTotale > ral);
  }
});

test("il breakdown espone ogni voce con formula e riferimento normativo", () => {
  const r = calcola(35000);
  assert.ok(r.steps.length >= 14);
  for (const s of r.steps) {
    assert.ok(s.label, "voce senza label");
    assert.ok(typeof s.importo === "number" && Number.isFinite(s.importo), `${s.label}: importo non numerico`);
    assert.ok(s.base, `${s.label}: manca la base di calcolo`);
    assert.ok(s.formula, `${s.label}: manca la formula`);
    assert.ok(s.riferimento, `${s.label}: manca il riferimento normativo`);
  }
});

test("ogni anno in configurazione è completo", () => {
  for (const anno of Object.keys(JetHR.TAX_CONFIG)) {
    const c = JetHR.TAX_CONFIG[anno];
    for (const chiave of [
      "inps", "tfr", "irpef", "detrazioneLavoroDipendente", "sommaIntegrativa",
      "ulterioreDetrazione", "trattamentoIntegrativo", "addizionaleRegionale", "addizionaleComunale",
    ]) {
      assert.ok(c[chiave], `anno ${anno}: manca la sezione ${chiave}`);
    }
    assert.equal(c.irpef.scaglioni.at(-1).fino, Infinity, `anno ${anno}: ultimo scaglione IRPEF non aperto`);
    assert.equal(c.addizionaleRegionale.scaglioni.at(-1).fino, Infinity, `anno ${anno}: ultimo scaglione regionale non aperto`);
  }
});

// --- Stampa la tabella di validazione, per confronto con calcolatori ufficiali.
test("tabella di validazione (output informativo)", () => {
  const righe = RAL_CAMPIONE.map((ral) => {
    const r = calcola(ral);
    return [
      String(ral).padStart(7),
      r.contributi.totale.toFixed(0).padStart(8),
      r.imponibileFiscale.toFixed(0).padStart(10),
      r.irpefLorda.totale.toFixed(0).padStart(9),
      r.irpefNetta.toFixed(0).padStart(9),
      r.addizionali.totale.toFixed(0).padStart(8),
      r.bonusNetti.toFixed(0).padStart(7),
      r.nettoAnnuo.toFixed(0).padStart(10),
      r.nettoMensile.toFixed(0).padStart(9),
      (r.aliquotaMediaEffettiva * 100).toFixed(1).padStart(7) + "%",
    ].join(" ");
  });
  console.log("\n    RAL  contrib  imponibile  irpefLrd  irpefNet  addiz.   bonus  nettoAnno  netto/13  aliq.med");
  righe.forEach((r) => console.log("  " + r));
  console.log();
  assert.ok(righe.length === 4);
});
