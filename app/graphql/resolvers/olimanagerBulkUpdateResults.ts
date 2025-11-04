"""
Script per aggiornare in batch i risultati dei partecipanti a un contest.

Il file CSV deve avere le colonne:
- participant_id: ID del partecipante
- problem_index: Indice del problema (0, 1, 2, ...)
- score: Punteggio (può essere vuoto per null)
- disqualified: 0 o 1 (opzionale, default 0)

Esempio CSV:
```
participant_id,problem_index,score,disqualified
1,0,10,0
1,1,15,0
2,0,8,0
2,1,,0
```

Esempio JSONL:
```
{"participant_id": 1, "problem_index": 0, "score": 10, "disqualified": false}
{"participant_id": 1, "problem_index": 1, "score": 15, "disqualified": false}
{"participant_id": 2, "problem_index": 0, "score": 8, "disqualified": false}
{"participant_id": 2, "problem_index": 1, "score": null, "disqualified": false}
```

Usage:
    # Da CSV
    python bulk_update_results.py --contest-id 1 --input results.csv
    
    # Da JSONL
    python bulk_update_results.py --contest-id 1 --input results.jsonl --input-format jsonl
    
    # Segna tutti come disqualified
    python bulk_update_results.py --contest-id 1 --input results.csv --disqualified
"""

import argparse
import csv
import sys
import json
from typing import List, Dict, Any
from api import Api


def bulk_update_results(
    contest_id: int,
    input_file: str,
    input_format: str = "csv",
    force_disqualified: bool = False
) -> Dict[str, Any]:
    """
    Aggiorna in batch i risultati dei partecipanti.
    
    Args:
        contest_id: ID del contest
        input_file: Path del file di input (CSV o JSONL)
        input_format: Formato del file di input (csv o jsonl)
        force_disqualified: Se True, imposta tutti come disqualified=True
    
    Returns:
        dict: Risposta della mutation
    """
    api = Api()
    
    # Login
    print("Login in corso...", file=sys.stderr)
    api.login()
    
    # Lettura input
    problem_results = []
    
    if input_format == "csv":
        with open(input_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                disqualified = force_disqualified if force_disqualified else (row.get("disqualified", "0") == "1")
                problem_results.append({
                    "participantId": int(row["participant_id"]),
                    "problemIndex": int(row["problem_index"]),
                    "score": int(row["score"]) if row.get("score") and row["score"].strip() else None,
                    "disqualified": disqualified
                })
    elif input_format == "jsonl":
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    disqualified = force_disqualified if force_disqualified else data.get("disqualified", False)
                    problem_results.append({
                        "participantId": int(data["participant_id"]),
                        "problemIndex": int(data["problem_index"]),
                        "score": int(data["score"]) if data.get("score") is not None else None,
                        "disqualified": disqualified
                    })
    else:
        print(f"Formato input non supportato: {input_format}", file=sys.stderr)
        sys.exit(1)
    
    total = len(problem_results)
    print(f"Trovati {total} risultati da aggiornare", file=sys.stderr)
    
    # Costruisci la mutation
    mutation = """
    mutation BulkUpdateResults($contestId: Int!, $problemResults: [ParticipantProblemResultInput!]!) {
        participants {
            bulkUpdateResults(contestId: $contestId, problemResults: $problemResults) {
                __typename
                ... on BulkUpdateResultsSuccess {
                    nothing
                }
                ... on OperationInfo {
                    messages {
                        message
                        kind
                    }
                }
            }
        }
    }
    """
    
    variables = {
        "contestId": contest_id,
        "problemResults": problem_results
    }
    
    print("Esecuzione mutation bulk_update_results...", file=sys.stderr)
    result = api.query(mutation, variables)
    
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Aggiorna in batch i risultati dei partecipanti a un contest"
    )
    
    parser.add_argument(
        "--contest-id",
        type=int,
        required=True,
        help="ID del contest"
    )
    
    parser.add_argument(
        "--input",
        required=True,
        help="Path del file di input (CSV o JSONL)"
    )
    
    parser.add_argument(
        "--input-format",
        choices=["csv", "jsonl"],
        default="csv",
        help="Formato del file di input (csv o jsonl)"
    )
    
    parser.add_argument(
        "--disqualified",
        action="store_true",
        help="Imposta tutti i risultati come disqualified=True (ignora la colonna disqualified del file)"
    )
    
    args = parser.parse_args()
    
    try:
        result = bulk_update_results(
            contest_id=args.contest_id,
            input_file=args.input,
            input_format=args.input_format,
            force_disqualified=args.disqualified
        )
        
        # Analizza il risultato
        data = result.get("data", {}).get("participants", {}).get("bulkUpdateResults", {})
        typename = data.get("__typename")
        
        if typename == "BulkUpdateResultsSuccess":
            print("\n✅ Aggiornamento completato con successo!", file=sys.stderr)
            
            # Output JSON completo
            print(json.dumps(result, indent=2))
            
        elif typename == "OperationInfo":
            messages = data.get("messages", [])
            print("\n❌ Operazione fallita:", file=sys.stderr)
            for msg in messages:
                kind = msg.get("kind", "ERROR")
                message = msg.get("message", "")
                print(f"  [{kind}] {message}", file=sys.stderr)
            
            print(json.dumps(result, indent=2))
            sys.exit(1)
        else:
            print(f"\n⚠️  Risposta inattesa: {typename}", file=sys.stderr)
            print(json.dumps(result, indent=2))
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ Errore: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
