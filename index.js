const AWS = require('aws-sdk')
const Bottleneck = require('bottleneck')
const Config = require('./lib/config')
const Db = require('./lib/mongo')
const Sqs = require('./lib/sqs')
const Process = require('./lib/process')

const kms = new AWS.KMS({ region: 'us-west-2' })
const awsSqs = new AWS.SQS({ region: 'us-west-2' })
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
})

exports.handler = async () => {
  const config = new Config({ kms })
  const db = new Db({ config })
  const sqs = new Sqs({ config, sqs: awsSqs })
  const log = console.log

  await db.connect()

  try {
    await Process.process({ db, log, limiter, sqs })
  } finally {
    db.close()
  }
}
