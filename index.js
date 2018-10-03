const rx = require('rxjs/Rx');

const {getElasticConsumer} = require('./rxSQSConsumer');
const esclient = require('./rxElasticSearch')();

const queueUrl = 'http://localhost:9324/queue/test-topic';
const availMessagesPerConsumer = 20;
const minConsumers = 3;
const maxConsumers = 60;

const messageProcessor = () => ({
    next: message => {
        const payload = JSON.stringify(message.Body);

        const indexRecord = rx.Observable.of({
            _id: payload.id,
            _type: 'foo',
            _index: 'widget',
            _source: payload
        });

        esclient.pushToIndex(indexRecord);
    }
});

module.exports.start = () => {
    getElasticConsumer(queueUrl, minConsumers, maxConsumers, availMessagesPerConsumer)
        .subscribe(messageProcessor());
};
