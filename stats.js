const AWS = require('aws-sdk');
const rx = require('rxjs/Rx');

AWS.config.update({region: 'es-east-1', accessKeyId: 'notValidKey', secretAccessKey: 'notValidSecret'});

const queueUrl = 'http://localhost:9324/queue/test-topic';
const minConsumers = 3;
const maxConsumers = 60;

const sqs = new AWS.SQS();

const statSubjects = {
    availMessages: new rx.BehaviorSubject(0),
    consumerCount: new rx.BehaviorSubject(0),
    maxConsumers: new rx.BehaviorSubject(0),
    minConsumers: new rx.BehaviorSubject(0),
    timeToIndex: new rx.BehaviorSubject(0),
    timeInQueue: new rx.BehaviorSubject(0),
    messagesPerSecond: new rx.BehaviorSubject(0),
    messageReceived: new rx.BehaviorSubject(0),
    indexed: new rx.BehaviorSubject(0),
    totalIndexed: new rx.BehaviorSubject(0),
    indexedPerSecond: new rx.BehaviorSubject(0)
};

statSubjects.messageCount = statSubjects.messageReceived.scan((sum, recieved) => sum + recieved, 0);
statSubjects.averageTimeInQueue = statSubjects.timeInQueue
    .bufferTime(1000)
    .map(times => {
        if (!times || times.length === 0) {
            return 0;
        }

        const sum = times.reduce((sum, time) => sum + time, 0);
        return sum/times.length;
    });

statSubjects.messageReceived
    .bufferTime(1000)
    .subscribe(recived => {
        statSubjects.messagesPerSecond.next(recived.length);
    });

statSubjects.indexed
    .do(indexed => statSubjects.totalIndexed.next(statSubjects.totalIndexed.value + indexed))
    .bufferTime(1000)
    .subscribe(indexed => {
        const numPerSecond = indexed.reduce((sum, numIndexed) => sum + numIndexed, 0);
        statSubjects.indexedPerSecond.next(numPerSecond);
    });

statSubjects.averageTimeToIndex = statSubjects.timeToIndex
    .bufferTime(1000)
    .map(times => {
        if (!times || times.length === 0) {
            return 0;
        }
        const sum = times.reduce((sum, time) => sum + time, 0);
        return sum/times.length;
    });

rx.Observable.interval(1000 * 60)
    .subscribe(() => {
        statSubjects.maxConsumers.next(maxConsumers);
        statSubjects.minConsumers.next(minConsumers);
    });

const stats = new rx.BehaviorSubject({
    availMessages: 0,
    consumerCount: 0,
    maxConsumers,
    minConsumers,
    averageTimeInQueue: 0,
    maxTimeInQUeue: 0,
    averageTimToIndex: 0,
    maxTimeToIndex: 0,
    messagesPerSecond: 0
});

rx.Observable.combineLatest(Object.values(statSubjects))
    .auditTime(1000)
    .retry()
    .subscribe(values => {
        const statsPayload = {};
        Object.keys(statSubjects).forEach((key, index) => {
            statsPayload[key] = values[index];
        });

        console.log(`emitting stats: ${JSON.stringify(statsPayload)}`);
        stats.next(statsPayload);
    });

const registerStat = (stat, value) => statSubjects[stat].next(value);

module.exports.stream = stats;
module.exports.statSubjects = statSubjects;
module.exports.registerStat = registerStat;
