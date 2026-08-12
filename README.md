# Calcolatore RAL → Netto

Prototipo di simulazione della retribuzione netta annuale e mensile di un dipendente
italiano a partire dalla RAL, con esplicitazione di tutte le voci trattenute.

**Demo: <https://userman12.github.io/calcolatore-ral-netto/>**

## Come si esegue

```bash
open index.html          # nessun build step, nessun backend
node --test "test/*.test.mjs"   # 46 test: motore di calcolo e input
```

Il prototipo è un singolo file HTML. React, Tailwind e Babel sono caricati da CDN con
versioni pinnate: serve connessione al primo caricamento, nient'altro.

## Caso modellato

Impiegato a tempo indeterminato, full time, residente a Milano (Lombardia), rapporto
attivo per l'intero anno, nessun carico familiare, nessuna agevolazione. Anno d'imposta
2026.

## Architettura

Il file è diviso in tre sezioni con confini netti:

| Sezione | Contenuto | Vincolo |
|---|---|---|
| **(A) `TAX_CONFIG`** | Scaglioni, aliquote, soglie, formule delle detrazioni, per anno | Solo dati. Ogni costante porta il riferimento normativo o la fonte |
| **(B) motore** | Funzioni pure di calcolo | Nessun side effect, nessun accesso al DOM, nessuna dipendenza dalla UI |
| **(C) UI** | Componenti React | Legge esclusivamente l'output del motore, non ricalcola nulla |

La separazione non è solo dichiarata: `test/engine.test.mjs` estrae da `index.html` le
sole sezioni (A) e (B) e le esegue in Node. Se il motore acquisisse una dipendenza dal
DOM o dalla UI, la suite smetterebbe di caricarsi.

Il motore è esposto anche su `window.JetHR` per l'ispezione da console del browser.

`TAX_CONFIG` è indicizzata per anno d'imposta e ne contiene uno solo, il 2026: aggiungere
un anno è una modifica di sola configurazione, senza toccare motore né UI.

`calcolaNetto()` non restituisce un numero ma un oggetto di breakdown con ogni voce
intermedia, e un array `steps` in cui ciascuna voce porta con sé importo, base di
calcolo, formula applicata e riferimento normativo. La UI si limita a renderizzarlo.

## Catena di calcolo

```
Costo azienda        = RAL + contributi c/azienda (INPS + INAIL) + accantonamento TFR
  − contributi c/azienda                            INPS c/datore + premio INAIL
  − accantonamento TFR                              RAL / 13,5 − 0,50% al Fondo di garanzia
= RAL
  − contributi c/dipendente                          9,19% + 1% oltre la prima fascia, entro il massimale
= Imponibile fiscale
  − IRPEF lorda                                      per scaglioni 23% / 33% / 43%
  + detrazione lavoro dipendente                     art. 13 TUIR, decrescente, + 65 € fra 25k e 35k
  + ulteriore detrazione                             1.000 € fra 20k e 32k, décalage fino a 40k
= IRPEF netta                                        mai negativa: le detrazioni non generano credito
  − addizionale regionale Lombardia                  per scaglioni 1,23% → 1,73%
  − addizionale comunale Milano                      0,80%, esente fino a 23.000 (cliff)
  + trattamento integrativo                          fino a 1.200 €, con test di capienza
  + somma integrativa                                7,1% / 5,3% / 4,8% fino a 20.000 € di reddito complessivo
= Netto annuo                                        ÷ 12, 13 o 14 mensilità
```

## Funzionalità

- **Modalità diretta**: RAL → netto annuo e mensile, trattenute, aliquota media effettiva.
- **Modalità inversa**: netto mensile desiderato → RAL e costo azienda, per ricerca
  binaria sulla funzione diretta (tolleranza 1 centesimo di RAL, ~40 iterazioni).
- **Waterfall interattivo** dal costo azienda al netto: ogni voce è cliccabile e mostra
  importo, base di calcolo, formula applicata e riferimento normativo. Il costo azienda
  si può nascondere per restare sul solo perimetro della busta paga.
- **Curva dell'aliquota marginale effettiva** da 0 a 100.000 € di RAL, con evidenziazione
  della zona sopra il 100%.
- **Rilevamento automatico dei cliff**: il motore scandisce la funzione diretta a passi
  di 50 € e individua i punti in cui aumentare la RAL *riduce* il netto. Le soglie non
  sono hardcoded nel grafico: sono derivate dalla config e convertite in RAL.
- **Campi con incremento e decremento** (passo 500 € sulla RAL, 50 € sul netto mensile),
  agganciati al multiplo del passo come le frecce di un input numerico, da mouse o da
  tastiera con ↑ e ↓.
