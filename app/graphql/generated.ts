import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { ObjectId } from 'bson';
import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Data: { input: any; output: any; }
  JSON: { input: JSON; output: JSON; }
  ObjectId: { input: ObjectId; output: ObjectId; }
  Timestamp: { input: Date; output: Date; }
};

export type Config = {
  __typename?: 'Config';
  OLIMANAGER_URL?: Maybe<Scalars['String']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  addRow?: Maybe<Row>;
  addRows?: Maybe<Scalars['Int']['output']>;
  addSheet?: Maybe<Sheet>;
  deleteRow?: Maybe<Scalars['ObjectId']['output']>;
  deleteScan?: Maybe<Scalars['Boolean']['output']>;
  deleteSheet?: Maybe<Scalars['ObjectId']['output']>;
  patchRow?: Maybe<Row>;
};


export type MutationAddRowArgs = {
  data: Scalars['Data']['input'];
  sheetId: Scalars['ObjectId']['input'];
};


export type MutationAddRowsArgs = {
  columns: Array<Scalars['String']['input']>;
  rows: Array<Array<Scalars['String']['input']>>;
  sheetId: Scalars['ObjectId']['input'];
};


export type MutationAddSheetArgs = {
  name: Scalars['String']['input'];
  schema: Scalars['String']['input'];
  workbookId: Scalars['ObjectId']['input'];
};


export type MutationDeleteRowArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationDeleteScanArgs = {
  jobId: Scalars['ObjectId']['input'];
};


export type MutationDeleteSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationPatchRowArgs = {
  _id: Scalars['ObjectId']['input'];
  data: Scalars['Data']['input'];
  updatedOn: Scalars['Timestamp']['input'];
};

export type Query = {
  __typename?: 'Query';
  config?: Maybe<Config>;
  hello?: Maybe<Scalars['String']['output']>;
  me?: Maybe<User>;
  olimanager?: Maybe<Scalars['String']['output']>;
  rows?: Maybe<Array<Maybe<Row>>>;
  scanJobs?: Maybe<Array<Maybe<ScanJob>>>;
  scanResults?: Maybe<Array<Maybe<ScanResults>>>;
  sheet?: Maybe<Sheet>;
  sheets?: Maybe<Array<Maybe<Sheet>>>;
  users?: Maybe<Array<Maybe<User>>>;
  workbook?: Maybe<Workbook>;
  workbooks?: Maybe<Array<Maybe<Workbook>>>;
};


export type QueryRowsArgs = {
  sheetId: Scalars['ObjectId']['input'];
};


export type QueryScanJobsArgs = {
  sheetId: Scalars['ObjectId']['input'];
  userId?: InputMaybe<Scalars['ObjectId']['input']>;
};


export type QueryScanResultsArgs = {
  jobId: Scalars['ObjectId']['input'];
};


export type QuerySheetArgs = {
  sheetId: Scalars['ObjectId']['input'];
};


export type QuerySheetsArgs = {
  workbookId: Scalars['ObjectId']['input'];
};


export type QueryWorkbookArgs = {
  workbookId: Scalars['ObjectId']['input'];
};

export type Row = {
  __typename?: 'Row';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  data?: Maybe<Scalars['Data']['output']>;
  isValid?: Maybe<Scalars['Boolean']['output']>;
  updatedOn?: Maybe<Scalars['Timestamp']['output']>;
};

export type ScanJob = {
  __typename?: 'ScanJob';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  message?: Maybe<ScanMessage>;
  messages?: Maybe<Array<Maybe<ScanMessage>>>;
  ownerId?: Maybe<Scalars['ObjectId']['output']>;
  sheetId?: Maybe<Scalars['ObjectId']['output']>;
  timestamp?: Maybe<Scalars['Timestamp']['output']>;
};

export type ScanMessage = {
  __typename?: 'ScanMessage';
  message?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['Timestamp']['output']>;
};

export type ScanResults = {
  __typename?: 'ScanResults';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  image?: Maybe<Scalars['String']['output']>;
  jobId?: Maybe<Scalars['ObjectId']['output']>;
  rawData?: Maybe<Scalars['Data']['output']>;
  sheetId?: Maybe<Scalars['ObjectId']['output']>;
};

export type Sheet = {
  __typename?: 'Sheet';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  ownerId?: Maybe<Scalars['ObjectId']['output']>;
  permissions?: Maybe<Array<Maybe<SheetPermission>>>;
  schema?: Maybe<Scalars['String']['output']>;
  workbookId?: Maybe<Scalars['ObjectId']['output']>;
};

