import test from 'ava'
import { v4 } from 'uuid'
import quibble from 'quibble'
import { generateKeyPairSync } from 'crypto'
import {
  mockApplicationGetByAuthorization,
  mockCustomEventHandler,
} from './mocks.js'

test('should validate x-socketkit-key', async (t) => {
  const { build } = await import('../src/server.js')
  const server = await build()
  const { statusCode, body } = await server.inject({
    method: 'POST',
    url: '/v1/events',
    payload: [{ name: 'non-existent', timestamp: Date.now() }],
  })
  const response = JSON.parse(body)
  t.is(statusCode, 400)
  t.is(response.error, 'Bad Request')
  t.truthy(
    response.message.includes(
      `headers should have required property 'x-socketkit-key`,
    ),
    response.message,
  )
})

test('should validate x-client-id', async (t) => {
  const { build } = await import('../src/server.js')
  const server = await build()
  const { statusCode, body } = await server.inject({
    method: 'POST',
    url: '/v1/events',
    payload: [{ name: 'non-existent', timestamp: Date.now() }],
    headers: {
      'x-socketkit-key': v4(),
    },
  })
  const response = JSON.parse(body)

  t.is(statusCode, 400)
  t.is(response.error, 'Bad Request')
  t.truthy(
    response.message.includes(
      `headers should have required property 'x-client-id'`,
    ),
    response.message,
  )
})

test.serial('should throw forbidden on wrong x-socketkit-key', async (t) => {
  await mockApplicationGetByAuthorization(null)
  const { build } = await import('../src/server.js')
  const server = await build()
  t.teardown(() => quibble.reset())

  const { statusCode, body } = await server.inject({
    method: 'POST',
    url: '/v1/events',
    payload: [{ name: 'non-existent', timestamp: Date.now() }],
    headers: {
      'x-socketkit-key': v4(),
      'x-client-id': v4(),
      'x-signature': 'hello',
    },
  })
  const response = JSON.parse(body)

  t.is(statusCode, 403)
  t.is(response.error, 'Forbidden')
  t.truthy(
    response.message.includes('Invalid authorization key'),
    response.message,
  )
})

test.serial(
  'should throw precondition failed on wrong x-signature',
  async (t) => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const defaults = {
      account_id: v4(),
      application_id: v4(),
      application_key: publicKey.export({ format: 'der', type: 'spki' }),
      server_key: privateKey.export({ format: 'der', type: 'pkcs8' }),
    }
    await mockApplicationGetByAuthorization(defaults)
    await mockCustomEventHandler(null)
    const { build } = await import('../src/server.js')
    const server = await build()
    t.teardown(() => quibble.reset())

    const { statusCode, body } = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: [{ name: 'non-existent', timestamp: Date.now() }],
      headers: {
        'x-socketkit-key': v4(),
        'x-client-id': v4(),
        'x-signature':
          'L+ObHL8qa75PIarUPKS65RHPLRSqeTFg30aC/V0r8k+G3hJxyXJfcAiFb3XEQRVN31x2tkhyMbYjcguEYpiLDQ==',
      },
    })
    const response = JSON.parse(body)

    t.is(statusCode, 417)
    t.is(response.error, 'Expectation Failed')
    t.truthy(
      response.message.includes('Application signature does not match'),
      response.message,
    )
  },
)
