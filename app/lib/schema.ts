import Schema from './schema/Schema'
import ArchimedeBiennio from './schema/ArchimedeBiennio'
import ArchimedeTriennio from './schema/ArchimedeTriennio'
import Distrettuale from './schema/Distrettuale'
import AmmissioneSenior from './schema/AmmissioneSenior'
import Scuole from './schema/Scuole'

const schemaClasses: Array<new () => Schema> = [
    ArchimedeBiennio,
    ArchimedeTriennio,
    Distrettuale,
    AmmissioneSenior,
    Scuole,
]

export const schemas = Object.fromEntries(
    schemaClasses.map(SchemaClass => {
        const instance = new SchemaClass()
        return [instance.name, instance]
    })
)
