/**
 * Caratteri considerati per il calcolo delle probabilità.
 */
export const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '\@_-.,;:!?\"()[]{}<>/\\|`~#%^&*=+";

/**
 * Calcola la probabilità che ogni carattere di LETTERS compaia almeno una volta in una stringa dell'elenco.
 * @param strings Array di stringhe
 * @returns Array di probabilità, stesso ordine di LETTERS
 */
export function letterProbabilities(strings: string[]): number[] {
  const n = strings.length;
  const counts = Array(LETTERS.length).fill(0);
  for (const str of strings) {
    const seen = new Set<string>();
    for (const char of str) {
      if (LETTERS.includes(char)) seen.add(char);
    }
    for (const char of seen) {
      const idx = LETTERS.indexOf(char);
      if (idx !== -1) counts[idx]++;
    }
  }
  return counts.map(count => Math.max(1,count) / n)
}

export function lengthProbabilities(strings: string[]): number[] {
  const n = strings.length;
  const counts = Array(30).fill(0); // Limitiamo a lunghezze fino a 99
  for (const str of strings) {
    const len = Math.min(str.length, counts.length-1); // Limitiamo a 99 per evitare overflow
    counts[len]++;
  }
  return counts.map(count => Math.max(1,count) / n);
}

export function mu_and_sigma(numbers: number[]): [number, number] {
    if (numbers.length === 0) return [0, 0];
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const variance = numbers.reduce((sum, num) => sum + (num-mean) * (num-mean), 0) / numbers.length;
    return [mean, Math.sqrt(variance)]
}

export class Bayes {
    private letterProbabilities: number[]
    private lengthProbabilities: number[]
    private mu: number
    private sigma: number
    
    constructor(data: string[]) {
        this.letterProbabilities = letterProbabilities(data)
        this.lengthProbabilities = lengthProbabilities(data)
        const mu_sigma = mu_and_sigma(data.map(str => this.score(str)))
        this.mu = mu_sigma[0]
        this.sigma = mu_sigma[1]
    }
    
    public score(input: string): number {
        const log = Math.log
        const len = Math.max(1,input.length)
        const letterScore = this.letterProbabilities.reduce((acc, prob, idx) => {
            return acc + log((LETTERS.includes(input[idx]) ? prob : 1 - prob))
        }, 0) / len
        
        const lengthScore = log(this.lengthProbabilities[Math.min(input.length, this.lengthProbabilities.length - 1)]);
        
        return letterScore + lengthScore;
    }

    public probability(input: string): number {
        const score = this.score(input)
        const z = Math.abs((score - this.mu) / this.sigma)
        return 1-erf(z/Math.sqrt(2)) // Normalizzazione per evitare divisione per zero
    }   
}

function erf(x: number): number {
  // Approximation of the error function (Abramowitz and Stegun formula 7.1.26)
  // with maximal error ~1.5×10⁻⁷
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign*y;
}

export function transpose(rows: string[][]): string[][] {
  if (rows.length === 0) return [];
  const cols = rows[0].length;
  const transposed: string[][] = Array.from({ length: cols }, () => [])
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      transposed[i].push(row[i] || '')
    }
  } 
  return transposed
}
