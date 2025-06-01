import { ApolloError } from '@apollo/client';

export default function ErrorElement({ error, dismiss }: { 
    error: ApolloError|Error|string,
    dismiss?: () => void,
}) {
    const message = typeof error === 'string' ? error : error.message
    return <div className="bg-error p-2">
        Errore: {message} 
        {dismiss && <button className="mx-2 px-2 bg-error" onClick={dismiss}>x</button>}
    </div>;
}