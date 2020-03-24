const stripe = require('stripe')

class Stripe {
  constructor ({ config, limiter }) {
    this.config = config
    this.limiter = limiter
    this.stripe = stripe
  }

  async setup () {
    const stripeKey = await this.config.getStripeKey()
    this.stripeClient = this.stripe(stripeKey)
  }

  async updateAdvertiserBalances (advertisers) {
    const advertisersBilled = new Map()
    const advertisersErrored = new Map()

    const promises = advertisers.map((advertiser) => {
      // Get the 1000 remainder because we can't send fractions of cents in the bill to stripe
      const remainderCents = advertiser.amountToBill % 1000
      const debtWithoutRemainder = advertiser.amountToBill - remainderCents
      if (debtWithoutRemainder >= 1000) { // Only charge the advertiser if debts >= 1 cent (1000 microcents)
        return this.stripeClient.customers.createBalanceTransaction(advertiser.customerId, {
          amount: debtWithoutRemainder / 1000, // Turn microcents to cents
          currency: 'usd',
          description: `Flossbank advertising bill for: ${debtWithoutRemainder / 1000} cents`
        }).then(() => { advertisersBilled.set(advertiser._id, debtWithoutRemainder) })
          .catch((e) => { advertisersErrored.set(advertiser, e) })
      }
    })

    await this.limiter.schedule(() => Promise.all(promises))
    return { advertisersBilled, advertisersErrored }
  }
}

module.exports = Stripe
