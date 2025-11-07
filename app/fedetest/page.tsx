"use client";

import React, { useState, useRef, useEffect } from "react";

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

  // Funzione per aggiornare il valore di una cella
  const updateCell = (r: number, c: number, value: string) => {
    const column = columns[c];
    
    // Validazione Anno di corso
    if (column.title === "Anno di corso" && !isValidYear(value)) {
      if (value) setErrorMessage("Inserire 1 o 2");
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
      if (col === 7) return;  // ultima colonna "Punti" 
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
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { // Gestisce tasti in input
    const { row, col } = editing!; // Prende riga e colonna in editing
    // Se premo Delete mentre sono in editing, svuota il valore della cella mantenendo l'editing
    if (e.key === "Delete") {
      e.preventDefault();
      updateCell(row, col, "");
      // mantieni l'editing attivo sull'input (non chiudere)
      return;
    }
    if (e.key === "Enter") { // Invio
      setEditing(null); // Chiude editing
      setTimeout(() => containerRef.current?.focus(), 0); // Rimette focus sul contenitore
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
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100vw",
        background: "#f3f4f6",
        fontFamily: "sans-serif",
        outline: "none",
      }}
    >
      {showError && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#f44336',
          color: 'white',
          padding: '15px 30px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          zIndex: 1000,
        }}>
          {errorMessage}
        </div>
      )}
      <table
        style={{
          borderCollapse: "collapse",
          background: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  border: "1px solid #ccc",
                  borderBottomWidth: "3px",
                  width: col.width,
                  height: "70px",
                  background: "#d3e1f1",
                  textAlign: "center",
                  fontWeight: 600,
                  color: "#444",
                }}
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
              {rowData.map((value, c) => (
                <td
                  key={c}
                  onClick={() => handleCellClick(r, c)}
                  style={{
                    border: "1px solid #ccc",
                    width: "columns[c].width",
                    height: "38px",
                    textAlign: "center",
                    position: "relative",
                    cursor: "pointer",
                    background:
                      editing?.row === r && editing?.col === c
                        ? "#f7f9fa"
                        : "#fff",
                    color: "#222",
                    ...(selected.row === r && selected.col === c
                      ? {
                          outline: "2px solid #0078ff",
                          outlineOffset: "-2px",
                          boxShadow: "0 0 4px rgba(0,120,255,0.3)",
                        }
                      : {}),
                    transition: "background 0.15s ease",
                  }}
                >
                  {/* Verifica se la cella corrente (r,c) è quella in fase di modifica */}
                  {/* Se è la colonna "Punti", mostra solo il conteggio */}
                  {c === 7 ? (  // aggiornato indice colonna punti
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        lineHeight: "32px",
                        fontSize: "14px",
                        userSelect: "none",
                        fontWeight: "bold",
                        color: "#333",
                      }}
                    >
                      {punti === 0? "" : punti*5}
                    </div>
            ) : editing?.row === r && editing?.col === c ? (
                    // Se la cella è in modifica, mostra un input per l'editing
                    <input
                      // Riferimento all'elemento input per gestire il focus
                      ref={inputRef}
                      // Il valore dell'input è sincronizzato con il dato della cella
                      value={value}
                      // Aggiorna il valore della cella quando l'input cambia
                      onChange={(e) => updateCell(r, c, e.target.value)}
                      // Gestisce i tasti speciali durante l'editing
                      onKeyDown={handleInputKeyDown}
                      // Stili dell'input per farlo apparire come una cella
                      style={{
                        width: "100%",          // Occupa tutta la larghezza
                        height: "100%",         // Occupa tutta l'altezza
                        border: "none",         // Rimuove il bordo dell'input
                        outline: "none",        // Rimuove l'outline di focus
                        textAlign: "center",    // Centra il testo
                        fontSize: "14px",       // Dimensione del testo
                        boxSizing: "border-box", // Include padding nel calcolo dimensioni
                        background: "#f7f9fa",  // Sfondo leggermente diverso
                        color: "#222",          // Colore del testo
                      }}
                    />
                  ) : (
                    // Se la cella non è in modifica, mostra un div con il valore
                    <div
                      style={{
                        width: "100%",          // Occupa tutta la larghezza
                        height: "100%",         // Occupa tutta l'altezza
                        lineHeight: "32px",     // Allinea verticalmente il testo
                        fontSize: "14px",       // Dimensione del testo
                        userSelect: "none",     // Impedisce la selezione del testo
                        color: "#222",          // Colore del testo
                      }}
                    >
                      {/* Mostra il valore della cella */}
                      {value}
                    </div>
                  )}
                </td>
              ))}
            </tr>)
          })}
        </tbody>
      </table>
    </div>
  );
}
