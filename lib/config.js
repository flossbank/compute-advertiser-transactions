class Config {
  constructor ({ kms }) {
    this.kms = kms
  }

  async decrypt (data) {
    return this.kms.decrypt({
      CiphertextBlob: Buffer.from(data, 'base64')
    }).promise().then(decrypted => decrypted.Plaintext.toString())
  }

  async getMongoUri () {
    return this.decrypt(process.env.MONGO_URI)
  }

  getQueueUrl () {
    return 'https://sqs.us-west-2.amazonaws.com/011767500962/process-advertiser-transactions-input'
  }
}

module.exports = Config
