// Global packages
import { IItemPrivacy } from '../../types/misc-types'
import { logger } from '../../utils/logger'
import { redisDb } from '../redis'
import { Thing } from '../../types/wot-types'
import { MyError } from '../../utils/error-handler'
import { HttpStatusCode } from '../../utils/http-status-codes'

/**
 * registrations.js
 * registrations model
 * [registrations] list in REDIS contains registered OIDs
 * Each OID is a hash in REDIS with the following fields:
 * oid, type, credentials, password, adapterId, name, properties, events, agents
*/

// Human readable privacy

const PRIV_ARRAY = ['Private', 'For Friends', 'Public']

export enum ItemPrivacy {
    PUBLIC = 2,
    FOR_FRIENDS = 1,
    PRIVATE = 0
}

export enum ItemStatus {
    ENABLED = 'Enabled',
    DISABLED = 'Disabled',
}

// Labels 

export enum ItemDomainType {
    ENERGY = 'Energy',
    UNDEFINED = 'Undefined',
    MOBILITY = 'Mobility',
    HEALTH = 'Health',
    FARMING = 'Farming',
    TOURISM = 'Tourism',
    WEATHER = 'Weather',
    INDOORQUALITY = 'Indoor quality'
}

export type ItemLabelsObj = {
    domain: ItemDomainType,
}

// Registration input types

export interface Base {
    labels?: ItemLabelsObj
    avatar?: string
    groups?: string[]
    privacy?: ItemPrivacy,
}

export interface RegistrationJSON extends Base {
    oid?: string,
    type?: string
    name: string
    adapterId?: string
    properties?: string[]
    events?: string[]
    actions?: string[]
    version?: string
    description?: string
}

export interface RegistrationJSONTD extends Base {
    oid?: string,
    td: Thing
}

// Update input types

export interface UpdateJSON extends Base {
    oid: string,
    type: string
    name: string
    adapterId: string
    properties?: string[]
    events?: string[]
    actions?: string[]
    version?: string
    description?: string
}

export interface UpdateJSONTD extends Base {
    oid?: string,
    td: Thing
}

export interface RegistrationNonSemantic {
    type: string
    name: string
    adapterId?: string
    properties?: string[]
    labels?: ItemLabelsObj
    avatar?: string
    groups?: string[]
    events?: string[]
    actions?: string[]
    version?: string
    description?: string
    privacy?: string,
    status?: string
}

export interface RegistrationSemantic {
    type?: string
    adapterId?: string
    labels?: ItemLabelsObj
    avatar?: string
    groups?: string[]
    version?: string
    description?: string
    privacy?: string,
    td?: Thing
}

export interface RegistrationnUpdateRedis {
    oid: string
    adapterId?: string
    name?: string
    description?: string
    properties?: string // Stringify to register in REDIS
    events?: string // Stringify to register in REDIS
    actions?: string // Stringify to register in REDIS
}

export interface RegistrationnUpdateNm {
    oid: string
    adapterId?: string
    name?: string
    labels?: ItemLabelsObj
    avatar?: string
    groups?: string[]
    version?: string
    description?: string
}

export interface UpdateBody extends Base {
    oid: string
    adapterId: string
    name: string
    properties?: string // Stringify to register in REDIS
    events?: string // Stringify to register in REDIS
    actions?: string // Stringify to register in REDIS
    description?: string
}

// Body ready to register
export interface RegistrationBody extends Base {
    type: string
    adapterId: string
    name: string
    properties?: string // Stringify to register in REDIS
    events?: string // Stringify to register in REDIS
    actions?: string // Stringify to register in REDIS
    description?: string
    oid: string
}

// Complete registration type after item is registered in AURORAL
// Item stored in REDIS
export interface Registration extends RegistrationBody {
    privacy?: ItemPrivacy
    credentials: string
    password: string
    created: string
}

