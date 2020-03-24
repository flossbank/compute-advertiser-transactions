const test = require('ava')
const sinon = require('sinon')
const Stripe = require('../lib/stripe')

test.beforeEach((t) => {
  t.context.config = {
    getStripeKey: sinon.stub()
  }
  t.context.limiter = {
    schedule: async (cb) => cb()
  }
  t.context.stripe = new Stripe({
    config: t.context.config,
    limiter: t.context.limiter
  })
  t.context.stripe.stripeClient = { customers: { createBalanceTransaction: sinon.stub().resolves() } }
  t.context.stripe.stripe = sinon.stub().returns({ customers: { createBalanceTransaction: sinon.stub().resolves() } })
})

test('setup', async (t) => {
  await t.context.stripe.setup()
  t.true(t.context.stripe.stripe.calledOnce)
})

test('updateAdvertiserBalances', async (t) => {
  const advertisers = [
    { _id: 'a1', amountToBill: 999, customerId: 'kilua' }, // 999mc
    { _id: 'a2', amountToBill: 10, customerId: 'gon' }, // 10mc
    { _id: 'a3', amountToBill: 1000000, customerId: 'papi' }, // $10
    { _id: 'a4', amountToBill: 500000, customerId: 'john' }, // $5
    { _id: 'a5', amountToBill: 1001, customerId: 'milroy' }, // 1001mc
    { _id: 'a6', amountToBill: 10, customerId: 'platwick' } // 10 mc
  ]

  const expectedBilledAdvertisers = new Map()
  expectedBilledAdvertisers.set('a3', 1000000)
  expectedBilledAdvertisers.set('a4', 500000)
  expectedBilledAdvertisers.set('a5', 1000)

  const result = await t.context.stripe.updateAdvertiserBalances(advertisers)
  t.deepEqual(result.advertisersBilled, expectedBilledAdvertisers)
})

test('updateAdvertiserBalances | throws for an advertiser', async (t) => {
  const error = new Error('fake error')
  t.context.stripe.stripeClient.customers.createBalanceTransaction = async (cid) => {
    if (cid === 'john') throw error
  }
  const advertisers = [
    { _id: 'a4', amountToBill: 500000, customerId: 'john' }, // $5
    { _id: 'a5', amountToBill: 1001, customerId: 'milroy' } // 1001mc
  ]
  const expectedBilledAdvertisers = new Map()
  expectedBilledAdvertisers.set('a5', 1000)

  const expectedErroredAdvertisers = new Map()
  expectedErroredAdvertisers.set(advertisers[0], error)

  const result = await t.context.stripe.updateAdvertiserBalances(advertisers)
  t.deepEqual(result.advertisersBilled, expectedBilledAdvertisers)
  t.deepEqual(result.advertisersErrored, expectedErroredAdvertisers)
})
