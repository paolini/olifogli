import type { 
  ApolloServerPlugin, 
  GraphQLRequestListener,
  GraphQLRequestContext 
} from '@apollo/server'
import { Context } from './types'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// Crea la directory dei log se non esiste
// (eseguito una sola volta all'avvio del modulo)
const logDir = process.env.LOG_DIR
if (logDir) {
  try {
    if (!existsSync(logDir)) {
      console.log(`Creating log directory at ${logDir}`)
      mkdirSync(logDir, { recursive: true })
    }
  } catch (err) {
    console.error('Failed to create log directory:', err)
  }
} else {
    console.warn('LOG_DIR is not defined. GraphQL logs will not be saved to file.')
}

interface LogEntry {
  timestamp: string
  type: 'query' | 'mutation'
  operation: string
  userId?: string
  email?: string
  variables?: Record<string, any>
  duration?: number
  error?: string
  status: 'success' | 'error'
}

/**
 * Plugin Apollo per logging automatico di tutte le richieste GraphQL
 * 
 * Logga:
 * - Tutte le query e mutation
 * - Utente che esegue l'operazione
 * - Variabili della richiesta
 * - Durata dell'operazione
 * - Errori eventuali
 */
export const graphqlLoggerPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart(
    requestContext: GraphQLRequestContext<Context>
  ): Promise<GraphQLRequestListener<Context> | void> {
    const startTime = Date.now()
    const operation = requestContext.request.operationName || 'anonymous'
    
    return {
      async willSendResponse(requestContext) {
        const duration = Date.now() - startTime
        const context = requestContext.contextValue
        const errors = requestContext.errors
        
        // Determina il tipo di operazione
        const operationType = requestContext.operation?.operation || 'unknown'
        
        // Recupera email utente dal context (già presente nel token NextAuth)
        const userEmail = context.email
        
        // Prepara l'entry di log
        const logEntry: LogEntry = {
          timestamp: new Date().toISOString(),
          type: operationType as 'query' | 'mutation',
          operation,
          userId: context.user_id?.toString(),
          email: userEmail,
          variables: requestContext.request.variables,
          duration,
          status: errors ? 'error' : 'success',
          error: errors?.[0]?.message,
        }
        
        // Log su console (in produzione andrà su Docker logs)
        const logLine = formatLogEntry(logEntry)
        if (logEntry.status === 'error') {
          console.error(logLine)
        } else {
          console.log(logLine)
        }
        
        // salva anche su file persistente
        // se LOG_DIR è definita
        const logDir = process.env.LOG_DIR
        if (logDir) {
          writeLogToFile(logDir, logLine, logEntry.status === 'error')
        }
      },
    }
  },
}

/**
 * Formatta il log entry in formato leggibile
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, type, operation, email, duration, status, error, variables } = entry
  
  const parts = [
    `[${timestamp}]`,
    `${type.toUpperCase()}`,
    operation,
    email ? `user=${email}` : 'anonymous',
    `${duration}ms`,
    status === 'error' ? `ERROR: ${error}` : 'OK'
  ]
  
  // aggiungi le variabili
  if (variables && Object.keys(variables).length > 0) {
    parts.push(`vars=${JSON.stringify(variables)}`)
  }
  
  return parts.join(' | ')
}

/**
 * Scrive i log su file persistente (solo in produzione)
 * I file vengono salvati in /app/logs che è montato come volume Docker
 */
function writeLogToFile(logDir: string, logLine: string, isError: boolean): void {
  try {
    const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    
    // File principale
    const mainLogFile = join(logDir, `graphql-${date}.log`)
    appendFileSync(mainLogFile, logLine + '\n', 'utf8')
    
    // File errori separato (più facile da monitorare)
    if (isError) {
      const errorLogFile = join(logDir, `graphql-errors-${date}.log`)
      appendFileSync(errorLogFile, logLine + '\n', 'utf8')
    }
  } catch (err) {
    // Non bloccare l'applicazione se non riesci a scrivere su file
    // Logga solo su console
    console.error('Failed to write log to file:', err)
  }
}
