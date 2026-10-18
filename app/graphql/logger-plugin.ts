import type { ApolloServerPlugin } from '@apollo/server'
import type { Context } from './types'
import type { GraphQLRequestContext } from '@apollo/server'
import type { SelectionSetNode } from 'graphql'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { logDiagnostic, safeErrorCode } from '../lib/logging'

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
    async requestDidStart() {
        const start = Date.now()
        const requestId = randomUUID()
        return {
            async willSendResponse(context) {
                const errors = context.errors ?? []
                const timestamp = new Date().toISOString()
                const entry = {
                    timestamp,
                    event: 'graphql.request',
                    requestId,
                    type: context.operation?.operation ?? 'unknown',
                    fields: operationFields(context),
                    durationMs: Math.max(0, Date.now() - start),
                    status: errors.length ? 'error' : 'success',
                    errorCount: errors.length,
                    errorCodes: [...new Set(errors.map(safeErrorCode))],
                }
                const line = JSON.stringify(entry)
                if (errors.length) console.error(line)
                else console.log(line)
                const directory = process.env.LOG_DIR
                if (!directory) return
                try {
                    mkdirSync(directory, { recursive: true, mode: 0o700 })
                    const day = timestamp.slice(0, 10)
                    appendFileSync(join(directory, `graphql-${day}.log`), line + '\n', { mode: 0o600 })
                    if (errors.length) appendFileSync(join(directory, `graphql-errors-${day}.log`), line + '\n', { mode: 0o600 })
                } catch (error) {
                    logDiagnostic('graphql.log_write_failed', error)
                }
            },
        }
    },
}
