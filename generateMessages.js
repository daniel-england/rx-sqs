const AWS = require('aws-sdk');
const faker = require('faker');
const rx = require('rxjs/Rx');

AWS.config.update({region: 'eu-central-1', accessKeyId: 'notValidKey', secretAccessKey: 'notValidSecret'});

//const ep = new AWS.Endpoint('awsproxy.example.com')
const sqs = new AWS.SQS();

const numToCreate = process.argv[2];

if (!numToCreate) throw new Error('"Number to create required: "npm run generate -- [numToCreate]"');

console.log(`Creating ${numToCreate} messages`);

const observable = rx.Observable.range(1, parseInt(numToCreate));

observable.subscribe(id => {
    const messageBody = `{"id":${id}, "message":"${faker.random.words()}"}`;

    sqs.sendMessage({
        QueueUrl: 'http://localhost:9324/queue/default',
        MessageBody: messageBody
    }, (err, data) => {
        if (err) {
            console.error('Error sending message', err);
        } else {
            console.log(`${id}: Success`, data.MessageId);
        }
    })

});