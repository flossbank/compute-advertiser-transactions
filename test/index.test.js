const test = require('ava')
const sinon = require('sinon')
const Db = require('../lib/mongo')
const Stripe = require('../lib/stripe')
const Process = require('../lib/process')
const index = require('../')

test.before(() => {
  sinon.stub(Stripe.prototype, 'setup')
  sinon.stub(Db.prototype, 'connect')
  sinon.stub(Db.prototype, 'close')
  sinon.stub(Process, 'process').resolves()
})

test.afterEach(() => {
  Stripe.prototype.setup.reset()
  Db.prototype.connect.reset()
  Db.prototype.close.reset()
  Process.process.reset()
})

test.after.always(() => {
  sinon.restore()
})

test.serial('processes records and closes db', async (t) => {
  await index.handler()
  t.true(Process.process.calledOnce)
  t.true(Db.prototype.close.calledOnce)
})

test.serial('throws on processing errors', async (t) => {
  Process.process.rejects()
  await t.throwsAsync(index.handler)
  t.true(Db.prototype.close.calledOnce)
})
