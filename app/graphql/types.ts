import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { ObjectId } from 'mongodb';
import { GraphQLScalarType, Kind, ValueNode } from "graphql";

export type Context = {
  req: NextRequest
  res: Response|undefined
  user_id?: ObjectId
  is_admin?: boolean
}

export const Timestamp = new GraphQLScalarType({
  name: "Timestamp",
  description: "A custom scalar for timestamps",
  
  parseValue(value: unknown): Date | null {
    if (typeof value === "number") return new Date(value); // Se è un numero, lo converte in Date
    if (typeof value === "string") return new Date(value); // Se è una stringa ISO, lo converte in Date
    return null; // Se non è un valore valido, ritorna null
  },

  serialize(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString(); // Converte in stringa ISO
    return null; // Se non è una data valida, ritorna null
  },

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return new Date(parseInt(ast.value, 10)); // Converte un numero in Date
    }
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value); // Converte una stringa ISO in Date
    }
    return null; // Se il tipo non è supportato, ritorna null
  }
});

export const ObjectIdType = new GraphQLScalarType({
  name: "ObjectId",
  description: "A custom scalar for MongoDB ObjectID",
  
  parseValue(value: unknown): ObjectId {
    switch(typeof value) {
      case "string":
      case "number":
        return new ObjectId(value); // Converte in ObjectId
      case "object":
        if (value instanceof ObjectId) return value; // Se è già un ObjectId, lo ritorna
      default:
        throw new Error("ObjectId must be a 24 digit hex string or a 12 byte Buffer");
    }
  },

  serialize(value: unknown): string {
    if (value instanceof ObjectId) return value.toString(); // Converte in stringa
    throw new Error("ObjectId expected");
  },

  parseLiteral(ast: ValueNode): ObjectId {
    if (ast.kind === Kind.STRING) {
      return new ObjectId(ast.value); // Converte in ObjectId
    }
    throw new Error("ObjectId must be a 24 digit hex string");
  }
});