export type SheetPermission = {
  __typename?: 'SheetPermission';
  filterField?: Maybe<Scalars['String']['output']>;
  filterValue?: Maybe<Scalars['String']['output']>;
  userEmail?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ObjectId']['output']>;
};

export type User = {
  __typename?: 'User';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  isAdmin?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['Int']['output']>;
};

export type Workbook = {
  __typename?: 'Workbook';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  ownerId?: Maybe<Scalars['ObjectId']['output']>;
};

export type AddRowsMutationVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
  columns: Array<Scalars['String']['input']> | Scalars['String']['input'];
  rows: Array<Array<Scalars['String']['input']> | Scalars['String']['input']> | Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;


export type AddRowsMutation = { __typename?: 'Mutation', addRows?: number | null };

export type ScansQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type ScansQuery = { __typename?: 'Query', scanJobs?: Array<{ __typename?: 'ScanJob', _id?: ObjectId | null, timestamp?: Date | null, sheetId?: ObjectId | null, message?: { __typename?: 'ScanMessage', status?: string | null, message?: string | null, timestamp?: Date | null } | null } | null> | null };

export type DeleteScanMutationVariables = Exact<{
  jobId: Scalars['ObjectId']['input'];
}>;


export type DeleteScanMutation = { __typename?: 'Mutation', deleteScan?: boolean | null };

export type ScanResultsQueryVariables = Exact<{
  jobId: Scalars['ObjectId']['input'];
}>;


export type ScanResultsQuery = { __typename?: 'Query', scanResults?: Array<{ __typename?: 'ScanResults', _id?: ObjectId | null, sheetId?: ObjectId | null, jobId?: ObjectId | null, image?: string | null, rawData?: any | null } | null> | null };

export type GetSheetQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type GetSheetQuery = { __typename?: 'Query', sheet?: { __typename?: 'Sheet', _id?: ObjectId | null, name?: string | null, schema?: string | null, permissions?: Array<{ __typename?: 'SheetPermission', userId?: ObjectId | null, userEmail?: string | null, filterField?: string | null, filterValue?: string | null } | null> | null } | null };

export type GetRowsQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type GetRowsQuery = { __typename?: 'Query', rows?: Array<{ __typename?: 'Row', _id?: ObjectId | null, isValid?: boolean | null, data?: any | null, updatedOn?: Date | null } | null> | null };

export type DeleteSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type DeleteSheetMutation = { __typename?: 'Mutation', deleteSheet?: ObjectId | null };

export type GetSheetsQueryVariables = Exact<{
  workbookId: Scalars['ObjectId']['input'];
}>;


export type GetSheetsQuery = { __typename?: 'Query', sheets?: Array<{ __typename?: 'Sheet', _id?: ObjectId | null, name?: string | null, schema?: string | null } | null> | null };

export type AddSheetMutationVariables = Exact<{
  name: Scalars['String']['input'];
  schema: Scalars['String']['input'];
  workbookId: Scalars['ObjectId']['input'];
}>;


export type AddSheetMutation = { __typename?: 'Mutation', addSheet?: { __typename?: 'Sheet', _id?: ObjectId | null, name?: string | null, schema?: string | null } | null };

export type AddRowMutationVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
  data: Scalars['Data']['input'];
}>;


export type AddRowMutation = { __typename?: 'Mutation', addRow?: { __typename?: 'Row', _id?: ObjectId | null, isValid?: boolean | null, data?: any | null } | null };

export type PatchRowMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
  updatedOn: Scalars['Timestamp']['input'];
  data: Scalars['Data']['input'];
}>;


export type PatchRowMutation = { __typename?: 'Mutation', patchRow?: { __typename: 'Row', _id?: ObjectId | null, updatedOn?: Date | null, isValid?: boolean | null, data?: any | null } | null };

export type DeleteRowMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type DeleteRowMutation = { __typename?: 'Mutation', deleteRow?: ObjectId | null };

export type GetWorkbooksQueryVariables = Exact<{ [key: string]: never; }>;


export type GetWorkbooksQuery = { __typename?: 'Query', workbooks?: Array<{ __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null } | null> | null };

export type GetProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type GetProfileQuery = { __typename?: 'Query', me?: { __typename?: 'User', _id?: ObjectId | null, isAdmin?: boolean | null, email?: string | null, name?: string | null } | null };

export type GetConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type GetConfigQuery = { __typename?: 'Query', config?: { __typename?: 'Config', OLIMANAGER_URL?: string | null } | null };

