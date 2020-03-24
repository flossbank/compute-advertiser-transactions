const test = require('ava')
const sinon = require('sinon')
const Process = require('../lib/process')

test.beforeEach((t) => {
  t.context.db = {
    getOwingAdvertisers: sinon.stub().resolves([]),
    updateAdvertiserBalances: sinon.stub().resolves(1)
  }
  t.context.stripe = {
    updateAdvertiserBalances: sinon.stub().resolves({
      advertisersBilled: new Map(),
      advertisersErrored: new Map()
    })
  }
})

test('updates advertisers balances', async (t) => {
  await Process.process({ db: t.context.db, stripe: t.context.stripe, log: () => {} })
  t.true(t.context.db.getOwingAdvertisers.calledOnce)
  t.true(t.context.stripe.updateAdvertiserBalances.calledOnce)
  t.true(t.context.db.updateAdvertiserBalances.calledOnce)
})

test('updates advertisers balances | errors with stripe', async (t) => {
  const error = new Error('fake error')
  const errors = new Map()
  errors.set({ id: 1 }, error)
  t.context.stripe.updateAdvertiserBalances.resolves({
    advertisersBilled: new Map(),
    advertisersErrored: errors
  })
  const log = sinon.stub()
  await Process.process({ db: t.context.db, stripe: t.context.stripe, log })

  t.true(log.calledWith({ advertisersErrored: JSON.stringify([...errors], Process.stringifyErrors) }))
})
