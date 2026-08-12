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
| ~38.550 € | 35.000 € | fine maggiorazione 65 € art. 13 c. 1.1 | −45 € |

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

## Verifica delle fonti

Ogni costante è stata riscontrata su fonte primaria dove esiste ed è accessibile.

| Dato | Esito | Fonte |
|---|---|---|
| IRPEF 2026: 23% / 33% / 43% | confermato | L. 199/2025 art. 1 c. 3 (Legge di Bilancio 2026) |
| Detrazione art. 13 c. 1 TUIR: 1.955 · 1.910 + 1.190×(28.000−R)/13.000 · 1.910×(50.000−R)/22.000 | confermato, testo vigente | art. 13 c. 1 TUIR |
| Maggiorazione 65 € fra 25.000 e 35.000 € | confermato, **citazione corretta** | art. 13 **c. 1.1** TUIR |
| INPS: prima fascia 56.224 €, massimale 122.295 € | confermato | Circolare INPS n. 6 del 30/01/2026 |
| Addizionale regionale Lombardia 1,23 / 1,58 / 1,72 / 1,73% per scaglioni | confermato su fonte primaria | art. 72 c. 1 L.R. Lombardia 10/2003, Portale del federalismo fiscale MEF, dato al 28/01/2026 |
| Somma integrativa 7,1 / 5,3 / 4,8%, soglia sul reddito complessivo | confermato | L. 207/2024 art. 1 cc. 4-5; circolare AdE n. 4/E del 16/05/2025 |
| Ulteriore detrazione 1.000 € con décalage 32.000–40.000 € | confermato | L. 207/2024 art. 1 c. 6 |
| Riduzione di 75 € nel test di capienza del trattamento integrativo | confermato, e si applica solo alla detrazione della fascia fino a 15.000 € — che è dove il motore la applica | D.L. 3/2020 art. 1; circolare AdE n. 4/E del 16/05/2025 |
| Cumulabilità di trattamento integrativo, somma integrativa e ulteriore detrazione | confermata | circolare AdE n. 4/E del 16/05/2025 |

**Un errore trovato e corretto:** la maggiorazione di 65 € era citata come art. 13
**c. 1-bis**. Il comma 1-bis è stato abrogato dall'art. 3 c. 1 del D.L. 3/2020: la norma
vigente è il **comma 1.1**. Il calcolo era giusto, sbagliata era la citazione.

## Riscontro dei calcoli

Confronto con calcolatori indipendenti, anno 2026.

| RAL | Motore | Riferimento esterno | Esito |
|---|---|---|---|
| 20.000 | contributi 1.838 · imponibile 18.162 · IRPEF netta 1.367 · somma integrativa 872 | 1.838 · 18.162 · 1.366 · 872 | coincide |
| 35.000 | contributi 3.217 · imponibile 31.784 · IRPEF lorda 7.689 · detrazione 1.647 · add. 455 e 254 · netto 26.032 | 3.217 · 31.784 · 7.689 · 1.647 · 455 e 254 · 26.032 | coincide riga per riga |
| 55.000 | netto al lordo delle addizionali 36.268 | 36.268 | coincide |
| 80.000 | netto al lordo delle addizionali 49.074 | 49.209 | differenza spiegata |

La differenza sugli 80.000 € è dovuta al **contributo aggiuntivo dell'1%** sulla quota
eccedente la prima fascia pensionabile: la fonte di confronto ferma i contributi a
80.000 × 9,19% = 7.352 €, il motore aggiunge l'1% su 23.776 € e arriva a 7.589,76 €.
Rifacendo il conto senza quell'1% il motore riproduce 49.209 € al centesimo. Il
contributo è dovuto per art. 3-ter L. 438/1992 e la soglia è quella della circolare INPS
n. 6/2026: qui è il riferimento esterno a semplificare, non il motore a sbagliare.

Una seconda fonte su 35.000 € restituisce una detrazione da lavoro dipendente di 1.582 €
contro i 1.647 € del motore: la differenza è esattamente la maggiorazione di 65 €
dell'art. 13 c. 1.1, che quella fonte non applica.

## DA VERIFICARE

Cosa resta aperto dopo la verifica. Sono ipotesi dichiarate, non numeri accertati.