- **Pannello delle assunzioni** sempre visibile sotto il risultato.

### Cliff rilevati nel modello 2026

| RAL | Imponibile | Causa | Perdita di netto |
|---|---|---|---|
| ~9.400 € | 8.500 € | somma integrativa 7,1% → 5,3% | −218 € |
| ~16.550 € | 15.000 € | somma integrativa 5,3% → 4,8% | −96 € |
| ~25.350 € | 23.000 € | soglia addizionale comunale Milano (cliff, non franchigia) | −154 € |
| ~38.550 € | 35.000 € | fine maggiorazione 65 € art. 13 c. 1-bis | −45 € |

## Tabella di validazione

2026, 13 mensilità, Milano. Da confrontare con un calcolatore di riferimento.

| RAL | Contributi | Imponibile | IRPEF lorda | IRPEF netta | Addizionali | Bonus | Netto anno | Netto/mese | Aliq. media |
|---|---|---|---|---|---|---|---|---|---|
| 20.000 | 1.838 | 18.162 | 4.177 | 1.367 | 234 | 872 | 17.433 | 1.341 | 12,8% |
| 35.000 | 3.217 | 31.784 | 7.689 | 5.042 | 709 | 0 | 26.032 | 2.002 | 25,6% |
| 55.000 | 5.055 | 49.946 | 13.682 | 13.677 | 1.167 | 0 | 35.101 | 2.700 | 36,2% |
| 80.000 | 7.590 | 72.410 | 23.336 | 23.336 | 1.735 | 0 | 47.339 | 3.641 | 40,8% |

Scostamenti di poche decine di euro rispetto a un calcolatore ufficiale sono attesi
(arrotondamenti mensili, base del test di capienza, aliquota datoriale). Scostamenti
maggiori indicano un errore di modello.

## Perimetro

La traccia chiede il netto e le voci trattenute al lordo. Il modello aggiunge, sopra la
RAL, il costo del lavoro a carico dell'azienda: per chi vende payroll alle PMI è la
prospettiva di chi compra, e mostrare che 26.032 € netti costano 47.701 € all'azienda
dice del cuneo fiscale più di qualsiasi percentuale.

È però la parte più fragile del modello, e va letta sapendolo: l'aliquota datoriale
cambia di diversi punti fra industria, commercio e artigianato, e il tasso INAIL dipende
dalla voce di tariffa della singola PAT. Nessuno dei due si può sapere senza conoscere
l'azienda. Sono parametri di configurazione dichiarati, non risultati: nel waterfall la
voce è marcata con ⚠ e nell'elenco DA VERIFICARE qui sotto. Il toggle "Mostra costo
azienda" permette di tornare al solo perimetro della busta paga.

## Assunzioni

- Rapporto attivo per l'intero anno (365 giorni): le detrazioni non sono ragguagliate.
- Unica fonte di reddito, quindi reddito complessivo = reddito di lavoro dipendente.
- La RAL non comprende il TFR, che è accantonato e non erogato in busta paga.
- Le mensilità aggiuntive sono già incluse nella RAL: cambiare il numero di mensilità
  ridistribuisce lo stesso netto annuo, non lo aumenta.
- Nessun arrotondamento all'unità di euro per periodo di paga: il calcolo è annuale in
  doppia precisione.
- Addizionali imputate per competenza, non per cassa.
- Importi in euro interi: la RAL si comunica in euro pieni, i centesimi non cambierebbero
  nulla di leggibile nel risultato.

## Cosa il modello NON copre

Detrazioni per carichi di famiglia · Assegno Unico Universale · fringe benefit · welfare
aziendale · premi di risultato a tassazione sostitutiva · detassazione di straordinari,
notturni e festivi · specificità di CCNL (mensilità, fondi Est/Metasalute/Previndai) ·
previdenza complementare · addizionali per cassa e acconto comunale · conguaglio di fine
anno e arrotondamenti mensili · regimi agevolati (impatriati, ricercatori, under 30) ·
esclusione del massimale contributivo per chi ha anzianità ante 1996 · eventi che
alterano i giorni retribuiti (CIG, malattia, maternità, congedi) · neutralizzazione del
taglio IRPEF oltre 200.000 € di reddito complessivo · rivalutazione annua del TFR già
accantonato.

Questo elenco vive nel README e non nel prototipo: le assunzioni del modello sono sotto
gli occhi di chi usa il calcolatore, la casistica di ciò che resta fuori serve a chi
valuta il codice.

## DA VERIFICARE

Valori che non ho potuto confermare su fonte primaria. Sono ipotesi dichiarate, non
numeri accertati.

