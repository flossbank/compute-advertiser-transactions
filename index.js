const AWS = require('aws-sdk')
const Bottleneck = require('bottleneck')
const Config = require('./lib/config')
const Db = require('./lib/mongo')
const Stripe = require('./lib/stripe')
const Process = require('./lib/process')

const kms = new AWS.KMS({ region: 'us-west-2' })
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
})

exports.handler = async () => {
  const config = new Config({ kms })
  const db = new Db({ config })
  const stripe = new Stripe({ config, limiter })
  const log = console.log

  await db.connect()
  await stripe.setup()

  try {
    await Process.process({ db, stripe, log })
  } finally {
    db.close()
  }
}