export const registrationFuncs = {
    // Store array of whole model in db
    storeInMemory: async (array: Registration[]): Promise<void> => {
        await storeItems(array)
    },
    // Get array of whole model from db
    loadFromMemory: async (): Promise<Registration[]> => {
        const oids = await redisDb.smembers('registrations')
        return Promise.all(oids.map(async (it) => {
            return redisDb.hgetall(it) as unknown as Registration
        }))
    },
    // Add item to db
    addItem: async (data: Registration): Promise<void> => {
        await storeItems([data])
    },
    // update sotred item
    updateItem: async (item: RegistrationnUpdateRedis): Promise<void> => {
        if (!item.oid) {
            throw new MyError('Object with misses some oid, its update could not be stored...', HttpStatusCode.BAD_REQUEST)
        }
        const exists = await redisDb.sismember('registrations', item.oid)
        if (exists) {
            if (item.name) {
                await redisDb.hset(item.oid, 'name', item.name)
            }
            if (item.adapterId) {
                await redisDb.hset(item.oid, 'adapterId', item.adapterId)
            }
            
            // Remove old interactions
            redisDb.hdel(item.oid, 'properties')
            redisDb.hdel(item.oid, 'events')
            redisDb.hdel(item.oid, 'actions')

            // Add new interactions
            if (item.properties) {
                redisDb.hset(item.oid, 'properties', item.properties)
            }
            if (item.events) {
                redisDb.hset(item.oid, 'events', item.events)
            }
            if (item.actions) {
                redisDb.hset(item.oid, 'actions', item.actions)
            }
        } else {
            throw new MyError('Object does not exists - not updated', HttpStatusCode.NOT_FOUND)
        }
    },
    // Remove item from db
    removeItem: async (ids: string | string[]): Promise<void> => {
        if (typeof ids === 'string') {
            ids = [ids]
        }
        for (let i = 0, l = ids.length; i < l; i++) {
            const oid = ids[i]
            const todo = []
            const adapterId = await redisDb.hget(oid, 'adapterId') as string
            todo.push(redisDb.srem('registrations', oid))
            todo.push(redisDb.srem('adapterIds', adapterId))
            todo.push(redisDb.hdel(adapterId, 'oid'))
            todo.push(redisDb.hdel(oid, 'credentials'))
            todo.push(redisDb.hdel(oid, 'password'))
            todo.push(redisDb.hdel(oid, 'type'))
            todo.push(redisDb.hdel(oid, 'name'))
            todo.push(redisDb.hdel(oid, 'created'))
            todo.push(redisDb.hdel(oid, 'adapterId'))
            todo.push(redisDb.hdel(oid, 'properties'))
            todo.push(redisDb.hdel(oid, 'events'))
            todo.push(redisDb.hdel(oid, 'actions'))
            todo.push(redisDb.hdel(oid, 'privacy'))
            await Promise.all(todo)
        }
        // Persist changes to dump.rdb
        redisDb.save()
    },
    // Get item from db;
    // Returns object if ID provided;
    // Returns array of ids if ID not provided;
    getItem: async (id?: string): Promise<RegistrationNonSemantic | string[]> => {
        if (id) {
            if (await redisDb.sismember('registrations', id)) {
                const data = await redisDb.hgetall(id)
                // Return to user
                // Do not return credentials or password!!
                return {
                    type: data.type,
                    adapterId: data.adapterId,
                    name: data.name,
                    version: data.version,
                    description: data.description,
                    privacy: PRIV_ARRAY[Number(data.privacy)],
                    status: data.status ? data.status : 'Disabled',
                    properties: data.properties ? data.properties.split(',') : undefined,
                    actions: data.actions ? data.actions.split(',') : undefined,
                    events: data.events ? data.events.split(',') : undefined,
                }
            } else {
                throw new MyError('Item not found', HttpStatusCode.NOT_FOUND)
            }
        } else {
            return redisDb.smembers('registrations')
        }
    },
  
    // Set item privacy in registration set
    setPrivacyAndStatus: async (items: IItemPrivacy[]): Promise<void> => {
        await Promise.all(items.map(async it => {
                await redisDb.hset(it.oid, 'privacy', String(it.privacy))
                if (it.status) {
                    await redisDb.hset(it.oid, 'status', String(it.status))
                } 
            })
        )
        await redisDb.hset('configuration', 'last_privacy_update', new Date().toISOString())
    },
    // Get item from db;
    // Returns privacy if ID provided;
    // Returns array all oids with privacy if ID not provided;
    getPrivacy: async (id?: string): Promise<ItemPrivacy | IItemPrivacy[]> => {
        // TBD display time last updated and maybe restrict access if older than 1 day
        if (id) {
            return redisDb.hget(id, 'privacy') as unknown as Promise<ItemPrivacy>
        } else {
            const items = await redisDb.smembers('registrations')
            return Promise.all(
                items.map(async (it): Promise<IItemPrivacy> => {
                    return {
                        oid: it,
                        privacy: await redisDb.hget(it, 'privacy') as unknown as ItemPrivacy
                    }
                })
            )
        }
    },
    // Get count of items in model stored in db
    getCountOfItems: async (): Promise<number> => {
        return redisDb.scard('registrations')
    },
    existsAdapterId: async (adapterId: string): Promise<boolean> => {
        const exists = await redisDb.sismember('adapterIds', adapterId)
        return exists
    },
    sameAdapterId: async (oid: string, adapterId: string): Promise<boolean> => {
        const oldAdapterId = await redisDb.hget(oid, 'adapterId')
        if (oldAdapterId === adapterId) {
            return true
        } else {
            throw new MyError('REGISTRATION ERROR: On update is not allowed to change adapterId', HttpStatusCode.FORBIDDEN)
        }
    },
    getOidByAdapterId: async (adapterId: string): Promise<string | undefined> => {
        return redisDb.hget(adapterId, 'oid')
    }
}

// Private functions
const storeItems = async (array: Registration[]) => {
    for (let i = 0, l = array.length; i < l; i++) {
        const data = array[i]
        const todo = []
        if (!data.credentials || !data.password || !data.adapterId || !data.name || !data.type) {
            throw new MyError(`Object with oid ${data.oid} misses some fields, its credentials could not be stored...`, HttpStatusCode.BAD_REQUEST)
        }
        const exists = await redisDb.sismember('registrations', data.oid)
        if (!exists) {
            todo.push(redisDb.sadd('registrations', data.oid)) // Registrations array
            todo.push(redisDb.sadd('adapterIds', data.adapterId)) // AdapterIDs array
            todo.push(redisDb.hset(data.adapterId, 'oid', data.oid))
            todo.push(redisDb.hset(data.oid, 'oid', data.oid))
            todo.push(redisDb.hset(data.oid, 'credentials', data.credentials))
            todo.push(redisDb.hset(data.oid, 'password', data.password))
            todo.push(redisDb.hset(data.oid, 'adapterId', data.adapterId))
            todo.push(redisDb.hset(data.oid, 'name', data.name))
            todo.push(redisDb.hset(data.oid, 'created', data.created))
            todo.push(redisDb.hset(data.oid, 'type', data.type))
            if (data.properties) {
                todo.push(redisDb.hset(data.oid, 'properties', data.properties))
            }
            if (data.events) {
                todo.push(redisDb.hset(data.oid, 'events', data.events))
            }
            if (data.actions) {
                todo.push(redisDb.hset(data.oid, 'actions', data.actions))
            }
            await Promise.all(todo)
        } else {
            logger.warn(`OID: ${data.oid} is already stored in memory.`)
        }
    }
    // Persist changes to dump.rdb
    redisDb.save()
}
