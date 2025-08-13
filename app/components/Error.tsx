import { ApolloError } from '@apollo/client';
import { useState } from 'react';

interface GraphQLErrorExtension {
  code?: string;
  stacktrace?: string[];
}

interface GraphQLError {
  message: string;
  extensions?: GraphQLErrorExtension;
  locations?: { line: number; column: number }[];
}

export type ErrorType = Error

export default function Error({ error, dismiss }: { 
    error: ErrorType|string|null|undefined 
    dismiss?: () => void
}) {
    const [showDetails, setShowDetails] = useState(false)
    if (!error) return null // No error to display

    const { message, details } = parse(error)

    return <div className="p-2 text-red-600 bg-red-100 border border-red-400">
        {details && <span className="mr-2 cursor-pointer" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? '▼' : '▶' }
        </span>}
        <b>{message}</b>
        {dismiss && <span className="ml-2 cursor-pointer font-bold hover:text-red-800" onClick={dismiss}>
            ✕
        </span>}
        {showDetails && <>
            <hr />
            {details}
        </>}
    </div>

    function parse(error: ErrorType|string) {
        if (typeof error === 'string') {
            return { message: error, details: null }
        } else if (error instanceof ApolloError) {
            return apolloError(error)
        } else {
            return { message: error.message, details: error.stack }
        }
    }

    function apolloError(error: ApolloError) {
        let causeDetails = null
        // Try to extract GraphQL error details if present
        const cause = error.cause as { result?: { errors?: GraphQLError[] } } | undefined
        const gqlErrors = cause && cause.result && Array.isArray(cause.result.errors)
            ? cause.result.errors
            : null
        if (gqlErrors) {
            causeDetails = gqlErrors.map((err, idx) => (
                <div key={idx} className="mb-2">
                    <div className="font-bold">{err.message}</div>
                    {err.extensions?.code && <div className="text-xs">Codice: {err.extensions.code}</div>}
                    {err.locations && <pre className="text-xs">{JSON.stringify(err.locations, null, 2)}</pre>}
                    {err.extensions?.stacktrace && (
                        <details>
                            <summary>Stacktrace</summary>
                            <pre className="text-xs overflow-x-auto">{err.extensions.stacktrace.join('\n')}</pre>
                        </details>
                    )}
                </div>
            ))
        } else if (cause) {
            causeDetails = <pre className="bg-red-100 text-red-700 p-2 mt-2 rounded text-xs overflow-x-auto">{typeof cause === 'string' ? cause : JSON.stringify(cause, null, 2)}</pre>
        }
        return {message: error.message, details: causeDetails}
    }
}
