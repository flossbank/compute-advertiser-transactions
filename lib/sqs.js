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

  async getMessageCount () {
    const attributeNames = [
      'ApproximateNumberOfMessages',
      'ApproximateNumberOfMessagesDelayed',
      'ApproximateNumberOfMessagesNotVisible'
    ]
    const { Attributes } = await this.sqs.getQueueAttributes({
      QueueUrl: this.queueUrl,
      AttributeNames: attributeNames
    }).promise()
    if (!Attributes) {
      throw new Error('unable to get queue attributes')
    }
    const messageCounts = attributeNames.map(attr => parseInt(Attributes[attr], 10))
    return messageCounts.reduce((sum, count) => sum + count)
  }
}

module.exports = Sqs
