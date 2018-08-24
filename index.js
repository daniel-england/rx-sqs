const Consumer = require('sqs-consumer');
const Rx = require('rxjs/Rx');
const AWS = require('aws-sdk');

AWS.config.update({region: 'es-east-1', accessKeyId: 'notValidKey', secretAccessKey: 'notValidSecret'});

const queueUrl = 'http://localhost:9324/queue/test-topic';
const availMessagesPerConsumer = 20;
const minConsumers = 3;
const maxConsumers = 60;

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

let consumerCount = 0;
const getConsumer = completeOnEmpty => {
    const num = consumerCount++;
    console.log(`get consumer: ${num} #completedOnEmpty: ${completeOnEmpty}`);

    return Rx.Observable.create(emitter => {
        const consumer = Consumer.create({
            queueUrl: queueUrl,
            handleMessage: (message, done) => {
                console.log(`consumer ${num} got a message`);
                emitter.next([message, done]);
            },
            batchSize: 10,
            sqs: new AWS.SQS()
        });

        consumer.on('error', (err) => {
            console.log(err.message);
        });

        consumer.on('empty', () => {
            console.log(`queue empty ${num} ## pool length: ${consumerCount}`);
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
        console.log('completing message');
        done();
    }
});

const baseConsumers = Rx.Observable.range(1, minConsumers)
    .map(() => getConsumer(false))
    .mergeAll();

const pool = Rx.Observable.create(emitter => {
    availMessages
        .mergeMap(numberOfAvailMessages => {
            const wantsToCreate = Math.ceil(numberOfAvailMessages / availMessagesPerConsumer) - consumerCount;
            const canCreate = maxConsumers - consumerCount;

            let willCreate;
            if (wantsToCreate > canCreate) {
                willCreate = canCreate;
            } else {
                willCreate = wantsToCreate;
            }

            console.log(`wantsToCreate: ${wantsToCreate} canCreate: ${canCreate} willCreate: ${willCreate} numberOfAvailMessage: ${numberOfAvailMessages}`);
            if (willCreate > 0) {
                return Rx.Observable.range(1, willCreate)
                    .map(() => getConsumer(true));
            }
            return Rx.Observable.empty();
        })
        .mergeAll()
        .subscribe(([message, done]) => {
            emitter.next([message, done]);
        });
});

baseConsumers
    .merge(pool)
    .subscribe(messageProcessor());
