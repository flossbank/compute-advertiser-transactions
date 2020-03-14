const aws = require('aws-sdk')
const { MongoClient, ObjectId } = require('mongodb')
const Bottleneck = require('bottleneck/es5')

const MONGO_DB = 'flossbank_db'
const ADVERTISER_COLLECTION = 'advertisers'

const kms = new aws.KMS()

const decrypt = async data => kms.decrypt({
  CiphertextBlob: Buffer.from(data, 'base64')
}).promise().then(decrypted => decrypted.Plaintext.toString())

const getMongoClient = async () => {
  const mongoUri = await decrypt(process.env.MONGO_URI)
  const mongoClient = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  return mongoClient.connect()
}

const getStripe = async () => {
  return decrypt(process.env.STRIPE_SECRET_KEY)
}

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
})

// This lambda should get called every 7 days to update the stripe balance for each advertiser
exports.handler = async () => {
  const mongoClient = await getMongoClient()
  const stripeKey = await getStripe()
  const db = mongoClient.db(MONGO_DB)
  const stripe = require('stripe')(stripeKey);

  const aggregationPipline = [
    {
      '$match': {
        'verified': true,
        'billingInfo.customerId': {
          '$exists': true
        },
        'billingInfo.amountOwed': {
          '$exists': true
        }
      }
    }, {
      '$project': {
        'customerId': '$billingInfo.customerId',
        'amountToBill': '$billingInfo.amountOwed'
      }
    }
  ];

  const advertisers = (await db.collection(ADVERTISER_COLLECTION)
    .aggregate(aggregationPipline)
    .toArray())

  const promises = []

  const bulkUpdates = db.collection(ADVERTISER_COLLECTION).initializeUnorderedBulkOp()

  for (let advertiser of advertisers) {
    promises.push(stripe.customers.createBalanceTransaction(
      advertiser.customerId,
      {
        amount: advertiser.amountToBill / 1000, // Turn microcents to cents
        currency: 'usd',
        description: `Flossbank advertiser ${advertiser._id} billed for $${advertiser.amountToBill / 1000 / 100}`
      }
    ))
    bulkUpdates.updateOne({
      _id: ObjectId(advertiser._id)
    }, { $set: { 'billingInfo.amountOwed': 0 }})
  }

  limiter.schedule(() => {
    return Promise.all(promises);
  }).then(() => {
    await bulkUpdates.execute()
  }).catch((e) => {
    // TODO: log that we failed and why / how 
  })
}
