const aws = require('aws-sdk')
const { MongoClient } = require('mongodb')

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

// This lambda should get called every 7 days to update the stripe balance
exports.handler = async () => {
  const mongoClient = await getMongoClient()
  const stripeKey = await getStripe()
  const db = mongoClient.db(MONGO_DB)
  const stripe = require('stripe')(stripeKey);

  // get verified advertisers
  // go through each campaign in each advertiser
  // go through each ad in each campaign
  // get number of impressions in past 7 days and multiply times ad campaign CPM 
  // sum that with all other ad impressions for campaign
  // sum that with all other costs of each campaign for advertiser
  // set the last date that we've last charged for impressions 
  //
  // return array of [advertiserStripeId, amountSpentIn7Days][]

  /** (size of (ads.impressions, where date > lastChargedDate)) * adCampaign.cpm  */

  const aggregationPipline = [
    {
      '$match': {
        'verified': true, // Only take verified advertisers and ones where billing customer id exists
        'billingInfo.customerId': {
          '$exists': true
        }
      }
    }, {
      '$project': {
        'adCampaigns': 1, // grab the adcampaigns
        'customerId': '$billingInfo.customerId'
      }
    }, {
      '$unwind': { // Unwind all the adcampaigns for active advertisers
        'path': '$adCampaigns', 
        'preserveNullAndEmptyArrays': false
      }
    }, {
      '$project': { // snag the ads for each ad campaign as well as capture the cpm
        'adCampaignId': '$adCampaigns.id', 
        'ads': '$adCampaigns.ads', 
        'cpm': '$adCampaigns.cpm',
        'customerId': '1'
      }
    }, {
      '$unwind': { // unwind all ads 
        'path': '$ads', 
        'preserveNullAndEmptyArrays': false
      }
    }, {
      '$project': { // grab the info we need, which is adcampaignId, cpm, and impressions > last billed date
        'adCampaignId': 1, 
        'cpm': 1, 
        'customerId': 1,
        'impressions': {
          '$filter': {
            'input': '$ads.impressions', 
            'cond': {
              '$gt': [
                '$$this.timestamp', 1580013845522
              ]
            }
          }
        }
      }
    }, {
      '$group': { // group the impressions into a number we can sum
        '_id': '$adCampaignId', 
        'advertiserId': {
          '$first': '$_id'
        }, 
        'customerId': { '$first': '$customerId' },
        'totalImpressions': {
          '$sum': {
            '$size': '$impressions'
          }
        }, 
        'cpm': {
          '$first': '$cpm'
        }
      }
    }, {
      '$project': { // Project to get the amount to bill per adcampaign
        'advertiserId': 1,
        'customerId': 1, 
        'amountToBill': {
          '$multiply': [
            '$totalImpressions', '$cpm', 0.001
          ]
        }
      }
    }, {
      '$group': { // group all bills for an advertiser into one totalBill (micro cents)
        '_id': '$advertiserId',
        'customerId': { '$first': '$customerId' }, 
        'totalBill': {
          '$sum': '$amountToBill'
        }
      }
    }
  ];

  const advertisers = (await db.collection(ADVERTISER_COLLECTION)
    .aggregate(aggregationPipline)
    .toArray())

  for (let advertiser of advertisers) {
    try {
      // Write to stripe balance
      await stripe.customers.createBalanceTransaction(
        advertiser.customerId,
        {
          amount: advertiser.totalBill * 1000, // Turn microcents to cents
          currency: 'usd',
          // TODO fix these date inputs.
          description: 'Flossbank bill for Ad Campaign impressions from <date> to <date>'
        }
      )
      // TODO: update the last billed time on the advertiser
    } catch (e) {
      // do not update the last billed field for this advertiser id
    }
  }
}
