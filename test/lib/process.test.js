const test = require('ava')
const sinon = require('sinon')
const Process = require('../../lib/process')

test.beforeEach((t) => {
  t.context.db = {
    getOwingAdvertisers: sinon.stub().resolves([]),
  }
  t.context.sqs = {
    sendMessage: sinon.stub().resolves()
  }
  t.context.limiter = {
    schedule: async (cb) => cb()
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

  const result = await Process.process({ 
    db: t.context.db, 
    sqs: t.context.sqs, 
    log: () => {}, 
    limiter: t.context.limiter
  })
  t.true(t.context.db.getOwingAdvertisers.calledOnce)
  t.deepEqual(result.advertisersBilled, expectedBilledAdvertisers)
})

test('updates advertisers balances | errors with sqs', async (t) => {
  const advertisers = [
    { _id: '1', amountToBill: 99900, customerId: 'kilua' },
    { _id: '2', amountToBill: 10000, customerId: 'gon' }, 
  ]

  t.context.db.getOwingAdvertisers.resolves(advertisers)

  const error = new Error('fake error')
  t.context.sqs.sendMessage.onCall(0).rejects(error)
  t.context.sqs.sendMessage.onCall(1).resolves()
  const log = sinon.stub()
  await Process.process({ db: t.context.db, sqs: t.context.sqs, log, limiter: t.context.limiter })

  t.true(log.calledWith('summary: %d owed us, %d were billed, %d failed',
    2,
    1,
    1,
  ))
})