export type GetUsersQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUsersQuery = { __typename?: 'Query', users?: Array<{ __typename?: 'User', _id?: ObjectId | null, email?: string | null, isAdmin?: boolean | null } | null> | null };

export type GetWorkbookQueryVariables = Exact<{
  workbookId: Scalars['ObjectId']['input'];
}>;


export type GetWorkbookQuery = { __typename?: 'Query', workbook?: { __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null } | null };


export const AddRowsDocument = gql`
    mutation addRows($sheetId: ObjectId!, $columns: [String!]!, $rows: [[String!]!]!) {
  addRows(sheetId: $sheetId, columns: $columns, rows: $rows)
}
    `;
export type AddRowsMutationFn = Apollo.MutationFunction<AddRowsMutation, AddRowsMutationVariables>;

/**
 * __useAddRowsMutation__
 *
 * To run a mutation, you first call `useAddRowsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddRowsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addRowsMutation, { data, loading, error }] = useAddRowsMutation({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *      columns: // value for 'columns'
 *      rows: // value for 'rows'
 *   },
 * });
 */
export function useAddRowsMutation(baseOptions?: Apollo.MutationHookOptions<AddRowsMutation, AddRowsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddRowsMutation, AddRowsMutationVariables>(AddRowsDocument, options);
      }
export type AddRowsMutationHookResult = ReturnType<typeof useAddRowsMutation>;
export type AddRowsMutationResult = Apollo.MutationResult<AddRowsMutation>;
export type AddRowsMutationOptions = Apollo.BaseMutationOptions<AddRowsMutation, AddRowsMutationVariables>;
export const ScansDocument = gql`
    query Scans($sheetId: ObjectId!) {
  scanJobs(sheetId: $sheetId) {
    _id
    timestamp
    sheetId
    message {
      status
      message
      timestamp
    }
  }
}
    `;

/**
 * __useScansQuery__
 *
 * To run a query within a React component, call `useScansQuery` and pass it any options that fit your needs.
 * When your component renders, `useScansQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useScansQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useScansQuery(baseOptions: Apollo.QueryHookOptions<ScansQuery, ScansQueryVariables> & ({ variables: ScansQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ScansQuery, ScansQueryVariables>(ScansDocument, options);
      }
export function useScansLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ScansQuery, ScansQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ScansQuery, ScansQueryVariables>(ScansDocument, options);
        }
export function useScansSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ScansQuery, ScansQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ScansQuery, ScansQueryVariables>(ScansDocument, options);
        }
export type ScansQueryHookResult = ReturnType<typeof useScansQuery>;
export type ScansLazyQueryHookResult = ReturnType<typeof useScansLazyQuery>;
export type ScansSuspenseQueryHookResult = ReturnType<typeof useScansSuspenseQuery>;
export type ScansQueryResult = Apollo.QueryResult<ScansQuery, ScansQueryVariables>;
export const DeleteScanDocument = gql`
    mutation DeleteScan($jobId: ObjectId!) {
  deleteScan(jobId: $jobId)
}
    `;
export type DeleteScanMutationFn = Apollo.MutationFunction<DeleteScanMutation, DeleteScanMutationVariables>;

/**
 * __useDeleteScanMutation__
 *
 * To run a mutation, you first call `useDeleteScanMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteScanMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteScanMutation, { data, loading, error }] = useDeleteScanMutation({
 *   variables: {
 *      jobId: // value for 'jobId'
 *   },
 * });
 */
export function useDeleteScanMutation(baseOptions?: Apollo.MutationHookOptions<DeleteScanMutation, DeleteScanMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteScanMutation, DeleteScanMutationVariables>(DeleteScanDocument, options);
      }
export type DeleteScanMutationHookResult = ReturnType<typeof useDeleteScanMutation>;
export type DeleteScanMutationResult = Apollo.MutationResult<DeleteScanMutation>;
export type DeleteScanMutationOptions = Apollo.BaseMutationOptions<DeleteScanMutation, DeleteScanMutationVariables>;
export const ScanResultsDocument = gql`
    query ScanResults($jobId: ObjectId!) {
  scanResults(jobId: $jobId) {
    _id
    sheetId
    jobId
    image
    rawData
  }
}
    `;

/**
 * __useScanResultsQuery__
 *
 * To run a query within a React component, call `useScanResultsQuery` and pass it any options that fit your needs.
 * When your component renders, `useScanResultsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useScanResultsQuery({
 *   variables: {
 *      jobId: // value for 'jobId'
 *   },
 * });
 */
