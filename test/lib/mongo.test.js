const test = require('ava')
const sinon = require('sinon')
const { MongoClient, ObjectId } = require('mongodb')
const Mongo = require('../../lib/mongo')

test.beforeEach((t) => {
  t.context.mongo = new Mongo({
    config: {
      getMongoUri: async () => 'mongodb+srv://0.0.0.0/test',
      getQueueUrl: async () => 'sqsurl.com',
    }
  })
  t.context.mongo.db = {
    collection: sinon.stub().returns({
      aggregate: sinon.stub().returns({
        toArray: sinon.stub().resolves([{
          _id: null,
          amountToBill: 1000000,
          customerId: 'kilua'
        },
        {
          _id: null,
          amountToBill: 500000,
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

test('get owing advertisers | calls mongo', async (t) => {
  await t.context.mongo.getOwingAdvertisers()
  t.true(t.context.mongo.db.collection().aggregate().toArray.calledOnce)
})

test('update advertiser balances | nothing to update', async (t) => {
  const advertisersBilled = new Map()
  t.is(await t.context.mongo.updateAdvertiserBalances(advertisersBilled), 0)
})

test('update advertiser balances | bulk updates', async (t) => {
  const advertisersBilled = new Map()
  advertisersBilled.set('aaaaaaaaaaaaaaaaaaaaaaaa', 1000)
  advertisersBilled.set('aaaaaaaaaaaaaaaaaaaaaaab', 2000)

  t.is(await t.context.mongo.updateAdvertiserBalances(advertisersBilled), 2)

  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find.calledWith(
    { _id: ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa') }
  ))
  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find.calledWith(
    { _id: ObjectId('aaaaaaaaaaaaaaaaaaaaaaab') }
  ))
  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.calledWith(
    { $inc: { 'billingInfo.amountOwed': -1000 } }
  ))
  t.true(t.context.mongo.db.collection().initializeUnorderedBulkOp().find().updateOne.calledWith(
    { $inc: { 'billingInfo.amountOwed': -2000 } }
  ))
})
