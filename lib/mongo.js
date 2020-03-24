const { MongoClient, ObjectId } = require('mongodb')
const MONGO_DB = 'flossbank_db'
const ADVERTISER_COLLECTION = 'advertisers'

class Mongo {
  constructor ({ config, stripe, stripeKey, limiter }) {
    this.config = config
    this.limiter = limiter
    this.db = null
    this.mongoClient = null
    this.stripeClient = stripe(stripeKey)
  }

  async connect () {
    const mongoUri = await this.config.getMongoUri()
    this.mongoClient = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    await this.mongoClient.connect()

    this.db = this.mongoClient.db(MONGO_DB)
  }

  async close () {
    if (this.mongoClient) return this.mongoClient.close()
  }

  async updateAdvertiserBalances () {
    // Vars to test with
    let advertisersWhoOwe = 0
    let advertisersToBill = 0
    let advertisersUpdated = 0
    // Grab stripe customer Id's and amount owed to bill each advertiser
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
  
    const advertisers = (await this.db.collection(ADVERTISER_COLLECTION)
      .aggregate(aggregationPipline)
      .toArray())

    advertisersWhoOwe = advertisers.length
  
    const bulkUpdates = this.db.collection(ADVERTISER_COLLECTION).initializeUnorderedBulkOp()
    let shouldUpdateMongo = false // Need a flag because potentially no operations could be ran, and bulk update throws in that case
  
    const promises = advertisers.map(async (advertiser) => {
      try {
        // Get the 1000 remainder because we can't send fractions of cents in the bill to stripe
        const remainderCents = advertiser.amountToBill % 1000
        const debtWithoutRemainder = advertiser.amountToBill - remainderCents
        if (debtWithoutRemainder >= 1000) { // Only charge the advertiser if debts >= 1 cent (1000 microcents)
          shouldUpdateMongo = true
          await this.stripeClient.customers.createBalanceTransaction(
            advertiser.customerId,
            {
              amount: debtWithoutRemainder / 1000, // Turn microcents to cents
              currency: 'usd',
              description: `Flossbank advertising bill for: ${debtWithoutRemainder / 1000} cents`
            }
          )
          advertisersToBill++
          bulkUpdates.find({ _id: ObjectId(advertiser._id) }).updateOne({ $inc: { 'billingInfo.amountOwed': -debtWithoutRemainder }})
        }
      } catch (e) {
        console.log(`ERROR updating stripe balance advertiser_id: ${advertiser._id}, amount: ${advertiser.amountToBill}, error:`, e.message)
        throw e
      }
    })
  
    try {
      await this.limiter.schedule(() => {
        return Promise.all(promises)
      })
      if (shouldUpdateMongo) {
        let res = await bulkUpdates.execute()
        advertisersUpdated = res.nModified
      }
      return { error: false, advertisersToBill, advertisersUpdated, advertisersWhoOwe }
    } catch (e) {
      console.log('ERROR updating stripe balance promise.all', e.message)
      return { error: true, advertisersToBill, advertisersUpdated, advertisersWhoOwe }
    }
  }
}

module.exports = Mongo
