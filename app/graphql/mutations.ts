import { gql } from '@apollo/client';

export const OLIMANAGER_BULK_UPDATE_RESULTS_MUTATION = gql`
  mutation OlimanagerBulkUpdateResults($rowIds: [ObjectId!], $sheetIds: [ObjectId!], $username: String, $password: String!) {
    olimanagerBulkUpdateResults(rowIds: $rowIds, sheetIds: $sheetIds, username: $username, password: $password)
  }
`;

export const OLIMANAGER_CREATE_PARTICIPANT_MUTATION = gql`
  mutation OlimanagerCreateParticipant($rowIds: [ObjectId!], $sheetIds: [ObjectId!], $username: String, $password: String!) {
    olimanagerCreateParticipant(rowIds: $rowIds, sheetIds: $sheetIds, username: $username, password: $password) {
      success
      error
      participantId
    }
  }
`;

export const REQUEST_SCAN_SHEET_GENERATION_MUTATION = gql`
  mutation RequestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]) {
    requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
  }
`;

export const CREATE_SHEETS_MUTATION = gql`
  mutation CreateSheets($sheetId: ObjectId!, $rowIds: [ObjectId!]) {
    createSheets(sheetId: $sheetId, rowIds: $rowIds) {
      sheets_created
      sheets_updated
      rows_created
      rows_updated
      error
    }
  }
`;