export function useScanResultsQuery(baseOptions: Apollo.QueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables> & ({ variables: ScanResultsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
      }
export function useScanResultsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
        }
export function useScanResultsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
        }
export type ScanResultsQueryHookResult = ReturnType<typeof useScanResultsQuery>;
export type ScanResultsLazyQueryHookResult = ReturnType<typeof useScanResultsLazyQuery>;
export type ScanResultsSuspenseQueryHookResult = ReturnType<typeof useScanResultsSuspenseQuery>;
export type ScanResultsQueryResult = Apollo.QueryResult<ScanResultsQuery, ScanResultsQueryVariables>;
export const GetSheetDocument = gql`
    query getSheet($sheetId: ObjectId!) {
  sheet(sheetId: $sheetId) {
    _id
    name
    schema
    permissions {
      userId
      userEmail
      filterField
      filterValue
    }
  }
}
    `;

/**
 * __useGetSheetQuery__
 *
 * To run a query within a React component, call `useGetSheetQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSheetQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSheetQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useGetSheetQuery(baseOptions: Apollo.QueryHookOptions<GetSheetQuery, GetSheetQueryVariables> & ({ variables: GetSheetQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
      }
export function useGetSheetLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSheetQuery, GetSheetQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
        }
export function useGetSheetSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSheetQuery, GetSheetQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
        }
export type GetSheetQueryHookResult = ReturnType<typeof useGetSheetQuery>;
export type GetSheetLazyQueryHookResult = ReturnType<typeof useGetSheetLazyQuery>;
export type GetSheetSuspenseQueryHookResult = ReturnType<typeof useGetSheetSuspenseQuery>;
export type GetSheetQueryResult = Apollo.QueryResult<GetSheetQuery, GetSheetQueryVariables>;
export const GetRowsDocument = gql`
    query getRows($sheetId: ObjectId!) {
  rows(sheetId: $sheetId) {
    _id
    isValid
    data
    updatedOn
  }
}
    `;

/**
 * __useGetRowsQuery__
 *
 * To run a query within a React component, call `useGetRowsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRowsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRowsQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useGetRowsQuery(baseOptions: Apollo.QueryHookOptions<GetRowsQuery, GetRowsQueryVariables> & ({ variables: GetRowsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
      }
export function useGetRowsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRowsQuery, GetRowsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
        }
export function useGetRowsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetRowsQuery, GetRowsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
        }
export type GetRowsQueryHookResult = ReturnType<typeof useGetRowsQuery>;
export type GetRowsLazyQueryHookResult = ReturnType<typeof useGetRowsLazyQuery>;
export type GetRowsSuspenseQueryHookResult = ReturnType<typeof useGetRowsSuspenseQuery>;
export type GetRowsQueryResult = Apollo.QueryResult<GetRowsQuery, GetRowsQueryVariables>;
export const DeleteSheetDocument = gql`
    mutation DeleteSheet($_id: ObjectId!) {
  deleteSheet(_id: $_id)
}
    `;
export type DeleteSheetMutationFn = Apollo.MutationFunction<DeleteSheetMutation, DeleteSheetMutationVariables>;

/**
 * __useDeleteSheetMutation__
 *
 * To run a mutation, you first call `useDeleteSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteSheetMutation, { data, loading, error }] = useDeleteSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useDeleteSheetMutation(baseOptions?: Apollo.MutationHookOptions<DeleteSheetMutation, DeleteSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteSheetMutation, DeleteSheetMutationVariables>(DeleteSheetDocument, options);
      }
export type DeleteSheetMutationHookResult = ReturnType<typeof useDeleteSheetMutation>;
export type DeleteSheetMutationResult = Apollo.MutationResult<DeleteSheetMutation>;
export type DeleteSheetMutationOptions = Apollo.BaseMutationOptions<DeleteSheetMutation, DeleteSheetMutationVariables>;
export const GetSheetsDocument = gql`
    query GetSheets($workbookId: ObjectId!) {
  sheets(workbookId: $workbookId) {
    _id
    name
    schema
  }
}
    `;

/**
 * __useGetSheetsQuery__
 *
 * To run a query within a React component, call `useGetSheetsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSheetsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSheetsQuery({
 *   variables: {
 *      workbookId: // value for 'workbookId'
 *   },
 * });
 */
export function useGetSheetsQuery(baseOptions: Apollo.QueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables> & ({ variables: GetSheetsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
      }
export function useGetSheetsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
        }
export function useGetSheetsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
        }
