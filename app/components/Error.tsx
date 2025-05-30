import { ApolloError } from '@apollo/client';

export default function Error({ error, dismiss }: { 
    error: ApolloError|string,
    dismiss?: () => void,
}) {
    const message = error instanceof ApolloError ? error.message : error;
    return <div className="bg-error p-2">
        Errore: {message} 
        {dismiss && <button className="mx-2" onClick={dismiss}>[x]</button>}
    </div>;
}