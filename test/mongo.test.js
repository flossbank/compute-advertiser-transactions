const test = require('ava')
const sinon = require('sinon')
const { MongoClient } = require('mongodb')
const Mongo = require('../lib/mongo')

test.beforeEach((t) => {
  t.context.mongo = new Mongo({
    config: {
      getMongoUri: async () => 'mongodb+srv://0.0.0.0/test'
    },
    stripe: () => ({
      customers: {
        createBalanceTransaction: () => Promise.resolve()
      }
    }),
    stripeKey: 'test-stripe-key',
    limiter: {
      schedule: async (cb) => {
        await cb()
        Promise.resolve()
      }
    },
  })
  t.context.mongo.db = {
    collection: sinon.stub().returns({
      aggregate: sinon.stub().returns({
        toArray: sinon.stub().resolves([{ // advertisers with customer ids and amount owed
          _id: null,
          amountToBill: 1000000, // 10 bucks in microcents
          customerId: 'kilua'
        },
        {
          _id: null,
          amountToBill: 500000, // 5 bucks in microcents
          customerId: 'gon'
        }])
      }),
      initializeUnorderedBulkOp: sinon.stub().returns({
        find: sinon.stub().returns({
          updateOne: sinon.stub()
        }),
        execute: sinon.stub().returns({ nModified: 2 })
      })
    })
  }
})

test('connect', async (t) => {
  sinon.stub(MongoClient.prototype, 'connect')
  sinon.stub(MongoClient.prototype, 'db')

  await t.context.mongo.connect()
  t.true(MongoClient.prototype.connect.calledOnce)

  MongoClient.prototype.connect.restore()
  MongoClient.prototype.db.restore()
})

test('close', async (t) => {
  await t.context.mongo.close()
  t.context.mongo.mongoClient = { close: sinon.stub() }
  await t.context.mongo.close()
  t.true(t.context.mongo.mongoClient.close.calledOnce)
})

test('update advertiser balances | nothing to charge', async (t) => {
  t.context.mongo.db.collection().aggregate().toArray.resolves([])
  const res = await t.context.mongo.updateAdvertiserBalances()
  t.is(res.error, false)
  t.is(res.advertisersWhoOwe, 0)
  t.is(res.advertisersToBill, 0)
  t.is(res.advertisersUpdated, 0)
})

test('update advertiser balances | none owe more than a dollar', async (t) => {
  t.context.mongo.db.collection().aggregate().toArray.resolves([{ 
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    amountToBill: 999, // 99 microcents
    customerId: 'kilua'
  },
  {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    amountToBill: 10, // 10 microcents
    customerId: 'gon'
  }])
  const res = await t.context.mongo.updateAdvertiserBalances()
  t.is(res.error, false)
  t.is(res.advertisersWhoOwe, 2)
  t.is(res.advertisersToBill, 0)
  t.is(res.advertisersUpdated, 0)
})

test('update advertiser balances | promise all throws', async (t) => {
  t.context.mongo.db.collection().initializeUnorderedBulkOp().find.throws()
  const res = await t.context.mongo.updateAdvertiserBalances()
  t.is(res.error, true)
  t.is(res.advertisersWhoOwe, 2)
  t.is(res.advertisersToBill, 2)
  t.is(res.advertisersUpdated, 0)
})

test('update advertiser balances | updates balances succesfully', async (t) => {
  const res = await t.context.mongo.updateAdvertiserBalances()
  t.is(res.error, false)
  t.is(res.advertisersWhoOwe, 2)
  t.is(res.advertisersToBill, 2)
  t.is(res.advertisersUpdated, 2)

  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.calledWith({
    $inc: { 'billingInfo.amountOwed': -1000000 } // billed all ten bucks
  }))
  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.calledWith({
    $inc: { 'billingInfo.amountOwed': -500000 } // billed all 5 bucks 
  }))
})

test('update advertiser balances | success for just one advertiser', async (t) => {
  t.context.mongo.db.collection().aggregate().toArray.resolves([{ 
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    amountToBill: 1001, // 99 microcents
    customerId: 'kilua'
  },
  {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    amountToBill: 10, // 10 microcents
    customerId: 'gon'
  }])
  t.context.mongo.db.collection().initializeUnorderedBulkOp().execute.returns({ nModified: 1 })
  const res = await t.context.mongo.updateAdvertiserBalances()
  t.is(res.error, false)
  t.is(res.advertisersWhoOwe, 2)
  t.is(res.advertisersToBill, 1)
  t.is(res.advertisersUpdated, 1)

  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.calledWith({
    $inc: { 'billingInfo.amountOwed': -1000 } // billed just 1 cent, left 1 remainder
  }))
})