| Valore | Ipotesi adottata | Dove controllare |
|---|---|---|
| Aliquota contributiva c/azienda **28,98%** | Terziario/commercio < 50 dipendenti | Tabelle contributive INPS per CCNL e classificazione aziendale effettiva: varia di diversi punti fra industria, commercio e artigianato |
| Premio INAIL **0,40%** | Tasso medio ipotizzato per impiegato amministrativo | Voce di tariffa INAIL della PAT aziendale: il tasso reale può essere molto più basso o più alto |
| Maggiorazione **65 €** art. 13 c. 1-bis, fascia 25.000–35.000 | Confermata per il 2026 | Testo vigente dell'art. 13 c. 1-bis TUIR e istruzioni AdE per l'anno d'imposta 2026 |
| Scaglioni addizionale regionale Lombardia **1,23 / 1,58 / 1,72 / 1,73%** | Progressivi per scaglioni, invariati nel 2026 | Portale del federalismo fiscale MEF |
| Addizionale comunale Milano **0,80%**, esenzione **23.000 €** | Esenzione come cliff sull'intero imponibile | Delibera comunale sul Portale del federalismo fiscale: verificare aliquota, soglia e meccanismo (cliff o franchigia) |
| Base del test di capienza del trattamento integrativo | Considerata la sola detrazione da lavoro dipendente | D.L. 3/2020 art. 1 c. 2: la norma richiede la somma di più detrazioni (artt. 12, 13, 15 e rate pluriennali) |
| Cumulabilità di trattamento integrativo, somma integrativa e ulteriore detrazione | Le tre misure sono cumulabili | Circolari AdE sul taglio del cuneo fiscale |
| Base di calcolo della somma integrativa ≤ 20.000 € | Percentuale sul reddito di lavoro dipendente, soglia di accesso sul reddito complessivo | L. 207/2024 art. 1 cc. 4-5 e circolare interpretativa |

Il prototipo mostra sempre, in fondo alla pagina, le assunzioni e l'elenco di ciò che il
modello non copre. L'elenco qui sopra vive invece solo nel README: è documentazione di
metodo per chi legge il codice, non un avviso da mettere sotto gli occhi di chi usa il
calcolatore.

## Fonti

- [IRPEF 2026: aliquote e scaglioni aggiornati alla Legge di Bilancio 2026](https://fiscomania.com/aliquote-irpef/) — L. 199/2025 art. 1 c. 3, seconda aliquota dal 35% al 33%
- [IRPEF: aliquota al 33% per redditi tra 28.000 e 50.000 euro](https://www.quotidianopiu.it/dettaglio/13312445/irpef-aliquota-al-33-percento-per-redditi-tra-28000-e-50000-euro) — limite dei 200.000 € e risparmio massimo di 440 €
- [Detrazioni per redditi da lavoro dipendente: importi e calcolo 2026](https://fiscomania.com/detrazioni-per-redditi-da-lavoro-dipendente/) — formule art. 13 TUIR per fascia
- [Detrazioni lavoro dipendente 2026: importi e calcolo](https://cafinforma.it/detrazioni-lavoro-dipendente-2026/) — maggiorazione 65 € e ulteriore detrazione
- [Contributi INPS 2026: stabiliti minimali e massimali](https://www.ecnews.it/lavoro/news-del-giorno/contributi-inps-2026-stabiliti-minimali-massimali/) — circolare INPS n. 6 del 30/01/2026: prima fascia 56.224 €, massimale 122.295 €
- [Trattamento integrativo 2026: guida completa a requisiti, soglie e calcolo](https://fiscomania.com/trattamento-integrativo-come-funziona/) — test di capienza e cumulabilità
- [Taglio cuneo fiscale: guida, esempi e FAQ 2026](https://www.fiscoetasse.com/new-rassegna-stampa/1178-taglio-cuneo-fiscale-ecco-le-novita-2025.html) — percentuali 7,1/5,3/4,8% e décalage 32.000–40.000
- [Addizionale IRPEF 2026 Lombardia](https://www.tuttocalcolo.it/addizionale-irpef/lombardia) e [addizionale comunale Milano](https://www.tuttocalcolo.it/addizionale-irpef/lombardia/milano)
- [Portale del federalismo fiscale MEF — addizionale regionale Lombardia](https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/addregirpef/addregirpef.php?reg=10) — fonte primaria da consultare per la verifica

Fonti secondarie di divulgazione fiscale, non atti normativi. Prima di qualunque uso
reale i valori vanno riscontrati sui testi di legge, sulle circolari INPS/AdE e sulle
delibere degli enti locali.

---

Prototipo a scopo dimostrativo. Non costituisce consulenza fiscale o del lavoro.