| Valore | Ipotesi adottata | Dove controllare |
|---|---|---|
| Aliquota contributiva c/azienda **28,98%** | Terziario/commercio < 50 dipendenti | Tabelle contributive INPS per CCNL e classificazione aziendale effettiva: varia di diversi punti fra industria, commercio e artigianato |
| Premio INAIL **0,40%** | Tasso medio ipotizzato per impiegato amministrativo | Voce di tariffa INAIL della PAT aziendale: il tasso reale può essere molto più basso o più alto |
| Addizionale comunale Milano **0,80%**, esenzione **23.000 €** | Meccanismo a cliff; in assenza di delibera 2026 vale quella 2025 | Delibera del Comune di Milano sul Portale del federalismo fiscale. La pagina ufficiale del Comune risponde 403: il dato è confermato da due fonti secondarie indipendenti ma non da quella primaria |
| Detrazioni che entrano nel test di capienza del trattamento integrativo, fascia 15.000–28.000 € | Considerata la sola detrazione da lavoro dipendente | D.L. 3/2020 art. 1 c. 2: nella fascia superiore la norma somma più detrazioni (artt. 12, 13, 15 e rate pluriennali). Irrilevante nel caso base senza carichi né oneri |

Il prototipo mostra sempre, in fondo alla pagina, le assunzioni e l'elenco di ciò che il
modello non copre. L'elenco qui sopra vive invece solo nel README: è documentazione di
metodo per chi legge il codice, non un avviso da mettere sotto gli occhi di chi usa il
calcolatore.

## Fonti

**Primarie**

- [Portale del federalismo fiscale MEF — addizionale regionale IRPEF Lombardia](https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/addregirpef/addregirpef.php?reg=10) — scaglioni e aliquote 2026, art. 72 c. 1 L.R. 10/2003
- [Circolare Agenzia delle Entrate n. 4/E del 16 maggio 2025](https://www.agenziaentrate.gov.it/portale/documents/20143/8410823/Circolare+lavoro+dipendente+LB2025+DD+IRPEF+n.+4+del+16+maggio+2025.pdf/36979eaa-9fc5-a4ec-a7aa-136497c53f91) — somma integrativa, ulteriore detrazione, capienza del trattamento integrativo
- [Art. 13 TUIR, testo vigente](https://www.brocardi.it/testo-unico-imposte-redditi/titolo-i/capo-i/art13.html) — detrazione per redditi di lavoro dipendente, comma 1 e comma 1.1

**Secondarie**

- [IRPEF 2026: aliquote e scaglioni aggiornati alla Legge di Bilancio 2026](https://fiscomania.com/aliquote-irpef/) — L. 199/2025 art. 1 c. 3, seconda aliquota dal 35% al 33%
- [IRPEF: aliquota al 33% per redditi tra 28.000 e 50.000 euro](https://www.quotidianopiu.it/dettaglio/13312445/irpef-aliquota-al-33-percento-per-redditi-tra-28000-e-50000-euro) — limite dei 200.000 € e risparmio massimo di 440 €
- [Contributi INPS 2026: stabiliti minimali e massimali](https://www.ecnews.it/lavoro/news-del-giorno/contributi-inps-2026-stabiliti-minimali-massimali/) — circolare INPS n. 6 del 30/01/2026
- [Trattamento integrativo 2026](https://fiscomania.com/trattamento-integrativo-come-funziona/) — requisiti e test di capienza
- [Addizionale comunale IRPEF Milano](https://www.tuttocalcolo.it/addizionale-irpef/lombardia/milano) — aliquota, soglia e meccanismo a cliff

**Usate per il riscontro dei calcoli**

- [RAL 35.000 € netto 2026](https://www.calcolonetto.it/stipendio-netto-35k/) — dettaglio riga per riga, Milano/Lombardia
- [Tabella stipendio lordo netto 2026, RAL da 15K a 100K](https://stipendionettocalcolatore.it/tabella-stipendio-lordo-netto-2026/) — netti al lordo delle addizionali

Le fonti secondarie sono di divulgazione fiscale, non atti normativi. Dove la fonte
primaria è accessibile è quella a fare fede, e in due casi il confronto ha dato ragione
al motore contro il calcolatore di riferimento.

---

Prototipo a scopo dimostrativo. Non costituisce consulenza fiscale o del lavoro.
