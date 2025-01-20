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
    data_nascita: string;
    risposte: string[];
}
