/**
* Persistance interface
* Interface to interact with the persistance layer services
* @interface
*/ 

import { JsonType } from '../types/misc-types'
import { logger, errorHandler, MyError } from '../utils'
import { redisDb } from './redis'
import { fileSystem } from './fileMgmt'
import { Interaction, interactionFuncs, InteractionsType } from './models/interactions'
import { registrationFuncs, Registration, RegistrationnUpdateRedis, RegistrationNonSemantic } from './models/registrations'
import { Config } from '../config'
import { addConfigurationInfo, removeConfigurationInfo, updateRegistrationsInfo } from './models/configurations'
import { Thing } from '../types/wot-types'

// Constants

type RegistrationsType = 'registrations'
const REGISTRATIONS: RegistrationsType = 'registrations' 
type RegistrationOrInteractionBody = Registration | Interaction
type RegistrationOrInteractionEnum = InteractionsType | RegistrationsType

// Import/Export data to/from persistance

/**
 * Import configuration files to memory;
 * Does not overwrite, only loads interactions or registrations not existing previously;
 * NOTE: Use delete endpoints of API to remove old interactions or registrations;
 * on ENOENT error resolves an empty array;
 * on unexpected error resolves a boolean;
 * @async 
 * @param {string} type 
 * @returns array
 */  
