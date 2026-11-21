import type { ApolloServerPlugin } from '@apollo/server'
import type { Context } from './types'
import type { GraphQLRequestContext } from '@apollo/server'
import type { SelectionSetNode } from 'graphql'
import { randomUUID } from 'node:crypto'
import { logDiagnostic, safeErrorCode, serverLog } from '../lib/logging'
import { appLog } from '../lib/appLog'

// Only schema-defined root field names; never client operation names or aliases.
function operationFields(context: GraphQLRequestContext<Context>): string[] {
    const operation = context.operation
    if (!operation) return []
    const type = operation.operation === 'query' ? context.schema.getQueryType()
        : operation.operation === 'mutation' ? context.schema.getMutationType()
        : context.schema.getSubscriptionType()
    const allowed = type?.getFields() ?? {}
    const fields = new Set<string>()
    const visited = new Set<string>()
    function collect(selectionSet: SelectionSetNode) {
        for (const selection of selectionSet.selections) {
            if (selection.kind === 'Field' && Object.hasOwn(allowed, selection.name.value)) {
                fields.add(selection.name.value)
            } else if (selection.kind === 'InlineFragment') {
                collect(selection.selectionSet)
            } else if (selection.kind === 'FragmentSpread' && !visited.has(selection.name.value)) {
                visited.add(selection.name.value)
                const fragment = context.document?.definitions.find(def => def.kind === 'FragmentDefinition' && def.name.value === selection.name.value)
                if (fragment?.kind === 'FragmentDefinition') collect(fragment.selectionSet)
            }
        }
    }
    collect(operation.selectionSet)
    return [...fields].sort()
}

export const graphqlLoggerPlugin: ApolloServerPlugin<Context> = {
    // These failures happen outside requestDidStart, so willSendResponse never
    // logs them: the client sees INTERNAL_SERVER_ERROR and the server nothing.
    async contextCreationDidFail({ error }) {
        logDiagnostic('graphql.context_creation_failed', error)
    },
    async unexpectedErrorProcessingRequest({ requestContext, error }) {
        serverLog('error', 'graphql.unexpected_error', { code: safeErrorCode(error), fields: operationFields(requestContext) })
    },
    async requestDidStart() {
        const start = Date.now()
        const requestId = randomUUID()
        return {
            async willSendResponse(context) {
                const errors = context.errors ?? []
                const fields = operationFields(context)
                const errorCodes = [...new Set(errors.map(safeErrorCode))]
                appLog('graphql.request', {
                    requestId,
                    type: context.operation?.operation ?? 'unknown',
                    fields,
                    durationMs: Math.max(0, Date.now() - start),
                    status: errors.length ? 'error' : 'success',
                    errorCount: errors.length,
                    errorCodes,
                }, { level: errors.length ? 'warn' : 'info' })
                // Unexpected failures also concern whoever runs the server.
                if (errorCodes.includes('INTERNAL_SERVER_ERROR')) {
                    serverLog('error', 'graphql.internal_error', { requestId, fields })
                }
            },
        }
    },
}
