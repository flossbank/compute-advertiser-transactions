const AWS = require('aws-sdk')
const stripe = require('stripe')
const Bottleneck = require('bottleneck')
const Config = require('./lib/config')
const Db = require('./lib/mongo')
const Process = require('./lib/process')

const kms = new AWS.KMS({ region: 'us-west-2' })
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
})

exports.handler = async () => {
  const config = new Config({ kms })
  const stripeKey = await config.getStripeKey()
  const db = new Db({ config, stripe, stripeKey, limiter })
  const log = console.log
  await db.connect()

  try {
    await Process.process({ db, log })
  } finally {
    db.close()
  }
}
