const { v4: uuidv4 } = require('uuid')

const stringifyErrors = (_, v) => {
  if (!(v instanceof Error)) return v
  const out = {}
  for (const key of Object.getOwnPropertyNames(v)) {
    out[key] = v[key]
  }
  return out
}
exports.stringifyErrors = stringifyErrors

exports.process = async ({ db, sqs, log, limiter }) => {
  const messageCount = await sqs.getMessageCount()
  if (messageCount !== 0) {
    throw new Error(`unable to begin; ${messageCount} messages found in SQS`)
  }
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
        advertiserId: advertiser._id,
        idempotencyKey: uuidv4()
      }).then(() => { advertisersBilled.set(advertiser._id, debtWithoutRemainder) })
        .catch((e) => { advertisersErrored.set(advertiser, e) })
    }
  })

  await limiter.schedule(() => Promise.all(promises))

  log({ advertisersBilled: JSON.stringify([...advertisersBilled.entries()]) })

  if (advertisersErrored.size > 0) {
    log({ advertisersErrored: JSON.stringify([...advertisersErrored.entries()], stringifyErrors) })
    throw new Error('advertisers errored; see log for details')
  }

  log(
    'summary: %d owed us, %d were billed, %d failed',
    advertisersWhoOwe.length,
    advertisersBilled.size,
    advertisersErrored.size
  )

  return {
    advertisersWhoOwe,
    advertisersErrored,
    advertisersBilled
  }
}
