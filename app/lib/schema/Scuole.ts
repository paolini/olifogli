import {ObjectId} from 'bson'
import { Field } from './fields'
import Schema from './Schema'
import { Row } from '../models'

export default class Scuole extends Schema {
    constructor() {
        super('scuole', 'scuole e referenti', [
            new Field('ID_iscrizione', 'ID iscrizione'),
            new Field('ID_scuola', 'ID scuola'),
            new Field('Codice_meccanografico', 'Codice meccanografico'),
            new Field('Tipo_scuola', 'Tipo scuola'),
            new Field('Nome_scuola', 'Nome scuola'),
            new Field('Indirizzo_scuola', 'Indirizzo scuola'),
            new Field('CAP_scuola', 'CAP scuola'),
            new Field('Città_scuola', 'Città scuola'),
            new Field('Provincia_scuola', 'Provincia scuola'),
            new Field('Sigla_provincia_scuola', 'Sigla provincia scuola'),
            new Field('Regione_scuola', 'Regione scuola'),
            new Field('Email_scuola', 'Email scuola'),
            new Field('Data_creazione', 'Data creazione'),
            new Field('Nome_referente', 'Nome referente'),
            new Field('Cognome_referente', 'Cognome referente'),
            new Field('Email_referente', 'Email referente'),
            new Field('Cellulare_referente', 'Cellulare referente'),
            new Field('Data_invalidazione', 'Data invalidazione'),
        ])
    }

    row_to_sheet_data(row: Row) {
        const email = row.data?.Email_referente || ''
        return {
            schema: "archimede",
            name: row.data?.Codice_meccanografico || '',
            permittedEmails: email ? [email] : [],
            commonData: {
                Nome_scuola: row.data?.Nome_scuola || '',                
            }
        }
    }
}
