export interface RispostaBase {
  n: number
  t: string
};

export interface RispostaAScelta extends RispostaBase {
  t: 'choice'
}

export interface RispostaNumerica extends RispostaBase {
  t: 'number'
}

export interface RispostaPunteggio extends RispostaBase {
  t: 'score'
}

export type  TipoRisposta = RispostaAScelta | RispostaNumerica | RispostaPunteggio

export const tipo_risposte: TipoRisposta[] = [
  { n: 1, t: 'choice' },
  { n: 2, t: 'choice' },
  { n: 3, t: 'choice' },
  { n: 4, t: 'choice' },
  { n: 5, t: 'choice' },
  { n: 6, t: 'choice' },
  { n: 7, t: 'choice' },
  { n: 8, t: 'choice' },
  { n: 9, t: 'choice' },
  { n: 10, t: 'choice' },
  { n: 11, t: 'choice' },
  { n: 12, t: 'choice' },
  { n: 13, t: 'number' },
  { n: 14, t: 'number' },
  { n: 15, t: 'score' },
  { n: 16, t: 'score' },
  { n: 17, t: 'score' },
]

export interface Row {
    cognome: string;
    nome: string;
    classe: number;
    sezione: string;
    scuola: string;
    data_nascita: string;
    risposte: string[];
}

export interface RowWithId extends Row {
    _id: string;
}

// per ora non usata, ma per il futuro, quando vorremo mostrare (anche)
// le risposte e/o i punteggi depermutati
//

type PermutazioneRisposta = {[from: string]: string}
type PermutazioneDomanda = {[from: number]: number}

export function depermutaRisposte(risposte: [string], codice: string) {
  const permutazioniDom: {[code:string]:PermutazioneDomanda} = {"GD":{1: 1,2: 2,3: 3,4: 4,5: 5,6: 6,7: 7,8: 8,9: 9,10: 10,11: 11,12: 12}}
  const permutazioniRisp: {[code:string]:PermutazioneRisposta} = {"GD":{"A":"A","B":"B","C":"C","D":"D","E":"E"}}
  return tipo_risposte.map((tipoRisp) => {
    switch (tipoRisp.t) {
      case "choice":
  return permutazioniRisp[codice][risposte[permutazioniDom[codice][tipoRisp.n]-1]]
case "number":
case "score":
  return risposte[tipoRisp.n-1]
    }
  })
}

export function calcolaPunteggi(risposte: string[]): number[] {
  const punteggioRisp = {choice: {giusta: 5, vuotanulla: 1, errata: 0}, number: {giusta: 5, vuotanulla: 1, errata: 0}, score: {giusta: "x", vuotanulla: 0, errata: 0}}
  const risposteNeutre = {choice:["-", "X"], number:["-"], score: []}
  const permutazioniDom: {[code: string]: PermutazioneDomanda} = {"GD":{1: 1,2: 2,3: 3,4: 4,5: 5,6: 6,7: 7,8: 8,9: 9,10: 10,11: 11,12: 12}}
  const permutazioniRisp: {[code: string]: PermutazioneRisposta} = {"GD":{"A":"A","B":"B","C":"C","D":"D","E":"E"}}
  const risposteCorrette = ["C","A","C","C","A","C","A","C","C","A","C","A",1234,1111,"*","*","*"]
  const codice = "GD"
  // const rispostedeperm = depermutaRisposte(risposte, "GD")

  return tipo_risposte.map((tipoRisp) => {
    switch (tipoRisp.t) {
      case "choice": 
case "number":
  if (risposteNeutre[tipoRisp.t].includes(risposte[tipoRisp.n-1])) {
    return punteggioRisp[tipoRisp.t]["vuotanulla"] 
  } else if (risposte[tipoRisp.n-1] == permutazioniRisp[codice][risposteCorrette[permutazioniDom[codice][tipoRisp.n]-1]]) {
    return punteggioRisp[tipoRisp.t]["giusta"]
        } else {
    return punteggioRisp[tipoRisp.t]["errata"]
        }
        break
      case "score": 
  return parseFloat(risposte[tipoRisp.n-1])
    }
  })
}

export function calcolaPunteggio(risposte: string[]) {
  if (risposte.includes("") == false) {
    const punteggi = calcolaPunteggi(risposte)
    const punteggio = punteggi.reduce((a,b) => a + b, 0)
    return punteggio
  } else {
    return "---"
  }
}

// da integrare con un set di condizioni completo
export function nonValida(row: RowWithId) {
  let nonVal = false
  if (row.risposte.includes("")) nonVal = true
  if (row.cognome == "") nonVal = true
  if (row.nome == "") nonVal = true
  return nonVal
}
