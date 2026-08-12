/**
 * Test dell'editing dei campi numerici.
 *
 * Regressione da cui nasce questo file: i campi coercevano il testo a numero a
 * ogni battuta. Cancellando il contenuto la stringa vuota diventava 0, il campo
 * si ripopolava da solo e le cifre digitate dopo finivano in coda allo zero
 * rimasto, rendendo il campo impossibile da svuotare.
 *
 * Qui si estraggono da index.html le due funzioni pure che governano il campo e
 * si simula la sequenza di battute dell'utente.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sorgente = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function estrai(nome) {
  const re = new RegExp(`function ${nome}\\([^)]*\\)[\\s\\S]*?\\n\\}`);
  const trovata = sorgente.match(re);
  assert.ok(trovata, `funzione ${nome} non trovata in index.html`);
  return new Function(`${trovata[0]}\nreturn ${nome};`)();
}

const normalizza = estrai("normalizzaInputNumerico");
const valore = estrai("valoreNumerico");
const su = estrai("passoSu");
const giu = estrai("passoGiu");

/** Simula una sequenza di stati del campo, come li produce il browser. */
function digita(sequenza) {
  return sequenza.map((grezzo) => normalizza(grezzo));
}

// -----------------------------------------------------------------------------

test("il campo si può svuotare completamente", () => {
  assert.equal(normalizza(""), "", "la stringa vuota non deve essere riscritta");
  assert.equal(valore(""), 0, "il motore legge il campo vuoto come 0");
});

test("regressione: digito 0, lo cancello, il campo resta vuoto", () => {
  const stati = digita(["0", ""]);
  assert.deepEqual(stati, ["0", ""]);
  assert.notEqual(stati.at(-1), "0", "lo zero è ricomparso dopo la cancellazione");
});

test("regressione: dopo aver cancellato lo 0 le cifre non si accodano", () => {
  // "0" → cancello → "" → digito "3", "5" → deve risultare 35, non 035.
  const stati = digita(["0", "", "3", "35"]);
  assert.equal(stati.at(-1), "35");
  assert.equal(valore(stati.at(-1)), 35);
});

test("gli zeri iniziali non restano incollati davanti alle cifre", () => {
  assert.equal(normalizza("05"), "5");
  assert.equal(normalizza("0035000"), "35000");
  assert.equal(valore(normalizza("05")), 5);
});

test("lo zero isolato resta digitabile", () => {
  assert.equal(normalizza("0"), "0", "deve restare possibile digitare uno 0");
  assert.equal(valore("0"), 0);
  assert.equal(normalizza("00"), "0", "gli zeri ripetuti collassano in uno");
});

test("solo euro interi: i separatori cadono, niente decimali", () => {
  // La RAL si comunica in euro pieni. Senza decimali punti e virgole sono
  // inequivocabilmente separatori di migliaia, quindi si scartano: sparisce
  // del tutto l'ambiguità di "1.500" (millecinquecento o uno virgola cinque?).
  assert.equal(normalizza("1.500"), "1500");
  assert.equal(normalizza("1,500"), "1500");
  assert.equal(normalizza("35.000"), "35000");
  assert.equal(valore(normalizza("1.500")), 1500, "1.500 vale millecinquecento");
  assert.equal(normalizza("1500,50"), "150050", "i centesimi non sono ammessi");
});

// --- Regressione segnalata: si potevano scrivere lettere nel campo RAL --------

test("regressione: le lettere non entrano nel campo", () => {
  assert.equal(normalizza("abc"), "");
  assert.equal(normalizza("35000abc"), "35000");
  assert.equal(normalizza("35a0b0c0"), "35000");
});

test("regressione: la notazione scientifica è rifiutata", () => {
  assert.equal(normalizza("e"), "", "la e dell'esponente non deve entrare");
  assert.equal(normalizza("1e"), "1");
  assert.equal(normalizza("35E5"), "355", "la E cade, restano le sole cifre");
  assert.ok(!/e/i.test(normalizza("1e5")), "nessuna e sopravvive alla normalizzazione");
});

