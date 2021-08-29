// Controller common imports
import { expressTypes } from '../../types/index'
import { HttpStatusCode } from '../../utils/http-status-codes'
import { logger } from '../../utils/logger'
import { responseBuilder } from '../../utils/response-builder'

// Other imports
import { JsonType } from '../../types/misc-types'
import { gateway } from '../../microservices/gateway'
import { gtwServices } from '../../core/gateway'
import { BasicArrayResponse, ConsumptionResponse, RegistrationResultPost, TdsResponse } from '../../types/gateway-types'
import { PreRegistration } from '../../persistance/models/registrations'
import { removeItem } from '../../persistance/persistance'

// Controllers

type loginCtrl = expressTypes.Controller<{ id?: string }, {}, {}, null, {}>

/**
 * Login endpoint
 * @param {string} id [OPTIONAL - If absent use gateway OID]
 */
export const login: loginCtrl = async (req, res) => {
  const { id } = req.params
	try {
    await gateway.login(id)
    return responseBuilder(HttpStatusCode.OK, res, null, null)
	} catch (err) {
		logger.error(err.message)
		return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
	}
}
 
type logoutCtrl = expressTypes.Controller<{ id?: string }, {}, {}, null, {}>

/**
 * Logout endpoint
 * @param {string} id [OPTIONAL - If absent use gateway OID]
 */
export const logout: logoutCtrl = async (req, res) => {
  const { id } = req.params
	try {
    await gateway.logout(id)
    return responseBuilder(HttpStatusCode.OK, res, null, null)
	} catch (err) {
		logger.error(err.message)
		return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
	}
}

type getRegistrationsCtrl = expressTypes.Controller<{}, {}, {}, TdsResponse, {}>

/**
 * Retrieve things registered in the platform
 */
export const getRegistrations: getRegistrationsCtrl = async (req, res) => {
	try {
    const data = await gateway.getRegistrations()
    return responseBuilder(HttpStatusCode.OK, res, null, data)
	} catch (err) {
		logger.error(err.message)
		return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
	}
}

type postRegistrationsCtrl = expressTypes.Controller<{}, PreRegistration | PreRegistration[], {}, RegistrationResultPost[], {}>

/**
 * Register things in the platform
 */
export const postRegistrations: postRegistrationsCtrl = async (req, res) => {
    const body = req.body
    try {
        // Add OID to registration objects
        // TBD Validate and Store TD in WoT** (Build TD from user input based on ontology)
        // TBD Once ontology ready do not hardcode type device
        // Register TD in NM (Dont send type nor interaction patterns)
        const result = await gtwServices.registerObject(body)
        // TBD Unregister from WoT on Error
        return responseBuilder(HttpStatusCode.OK, res, null, result)
	} catch (err) {
		logger.error(err.message)
		return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
	}
}

type removeRegistrationsCtrl = expressTypes.Controller<{}, { oids: string[] }, {}, null, {}>

/**
 * Remove registered object endpoint
 */
export const removeRegistrations: removeRegistrationsCtrl = async (req, res) => {
    const body = req.body
    try {
        await gateway.removeRegistrations(body)
        await removeItem('registrations', req.body.oids)
    return responseBuilder(HttpStatusCode.OK, res, null, null)
	} catch (err) {
		logger.error(err.message)
		return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
	}
}

type discoveryCtrl = expressTypes.Controller<{ id?: string }, {}, {}, BasicArrayResponse, {}>

/**
 * Discovery endpoint
 * Check what remote objects can you see
 */
 export const discovery: discoveryCtrl = async (req, res) => {
    const { id } = req.params
      try {
      const data = await gateway.discovery(id)
      return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
          logger.error(err.message)
          return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
      }
  }

type discoveryRemoteCtrl = expressTypes.Controller<{ id: string, originId?: string }, { sparql?: JsonType }, {}, BasicArrayResponse, {}>

/**
 * Discovery endpoint
 * Check what remote objects can you see
 */
 export const discoveryRemote: discoveryRemoteCtrl = async (req, res) => {
    const { id, originId } = req.params
    const { sparql } = req.body
      try {
        const params = { sparql, originId }
        const data = await gateway.discoveryRemote(id, params)
        return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
          logger.error(err.message)
          return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
      }
  }

// ***** Consume remote resources *****

type getPropertyCtrl = expressTypes.Controller<{ id: string, oid: string, pid: string }, {}, {}, ConsumptionResponse, {}>

/**
 * Request remote property
 */
 export const getProperty: getPropertyCtrl = async (req, res) => {
    const { id, oid, pid } = req.params
      try {
      const data = await gateway.getProperty(id, oid, pid)
      logger.info(`Property ${pid} of ${oid} received`)
      return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
          logger.error(err.message)
          return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
      }
  }

type setPropertyCtrl = expressTypes.Controller<{ id: string, oid: string, pid: string }, JsonType, {}, ConsumptionResponse, {}>

/**
 * Set remote property
 */
export const setProperty: setPropertyCtrl = async (req, res) => {
    const { id, oid, pid } = req.params
    const body = req.body
    try {
      if (!body) {
        logger.warn('Missing body')
        return responseBuilder(HttpStatusCode.BAD_REQUEST, res, null)
      } 
      const data = await gateway.putProperty(id, oid, pid, body)
      logger.info(`Property ${pid} of ${oid} set`)
      return responseBuilder(HttpStatusCode.OK, res, null, data)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
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
      logger.info(`Channel ${eid} of ${id} activated`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
    }
}

type publishEventCtrl = expressTypes.Controller<{ id: string, eid: string }, JsonType, {}, string, {}>

/**
 * Publish event to channel
 */
    export const publishEvent: publishEventCtrl = async (req, res) => {
    const { id, eid } = req.params
    const body = req.body
    try {
        if (!body) {
            logger.warn('Missing body')
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, null)
          } 
        const data = await gateway.publishEvent(id, eid, body)
        logger.info(`Message sent to channel ${eid} of ${id}`)
        return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
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
      logger.info(`Channel ${eid} of ${id} deactivated`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
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
      logger.info(`Get status of remote channel ${eid} of ${oid}`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
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
      logger.info(`Subscribed to remote channel ${eid} of ${oid}`)
      return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
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
        logger.info(`Unsubscribed to remote channel ${eid} of ${oid}`)
        return responseBuilder(HttpStatusCode.OK, res, null, data.message)
    } catch (err) {
        logger.error(err.message)
        return responseBuilder(HttpStatusCode.INTERNAL_SERVER_ERROR, res, err)
    }
}
