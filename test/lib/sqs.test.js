const test = require('ava')
const sinon = require('sinon')
const Sqs = require('../../lib/sqs')

test.beforeEach((t) => {
  t.context.sqs = new Sqs({
    sqs: {
      sendMessage: sinon.stub().returns({
        promise: async () => (Promise.resolve('fishing poll'))
      }),
      getQueueAttributes: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Attributes: {
            ApproximateNumberOfMessages: 1,
            ApproximateNumberOfMessagesDelayed: 2,
            ApproximateNumberOfMessagesNotVisible: 3
          }
        })
      })
    },
    config: {
      getQueueUrl: () => 'bandit url'
    }
  })
})

test('sendMessage', async (t) => {
  const payload = {
    ship: 'yard'
  }
  const res = await t.context.sqs.sendMessage(payload)
  t.true(t.context.sqs.sqs.sendMessage.calledWith({
    QueueUrl: 'bandit url',
    MessageBody: JSON.stringify(payload)
  }))
  t.deepEqual(res, 'fishing poll')
})

test('getMessageCount | success', async (t) => {
  t.is(await t.context.sqs.getMessageCount(), 6)
  t.true(t.context.sqs.sqs.getQueueAttributes.called)
})

test('getMessageCount | failure', async (t) => {
  t.context.sqs.sqs.getQueueAttributes().promise.resolves({})
  await t.throwsAsync(() => t.context.sqs.getMessageCount())
})
