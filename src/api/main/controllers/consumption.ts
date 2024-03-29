// Controller common imports
import { expressTypes } from '../../../types/index'
import { HttpStatusCode } from '../../../utils/http-status-codes'
import { logger, errorHandler, MyError } from '../../../utils'
import { responseBuilder } from '../../../utils/response-builder'

// Other imports
import { JsonType } from '../../../types/misc-types'
import { gateway } from '../../../microservices/gateway'
import { GatewayResponse } from '../../../types/gateway-types'
// import { useMapping } from '../../../core/mapping'
import { Config } from '../../../config'
import { addTDtoCache, getTDfromCache } from '../../../persistance/persistance'
import { Thing } from '../../../types/wot-types'

// ***** Consume remote resources *****

type getPropertyCtrl = expressTypes.Controller<{ id: string, oid: string, pid: string }, {}, JsonType, any, {}>

/**
 * Request remote property
 */
 export const getProperty: getPropertyCtrl = async (req, res) => {
    const { id, oid, pid } = req.params
    const reqParams = req.query
      try {
        const td = await getTdForOutcomingRequest(oid)
        logger.debug(`TD of ${oid} retrieved`)
        // td is not used now, but later we can check how to retrieve the property
        const data = await gateway.getProperty(id, oid, pid, reqParams)
        // Parse response to get only the final payload
        if (data.error) {
          const response: string = data.statusCodeReason
          logger.warn(`Property ${pid} of ${oid} could not be retrieved`)
          return responseBuilder(data.statusCode, res, response)
        } else {
          const response = data.message[0].message.wrapper
          logger.debug(`Property ${pid} of ${oid} received`)
          return responseBuilder(HttpStatusCode.OK, res, null, response)
        }      
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
  }

type setPropertyCtrl = expressTypes.Controller<{ id: string, oid: string, pid: string }, JsonType, JsonType, GatewayResponse, {}>

/**
 * Set remote property
 */
export const setProperty: setPropertyCtrl = async (req, res) => {
    const { id, oid, pid } = req.params
    const body = req.body
    const reqParams = req.query
    try {
      if (!body) {
        logger.warn('Missing body')
        return responseBuilder(HttpStatusCode.BAD_REQUEST, res, null)
      }
      const td = await getTdForOutcomingRequest(oid)
      logger.debug(`TD of ${oid} retrieved`)
      // td is not used now, but later we can check how to retrieve the property
      const data = await gateway.putProperty(id, oid, pid, body, reqParams)
      // Parse response to get only the final payload
      if (data.error) {
        const response: string = data.statusCodeReason
        logger.warn(`Property ${pid} of ${oid} could not be set`)
        return responseBuilder(data.statusCode, res, response)
      } else {
        const response = data.message[0].message.wrapper
        logger.debug(`Property ${pid} of ${oid} set`)
        return responseBuilder(HttpStatusCode.OK, res, null, response)
      }      
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type getEventChannelsCtrl = expressTypes.Controller<{ id: string, oid: string }, {}, {}, JsonType[], {}>

/**
 * Create event channel
 */
export const getEventChannels: getEventChannelsCtrl = async (req, res) => {
    const { id, oid } = req.params
    try {
      const data = await gateway.getObjectEventChannels(id, oid)
      _parse_gtw_response(data)
      logger.info(`Channels of ${oid} retrieved`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type activateEventChannelCtrl = expressTypes.Controller<{ id: string, eid: string }, {}, {}, string, {}>

/**
 * Create event channel
 */
export const activateEventChannel: activateEventChannelCtrl = async (req, res) => {
    const { id, eid } = req.params
    try {
      const data = await gateway.activateEventChannel(id, eid)
      _parse_gtw_response(data)
      logger.info(`Channel ${eid} of ${id} activated`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.statusCodeReason)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type publishEventCtrl = expressTypes.Controller<{ id: string, eid: string }, string, {}, string, {}>

/**
 * Publish event to channel
 */
    export const publishEvent: publishEventCtrl = async (req, res) => {
    const { id, eid } = req.params
    const body = req.body
    const ts = String(req.headers['x-timestamp'])
    const mappingString = String(req.headers['x-mapping']).toLowerCase()
    try {
        if (!body) {
          logger.warn('Missing body')
          return responseBuilder(HttpStatusCode.BAD_REQUEST, res, null)
        } 
        // JSON parse 
        let parsedBody
        try {
          parsedBody = JSON.parse(body)
        } catch (error) {
          parsedBody = body
        }
        // do mappings if enabled
        let mappingEnabled = Config.ADAPTER.USE_MAPPING
        // Override mapping if header is present
        if (mappingString === 'true') {
            mappingEnabled = true
        } else if (mappingString === 'false') {
            mappingEnabled = false
        }
        // check if wot is enabled and mapping is enabled - MAPPING IS DISABLED FOR NOW
        // const toSend = Config.WOT.ENABLED && mappingEnabled ? await useMapping(id, eid, parsedBody, ts) : parsedBody
        const toSend = parsedBody
        const data = await  gateway.publishEvent(id, eid, { wrapper: toSend })
        _parse_gtw_response(data)
        logger.info(`Message sent to channel ${eid} of ${id}`)
        return responseBuilder(HttpStatusCode.OK, res, null, data.statusCodeReason)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type deactivateEventChannelCtrl = expressTypes.Controller<{ id: string, eid: string }, {}, {}, string, {}>

/**
 * Deactivate event channel
 */
export const deactivateEventChannel: deactivateEventChannelCtrl = async (req, res) => {
    const { id, eid } = req.params
    try {
      const data = await gateway.deactivateEventChannel(id, eid)
      _parse_gtw_response(data)
      logger.info(`Channel ${eid} of ${id} deactivated`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.statusCodeReason)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type statusRemoteEventChannelCtrl = expressTypes.Controller<{ id: string, oid: string, eid: string }, {}, {}, string, {}>

/**
 * Status of remote event channel
*/
export const statusRemoteEventChannel: statusRemoteEventChannelCtrl = async (req, res) => {
    const { id, oid, eid } = req.params
    try {
      const data = await gateway.statusRemoteEventChannel(id, oid, eid)
      _parse_gtw_response(data)
      logger.info(`Get status of remote channel ${eid} of ${oid}`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message as unknown as string)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type subscribeRemoteEventChannelCtrl = expressTypes.Controller<{ id: string, oid: string, eid: string }, {}, {}, string, {}>

/**
 * Subscribe remote event channel
*/
export const subscribeRemoteEventChannel: subscribeRemoteEventChannelCtrl = async (req, res) => {
    const { id, oid, eid } = req.params
    try {
      const data = await gateway.subscribeRemoteEventChannel(id, oid, eid)
      _parse_gtw_response(data)
      logger.info(`Subscribed to remote channel ${eid} of ${oid}`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.statusCodeReason)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type unsubscribeRemoteEventChannelCtrl = expressTypes.Controller<{ id: string, oid: string, eid: string }, {}, {}, string, {}>

/**
 * Unsubscribe remote event channel
 */
export const unsubscribeRemoteEventChannel: unsubscribeRemoteEventChannelCtrl = async (req, res) => {
    const { id, oid, eid } = req.params
    try {
        const data = await gateway.unsubscribeRemoteEventChannel(id, oid, eid)
        _parse_gtw_response(data)
        logger.info(`Unsubscribed to remote channel ${eid} of ${oid}`)
        return responseBuilder(HttpStatusCode.OK, res, null, data.statusCodeReason)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

// Private functions

const _parse_gtw_response = (data: GatewayResponse): void => {
  if (data.statusCode >= 500) {
    throw new MyError(data.statusCodeReason, HttpStatusCode.INTERNAL_SERVER_ERROR)
  } else if (data.statusCode === 400) {
    throw new MyError(data.statusCodeReason, HttpStatusCode.BAD_REQUEST)
  } else if (data.statusCode === 401) {
    throw new MyError(data.statusCodeReason, HttpStatusCode.UNAUTHORIZED)
  } else if (data.statusCode === 404) {
    throw new MyError(data.statusCodeReason, HttpStatusCode.NOT_FOUND)
  }  else if (data.statusCode > 400) {
    throw new MyError(data.statusCodeReason, HttpStatusCode.INTERNAL_SERVER_ERROR)
  } 
}

export const getTdForOutcomingRequest = async (oid: string): Promise<Thing> => {
   // Retrieve TD (cache or from remote)
   const cached_td = await getTDfromCache(oid) 
   if (cached_td) {
     // logger.debug('TD retrieved from cache')
     return cached_td as Thing
     // Use TD later for detail extraction
   } else {
     // get remote agid
     const agid = (await gateway.getAgentByOid(oid)).message
     const td = (await gateway.discoveryRemote(agid, { oids: oid })).message
     // cache TD
     await addTDtoCache(oid, JSON.stringify(td), true)
     return td as any as Thing
   }
}
