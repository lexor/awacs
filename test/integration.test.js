import test from 'ava'
import { v4 } from 'uuid'

import * as Signing from '../src/signing.js'
import { getRandomPort, getGrpcClients, promisifyAll } from './helper.js'
import private_server from '../src/grpc.js'
import logger from '../src/logger.js'

const app_open = {
  locale: 'en-US',
  manufacturer: 'Apple',
  platform: 'ios',
  type: 'iPad13,1',
  carrier: 'T-Mobile',
  os_name: 'iOS',
  os_version: '14.4.1',
  screen_size: [2778, 1284],
  application_build_number: 14,
  application_version: '1.0.0',
  library_version: '0.4.1',
  watch_model: 'Apple Watch 38mm',
}

test.before(async (t) => {
  logger.pause()

  const account_id = v4()
  const application_id = v4()
  const port = getRandomPort()

  await private_server.start(`0.0.0.0:${port}`)
  t.context.private_server = private_server
  t.context.clients = getGrpcClients(port)
  t.context.account_id = account_id
  t.context.application_id = application_id

  const Applications = promisifyAll(t.context.clients.Applications)

  await Applications.create({
    account_id,
    application_id,
    title: 'Test Application',
    session_timeout: 60,
  })

  t.context.application = (
    await Applications.findOne({
      account_id,
      application_id,
    })
  ).row
})

test.after.always(async (t) => {
  const { account_id, application_id } = t.context
  const Applications = promisifyAll(t.context.clients.Applications)
  await Applications.destroy({ account_id, application_id })
  await t.context.private_server.close()
})

test('should send an event', async (t) => {
  const client_id = v4()
  const { application } = t.context
  const payload = [{ name: 'app_open', timestamp: Date.now(), ...app_open }]

  const { build } = await import('../src/server.js')
  const server = await build()
  const { body, statusCode } = await server.inject({
    method: 'POST',
    url: '/v1/events',
    headers: {
      'x-socketkit-key': application.authorization_key.toString('base64'),
      'x-client-id': client_id,
      'x-signature': await Signing.sign(
        JSON.stringify(payload),
        application.application_key,
      ),
    },
    payload,
  })

  t.deepEqual(JSON.parse(body), {})
  t.is(statusCode, 200)
})