test("segni e simboli non entrano: il campo accetta solo positivi", () => {
  assert.equal(normalizza("-100"), "100", "il meno cade, non si digita un negativo");
  assert.equal(normalizza("+100"), "100");
  assert.equal(normalizza("€ 35.000"), "35000", "simbolo di valuta, spazio e punto cadono");
  assert.equal(normalizza("35 000"), "35000", "gli spazi cadono");
  assert.ok(valore(normalizza("-100")) > 0, "non esistono valori negativi nel campo");
});

test("il campo contiene sempre e solo cifre", () => {
  const casi = ["35000", "-1", "1e5", "€1.500", "12,50", "abc", "0", "", "1..2", "١٢٣"];
  for (const c of casi) {
    assert.match(normalizza(c), /^\d*$/, `"${c}" lascia caratteri non numerici nel campo`);
  }
});

test("nessuna sequenza di caratteri produce un valore negativo o non finito", () => {
  const casi = ["-1", "-0.5", "e", "1e999", "Infinity", "NaN", "--5", "1-2", "", ".", ",", "abc", "1e-5", "0"];
  for (const c of casi) {
    const v = valore(normalizza(c));
    assert.ok(Number.isFinite(v), `"${c}" produce un valore non finito: ${v}`);
    assert.ok(v >= 0, `"${c}" produce un valore negativo: ${v}`);
  }
});

test("una digitazione normale attraversa stati coerenti", () => {
  const stati = digita(["3", "35", "350", "3500", "35000"]);
  assert.deepEqual(stati, ["3", "35", "350", "3500", "35000"]);
  assert.deepEqual(stati.map(valore), [3, 35, 350, 3500, 35000]);
});

test("cancellazione progressiva fino al campo vuoto", () => {
  const stati = digita(["35000", "3500", "350", "35", "3", ""]);
  assert.equal(stati.at(-1), "", "l'ultimo backspace non deve lasciare residui");
  assert.deepEqual(stati.map(valore), [35000, 3500, 350, 35, 3, 0]);
});

// --- Frecce di incremento e decremento ---------------------------------------

test("le frecce si agganciano al multiplo del passo, come un input numerico", () => {
  // Da un valore già allineato ci si muove di un passo pieno.
  assert.equal(su(35000, 500), 35500);
  assert.equal(giu(35000, 500), 34500);
  // Da un valore disallineato ci si aggancia al multiplo, senza sommare e basta.
  assert.equal(su(35123, 500), 35500, "35.123 + freccia su deve dare 35.500, non 35.623");
  assert.equal(giu(35123, 500), 35000, "35.123 + freccia giù deve dare 35.000, non 34.623");
});

test("il decremento non scende sotto zero", () => {
  assert.equal(giu(0, 500), 0);
  assert.equal(giu(200, 500), 0);
  assert.equal(giu(500, 500), 0);
  for (let v = 0; v <= 3000; v += 137) {
    assert.ok(giu(v, 500) >= 0, `valore negativo partendo da ${v}`);
  }
});

test("su e giù sono inversi sui valori allineati al passo", () => {
  for (let v = 0; v <= 100000; v += 500) {
    assert.equal(giu(su(v, 500), 500), v, `andata e ritorno non torna da ${v}`);
  }
});

test("le frecce producono sempre un valore digitabile nel campo", () => {
  for (const v of [0, 1, 499, 500, 35123, 99999]) {
    for (const n of [su(v, 500), giu(v, 500)]) {
      assert.equal(normalizza(String(n)), String(n), `${n} non sopravvive alla normalizzazione`);
      assert.equal(valore(String(n)), n);
    }
  }
});

test("il passo del netto mensile è più fine di quello della RAL", () => {
  assert.equal(su(2000, 50), 2050);
  assert.equal(giu(2000, 50), 1950);
});
