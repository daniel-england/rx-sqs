const Consumer = require('sqs-consumer');
const Rx = require('rxjs/Rx');
const AWS = require('aws-sdk');

AWS.config.update({region: 'eu-central-1', accessKeyId: 'notValidKey', secretAccessKey: 'notValidSecret'});

const queueUrl = 'http://localhost:9324/queue/default';
const availMessagesPerConsumer = 20;
const maxConsumers = 60;
let consumerCount = 0;

const availMessages = Rx.Observable.create(emitter => {
    const sqs = new AWS.SQS();

    Rx.Observable.interval(1000).subscribe(() => {
        sqs.getQueueAttributes({
            QueueUrl: queueUrl,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed']
        }, (err, data) => {
            if (err) {
                console.error(err, err.stack);
            } else {
                emitter.next(parseInt(data.Attributes.ApproximateNumberOfMessages) + parseInt(data.Attributes.ApproximateNumberOfMessagesDelayed));
            }
        })
    });
});

let consumerNum = 0;

const getConsumer = completeOnEmpty => {
    const num = consumerNum++;
    console.log(`get consumer: ${num} #completedOnEmpty: ${completeOnEmpty}`);

    consumerCount++;
    return Rx.Observable.create(emitter => {
        const consumer = Consumer.create({
            queueUrl: 'http://localhost:9324/queue/default',
            handleMessage: (message, done) => {
                //console.log(`consumer ${num} got a message`);
                emitter.next([message, done]);
            },
            batchSize: 10,
            sqs: new AWS.SQS()
        });

        consumer.on('error', (err) => {
            console.log(err.message);
        });

        consumer.on('empty', () => {
            if (completeOnEmpty) emitter.complete();
        });

        consumer.start();

        return () => {
            console.log(`stopping consumer ${num}`);
            consumer.stop();
            consumerCount--;
        }
    });
};

const messageProcessor = () => ({
    next: ([message, done]) => {
        //console.log('completing message');
        done();
    }
});

const baseConsumer = getConsumer(false);

const subject = new Rx.Subject();

subject.subscribe(messageProcessor());

subject
    .throttleTime(1000)
    .withLatestFrom(availMessages, (message, latestAvailMessage) => latestAvailMessage)
    .do(availMessages => console.log(`avail messages: ${availMessages}`))
    .mergeScan((consumers, availMessages) => {
        consumers.count().subscribe(count => {
            console.log(`consumers:${count}`);
        });

        const numToCreate = Math.ceil(availMessages / availMessagesPerConsumer);

        let goingToCreate;
        if (numToCreate + consumerCount > maxConsumers) {
            goingToCreate = maxConsumers - consumerCount;
        } else {
            goingToCreate = numToCreate;
        }

        console.log(`Creating ${goingToCreate}.  Current count: ${goingToCreate}`);
        return Rx.Observable.range(1, goingToCreate)
            .map(() => {
                return getConsumer(true)
            });
    }, Rx.Observable.empty())
    .subscribe(consumer => {
        console.log(JSON.stringify(consumer));

        consumer.subscribe(messageProcessor());
    });

baseConsumer.subscribe(subject);
