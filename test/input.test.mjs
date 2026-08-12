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
  const re = new RegExp(`function ${nome}\\(grezzo\\)[\\s\\S]*?\\n\\}|function ${nome}\\(testo\\)[\\s\\S]*?\\n\\}`);
  const trovata = sorgente.match(re);
  assert.ok(trovata, `funzione ${nome} non trovata in index.html`);
  return new Function(`${trovata[0]}\nreturn ${nome};`)();
}

const normalizza = estrai("normalizzaInputNumerico");
const valore = estrai("valoreNumerico");

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
  assert.equal(normalizza("0"), "0");
  assert.equal(valore("0"), 0);
});

test("i decimali che iniziano per zero non vengono mutilati", () => {
  assert.equal(normalizza("0.5"), "0.5");
  assert.equal(valore("0.5"), 0.5);
  assert.equal(normalizza("0.05"), "0.05");
});

test("valori negativi o non numerici sono letti come 0 senza rompere il campo", () => {
  assert.equal(valore("-100"), 0);
  assert.equal(valore("abc"), 0);
  assert.equal(normalizza("abc"), "abc", "la normalizzazione non riscrive il campo");
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
