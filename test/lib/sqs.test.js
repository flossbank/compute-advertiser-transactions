const test = require('ava')
const sinon = require('sinon')
const Sqs = require('../../lib/sqs')

test('sendMessage', async (t) => {
  const sqs = new Sqs({
    sqs: {
      sendMessage: sinon.stub().returns({
        promise: async () => (Promise.resolve('fishing poll'))
      })
    },
    queueUrl: 'poopie url',
  })

  const payload = {
    ship: 'yard'
  }
  const res = await sqs.sendMessage(payload)
  t.true(sqs.sqs.sendMessage.calledWith({ 
    QueueUrl: 'poopie url', 
    MessageBody: JSON.stringify(payload) 
  }))
  t.deepEqual(res, 'fishing poll')
})