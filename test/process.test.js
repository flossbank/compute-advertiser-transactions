const test = require('ava')
const sinon = require('sinon')
const Process = require('../lib/process')

test.beforeEach((t) => {
  t.context.db = {
    updateAdvertiserBalances: sinon.stub().resolves({})
  }
})

test('update advertisers balances', async (t) => {
  await Process.process({ db: t.context.db, log: () => {} })
  t.true(t.context.db.updateAdvertiserBalances.calledOnce)
})