export const loadConfigurationFile = async (type: RegistrationOrInteractionEnum): Promise<Registration[] | Interaction[]> => {
    try { 
        const file = await fileSystem.read(`${Config.HOME_PATH}/agent/imports/${type}.json`)
        const array = JSON.parse(file)
        const countRows = array.length
        if (countRows > 0) {
            if (type === REGISTRATIONS) {
                await registrationFuncs.storeInMemory(array)
            } else {
                await interactionFuncs.storeInMemory(array, type)
            }
            logger.info(`File ${type}.json, loaded ${countRows} elements`)
            return array
        } else {
            logger.info(`There are no ${type} available to load`)
            return array
        }
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Exports to file some hash stored in memory;
 * Additional backup possibility;
 * on error rejects boolean false;
 * @async
 * @param {string} type 
 * @returns boolean
 */
 export const saveConfigurationFile = async (type: RegistrationOrInteractionEnum): Promise<boolean> => {
    try { 
        let data: Interaction[] | Registration[]
        if (type === REGISTRATIONS) {
            data = await registrationFuncs.loadFromMemory()
        } else {
            data = await interactionFuncs.loadFromMemory(type)
        }
        await fileSystem.write(`${Config.HOME_PATH}/agent/exports/${type}.json`, JSON.stringify(data))
        return true
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return false
    }
}

// Work with data models in DB

/**
 * Add item to db
 * @async
 * @param {string} type 
 * @param {object} data 
 * @returns boolean 
 */
 export const addItem = async (type: RegistrationOrInteractionEnum, data: RegistrationOrInteractionBody): Promise<void> => {
    try {
        let result
        if (type === REGISTRATIONS && determineIfIsRegistration(data)) {
            await registrationFuncs.addItem(data)
        } else if (type !== REGISTRATIONS) {
            await interactionFuncs.addItem(data as Interaction, type)
        } else {
            throw new Error('Wrong type')
        }
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Update item in db
 * @async
 * @param {string} type 
 * @param {object} data 
 * @returns boolean 
 */
 export const updateItem = async (data: RegistrationnUpdateRedis): Promise<void> => {
    try {
        await registrationFuncs.updateItem(data)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Remove item from db
 * @async
 * @param {string} type 
 * @param {string} id 
 * @returns boolean  
 */
 export const removeItem = async (type: RegistrationOrInteractionEnum, ids: string | string[]): Promise<void> => {
    try {
        let result
        if (type === REGISTRATIONS) {
            await registrationFuncs.removeItem(ids)
        } else {
            await interactionFuncs.removeItem(ids, type)
        }
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new MyError(error.message, error.status)
    }
}

/** 
 * Get item from db;
 * Returns object if ID provided;
 * Returns array of ids if ID not provided;
 * @async
 * @param {string} type 
 * @param {string} id [OPTIONAL]
 * @returns object 
 */
 export const getItem = async (type: RegistrationOrInteractionEnum, id?: string): Promise<RegistrationNonSemantic | Interaction | string[]>  => {
    try {
        let result
        if (type === REGISTRATIONS) {
            result = await registrationFuncs.getItem(id)
        } else {
            result = await interactionFuncs.getItem(type, id)
        }
        return Promise.resolve(result)
    } catch (err) {
        const error = errorHandler(err)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Get count of items in model stored in db
 * @async
 * @param {string} type
 * @returns integer
 */
 export const getCountOfItems = async (type: RegistrationOrInteractionEnum): Promise<number> => {
    try {
        let result
        if (type === REGISTRATIONS) {
            result = await registrationFuncs.getCountOfItems()
        } else {
            result = await interactionFuncs.getCountOfItems(type)
        }
        return Promise.resolve(result)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Check if adapter ID is duplicated
 * @async
 * @param {string} adapterId
 * @returns boolean
 */
 export const existsAdapterId = async (adapterId: string): Promise<boolean> => {
    return registrationFuncs.existsAdapterId(adapterId)
}

/**
 * Check if new adapter ID is the same as the old
 * @async
 * @param {string} oid
 * @param {string} adapterId
 * @returns boolean
 */
 export const sameAdapterId = async (oid: string, adapterId: string): Promise<boolean> => {
    return registrationFuncs.sameAdapterId(oid, adapterId)
}

/**
 * Get OID by AdapterID
 * @async
 * @param {string} adapterId
 * @returns string
 */
 export const getOidByAdapterId = async (adapterId: string): Promise<string | undefined> => {
    return registrationFuncs.getOidByAdapterId(adapterId)
}

// Useful functionalities

/**
 * Get credentials for one OID;
 * From memory;
 * on error rejects boolean false;
 * @async
 * @param {string} oid
 * @returns string
 */
export const getCredentials = async (oid: string) => {
    try { 
        const credentials = await redisDb.hget(oid, 'credentials')
        return Promise.resolve(credentials)
    } catch (err) {
        const error = errorHandler(err)
        throw new MyError(error.message, error.status)
    }
}

/**
 * Check if incoming request is valid;
 * Oid exists in infrastructure and has pid;
 * on error rejects error object;
 * @async
 * @param {string} oid
 * @param {string} pid
 * @param boolean
 */
export const combinationExists = async (oid: string, pid: string) => {
    try {
        const exists = await redisDb.sismember('registrations', oid)
        if (!exists) {
            throw new Error(`Object ${oid} does not exist in infrastructure`)
        }
        const type = await redisDb.hget(oid, 'type')
        const properties = await redisDb.hget(oid, 'properties')
        if (type !== 'core:Service') {
            const p = properties != null ? properties.split(',') : []
            if (p.indexOf(pid) === -1) {
                throw new Error(`Object ${oid} does not have property ${pid}`)
            }
        }
        return Promise.resolve(true)
    } catch (err) {
        const error = errorHandler(err)
        throw new MyError(error.message, error.status)
    }    
}

export const isRegistered = async (oid: string): Promise<boolean> => {
    return Boolean(await redisDb.sismember('registrations', oid))
}

// Configuration info MANAGEMENT

/**
 * Store configuration information;
 * Needs to be removed first;
 * on error rejects error string;
 * @async
 * @returns boolean
 */
export const reloadConfigInfo = async function(cid: string, name: string, nodes: string[], partners: string[]): Promise<void> {
    try { 
        await removeConfigurationInfo()
        await addConfigurationInfo(cid, name, nodes, partners)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new Error('Problem storing configuration information...')
    }
}

/**
 * Update configuration of agent info, only registrations;
 * From memory;
 * on error rejects error string;
 * @async
 * @returns object
 */
 export const updateConfigurationInfo = async (): Promise<void>  => {
    try { 
        await updateRegistrationsInfo()
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new Error('Problem storing configuration information...')
    }
}

/**
 * Get configuration information;
 * From memory;
 * on error rejects error string;
 * @async
 * @returns object
 */
 export const getConfigInfo = async (): Promise<JsonType>  => {
    return redisDb.hgetall('configuration')
}

// CACHE

/**
 * Add property request to cache
 * Support for caching incoming requests
 * on error resolves false;
 * @async
 * @param {string} key path requested
 * @param {string} data data requested
 * @returns boolean
 */
 export const addToCache = async function(key: string, data: string) {
    try {
        await redisDb.set(key, data)
        return Promise.resolve(true)
    } catch (err) {
        const error = errorHandler(err)
        throw new MyError(error.message, error.status)
    }
}

// WoT
// Persist TDs in cache
// td:<oid>
// tds: [ <oids> ]

export const addTDtoCache = async function(key: string, data: string, remote: Boolean = false) {
    try {
        const ttl = remote ? Config.DB.REMOTE_TD_TTL : Config.DB.LOCAL_TD_TTL
        await redisDb.set('td:' + key, data, ttl)
        await redisDb.sadd('thingdescriptions', key)
        logger.debug('Added TD to cache: ' + key)
    } catch (err) {
        const error = errorHandler(err)
        logger.debug('Error adding TD to cache: ' + key)
        logger.error(error.message)
        return false
    }
}

export const deleteAllTDsfromCache = async function() {
    try {
        const keys = await redisDb.smembers('thingdescriptions')
        // logger.info(keys.toString())
        for (let i = 0, len = keys.length; i < len; i++) {
            logger.info('Removing TD from cache: td:' + keys[i])
                await delTDfromCache(keys[i].toString())
        }
    } catch (err) {
        logger.error('Error removing all TDs from cache')
    }
}

export const getTDfromCache = async function(key?: string): Promise<Thing | Thing[] | undefined > {
    try {
       if (key) {
            const tdStr = await redisDb.get('td:' + key)
            return tdStr ? JSON.parse(tdStr) as Thing : undefined
       } else {
            const keys = await redisDb.smembers('thingdescriptions')
            const tds = []
            for (let i = 0, len = keys.length; i <= len; i++) {
                const td = await redisDb.get('td:' + key)
                if (td) {
                    tds.push(JSON.parse(td))
                }
            }
            return tds as Thing[]
       }
    } catch (err) {
        const error = errorHandler(err)
        // TD is broken -> remove it 
        if (key) {
            await delTDfromCache(key)
        }
        logger.debug('Error getting TD from cache: ' + key)
        logger.error(error.message)
        return undefined
    }
}

export const delTDfromCache = async function(key: string) {
    try {
        await redisDb.remove('td:' + key)
        await redisDb.srem('thingdescriptions', key)
        logger.debug('Removed TD from cache: ' + key)
        return true
    } catch (err) {
        const error = errorHandler(err)
        logger.debug('Error removing TD from cache: ' + key)
        logger.error(error.message)
        return false
    }
}

// System Health

/**
 * Check Redis availability
 * on error resolves false;
 * @async
 * @returns string
 */
 export const redisHealth = async (): Promise<string> => {
    try {
        await redisDb.health()
        return Promise.resolve('OK')
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return Promise.resolve('ERROR')
    }
}

// Private functions

const determineIfIsRegistration = (toBeDetermined: RegistrationOrInteractionBody): toBeDetermined is Registration => {
    if ((toBeDetermined as Registration).type) {
      return true
    }
    return false
  }