export type GetSheetsQueryHookResult = ReturnType<typeof useGetSheetsQuery>;
export type GetSheetsLazyQueryHookResult = ReturnType<typeof useGetSheetsLazyQuery>;
export type GetSheetsSuspenseQueryHookResult = ReturnType<typeof useGetSheetsSuspenseQuery>;
export type GetSheetsQueryResult = Apollo.QueryResult<GetSheetsQuery, GetSheetsQueryVariables>;
export const AddSheetDocument = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!) {
  addSheet(name: $name, schema: $schema, workbookId: $workbookId) {
    _id
    name
    schema
  }
}
    `;
export type AddSheetMutationFn = Apollo.MutationFunction<AddSheetMutation, AddSheetMutationVariables>;

/**
 * __useAddSheetMutation__
 *
 * To run a mutation, you first call `useAddSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addSheetMutation, { data, loading, error }] = useAddSheetMutation({
 *   variables: {
 *      name: // value for 'name'
 *      schema: // value for 'schema'
 *      workbookId: // value for 'workbookId'
 *   },
 * });
 */
export function useAddSheetMutation(baseOptions?: Apollo.MutationHookOptions<AddSheetMutation, AddSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddSheetMutation, AddSheetMutationVariables>(AddSheetDocument, options);
      }
export type AddSheetMutationHookResult = ReturnType<typeof useAddSheetMutation>;
export type AddSheetMutationResult = Apollo.MutationResult<AddSheetMutation>;
export type AddSheetMutationOptions = Apollo.BaseMutationOptions<AddSheetMutation, AddSheetMutationVariables>;
export const AddRowDocument = gql`
    mutation addRow($sheetId: ObjectId!, $data: Data!) {
  addRow(sheetId: $sheetId, data: $data) {
    _id
    isValid
    data
  }
}
    `;
export type AddRowMutationFn = Apollo.MutationFunction<AddRowMutation, AddRowMutationVariables>;

/**
 * __useAddRowMutation__
 *
 * To run a mutation, you first call `useAddRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addRowMutation, { data, loading, error }] = useAddRowMutation({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *      data: // value for 'data'
 *   },
 * });
 */
export function useAddRowMutation(baseOptions?: Apollo.MutationHookOptions<AddRowMutation, AddRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddRowMutation, AddRowMutationVariables>(AddRowDocument, options);
      }
export type AddRowMutationHookResult = ReturnType<typeof useAddRowMutation>;
export type AddRowMutationResult = Apollo.MutationResult<AddRowMutation>;
export type AddRowMutationOptions = Apollo.BaseMutationOptions<AddRowMutation, AddRowMutationVariables>;
export const PatchRowDocument = gql`
    mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!) {
  patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
    _id
    __typename
    updatedOn
    isValid
    data
  }
}
    `;
export type PatchRowMutationFn = Apollo.MutationFunction<PatchRowMutation, PatchRowMutationVariables>;

/**
 * __usePatchRowMutation__
 *
 * To run a mutation, you first call `usePatchRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `usePatchRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [patchRowMutation, { data, loading, error }] = usePatchRowMutation({
 *   variables: {
 *      _id: // value for '_id'
 *      updatedOn: // value for 'updatedOn'
 *      data: // value for 'data'
 *   },
 * });
 */
export function usePatchRowMutation(baseOptions?: Apollo.MutationHookOptions<PatchRowMutation, PatchRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<PatchRowMutation, PatchRowMutationVariables>(PatchRowDocument, options);
      }
export type PatchRowMutationHookResult = ReturnType<typeof usePatchRowMutation>;
export type PatchRowMutationResult = Apollo.MutationResult<PatchRowMutation>;
export type PatchRowMutationOptions = Apollo.BaseMutationOptions<PatchRowMutation, PatchRowMutationVariables>;
export const DeleteRowDocument = gql`
    mutation deleteRow($_id: ObjectId!) {
  deleteRow(_id: $_id)
}
    `;
export type DeleteRowMutationFn = Apollo.MutationFunction<DeleteRowMutation, DeleteRowMutationVariables>;

