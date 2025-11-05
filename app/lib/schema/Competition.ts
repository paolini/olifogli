import { Data, Row } from "../models";
import { Field } from "./fields";
import Schema from "./Schema";

export type OlimanagerProblemResult = {
  participantId: number;
  problemIndex: number;
  score: number | null;
  disqualified: boolean;
}

export default class Competition extends Schema {
    constructor(name: string, description: string, fields: Field[]  = []) {
        super(name, description, fields)
    }

    extract_olimanager_results(row: Row, sheetData: Data, workbookData: Data)
    : OlimanagerProblemResult[] {
        throw new Error("Method not implemented.");
    }
}