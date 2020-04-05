const test = require('ava')
const sinon = require('sinon')
const Process = require('../../lib/process')

test.beforeEach((t) => {
  t.context.db = {
    getOwingAdvertisers: sinon.stub().resolves([]),
    updateAdvertiserBalances: sinon.stub().resolves(1)
  }
  t.context.sqs = {
    sendMessage: sinon.stub().resolves()
  }
})

test('updates advertisers balances', async (t) => {
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

  t.context.db.getOwingAdvertisers.resolves(advertisers)

  const result = await Process.process({ db: t.context.db, sqs: t.context.sqs, log: () => {} })
  t.true(t.context.db.getOwingAdvertisers.calledOnce)
  t.true(t.context.db.updateAdvertiserBalances.calledOnce)
  t.deepEqual(result.advertisersBilled, expectedBilledAdvertisers)
})

test('updateAdvertiserBalances', async (t) => {
  

  const result = await t.context.stripe.updateAdvertiserBalances(advertisers)
  t.deepEqual(result.advertisersBilled, expectedBilledAdvertisers)
})

test('updates advertisers balances | errors with sqs', async (t) => {
  const error = new Error('fake error')
  t.context.sqs.sendMessage.onCall(0).rejects(error)
  t.context.sqs.sendMessage.onCall(1).resolves()
  const log = sinon.stub()
  await Process.process({ db: t.context.db, sqs: t.context.sqs, log })

  t.true(log.calledWith({ advertisersErrored: JSON.stringify([...errors], Process.stringifyErrors) }))
})