/**
 * __useDeleteRowMutation__
 *
 * To run a mutation, you first call `useDeleteRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteRowMutation, { data, loading, error }] = useDeleteRowMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useDeleteRowMutation(baseOptions?: Apollo.MutationHookOptions<DeleteRowMutation, DeleteRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteRowMutation, DeleteRowMutationVariables>(DeleteRowDocument, options);
      }
export type DeleteRowMutationHookResult = ReturnType<typeof useDeleteRowMutation>;
export type DeleteRowMutationResult = Apollo.MutationResult<DeleteRowMutation>;
export type DeleteRowMutationOptions = Apollo.BaseMutationOptions<DeleteRowMutation, DeleteRowMutationVariables>;
export const GetWorkbooksDocument = gql`
    query GetWorkbooks {
  workbooks {
    _id
    name
  }
}
    `;

/**
 * __useGetWorkbooksQuery__
 *
 * To run a query within a React component, call `useGetWorkbooksQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetWorkbooksQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetWorkbooksQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetWorkbooksQuery(baseOptions?: Apollo.QueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
      }
export function useGetWorkbooksLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
        }
export function useGetWorkbooksSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
        }
export type GetWorkbooksQueryHookResult = ReturnType<typeof useGetWorkbooksQuery>;
export type GetWorkbooksLazyQueryHookResult = ReturnType<typeof useGetWorkbooksLazyQuery>;
export type GetWorkbooksSuspenseQueryHookResult = ReturnType<typeof useGetWorkbooksSuspenseQuery>;
export type GetWorkbooksQueryResult = Apollo.QueryResult<GetWorkbooksQuery, GetWorkbooksQueryVariables>;
export const GetProfileDocument = gql`
    query GetProfile {
  me {
    _id
    isAdmin
    email
    name
  }
}
    `;

/**
 * __useGetProfileQuery__
 *
 * To run a query within a React component, call `useGetProfileQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProfileQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProfileQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetProfileQuery(baseOptions?: Apollo.QueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
      }
export function useGetProfileLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
        }
export function useGetProfileSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
        }
export type GetProfileQueryHookResult = ReturnType<typeof useGetProfileQuery>;
export type GetProfileLazyQueryHookResult = ReturnType<typeof useGetProfileLazyQuery>;
export type GetProfileSuspenseQueryHookResult = ReturnType<typeof useGetProfileSuspenseQuery>;
export type GetProfileQueryResult = Apollo.QueryResult<GetProfileQuery, GetProfileQueryVariables>;
export const GetConfigDocument = gql`
    query GetConfig {
  config {
    OLIMANAGER_URL
  }
}
    `;

/**
 * __useGetConfigQuery__
 *
 * To run a query within a React component, call `useGetConfigQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConfigQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConfigQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetConfigQuery(baseOptions?: Apollo.QueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
      }
export function useGetConfigLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
        }
export function useGetConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
        }
export type GetConfigQueryHookResult = ReturnType<typeof useGetConfigQuery>;
export type GetConfigLazyQueryHookResult = ReturnType<typeof useGetConfigLazyQuery>;
export type GetConfigSuspenseQueryHookResult = ReturnType<typeof useGetConfigSuspenseQuery>;
export type GetConfigQueryResult = Apollo.QueryResult<GetConfigQuery, GetConfigQueryVariables>;
export const GetUsersDocument = gql`
    query GetUsers {
  users {
    _id
    email
    isAdmin
  }
}
    `;

/**
 * __useGetUsersQuery__
 *
 * To run a query within a React component, call `useGetUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUsersQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUsersQuery(baseOptions?: Apollo.QueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
      }
export function useGetUsersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
        }
export function useGetUsersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
        }
export type GetUsersQueryHookResult = ReturnType<typeof useGetUsersQuery>;
export type GetUsersLazyQueryHookResult = ReturnType<typeof useGetUsersLazyQuery>;
export type GetUsersSuspenseQueryHookResult = ReturnType<typeof useGetUsersSuspenseQuery>;
export type GetUsersQueryResult = Apollo.QueryResult<GetUsersQuery, GetUsersQueryVariables>;
export const GetWorkbookDocument = gql`
    query GetWorkbook($workbookId: ObjectId!) {
  workbook(workbookId: $workbookId) {
    _id
    name
  }
}
    `;

/**
 * __useGetWorkbookQuery__
 *
 * To run a query within a React component, call `useGetWorkbookQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetWorkbookQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetWorkbookQuery({
 *   variables: {
 *      workbookId: // value for 'workbookId'
 *   },
 * });
 */
export function useGetWorkbookQuery(baseOptions: Apollo.QueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables> & ({ variables: GetWorkbookQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
      }
export function useGetWorkbookLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
        }
export function useGetWorkbookSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
        }
export type GetWorkbookQueryHookResult = ReturnType<typeof useGetWorkbookQuery>;
export type GetWorkbookLazyQueryHookResult = ReturnType<typeof useGetWorkbookLazyQuery>;
export type GetWorkbookSuspenseQueryHookResult = ReturnType<typeof useGetWorkbookSuspenseQuery>;
export type GetWorkbookQueryResult = Apollo.QueryResult<GetWorkbookQuery, GetWorkbookQueryVariables>;


