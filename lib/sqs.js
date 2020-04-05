class Sqs {
  constructor ({ sqs, config }) {
    this.sqs = sqs
    this.queueUrl = config.getQueueUrl()
  }

  async sendMessage (payload) {
    return this.sqs.sendMessage({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload)
    }).promise()
  }
}

module.exports = Sqs

