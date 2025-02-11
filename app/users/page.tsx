import { WithId } from "mongodb"
import { User, getUsersCollection } from "../lib/models"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function Users() {
    const collection = await getUsersCollection();
    const users = await collection.find({}).toArray();

    return <>
        <h1>utenti</h1>
        <table>
            <thead>
                <tr>
                    <th>uid</th>
                </tr>
            </thead>
            <tbody>
                {users.map((user:WithId<User>) => <tr key={user._id.toString()}>
                    <td><Link href={`/user/${user._id}`}>{user.uid}</Link></td>
                </tr>)}
            </tbody>
        </table>
    </>
}
