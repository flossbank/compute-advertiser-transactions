const test = require('ava')
const sinon = require('sinon')
const { MongoClient } = require('mongodb')
const Mongo = require('../../lib/mongo')

test.beforeEach((t) => {
  t.context.mongo = new Mongo({
    config: {
      getMongoUri: async () => 'mongodb+srv://0.0.0.0/test',
      getQueueUrl: async () => 'sqsurl.com'
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
