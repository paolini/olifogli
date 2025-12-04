import { Dispatch, SetStateAction, useState } from "react";
import Schema from "../lib/schema/Schema";

export type CheckboxesState = {
    showAdditionalColumns: boolean,
    showHiddenColumns: boolean,
}

export function useCheckboxesState(): [CheckboxesState, Dispatch<SetStateAction<CheckboxesState>>] {
    const [state, setState] = useState<CheckboxesState>({
        showAdditionalColumns: false,
        showHiddenColumns: false,
    });
    return [state, setState];
}   

export default function Checkboxes({schema, state, setState}: {schema: Schema, state: CheckboxesState, setState: Dispatch<SetStateAction<CheckboxesState>>}) {
  return <>
    Mostra: {}
      <label className="ml-4">
        <input type="checkbox" checked={state.showAdditionalColumns} onChange={e => setState(prev => ({ ...prev, showAdditionalColumns: e.target.checked }))} />
        {} colonne informative
      </label>
      <label className="ml-4">
        <input type="checkbox" checked={state.showHiddenColumns} onChange={e => setState(prev => ({ ...prev, showHiddenColumns: e.target.checked }))} />
        {} colonne nascoste
      </label>
  </>
}