export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Config: ResolverTypeWrapper<Config>;
  Data: ResolverTypeWrapper<Scalars['Data']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<{}>;
  ObjectId: ResolverTypeWrapper<ObjectId>;
  Query: ResolverTypeWrapper<{}>;
  Row: ResolverTypeWrapper<Omit<Row, '_id'> & { _id?: Maybe<ResolversTypes['ObjectId']> }>;
  ScanJob: ResolverTypeWrapper<Omit<ScanJob, '_id' | 'ownerId' | 'sheetId'> & { _id?: Maybe<ResolversTypes['ObjectId']>, ownerId?: Maybe<ResolversTypes['ObjectId']>, sheetId?: Maybe<ResolversTypes['ObjectId']> }>;
  ScanMessage: ResolverTypeWrapper<ScanMessage>;
  ScanResults: ResolverTypeWrapper<Omit<ScanResults, '_id' | 'jobId' | 'sheetId'> & { _id?: Maybe<ResolversTypes['ObjectId']>, jobId?: Maybe<ResolversTypes['ObjectId']>, sheetId?: Maybe<ResolversTypes['ObjectId']> }>;
  Sheet: ResolverTypeWrapper<Omit<Sheet, '_id' | 'ownerId' | 'workbookId'> & { _id?: Maybe<ResolversTypes['ObjectId']>, ownerId?: Maybe<ResolversTypes['ObjectId']>, workbookId?: Maybe<ResolversTypes['ObjectId']> }>;
  SheetPermission: ResolverTypeWrapper<Omit<SheetPermission, 'userId'> & { userId?: Maybe<ResolversTypes['ObjectId']> }>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Timestamp: ResolverTypeWrapper<Scalars['Timestamp']['output']>;
  User: ResolverTypeWrapper<Omit<User, '_id'> & { _id?: Maybe<ResolversTypes['ObjectId']> }>;
  Workbook: ResolverTypeWrapper<Omit<Workbook, '_id' | 'ownerId'> & { _id?: Maybe<ResolversTypes['ObjectId']>, ownerId?: Maybe<ResolversTypes['ObjectId']> }>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  Config: Config;
  Data: Scalars['Data']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: {};
  ObjectId: ObjectId;
  Query: {};
  Row: Omit<Row, '_id'> & { _id?: Maybe<ResolversParentTypes['ObjectId']> };
  ScanJob: Omit<ScanJob, '_id' | 'ownerId' | 'sheetId'> & { _id?: Maybe<ResolversParentTypes['ObjectId']>, ownerId?: Maybe<ResolversParentTypes['ObjectId']>, sheetId?: Maybe<ResolversParentTypes['ObjectId']> };
  ScanMessage: ScanMessage;
  ScanResults: Omit<ScanResults, '_id' | 'jobId' | 'sheetId'> & { _id?: Maybe<ResolversParentTypes['ObjectId']>, jobId?: Maybe<ResolversParentTypes['ObjectId']>, sheetId?: Maybe<ResolversParentTypes['ObjectId']> };
  Sheet: Omit<Sheet, '_id' | 'ownerId' | 'workbookId'> & { _id?: Maybe<ResolversParentTypes['ObjectId']>, ownerId?: Maybe<ResolversParentTypes['ObjectId']>, workbookId?: Maybe<ResolversParentTypes['ObjectId']> };
  SheetPermission: Omit<SheetPermission, 'userId'> & { userId?: Maybe<ResolversParentTypes['ObjectId']> };
  String: Scalars['String']['output'];
  Timestamp: Scalars['Timestamp']['output'];
  User: Omit<User, '_id'> & { _id?: Maybe<ResolversParentTypes['ObjectId']> };
  Workbook: Omit<Workbook, '_id' | 'ownerId'> & { _id?: Maybe<ResolversParentTypes['ObjectId']>, ownerId?: Maybe<ResolversParentTypes['ObjectId']> };
};

