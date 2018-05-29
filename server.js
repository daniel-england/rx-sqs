const AWS = require('aws-sdk');
const faker = require('faker');
const sqs = new AWS.SQS();

const numToCreate = process.argv[2];


if (!numToCreate) throw new Error('"Number to create required: "npm run generate -- [numToCreate]"');

const observable = rx.Observable.range(1, numToCreate);

observable.subscribe(id => {
    const messageBody = `{"id":${id}, "message":"${faker.random.words()}"}`;

    sqs.sendMessage({
        QueueUrl: 'http://localhost:9324/queue/default',
        MessageBody: messageBody})

});
