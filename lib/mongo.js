const { MongoClient, ObjectId } = require('mongodb')
const MONGO_DB = 'flossbank_db'
const ADVERTISER_COLLECTION = 'advertisers'

class Mongo {
  constructor ({ config }) {
    this.config = config
    this.db = null
    this.mongoClient = null
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

  async getOwingAdvertisers () {
    // Grab stripe customer Id's and amount owed to bill each advertiser
    const aggregationPipline = [
      {
        $match: {
          verified: true,
          'billingInfo.customerId': {
            $exists: true
          },
          'billingInfo.amountOwed': {
            $exists: true
          }
        }
      }, {
        $project: {
          customerId: '$billingInfo.customerId',
          amountToBill: '$billingInfo.amountOwed'
        }
      }
    ]

    return this.db.collection(ADVERTISER_COLLECTION)
      .aggregate(aggregationPipline)
      .toArray()
  }

  async updateAdvertiserBalances (advertisersBilled) {
    if (advertisersBilled.size < 1) return 0
    const bulkUpdates = this.db.collection(ADVERTISER_COLLECTION)
      .initializeUnorderedBulkOp()

    for (const [_id, debtWithoutRemainder] of advertisersBilled.entries()) {
      bulkUpdates
        .find({ _id: ObjectId(_id) })
        .updateOne({ $inc: { 'billingInfo.amountOwed': -debtWithoutRemainder } })
    }
    const res = await bulkUpdates.execute()
    return res.nModified
  }
}

module.exports = Mongo
