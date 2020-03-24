exports.process = async ({ db, log }) => {
  const res = await db.updateAdvertiserBalances()
  log(
    '%d owed us, %d were billed, %d were updated in db',
    res.advertisersWhoOwe,
    res.advertisersToBill,
    res.advertisersUpdated
  )
}
