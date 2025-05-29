import { ApolloError } from '@apollo/client';

export default function Error({ error }: { error: ApolloError|string }) {
    const message = error instanceof ApolloError ? error.message : error;
    return <div className="bg-error">Errore: {message}</div>;
}