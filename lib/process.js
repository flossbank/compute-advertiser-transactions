const { v4 } = require('uuid')

exports.process = async ({ db, sqs, log, limiter }) => {
  const advertisersWhoOwe = await db.getOwingAdvertisers()

  log({ advertisersWhoOwe })

  const advertisersBilled = new Map()
  const advertisersErrored = new Map()

  const promises = advertisersWhoOwe.map((advertiser) => {
    // Get the 1000 remainder because we can't send fractions of cents in the bill to stripe
    const remainderCents = advertiser.amountToBill % 1000
    const debtWithoutRemainder = advertiser.amountToBill - remainderCents
    if (debtWithoutRemainder >= 1000) { // Only charge the advertiser if debts >= 1 cent (1000 microcents)
      return sqs.sendMessage({
        amount: debtWithoutRemainder / 1000, // Turn microcents to cents
        customerId: advertiser.customerId,
        idempotencyKey: v4()
      }).then(() => { advertisersBilled.set(advertiser._id, debtWithoutRemainder) })
      .catch((e) => { advertisersErrored.set(advertiser, e) })
    }
  })

  await limiter.schedule(() => Promise.all(promises))

  const advertisersUpdated = await db.updateAdvertiserBalances(advertisersBilled)

  log(
    'summary: %d owed us, %d were billed, %d failed, %d were updated in db',
    advertisersWhoOwe.length,
    advertisersBilled.size,
    advertisersErrored.size,
    advertisersUpdated
  )

  return {
    advertisersWhoOwe,
    advertisersUpdated,
    advertisersErrored,
    advertisersBilled,
  }
}
