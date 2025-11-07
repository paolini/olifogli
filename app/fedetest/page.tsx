"use client";

import React, { useState, useRef, useEffect } from "react";
import "./fedetest.css";

// Definisce il tipo Position per gestire la posizione della cella selezionata
type Position = { row: number; col: number };

export default function App() {
  // Definisce le dimensioni della griglia
  const rows = 10;

  // Configurazione delle colonne
  const columns = [
    { title: "Cognome", width: 180, singleChar: false },
    { title: "Nome", width: 180, singleChar: false },
    { title: "Anno di corso", width: 80, singleChar: true },
    { title: "Sezione", width: 120, singleChar: false },
    { title: "Codice compito", width: 90, isCodiceCompito: true },
    { title: "1", width: 40, singleChar: true },
    { title: "2", width: 40, singleChar: true },
    { title: "3", width: 40, singleChar: true },
    { title: "Punti", width: 90, singleChar: false}
  ];

  const cols = columns.length;

  // Inizializza lo stato della griglia con un array vuoto 5x5
  const [data, setData] = useState(
    Array.from({ length: rows }, () => Array(cols).fill(""))
  );

  // Gestisce la cella attualmente selezionata
  const [selected, setSelected] = useState<Position>({ row: 0, col: 0 });

  // Gestisce lo stato di modifica di una cella
  const [editing, setEditing] = useState<Position | null>(null);

  // Riferimenti per l'input di modifica e il contenitore principale
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stato per gestire la visibilità del popup
  const [showError, setShowError] = useState(false);

  // Stato per il messaggio di errore
  const [errorMessage, setErrorMessage] = useState("Inserire 1 o 2");

  // Effetto per gestire il focus dell'input quando si entra in modalità modifica
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Effetto per impostare il focus iniziale sul contenitore
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Funzione per validare l'anno (solo 1 o 2)
  const isValidYear = (value: string) => {
    if (!value) return true; // permetti valori vuoti
    return value === "1" || value === "2";
  };

  // Funzione per validare le risposte (1,2,3)
  const isValidAnswer = (value: string) => {
    const validAnswers = ['A', 'B', 'C', 'D', 'E', 'X', '-'];
    return value === '' || validAnswers.includes(value.toUpperCase());
  };

  // Funzione per normalizzare le risposte in maiuscolo
  const normalizeAnswer = (value: string) => value.toUpperCase();

  // Funzione per mostrare temporaneamente l'errore
  const showTemporaryError = () => {
    setShowError(true);
    setTimeout(() => setShowError(false), 2000); // Nasconde dopo 2 secondi
  };

  // Funzione per validare il codice compito: solo numeri di esattamente 3 cifre, prima 2, seconda 1-5, terza 1-8
  const isValidCodiceCompito = (value: string) => {
    if (!value) return true;
    // Accetta solo stringhe composte ESATTAMENTE da 3 cifre
    if (!/^\d{3}$/.test(value)) return false;
    if (value.length !== 3) return false;
    if (value[0] !== "2") return false;
    if (value[1] < "1" || value[1] > "5") return false;
    if (value[2] < "1" || value[2] > "8") return false;
    return true;
  };

  // Funzione per aggiornare il valore di una cella
  const updateCell = (r: number, c: number, value: string, validateCodiceCompito = true) => {
    const column = columns[c];

    // Validazione Anno di corso
    if (column.title === "Anno di corso" && !isValidYear(value)) {
      if (value) setErrorMessage("Inserire 1 o 2");
      showTemporaryError();
      return;
    }

    // Validazione Codice compito SOLO se richiesto (invio/tab/freccia)
    if (
      column.title === "Codice compito" &&
      validateCodiceCompito &&
      !isValidCodiceCompito(value)
    ) {
      setErrorMessage("Inserire un codice corretto");
      showTemporaryError();
      return;
    }

    // Validazione risposte 1,2,3
    if (["1", "2", "3"].includes(column.title)) {
      if (!isValidAnswer(value)) {
        if (value) setErrorMessage("Inserisci A, B, C, D, E, X oppure -");
        showTemporaryError();
        return;
      }
      value = normalizeAnswer(value);
    }

    setData((prev) => {
      const copy = prev.map((row) => [...row]);
      copy[r][c] = value;
      return copy;
    });
  };

  // Funzione per spostare la selezione a una nuova posizione
  const moveSelection = (r: number, c: number) => {
    const newRow = Math.max(0, Math.min(r, data.length - 1));
    const newCol = Math.max(0, Math.min(c, cols - 2));
    setSelected({ row: newRow, col: newCol });
  };

  // Gestione degli eventi tastiera quando il focus è sul contenitore
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const { row, col } = selected;
    if (editing) return;

    // Cancella il contenuto della cella selezionata (se non è la colonna "Punti" read-only)
    if (e.key === "Delete") {
      e.preventDefault();
      if (col === cols - 1) return; // ultima colonna "Punti" non modificabile
      updateCell(row, col, "");
      setEditing(null);
      return;
    }

    // Gestione tasti freccia per la navigazione
    if (e.key === "ArrowUp" && row > 0) moveSelection(row - 1, col);
    else if (e.key === "ArrowDown" && row < data.length - 1)
      moveSelection(row + 1, col);
    else if (e.key === "ArrowLeft" && col > 0) moveSelection(row, col - 1);
    else if (e.key === "ArrowRight" && col < cols - 2)
      moveSelection(row, col + 1);
    // Gestione del tasto Tab
    else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
          if (col > 0) {
            moveSelection(row, col - 1);
          } else {
            moveSelection(row - 1, cols - 1);
          }
      }
      else {
        if (col < cols - 2) {
          moveSelection(row, col + 1);
        } else {
          moveSelection(row+1, 0);
        }
      }   
    }
    // Attiva modalità modifica con Enter o F2
    else if (e.key === "Enter" || e.key === "F2") 
        setEditing(selected);
    // Gestione input diretto di caratteri
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (col === cols - 1) return;  // ultima colonna "Punti"
      const colConfig = columns[col];
      if (colConfig.singleChar) {
        const isAnnoField = colConfig.title === "Anno di corso";
        const isValidInput = !isAnnoField || isValidYear(e.key);

        // Se è una delle colonne 1,2,3 e il carattere non è valido, mostra errore e NON spostare il focus e NON entrare in input
        if (["1", "2", "3"].includes(colConfig.title) && !isValidAnswer(e.key)) {
          setErrorMessage("Inserisci A, B, C, D, E, X oppure -");
          showTemporaryError();
          // NON chiamare updateCell, NON cambiare editing
          return;
        }

        updateCell(row, col, e.key);
        setEditing(null);
        if (!isAnnoField || isValidInput) {
          moveSelection(row, Math.min(col + 1, cols - 1));
        }
      } else {
        // Per prima e ultima colonna: entra in modalità modifica
        setEditing(selected);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.value = e.key;
            updateCell(row, col, e.key);
          }
        }, 0);
      }
    }
  };

  // Gestione degli eventi tastiera durante la modifica di una cella
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { row, col } = editing!;
    const column = columns[col];
    // Se premo Delete mentre sono in editing, svuota il valore della cella mantenendo l'editing
    if (e.key === "Delete") {
      e.preventDefault();
      updateCell(row, col, "");
      return;
    }
    // Validazione codice compito SOLO su invio/tab/freccia
    if (
      column.title === "Codice compito" &&
      (e.key === "Enter" || e.key === "Tab" || e.key.startsWith("Arrow"))
    ) {
      if (
        !isValidCodiceCompito(data[row][col])
      ) {
        setErrorMessage("Inserire un codice corretto");
        showTemporaryError();
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Enter") {
      setEditing(null);
      setTimeout(() => containerRef.current?.focus(), 0);
    } else if (e.key === "ArrowUp" && row > 0) {
      setEditing(null);
      moveSelection(row - 1, col);
      setTimeout(() => containerRef.current?.focus(), 0);
    } else if (e.key === "ArrowDown" && row < data.length - 1) {
      setEditing(null);
      moveSelection(row + 1, col);
      setTimeout(() => containerRef.current?.focus(), 0);
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      const cursorAtEnd =
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length;
      if (cursorAtEnd && col < cols - 2) {
        setEditing(null);
        moveSelection(row, col + 1);
        setTimeout(() => containerRef.current?.focus(), 0);
      }
    } else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      const cursorAtStart =
        input.selectionStart === 0 && input.selectionEnd === 0;
      if (cursorAtStart && col > 0) {
        setEditing(null);
        moveSelection(row, col - 1);
        setTimeout(() => containerRef.current?.focus(), 0);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      setEditing(null);
      if (e.shiftKey)
        moveSelection(row, col > 0 ? col - 1 : cols - 1);
      else moveSelection(row, col < cols - 1 ? col + 1 : 0);
      setTimeout(() => containerRef.current?.focus(), 0);
    } else if (e.key === "Escape") {
      setEditing(null);
      setTimeout(() => containerRef.current?.focus(), 0);
    }
  };

  // Gestione del click su una cella
  const handleCellClick = (r: number, c: number) => {
    setSelected({ row: r, col: c });
    setEditing(null);
    containerRef.current?.focus();
  };

  // Rendering del componente
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fedetest-root"
    >
      {showError && (
        <div className="fedetest-error-popup">
          {errorMessage}
        </div>
      )}
      <div className="fedetest-table-container">
        <table className="fedetest-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="fedetest-th"
                  style={{ width: col.width }}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 
              data.map() itera su ogni riga dell'array data
              - rowData: rappresenta l'array contenente i dati di una singola riga
              - r: è l'indice della riga corrente (0,1,2,3,4)
            */}
            {data.map((rowData, r) => {
              const punti = ["1", "2", "3"].reduce((acc, colName) => {
                const colIndex = columns.findIndex(c => c.title === colName);
                return acc + (rowData[colIndex] ? 1 : 0);
              }, 0);
                
              return (
                <tr key={r}>
                {columns.map((col, c) => (
                  <td
                    key={c}
                    onClick={() => handleCellClick(r, c)}
                    className={
                      "fedetest-td" +
                      (editing?.row === r && editing?.col === c ? " fedetest-td-editing" : "") +
                      (selected.row === r && selected.col === c ? " fedetest-td-selected" : "")
                    }
                    style={{ width: columns[c].width }}
                  >
                    {/* Se è la colonna "Punti", mostra solo il conteggio */}
                    {c === columns.length - 1 ? (
                      <div className="fedetest-punti-cell">
                        {punti === 0 ? "" : punti * 5}
                      </div>
                    ) : editing?.row === r && editing?.col === c ? (
                      <input
                        ref={inputRef}
                        value={data[r][c]}
                        onChange={(e) => updateCell(r, c, e.target.value, false)}
                        onKeyDown={handleInputKeyDown}
                        onBlur={() => {
                          if (columns[c].title === "Codice compito" && data[r][c]) {
                            if (!isValidCodiceCompito(data[r][c])) {
                              setErrorMessage("Inserire un codice corretto");
                              showTemporaryError();
                            }
                          }
                          setEditing(null);
                        }}
                        className="fedetest-input"
                      />
                    ) : (
                      <div className="fedetest-cell-value">
                        {data[r][c]}
                      </div>
                    )}
                  </td>
                ))}
                </tr>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
