import { ObjectId } from 'mongodb';
import { getUsersCollection } from '@/app/lib/models';
import ApolloProviderClient from '@/app/ApolloProviderClient';
import Error from '@/app/components/Error'

export default async function UserPage({ params }:{params: Promise<{userId: string}>}) {
    const userId = (await params).userId;
    const usersCollection = await getUsersCollection();
    const user = await (usersCollection.findOne({_id: new ObjectId(userId)}));    
    if (!user) return <Error error="User not found" />;
    return <ApolloProviderClient> 
        <h1>{user.uid}</h1>
    </ApolloProviderClient>
}