import Schema from './schema/Schema'
import Archimede from './schema/Archimede'
import Distrettuale from './schema/Distrettuale'
import AmmissioneSenior from './schema/AmmissioneSenior'
import Scuole from './schema/Scuole'

const schemaClasses: Array<new () => Schema> = [
    Archimede,
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
