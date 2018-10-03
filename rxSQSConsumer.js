const Consumer = require('sqs-consumer');
const AWS = require('aws-sdk');
const rx = require('rxjs/Rx');
const stats = require('./stats');
const moment = require('moment');

const getSQSOptions = () => ({
    region: 'es-east-1',
    accessKeyId: 'notValidKey',
    secretAccessKey: 'notValidSecret'
});

const consumerGenerator = () => {
    let consumerCount = 0;
    return (queueUrl, completeOnEmpty) => {
        const num = consumerCount++;
        stats.statSubjects.consumerCount.next(num);
        console.log(`get consumer: ${num} #completedOnEmpty: ${completeOnEmpty}`);

        return rx.Observable.create(emitter => {
            const consumer = Consumer.create({
                queueUrl: queueUrl,
                attributeNames: ['SentTimestamp', 'RetryCount'],
                handleMessage: (message, done) => {
                    stats.statSubjects.messageReceived.next(1);
                    const timeInQueue = moment.duration(moment.unix(parseInt(message.Attributes.SentTimestamp, 10)).diff(moment()))
                        .get('milliseconds');
                    stats.statSubjects.timeInQueue.next(timeInQueue);
                    done();
                    emitter.next(message);
                },

                batchSize: 10,
                sqs: new AWS.SQS(getSQSOptions())
            });

            consumer.on('error', (err) => {
                console.log('consumer error', err.message);
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
                stats.statSubjects.consumerCount.next(consumerCount);
            }
        });
    };
};

const getBaseConsumers = (queueUrl, min, getConsumer) =>
    rx.Observable.range(1, min)
        .map(() => getConsumer(queueUrl, false))
        .mergeAll();

const getPool = (queueUrl, max, messagesPerConsumer, getConsumer) =>
    rx.Observable.create(emitter => {
        stats.statSubjects.availMessages
            .mergeMap(availMessages => {
                const consumerCount = stats.statSubjects.consumerCount.value;
                const wantsToCreate = Math.ceil(availMessages / messagesPerConsumer) - consumerCount;
                const canCreate = max - consumerCount;

                let willCreate;
                if (wantsToCreate >= canCreate) {
                    willCreate = canCreate;
                } else {
                    willCreate = wantsToCreate;
                }

                if (willCreate > 0) {
                    console.log(`Creating ${willCreate} more consumers`);
                    return rx.Observable.range(1, willCreate)
                        .map(() => getConsumer(queueUrl, true));
                }
                return rx.Observable.empty();
            })
            .mergeAll()
            .subscribe((message) => {
                emitter.next(message);
            });
    });

const availMessagesObserver = queueUrl =>
    rx.Observable.interval(1000)
        .mergeMap(() => new Promise(((resolve, reject) => {
            new AWS.SQS(getSQSOptions()).getQueueAttributes({
                QueueUrl: queueUrl,
                AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed']
            }, (err, data) => {
                if (err) {
                    console.error(err, err.stack);
                    reject(err);
                } else {
                    resolve(parseInt(data.Attributes.ApproximateNumberOfMessages) + parseInt(data.Attributes.ApproximateNumberOfMessagesDelayed));
                }
            });
        })));


const getElasticConsumer = (queueUrl, min = 3, max = 60, messagesPerConsumer = 20) => {
    const getConsumer = consumerGenerator();

    availMessagesObserver(queueUrl)
        .subscribe(availMessages => {
            stats.statSubjects.availMessages.next(availMessages);
        });

    return getBaseConsumers(queueUrl, min, getConsumer)
        .merge(getPool(queueUrl, max, messagesPerConsumer, getConsumer));
};

module.exports.getElasticConsumer = getElasticConsumer;
module.exports.getConsumer = queueUrl => consumerGenerator()(queueUrl, false);
