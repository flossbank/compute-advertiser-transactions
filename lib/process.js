const stringifyErrors = (_, v) => {
  if (!(v instanceof Error)) return v
  const out = {}
  for (const key of Object.getOwnPropertyNames(v)) {
    out[key] = v[key]
  }
  return out
}
exports.stringifyErrors = stringifyErrors

exports.process = async ({ db, stripe, log }) => {
  const advertisersWhoOwe = await db.getOwingAdvertisers()

  log({ advertisersWhoOwe })

  const { advertisersBilled, advertisersErrored } = await stripe.updateAdvertiserBalances(advertisersWhoOwe)

  // TODO: send advertisers erorred to sns topic for alarming
  log({ advertisersBilled: JSON.stringify([...advertisersBilled.entries()]) })
  log({ advertisersErrored: JSON.stringify([...advertisersErrored.entries()], stringifyErrors) })

  const advertisersUpdated = await db.updateAdvertiserBalances(advertisersBilled)

  log({ advertisersUpdated })

  log(
    'summary: %d owed us, %d were billed, %d failed, %d were updated in db',
    advertisersWhoOwe.length,
    advertisersBilled.size,
    advertisersErrored.size,
    advertisersUpdated
  )
}
