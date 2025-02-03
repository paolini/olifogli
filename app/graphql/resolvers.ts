import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Context } from './types';

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',
    me: (_:unknown, __: unknown, context: Context) => {
      const {user} = context 
      if (user) {
        return {
          email: user.email,
          uid: user.uid,
        };
      } else return null
    },
    data: async () => {
        const db = await getDb();
        const collection = db.collection('rows');
        const results = await collection.find({}).toArray();
        return results.map(doc => ({
            _id: doc._id.toString(),
            cognome: doc.cognome || '',
            nome: doc.nome || '',
            classe: doc.classe || '',
            sezione: doc.sezione || '',
            scuola: doc.scuola || '',
            data_nascita: doc.data_nascita || '',
            risposte: Array.isArray(doc.risposte)? doc.risposte : ['','','','','','','','','','','','','','','','','','','',''],
          }));  
    }
  },
  Mutation: {
    addRow: async (_: unknown, { cognome, nome, classe, sezione, scuola, data_nascita, risposte }: { 
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      const result = await collection.insertOne({ cognome, nome, classe, sezione, scuola, data_nascita, risposte });
      return {
          _id: result.insertedId.toString(),
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      };
    },
    updateRow: async (_: unknown, { _id, cognome, nome, classe, sezione, scuola, data_nascita, risposte }: {
        _id: string,
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.updateOne({ _id: new ObjectId(_id) }, { $set: { cognome, nome, classe, sezione, scuola, data_nascita, risposte } });
      return {
          _id,
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      }
    },
    deleteRow: async (_: unknown, { _id }: { _id: string }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.deleteOne({ _id: new ObjectId(_id) });
      return _id;
    },
  }
};
