import { readFileSync } from 'fs'
import { join } from 'path'

// Carica lo schema GraphQL dal file .gql
const schemaPath = join(process.cwd(), 'app/graphql/schema.gql')
export const typeDefs = readFileSync(schemaPath, 'utf8')
