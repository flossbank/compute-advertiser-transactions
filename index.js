const aws = require('aws-sdk')
const { MongoClient, ObjectId } = require('mongodb')
const Bottleneck = require('bottleneck')

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

  const bulkUpdates = db.collection(ADVERTISER_COLLECTION).initializeUnorderedBulkOp()
  let shouldUpdateMongo = false // Need a flag because potentially no operations could be ran, and bulk update throws in that case

  const promises = advertisers.map(async (advertiser) => {
    try {
      // Get the 1000 remainder because we can't send fractions of cents in the bill to stripe
      const remainderCents = advertiser.amountToBill % 1000
      const debtWithoutRemainder = advertiser.amountToBill - remainderCents
      if (debtWithoutRemainder >= 1000) { // Only charge the advertiser if debts >= 1 cent (1000 microcents)
        shouldUpdateMongo = true
        await stripe.customers.createBalanceTransaction(
          advertiser.customerId,
          {
            amount: debtWithoutRemainder / 1000, // Turn microcents to cents
            currency: 'usd',
            description: `Flossbank advertising bill for: ${debtWithoutRemainder / 1000} cents`
          }
        )
        bulkUpdates.find({ _id: ObjectId(advertiser._id) }).updateOne({ $inc: { 'billingInfo.amountOwed': -debtWithoutRemainder }})
      }
    } catch (e) {
      console.log(`ERROR updating stripe balance advertiser_id: ${advertiser._id}, amount: ${debtWithoutRemainder}, error:`, e.message)
    }
  })

  return limiter.schedule(() => {
    return Promise.all(promises)
  }).then(async () => {
    if (shouldUpdateMongo) await bulkUpdates.execute()
  }).catch((e) => {
    console.log('ERROR updating stripe balance promise.all', e.message)
  }).finally(async () => {
    await mongoClient.close()
  })
}