export type ConfigResolvers<ContextType = any, ParentType extends ResolversParentTypes['Config'] = ResolversParentTypes['Config']> = {
  OLIMANAGER_URL?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface DataScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Data'], any> {
  name: 'Data';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addRow?: Resolver<Maybe<ResolversTypes['Row']>, ParentType, ContextType, RequireFields<MutationAddRowArgs, 'data' | 'sheetId'>>;
  addRows?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType, RequireFields<MutationAddRowsArgs, 'columns' | 'rows' | 'sheetId'>>;
  addSheet?: Resolver<Maybe<ResolversTypes['Sheet']>, ParentType, ContextType, RequireFields<MutationAddSheetArgs, 'name' | 'schema' | 'workbookId'>>;
  deleteRow?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType, RequireFields<MutationDeleteRowArgs, '_id'>>;
  deleteScan?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteScanArgs, 'jobId'>>;
  deleteSheet?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType, RequireFields<MutationDeleteSheetArgs, '_id'>>;
  patchRow?: Resolver<Maybe<ResolversTypes['Row']>, ParentType, ContextType, RequireFields<MutationPatchRowArgs, '_id' | 'data' | 'updatedOn'>>;
};

export interface ObjectIdScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['ObjectId'], any> {
  name: 'ObjectId';
}

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  config?: Resolver<Maybe<ResolversTypes['Config']>, ParentType, ContextType>;
  hello?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  olimanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rows?: Resolver<Maybe<Array<Maybe<ResolversTypes['Row']>>>, ParentType, ContextType, RequireFields<QueryRowsArgs, 'sheetId'>>;
  scanJobs?: Resolver<Maybe<Array<Maybe<ResolversTypes['ScanJob']>>>, ParentType, ContextType, RequireFields<QueryScanJobsArgs, 'sheetId'>>;
  scanResults?: Resolver<Maybe<Array<Maybe<ResolversTypes['ScanResults']>>>, ParentType, ContextType, RequireFields<QueryScanResultsArgs, 'jobId'>>;
  sheet?: Resolver<Maybe<ResolversTypes['Sheet']>, ParentType, ContextType, RequireFields<QuerySheetArgs, 'sheetId'>>;
  sheets?: Resolver<Maybe<Array<Maybe<ResolversTypes['Sheet']>>>, ParentType, ContextType, RequireFields<QuerySheetsArgs, 'workbookId'>>;
  users?: Resolver<Maybe<Array<Maybe<ResolversTypes['User']>>>, ParentType, ContextType>;
  workbook?: Resolver<Maybe<ResolversTypes['Workbook']>, ParentType, ContextType, RequireFields<QueryWorkbookArgs, 'workbookId'>>;
  workbooks?: Resolver<Maybe<Array<Maybe<ResolversTypes['Workbook']>>>, ParentType, ContextType>;
};

export type RowResolvers<ContextType = any, ParentType extends ResolversParentTypes['Row'] = ResolversParentTypes['Row']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  data?: Resolver<Maybe<ResolversTypes['Data']>, ParentType, ContextType>;
  isValid?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  updatedOn?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanJobResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanJob'] = ResolversParentTypes['ScanJob']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['ScanMessage']>, ParentType, ContextType>;
  messages?: Resolver<Maybe<Array<Maybe<ResolversTypes['ScanMessage']>>>, ParentType, ContextType>;
  ownerId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  sheetId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanMessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanMessage'] = ResolversParentTypes['ScanMessage']> = {
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanResultsResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanResults'] = ResolversParentTypes['ScanResults']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  jobId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  rawData?: Resolver<Maybe<ResolversTypes['Data']>, ParentType, ContextType>;
  sheetId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SheetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Sheet'] = ResolversParentTypes['Sheet']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  permissions?: Resolver<Maybe<Array<Maybe<ResolversTypes['SheetPermission']>>>, ParentType, ContextType>;
  schema?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  workbookId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SheetPermissionResolvers<ContextType = any, ParentType extends ResolversParentTypes['SheetPermission'] = ResolversParentTypes['SheetPermission']> = {
  filterField?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  filterValue?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userEmail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface TimestampScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Timestamp'], any> {
  name: 'Timestamp';
}

export type UserResolvers<ContextType = any, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isAdmin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uid?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WorkbookResolvers<ContextType = any, ParentType extends ResolversParentTypes['Workbook'] = ResolversParentTypes['Workbook']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Config?: ConfigResolvers<ContextType>;
  Data?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  ObjectId?: GraphQLScalarType;
  Query?: QueryResolvers<ContextType>;
  Row?: RowResolvers<ContextType>;
  ScanJob?: ScanJobResolvers<ContextType>;
  ScanMessage?: ScanMessageResolvers<ContextType>;
  ScanResults?: ScanResultsResolvers<ContextType>;
  Sheet?: SheetResolvers<ContextType>;
  SheetPermission?: SheetPermissionResolvers<ContextType>;
  Timestamp?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
  Workbook?: WorkbookResolvers<ContextType>;
};

