class Sqs {
  constructor ({ sqs, queueUrl }) {
    this.sqs = sqs
    this.queueUrl = queueUrl
  }

  async sendMessage (payload) {
    return this.sqs.sendMessage({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload)
    }).promise()
  }
}

module.exports = Sqs

